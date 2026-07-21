"use strict";

const CACHE_NAME = "roca-vecchia-ar-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./istruzioni.html",
  "./ar.html",
  "./js/ar.js",
  "./js/pwa.js",
  "./data/pois.json",
  "./manifest.webmanifest",
  "./assets/ui/back.png",
  "./assets/ui/graficaroca.png",
  "./assets/ui/LogoART.png",
  "./assets/ui/Logolarge.png",
  "./assets/ui/Logosmall.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isHeavyMedia =
    url.pathname.endsWith(".mp4") ||
    url.pathname.endsWith(".mp3") ||
    url.pathname.endsWith(".mind");

  if (!isSameOrigin || isHeavyMedia) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }

        return networkResponse;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
