function waitForMetadata(element) {
  if (Number.isFinite(element.duration) && element.duration > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    element.addEventListener("loadedmetadata", resolve, { once: true });
    element.addEventListener("error", () => reject(new Error("미디어 정보를 읽지 못했어요.")), { once: true });
  });
}

function preferredRecorderType() {
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export async function getMediaDuration(blob, kind = "audio") {
  const url = URL.createObjectURL(blob);
  const element = document.createElement(kind);
  element.preload = "metadata";
  element.src = url;
  try {
    await waitForMetadata(element);
    return element.duration;
  } finally {
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(url);
  }
}

export async function mixVideoAndVoice({ videoBlob, voiceBlob, backgroundVolume = 0.08, onProgress }) {
  if (!window.MediaRecorder || !window.AudioContext) {
    throw new Error("이 브라우저는 영상과 음성 합성을 지원하지 않아요. 최신 Chrome 또는 Edge를 사용해 주세요.");
  }

  const videoUrl = URL.createObjectURL(videoBlob);
  const voiceUrl = URL.createObjectURL(voiceBlob);
  const video = document.createElement("video");
  const voice = document.createElement("audio");
  video.preload = "auto";
  video.playsInline = true;
  video.src = videoUrl;
  voice.preload = "auto";
  voice.src = voiceUrl;
  const capture = video.captureStream || video.mozCaptureStream;
  if (!capture) {
    URL.revokeObjectURL(videoUrl);
    URL.revokeObjectURL(voiceUrl);
    throw new Error("이 브라우저는 영상 합성을 지원하지 않아요. 최신 Chrome 또는 Edge를 사용해 주세요.");
  }

  await Promise.all([waitForMetadata(video), waitForMetadata(voice)]);
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const backgroundGain = audioContext.createGain();
  const voiceGain = audioContext.createGain();
  backgroundGain.gain.value = backgroundVolume;
  voiceGain.gain.value = 1;
  audioContext.createMediaElementSource(video).connect(backgroundGain).connect(destination);
  audioContext.createMediaElementSource(voice).connect(voiceGain).connect(destination);

  const videoStream = capture.call(video);
  if (!videoStream.getVideoTracks().length) {
    await audioContext.close().catch(() => {});
    URL.revokeObjectURL(videoUrl);
    URL.revokeObjectURL(voiceUrl);
    throw new Error("영상 트랙을 읽지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
  }
  const outputStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const mimeType = preferredRecorderType();
  const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  const result = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => {
      if (!chunks.length) reject(new Error("합쳐진 영상을 만들지 못했어요."));
      else resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    }, { once: true });
    recorder.addEventListener("error", () => reject(recorder.error || new Error("영상 합성에 실패했어요.")), { once: true });
  });

  const progressTimer = setInterval(() => {
    if (video.duration) onProgress?.(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
  }, 200);

  try {
    video.currentTime = 0;
    voice.currentTime = 0;
    await audioContext.resume();
    recorder.start(250);
    await Promise.all([video.play(), voice.play()]);
    await new Promise((resolve, reject) => {
      video.addEventListener("ended", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("원본 영상을 재생하지 못했어요.")), { once: true });
    });
    voice.pause();
    recorder.stop();
    const blob = await result;
    onProgress?.(100);
    return blob;
  } finally {
    clearInterval(progressTimer);
    if (recorder.state !== "inactive") recorder.stop();
    video.pause();
    voice.pause();
    outputStream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => {});
    video.removeAttribute("src");
    voice.removeAttribute("src");
    video.load();
    voice.load();
    URL.revokeObjectURL(videoUrl);
    URL.revokeObjectURL(voiceUrl);
  }
}
