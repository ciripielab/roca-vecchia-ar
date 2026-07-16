"use strict";

const fallbackPois = [
  {
    id: "mura",
    enabled: true,
    targetIndex: 0,
    video: "assets/videos/Mura_mobile.mp4",
    overlayImage: "assets/overlays/mura_frame_mobile.png",
    audio: {
      it: "assets/audio/mura_it.mp3",
      en: "assets/audio/mura_en.mp3"
    },
    title: {
      it: "Le mura",
      en: "The Walls"
    }
  },
  {
    id: "capanna",
    enabled: true,
    targetIndex: 1,
    video: "assets/videos/Capanna_mobile.mp4",
    overlayImage: "assets/overlays/capanna_frame_mobile.png",
    audio: {
      it: "assets/audio/capanna_it.mp3",
      en: "assets/audio/capanna_en.mp3"
    },
    title: {
      it: "La capanna",
      en: "The Hut"
    }
  }
];

const messages = {
  it: {
    cameraReady: "Inquadra il target: {title}",
    cameraStarting: "Avvio camera in corso...",
    loading: "Preparazione esperienza AR...",
    orientationMessage:
      "Per usare l’esperienza AR, tieni il telefono in orizzontale.",
    orientationStatus: "Ruota il dispositivo in orizzontale per continuare.",
    orientationTitle: "Ruota il dispositivo",
    targetConfigured: "Target configurato: {title} (indice {targetIndex})",
    startCamera: "Avvia camera",
    targetFound: "Target rilevato: {title}",
    targetLost: "Target perso. Inquadra di nuovo: {title}",
    cameraError: "Impossibile avviare la camera. Dettaglio: {detail}",
    cameraUnsupported:
      "Camera non disponibile in questo browser. Usa Chrome/Edge su Android o Safari su iOS.",
    insecureContext:
      "La camera richiede HTTPS oppure localhost. Da smartphone, Live Server su http://IP:porta non può avviare la camera: usa GitHub Pages o un server HTTPS.",
    invalidPoi: "POI non trovato. Uso il primo target disponibile."
  },
  en: {
    cameraReady: "Frame the target: {title}",
    cameraStarting: "Starting camera...",
    loading: "Preparing AR experience...",
    orientationMessage:
      "To use the AR experience, keep your phone in landscape mode.",
    orientationStatus: "Rotate your device to landscape mode to continue.",
    orientationTitle: "Rotate your device",
    targetConfigured: "Target configured: {title} (index {targetIndex})",
    startCamera: "Start camera",
    targetFound: "Target detected: {title}",
    targetLost: "Target lost. Frame again: {title}",
    cameraError: "Unable to start the camera. Detail: {detail}",
    cameraUnsupported:
      "Camera is not available in this browser. Use Chrome/Edge on Android or Safari on iOS.",
    insecureContext:
      "The camera requires HTTPS or localhost. On smartphone, Live Server over http://IP:port cannot start the camera: use GitHub Pages or an HTTPS server.",
    invalidPoi: "POI not found. Using the first available target."
  }
};

const sceneEl = document.querySelector("#ar-scene");
const targetEl = document.querySelector("#selected-target");
const startButton = document.querySelector("#start-button");
const statusMessage = document.querySelector("#status-message");
const orientationLock = document.querySelector("#orientation-lock");
const orientationTitle = document.querySelector("#orientation-title");
const orientationMessage = document.querySelector("#orientation-message");
const arAssets = document.querySelector("#ar-assets");
const params = new URLSearchParams(window.location.search);
const defaultVideoFrame = {
  width: 1.00,
  height: 0.5625,
  x: 0,
  y: 0,
  z: -0.20
};
const defaultOverlayFrame = {
  width: 1,
  height: 0.718,
  x: 0,
  y: 0,
  z: 0.02
};

let language = "it";
let selectedPoi = null;
let arSystem = null;
let sceneLoaded = false;
let poiLoaded = false;
let orientationBlocked = false;
let arStarted = false;
let poiVideo = null;
let poiVideoPlane = null;
let poiOverlayImage = null;
let poiOverlayPlane = null;
let poiOverlayReady = false;
let poiAudio = null;
let poiAudioPrimed = false;
let poiAudioStarted = false;
let audioStartTimer = 0;

