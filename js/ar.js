"use strict";

const fallbackPois = [
  {
    id: "mura",
    enabled: true,
    targetIndex: 0,
    title: {
      it: "Le mura",
      en: "The Walls"
    }
  },
  {
    id: "capanna",
    enabled: true,
    targetIndex: 1,
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
const params = new URLSearchParams(window.location.search);

let language = "it";
let selectedPoi = null;
let arSystem = null;
let sceneLoaded = false;
let poiLoaded = false;
let orientationBlocked = false;
let arStarted = false;

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

  targetEl.addEventListener("targetFound", () => {
    console.log("Target rilevato", selectedPoi);
    setStatus("targetFound");
  });

  targetEl.addEventListener("targetLost", () => {
    console.log("Target perso", selectedPoi);
    setStatus("targetLost");
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
