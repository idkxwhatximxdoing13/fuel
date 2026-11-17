/* Fuel offline cache. App files: network first (so updates arrive), cache as fallback (so it opens offline).
   Never touches other sites (Open Food Facts, Anthropic). */
const CACHE = "fuel-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "foods.js", "vendor.js", "manifest.webmanifest", "icon-180.png", "icon-512.png",
  "fonts/vt323-latin-400-normal.woff2", "fonts/jetbrains-mono-latin-400-normal.woff2", "fonts/jetbrains-mono-latin-700-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // other sites: browser handles it
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