function getLocalizedValue(value, currentLanguage) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value[currentLanguage] || value.it || value.en || "";
}

function formatMessage(key, detail = "") {
  const dictionary = messages[language] || messages.it;
  const title = selectedPoi
    ? getLocalizedValue(selectedPoi.title, language) || selectedPoi.id
    : "";
  const targetIndex =
    selectedPoi && selectedPoi.targetIndex !== undefined
      ? selectedPoi.targetIndex
      : "-";

  return dictionary[key]
    .replace("{title}", title)
    .replace("{targetIndex}", targetIndex)
    .replace("{detail}", detail || "-");
}

function setStatus(key, detail = "") {
  statusMessage.textContent = formatMessage(key, detail);
}

function getFiniteNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function getVideoFrameConfig(poi) {
  const frame = poi && (poi.frame || poi.videoFrame || poi.overlay);

  if (!frame) {
    return defaultVideoFrame;
  }

  return {
    width: getFiniteNumber(frame.width, defaultVideoFrame.width),
    height: getFiniteNumber(frame.height, defaultVideoFrame.height),
    x: getFiniteNumber(frame.x, defaultVideoFrame.x),
    y: getFiniteNumber(frame.y, defaultVideoFrame.y),
    z: getFiniteNumber(frame.z, defaultVideoFrame.z)
  };
}

function getOverlayFrameConfig(poi) {
  const frame =
    poi && (poi.overlayFrame || poi.frameOverlayConfig || poi.maskFrame);

  if (!frame) {
    return defaultOverlayFrame;
  }

  return {
    width: getFiniteNumber(frame.width, defaultOverlayFrame.width),
    height: getFiniteNumber(frame.height, defaultOverlayFrame.height),
    x: getFiniteNumber(frame.x, defaultOverlayFrame.x),
    y: getFiniteNumber(frame.y, defaultOverlayFrame.y),
    z: getFiniteNumber(frame.z, defaultOverlayFrame.z)
  };
}

function getOverlayImageSource(poi) {
  if (!poi) {
    return "";
  }

  return (
    getLocalizedValue(poi.overlayImage, language) ||
    getLocalizedValue(poi.frameOverlay, language) ||
    getLocalizedValue(poi.maskImage, language)
  );
}

function makeSafeId(value) {
  return String(value || "poi").replace(/[^a-z0-9_-]/gi, "-");
}

function clearPoiAudioTimer() {
  if (!audioStartTimer) {
    return;
  }

  window.clearTimeout(audioStartTimer);
  audioStartTimer = 0;
}

function pausePoiAudio() {
  clearPoiAudioTimer();

  if (poiAudio) {
    poiAudio.pause();
  }
}

function showPoiOverlay() {
  if (!poiOverlayPlane || !poiOverlayReady) {
    return;
  }

  const videoVisible = poiVideoPlane && poiVideoPlane.getAttribute("visible");

  if (videoVisible !== true && videoVisible !== "true") {
    return;
  }

  poiOverlayPlane.setAttribute("visible", "true");
}

function pausePoiVideo() {
  if (poiVideoPlane) {
    poiVideoPlane.setAttribute("visible", "false");
  }

  if (poiOverlayPlane) {
    poiOverlayPlane.setAttribute("visible", "false");
  }

  if (poiVideo) {
    poiVideo.pause();
  }
}

async function startPoiAudio() {
  if (!poiAudio) {
    return;
  }

  if (poiAudio.ended) {
    poiAudio.currentTime = 0;
    poiAudioStarted = false;
  }

  try {
    poiAudio.muted = false;
    poiAudio.volume = 1;
    await poiAudio.play();
    poiAudioStarted = true;
  } catch (error) {
    console.warn("Impossibile riprodurre l'audio AR.", error);
  }
}

