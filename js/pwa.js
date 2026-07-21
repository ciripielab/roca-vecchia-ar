"use strict";

function canRegisterServiceWorker() {
  const isSecureContext =
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  return "serviceWorker" in navigator && isSecureContext;
}

if (canRegisterServiceWorker()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Registrazione service worker non riuscita.", error);
    });
  });
}
