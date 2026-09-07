const CACHE_NAME = "godhealth-client-static-v1";
const STATIC_ASSETS = [
  "/client/",
  "/client/index.html",
  "/client/manifest.webmanifest",
  "/godhealth-config.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if(event.request.method !== "GET") return;
  if(url.hostname.includes("supabase.co")) return;
  if(url.pathname.startsWith("/client/") || url.pathname === "/godhealth-config.js"){
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