function schedulePoiAudioStart() {
  if (!poiAudio) {
    return;
  }

  clearPoiAudioTimer();

  if (poiAudioStarted && !poiAudio.ended) {
    startPoiAudio();
    return;
  }

  audioStartTimer = window.setTimeout(() => {
    audioStartTimer = 0;
    startPoiAudio();
  }, 2000);
}

async function playPoiVideo() {
  if (!poiVideo || !poiVideoPlane) {
    return;
  }

  try {
    if (poiVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      poiVideo.load();
    }

    await poiVideo.play();
    poiVideoPlane.setAttribute("src", `#${poiVideo.id}`);
    poiVideoPlane.setAttribute("visible", "true");
    showPoiOverlay();
    schedulePoiAudioStart();
  } catch (error) {
    console.warn("Impossibile riprodurre il video AR.", error);
  }
}

function configureAudioTrack(safePoiId) {
  const audioSource = getLocalizedValue(selectedPoi.audio, language);

  if (!audioSource) {
    return;
  }

  poiAudio = document.createElement("audio");
  poiAudio.id = `poi-audio-${safePoiId}`;
  poiAudio.src = audioSource;
  poiAudio.preload = "auto";
  poiAudio.setAttribute("preload", "auto");

  poiAudio.addEventListener("canplay", () => {
    console.log("Audio AR pronto", audioSource);
  });

  poiAudio.addEventListener("ended", () => {
    poiAudioStarted = false;
  });

  poiAudio.addEventListener("error", () => {
    console.warn("Errore caricamento audio AR", audioSource, poiAudio.error);
  });

  (arAssets || document.body).appendChild(poiAudio);
  poiAudio.load();
}

function configureFrameOverlay(safePoiId) {
  const overlaySource = getOverlayImageSource(selectedPoi);

  if (!overlaySource) {
    return;
  }

  const frame = getOverlayFrameConfig(selectedPoi);
  poiOverlayReady = false;

  poiOverlayImage = new Image();
  poiOverlayImage.crossOrigin = "anonymous";
  poiOverlayImage.addEventListener("load", () => {
    poiOverlayReady = true;
    console.log("Overlay AR pronto", overlaySource);
    showPoiOverlay();
  });

  poiOverlayImage.addEventListener("error", () => {
    console.warn("Errore caricamento overlay AR", overlaySource);
  });
  poiOverlayImage.src = overlaySource;

  poiOverlayPlane = document.createElement("a-plane");
  poiOverlayPlane.id = `poi-overlay-frame-${safePoiId}`;
  poiOverlayPlane.setAttribute("visible", "false");
  poiOverlayPlane.setAttribute("position", `${frame.x} ${frame.y} ${frame.z}`);
  poiOverlayPlane.setAttribute("rotation", "0 0 0");
  poiOverlayPlane.setAttribute("width", frame.width);
  poiOverlayPlane.setAttribute("height", frame.height);
  poiOverlayPlane.setAttribute("material", "shader", "flat");
  poiOverlayPlane.setAttribute("material", "src", overlaySource);
  poiOverlayPlane.setAttribute("material", "transparent", true);
  poiOverlayPlane.setAttribute("material", "alphaTest", 0.01);
  poiOverlayPlane.setAttribute("material", "side", "double");
  poiOverlayPlane.setAttribute("material", "depthTest", true);
  poiOverlayPlane.setAttribute("material", "depthWrite", false);

  targetEl.appendChild(poiOverlayPlane);
}

