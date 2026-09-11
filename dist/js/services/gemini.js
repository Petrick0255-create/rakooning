const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

async function readError(response) {
  let detail = "";
  try {
    const payload = await response.json();
    detail = payload?.error?.message || payload?.message || "";
  } catch {
    detail = await response.text().catch(() => "");
  }
  const error = new Error(detail || `Gemini API 요청 실패 (${response.status})`);
  error.status = response.status;
  return error;
}

export async function imageSourceToInlineData(source, aspectRatio = "9:16") {
  const blob = source instanceof Blob ? source : await fetch(source).then((response) => {
    if (!response.ok) throw new Error("기준 이미지를 불러오지 못했어요.");
    return response.blob();
  });

  if (blob.size > 20 * 1024 * 1024) {
    throw new Error("기준 이미지는 20MB보다 작아야 해요.");
  }

  let uploadBlob = blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    const isPortrait = aspectRatio === "9:16";
    canvas.width = isPortrait ? 576 : 1024;
    canvas.height = isPortrait ? 1024 : 576;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#d8effb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const x = Math.round((canvas.width - width) / 2);
    const y = Math.round((canvas.height - height) / 2);
    context.drawImage(bitmap, x, y, width, height);
    bitmap.close();
    uploadBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (compressed) => compressed ? resolve(compressed) : reject(new Error("이미지 압축에 실패했어요.")),
        "image/jpeg",
        0.88,
      );
    });
  } catch {
    // 압축을 지원하지 않는 브라우저에서는 원본을 그대로 사용합니다.
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지를 읽지 못했어요."));
    reader.readAsDataURL(uploadBlob);
  });

  const [meta, data] = String(dataUrl).split(",");
  return {
    mimeType: meta.match(/^data:(.*?);base64$/)?.[1] || uploadBlob.type || "image/jpeg",
    data,
  };
}

export function buildLockedPrompt(userPrompt, outfit) {
  return [
    "Create an 8-second vertical or horizontal cinematic slice-of-life office comedy featuring the exact same original raccoon shown in the supplied character reference image.",
    "IDENTITY LOCK: Preserve the raccoon's large round brown eyes, soft smiling face, gray-and-cream fur markings, rounded oversized head, compact body, short limbs, fluffy ringed tail, and soft premium 3D storybook rendering. The raccoon is always anthropomorphic and moves upright on two legs like a tiny office employee. Never make it quadrupedal, photoreal wildlife, or human-proportioned.",
    `OUTFIT LOCK: ${outfit}`,
    `SCENE: ${userPrompt.trim()}`,
    "DIRECTION: One simple readable action, natural tiny gestures, gentle cinematic camera movement, warm expressive acting, consistent face and outfit from first frame to last. No morphing, no duplicate character, no captions, no logos, no spoken dialogue or voices. Ambient office sounds and subtle sound effects only.",
  ].join("\n\n");
}

export async function startVideoGeneration({ apiKey, model, prompt, outfit, reference, aspectRatio, resolution, signal }) {
  const response = await fetch(`${API_ROOT}/models/${encodeURIComponent(model)}:predictLongRunning`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      instances: [{
        prompt: buildLockedPrompt(prompt, outfit),
        image: {
          bytesBase64Encoded: reference.data,
          mimeType: reference.mimeType,
        },
      }],
      parameters: {
        sampleCount: 1,
        durationSeconds: 8,
        aspectRatio,
        resolution,
      },
    }),
  });

  if (!response.ok) throw await readError(response);
  const operation = await response.json();
  if (!operation.name) throw new Error("생성 작업 번호를 받지 못했어요.");
  return operation;
}

export async function getOperation({ apiKey, operationName, signal }) {
  const response = await fetch(`${API_ROOT}/${operationName}`, {
    signal,
    headers: { "x-goog-api-key": apiKey },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export function getVideoUri(operation) {
  if (operation?.error) {
    throw new Error(operation.error.message || "영상 생성이 중단됐어요.");
  }
  return operation?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    || operation?.response?.generatedVideos?.[0]?.video?.uri
    || "";
}

export async function downloadVideo({ apiKey, uri, signal }) {
  const response = await fetch(uri, {
    signal,
    headers: { "x-goog-api-key": apiKey },
  });
  if (!response.ok) throw await readError(response);
  return response.blob();
}
