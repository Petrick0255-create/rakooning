import {
  downloadVideo,
  getOperation,
  getVideoUri,
  imageSourceToInlineData,
  startVideoGeneration,
} from "./services/gemini.js";

const KEY_NAME = "rakooning.geminiApiKey";
const EXAMPLE = "월요일 아침, 라쿤 신입사원이 양손으로 커다란 아이스커피를 안고 사무실에 들어오다가 팀장과 눈이 마주쳐 어색하게 꾸벅 인사해요. 낮은 카메라가 옆에서 천천히 따라가요.";
const MAX_WAIT_MS = 8 * 60 * 1000;
const POLL_MS = 10_000;
const OUTFITS = {
  scarf: "Wear only the exact burnt-orange neckerchief shown in the reference image. No shirt, pants, shoes, or other clothing.",
  office: "Wear a pale-blue button-down shirt with rolled sleeves, charcoal office trousers, and the same burnt-orange neckerchief tied neatly like a small tie.",
  hoodie: "Wear a cozy simple cream hoodie while keeping the burnt-orange neckerchief visibly tied at the neck.",
  suit: "Wear a tidy charcoal business suit over a white shirt, with the burnt-orange neckerchief used as the tie accent.",
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  form: $("#generationForm"),
  prompt: $("#prompt"),
  promptCount: $("#promptCount"),
  useExample: $("#useExample"),
  referenceInput: $("#referenceInput"),
  referencePreview: $("#referencePreview"),
  referenceName: $("#referenceName"),
  outfit: $("#outfit"),
  customOutfit: $("#customOutfit"),
  aspectRatio: $("#aspectRatio"),
  resolution: $("#resolution"),
  seed: $("#seed"),
  model: $("#model"),
  generateButton: $("#generateButton"),
  previewStage: $("#previewStage"),
  previewPoster: $("#previewPoster"),
  resultVideo: $("#resultVideo"),
  emptyState: $("#emptyState"),
  loadingState: $("#loadingState"),
  loadingTitle: $("#loadingTitle"),
  loadingDetail: $("#loadingDetail"),
  progressBar: $("#progressBar"),
  statusBadge: $("#statusBadge"),
  downloadButton: $("#downloadButton"),
  newScene: $("#newScene"),
  settingsDialog: $("#settingsDialog"),
  openSettings: $("#openSettings"),
  apiKey: $("#apiKey"),
  toggleKey: $("#toggleKey"),
  clearKey: $("#clearKey"),
  saveKey: $("#saveKey"),
  toast: $("#toast"),
};

let customReference = null;
let videoObjectUrl = "";
let activeController = null;
let toastTimer = 0;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function getApiKey() {
  return localStorage.getItem(KEY_NAME)?.trim() || "";
}

function openSettings() {
  elements.apiKey.value = getApiKey();
  elements.settingsDialog.showModal();
  setTimeout(() => elements.apiKey.focus(), 30);
}

function setStatus(kind, text) {
  elements.statusBadge.className = `status-badge ${kind || ""}`.trim();
  elements.statusBadge.textContent = text;
}

function resetResult() {
  activeController?.abort();
  activeController = null;
  if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl = "";
  elements.resultVideo.removeAttribute("src");
  elements.resultVideo.hidden = true;
  elements.previewPoster.hidden = false;
  elements.emptyState.hidden = false;
  elements.loadingState.hidden = true;
  elements.downloadButton.removeAttribute("href");
  elements.downloadButton.classList.add("disabled");
  elements.downloadButton.setAttribute("aria-disabled", "true");
  elements.generateButton.disabled = false;
  setStatus("", "준비됨");
}

function applyAspectRatio() {
  elements.previewStage.classList.toggle("portrait", elements.aspectRatio.value === "9:16");
}

function friendlyError(error) {
  const message = error?.message || "알 수 없는 오류가 발생했어요.";
  if (error?.name === "AbortError") return "작업을 취소했어요.";
  if (error?.status === 400) return `요청 내용을 확인해 주세요. ${message}`;
  if (error?.status === 403) return `API 키 권한이나 웹사이트 제한을 확인해 주세요. ${message}`;
  if (error?.status === 429) return "요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.";
  if (/Failed to fetch|NetworkError/i.test(message)) return "Gemini API에 연결하지 못했어요. 인터넷 연결과 API 키의 웹사이트 제한을 확인해 주세요.";
  return message;
}

async function pollUntilDone(apiKey, operationName, signal) {
  const startedAt = Date.now();
  let elapsedPolls = 0;
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_MS);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
    const operation = await getOperation({ apiKey, operationName, signal });
    elapsedPolls += 1;
    const progress = Math.min(92, 14 + elapsedPolls * 9);
    elements.progressBar.style.width = `${progress}%`;
    elements.loadingDetail.textContent = `장면과 움직임을 다듬는 중 · ${Math.round((Date.now() - startedAt) / 1000)}초`;
    if (operation.done) return operation;
  }
  throw new Error("생성이 예상보다 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.");
}