function configureVideoFrame() {
  if (!selectedPoi || !selectedPoi.video) {
    return;
  }

  const safePoiId = makeSafeId(selectedPoi.id);
  const videoId = `poi-video-${safePoiId}`;
  const frame = getVideoFrameConfig(selectedPoi);

  poiVideo = document.createElement("video");
  poiVideo.id = videoId;
  poiVideo.className = "ar-content-video";
  poiVideo.src = selectedPoi.video;
  poiVideo.crossOrigin = "anonymous";
  poiVideo.loop = true;
  poiVideo.muted = true;
  poiVideo.playsInline = true;
  poiVideo.preload = "auto";
  poiVideo.setAttribute("crossorigin", "anonymous");
  poiVideo.setAttribute("loop", "");
  poiVideo.setAttribute("muted", "");
  poiVideo.setAttribute("playsinline", "");
  poiVideo.setAttribute("webkit-playsinline", "");
  poiVideo.setAttribute("preload", "auto");

  poiVideo.addEventListener("canplay", () => {
    console.log("Video AR pronto", selectedPoi.video);
  });

  poiVideo.addEventListener("error", () => {
    console.warn("Errore caricamento video AR", selectedPoi.video, poiVideo.error);
  });

  poiVideoPlane = document.createElement("a-video");
  poiVideoPlane.id = `poi-video-frame-${safePoiId}`;
  poiVideoPlane.setAttribute("visible", "false");
  poiVideoPlane.setAttribute("src", `#${videoId}`);
  poiVideoPlane.setAttribute("position", `${frame.x} ${frame.y} ${frame.z}`);
  poiVideoPlane.setAttribute("rotation", "0 0 0");
  poiVideoPlane.setAttribute("width", frame.width);
  poiVideoPlane.setAttribute("height", frame.height);
  poiVideoPlane.setAttribute("material", "shader: flat; side: double");

  (arAssets || sceneEl).appendChild(poiVideo);
  targetEl.appendChild(poiVideoPlane);
  poiVideo.load();
  configureFrameOverlay(safePoiId);
  configureAudioTrack(safePoiId);
}

async function primePoiAudio() {
  if (!poiAudio || poiAudioPrimed) {
    return;
  }

  const originalMuted = poiAudio.muted;
  const originalVolume = poiAudio.volume;

  try {
    poiAudio.muted = true;
    poiAudio.volume = 0;
    await poiAudio.play();
    poiAudio.pause();
    poiAudio.currentTime = 0;
    poiAudioPrimed = true;
  } catch (error) {
    console.warn("Impossibile preparare l'audio AR.", error);
  } finally {
    poiAudio.muted = originalMuted;
    poiAudio.volume = originalVolume;
  }
}

function isMobileLikeDevice() {
  const isMobileUserAgent = /Android|iPhone|iPad|iPod/i.test(
    navigator.userAgent
  );
  const isSmallTouchScreen =
    navigator.maxTouchPoints > 0 &&
    Math.min(window.screen.width, window.screen.height) <= 1100;

  return isMobileUserAgent || isSmallTouchScreen;
}

function isLandscapeOrientation() {
  return (
    window.matchMedia("(orientation: landscape)").matches ||
    window.innerWidth > window.innerHeight
  );
}

function shouldBlockForOrientation() {
  return isMobileLikeDevice() && !isLandscapeOrientation();
}

function updateOrientationCopy() {
  const dictionary = messages[language] || messages.it;

  orientationTitle.textContent = dictionary.orientationTitle;
  orientationMessage.textContent = dictionary.orientationMessage;
}

function stopARForOrientation() {
  if (!arStarted || !arSystem || typeof arSystem.stop !== "function") {
    return;
  }

  pausePoiVideo();
  pausePoiAudio();

  try {
    arSystem.stop();
  } catch (error) {
    console.warn("Impossibile fermare MindAR dopo rotazione verticale.", error);
  }

  arStarted = false;
  startButton.hidden = false;
}

function updateOrientationGuard() {
  orientationBlocked = shouldBlockForOrientation();
  orientationLock.hidden = !orientationBlocked;

  if (orientationBlocked) {
    stopARForOrientation();
    updateOrientationCopy();
    setStatus("orientationStatus");
    startButton.disabled = true;
    startButton.textContent = messages[language].startCamera;
    return;
  }

  enableStartWhenReady();
}

function getCameraBlockerKey() {
  if (
    !window.isSecureContext &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return "insecureContext";
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "cameraUnsupported";
  }

  return "";
}

function getErrorDetail(error) {
  if (!error) {
    return "errore sconosciuto";
  }

  return [error.name, error.message].filter(Boolean).join(" - ");
}

