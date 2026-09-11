const TYPECAST_ROOT = "https://api.typecast.ai";

async function readTypecastError(response) {
  const raw = await response.text().catch(() => "");
  let detail = raw;
  try {
    const payload = JSON.parse(raw);
    detail = payload?.detail?.message
      || payload?.detail
      || payload?.error?.message
      || payload?.message
      || raw;
  } catch {
    // JSON이 아닌 오류 응답은 원문을 사용합니다.
  }
  const error = new Error(typeof detail === "string" && detail ? detail : `Typecast API 요청 실패 (${response.status})`);
  error.status = response.status;
  return error;
}

export async function listVoices({ apiKey, signal }) {
  const response = await fetch(`${TYPECAST_ROOT}/v2/voices?model=ssfm-v30`, {
    signal,
    headers: { "X-API-KEY": apiKey },
  });
  if (!response.ok) throw await readTypecastError(response);
  const payload = await response.json();
  const voices = Array.isArray(payload) ? payload : payload?.voices || payload?.data || [];
  return voices
    .map((voice) => ({
      id: voice.voice_id || voice.id,
      name: voice.voice_name || voice.name || voice.voice_id || voice.id,
      gender: voice.gender || "",
      age: voice.age || "",
    }))
    .filter((voice) => voice.id);
}

export async function synthesizeVoice({ apiKey, voiceId, text, emotion = "smart", tempo = 1, signal }) {
  const prompt = emotion === "smart"
    ? { emotion_type: "smart" }
    : { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 1 };
  const response = await fetch(`${TYPECAST_ROOT}/v1/text-to-speech`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      voice_id: voiceId,
      text: text.trim(),
      model: "ssfm-v30",
      language: "kor",
      prompt,
      output: {
        volume: 100,
        audio_pitch: 0,
        audio_tempo: Number(tempo),
        audio_format: "wav",
      },
    }),
  });
  if (!response.ok) throw await readTypecastError(response);
  return response.blob();
}
