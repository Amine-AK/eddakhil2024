// Minimal service worker: exists only to make the app installable as a PWA
// and to keep a couple of static assets available offline. It intentionally
// does NOT intercept page or API requests — offline attendance submission
// is handled by the app's own IndexedDB queue (src/lib/offline), which
// already gives correct idempotent behavior without the risk of a service
// worker serving stale dynamic data (a roster, an alert list) while
// pretending it is live.

const CACHE_NAME = "school-attendance-static-v1";
const STATIC_ASSETS = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!STATIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