function getEnabledPois(data) {
  const list = data && Array.isArray(data.pois) ? data.pois : [];

  return list.filter((poi) => poi && poi.id && poi.enabled !== false);
}

async function loadPois() {
  try {
    const response = await fetch("data/pois.json", { cache: "no-cache" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return getEnabledPois(await response.json());
  } catch (error) {
    console.warn(
      "Impossibile caricare data/pois.json. Uso i POI locali di fallback.",
      error
    );

    return fallbackPois;
  }
}

function selectPoi(pois) {
  const requestedTarget = params.get("target");
  const requestedPoi = pois.find((poi) => poi.id === requestedTarget);

  if (requestedPoi) {
    return requestedPoi;
  }

  if (requestedTarget) {
    console.warn(messages[language].invalidPoi, requestedTarget);
  }

  return pois[0];
}

function configureTarget() {
  const targetIndex = Number(selectedPoi.targetIndex);

  targetEl.setAttribute(
    "mindar-image-target",
    `targetIndex: ${Number.isFinite(targetIndex) ? targetIndex : 0}`
  );
  setStatus("targetConfigured");
  configureVideoFrame();

  targetEl.addEventListener("targetFound", () => {
    console.log("Target rilevato", selectedPoi);
    setStatus("targetFound");
    playPoiVideo();
  });

  targetEl.addEventListener("targetLost", () => {
    console.log("Target perso", selectedPoi);
    setStatus("targetLost");
    pausePoiVideo();
    pausePoiAudio();
  });
}

function enableStartWhenReady() {
  if (!sceneLoaded || !poiLoaded || !arSystem) {
    return;
  }

  if (orientationBlocked || shouldBlockForOrientation()) {
    updateOrientationGuard();
    return;
  }

  const cameraBlockerKey = getCameraBlockerKey();

  if (cameraBlockerKey) {
    setStatus(cameraBlockerKey);
    startButton.disabled = true;
    startButton.textContent = messages[language].startCamera;
    return;
  }

  startButton.disabled = false;
  startButton.textContent = messages[language].startCamera;
  setStatus("cameraReady");
}

sceneEl.addEventListener("loaded", () => {
  sceneLoaded = true;
  arSystem = sceneEl.systems["mindar-image-system"];
  enableStartWhenReady();
});

sceneEl.addEventListener("arReady", () => {
  arStarted = true;
  setStatus("cameraReady");
  startButton.hidden = true;
});

sceneEl.addEventListener("arError", (event) => {
  console.error("MindAR arError", event);
  arStarted = false;
  setStatus("cameraError", "MindAR arError");
  startButton.hidden = false;
  startButton.disabled = false;
});

startButton.addEventListener("click", async () => {
  if (!arSystem) {
    return;
  }

  if (orientationBlocked || shouldBlockForOrientation()) {
    updateOrientationGuard();
    return;
  }

  const cameraBlockerKey = getCameraBlockerKey();

  if (cameraBlockerKey) {
    setStatus(cameraBlockerKey);
    return;
  }

  startButton.disabled = true;
  setStatus("cameraStarting");

  try {
    await primePoiAudio();
    await arSystem.start();
    arStarted = true;
  } catch (error) {
    console.error("Errore avvio MindAR", error);
    setStatus("cameraError", getErrorDetail(error));
    startButton.disabled = false;
  }
});

try {
  const savedLanguage = localStorage.getItem("preferredLanguage");

  if (savedLanguage === "it" || savedLanguage === "en") {
    language = savedLanguage;
  }
} catch (error) {
  console.warn("Impossibile leggere la lingua salvata.", error);
}

document.documentElement.lang = language;
updateOrientationCopy();
setStatus("loading");

window.addEventListener("resize", () => {
  window.setTimeout(updateOrientationGuard, 150);
});

window.addEventListener("orientationchange", () => {
  window.setTimeout(updateOrientationGuard, 350);
});

loadPois().then((pois) => {
  selectedPoi = selectPoi(pois);

  if (!selectedPoi) {
    setStatus("cameraError");
    return;
  }

  configureTarget();
  poiLoaded = true;
  updateOrientationGuard();
});