async function generate(event) {
  event.preventDefault();
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast("먼저 Gemini API 키를 저장해 주세요.");
    openSettings();
    return;
  }

  activeController?.abort();
  activeController = new AbortController();
  const { signal } = activeController;
  elements.generateButton.disabled = true;
  elements.emptyState.hidden = true;
  elements.loadingState.hidden = false;
  elements.resultVideo.hidden = true;
  elements.previewPoster.hidden = false;
  elements.progressBar.style.width = "8%";
  setStatus("active", "생성 중");

  try {
    const outfit = elements.outfit.value === "custom"
      ? `Dress the raccoon in this user-requested outfit while preserving the orange neckerchief when possible: ${elements.customOutfit.value.trim() || "the orange neckerchief only"}.`
      : OUTFITS[elements.outfit.value];
    const reference = await imageSourceToInlineData(customReference || "./assets/raccoon-reference.png");
    elements.loadingTitle.textContent = "라쿤이 콘티를 확인하고 있어요";
    elements.loadingDetail.textContent = "같은 얼굴과 옷을 고정하는 중이에요.";
    const operation = await startVideoGeneration({
      apiKey,
      model: elements.model.value,
      prompt: elements.prompt.value,
      outfit,
      reference,
      aspectRatio: elements.aspectRatio.value,
      resolution: elements.resolution.value,
      seed: elements.seed.value,
      signal,
    });

    elements.loadingTitle.textContent = "회사 생활 한 장면을 촬영 중이에요";
    elements.progressBar.style.width = "14%";
    const completed = operation.done ? operation : await pollUntilDone(apiKey, operation.name, signal);
    const uri = getVideoUri(completed);
    if (!uri) throw new Error("완성된 영상 주소를 찾지 못했어요.");

    elements.loadingTitle.textContent = "완성된 영상을 가져오고 있어요";
    elements.progressBar.style.width = "96%";
    const blob = await downloadVideo({ apiKey, uri, signal });
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    videoObjectUrl = URL.createObjectURL(blob);
    elements.resultVideo.src = videoObjectUrl;
    elements.resultVideo.hidden = false;
    elements.previewPoster.hidden = true;
    elements.loadingState.hidden = true;
    elements.downloadButton.href = videoObjectUrl;
    elements.downloadButton.classList.remove("disabled");
    elements.downloadButton.removeAttribute("aria-disabled");
    elements.progressBar.style.width = "100%";
    setStatus("done", "완성");
    showToast("라쿤 영상이 완성됐어요!");
    await elements.resultVideo.play().catch(() => {});
  } catch (error) {
    if (error?.name !== "AbortError") {
      showToast(friendlyError(error));
      setStatus("", "오류");
    }
    elements.loadingState.hidden = true;
    elements.emptyState.hidden = false;
  } finally {
    elements.generateButton.disabled = false;
    activeController = null;
  }
}

elements.prompt.addEventListener("input", () => {
  elements.promptCount.textContent = `${elements.prompt.value.length} / 800`;
});
elements.useExample.addEventListener("click", () => {
  elements.prompt.value = EXAMPLE;
  elements.prompt.dispatchEvent(new Event("input"));
  elements.prompt.focus();
});
elements.referenceInput.addEventListener("change", () => {
  const file = elements.referenceInput.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showToast("이미지는 20MB보다 작아야 해요.");
    elements.referenceInput.value = "";
    return;
  }
  customReference = file;
  elements.referencePreview.src = URL.createObjectURL(file);
  elements.previewPoster.src = elements.referencePreview.src;
  elements.referenceName.textContent = file.name;
  showToast("새 기준 이미지를 이번 작업에 적용했어요.");
});
elements.aspectRatio.addEventListener("change", applyAspectRatio);
elements.outfit.addEventListener("change", () => {
  const isCustom = elements.outfit.value === "custom";
  elements.customOutfit.hidden = !isCustom;
  if (isCustom) elements.customOutfit.focus();
});
elements.form.addEventListener("submit", generate);
elements.openSettings.addEventListener("click", openSettings);
elements.newScene.addEventListener("click", () => {
  resetResult();
  elements.prompt.value = "";
  elements.prompt.dispatchEvent(new Event("input"));
  elements.prompt.focus();
});
elements.toggleKey.addEventListener("click", () => {
  const visible = elements.apiKey.type === "text";
  elements.apiKey.type = visible ? "password" : "text";
  elements.toggleKey.textContent = visible ? "보기" : "숨기기";
});
elements.saveKey.addEventListener("click", (event) => {
  event.preventDefault();
  const value = elements.apiKey.value.trim();
  if (!value) {
    showToast("API 키를 입력해 주세요.");
    return;
  }
  localStorage.setItem(KEY_NAME, value);
  elements.settingsDialog.close();
  showToast("이 브라우저에 API 키를 저장했어요.");
});
elements.clearKey.addEventListener("click", () => {
  localStorage.removeItem(KEY_NAME);
  elements.apiKey.value = "";
  showToast("저장된 API 키를 지웠어요.");
});

function registerWebMcpTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  try {
    void Promise.resolve(context.registerTool({
      name: "stage_raccoon_scene",
      title: "라쿤 장면 준비",
      description: "라쿠닝 편집 화면에 직장인 라쿤의 새 장면 설명과 화면 비율을 입력합니다. 영상을 생성하거나 비용을 발생시키지는 않습니다.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", minLength: 1, maxLength: 800, description: "라쿤이 회사에서 겪는 한 장면" },
          aspectRatio: { type: "string", enum: ["9:16", "16:9"], default: "9:16" },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 800) {
          throw new Error("prompt는 1~800자의 문자열이어야 합니다.");
        }
        if (input.aspectRatio && !["9:16", "16:9"].includes(input.aspectRatio)) {
          throw new Error("aspectRatio는 9:16 또는 16:9여야 합니다.");
        }
        elements.prompt.value = input.prompt.trim();
        elements.prompt.dispatchEvent(new Event("input"));
        elements.aspectRatio.value = input.aspectRatio || "9:16";
        applyAspectRatio();
        elements.prompt.focus();
        return { staged: true, promptLength: elements.prompt.value.length, aspectRatio: elements.aspectRatio.value };
      },
    })).catch(() => {});
  } catch {
    // WebMCP가 없는 브라우저에서도 앱 기능은 그대로 동작합니다.
  }
}

applyAspectRatio();
registerWebMcpTool();
