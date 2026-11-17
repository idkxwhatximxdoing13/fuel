/* Fuel service worker: makes the app open instantly and work with no signal.

   How it works: each version of the app gets its own complete copy of every file, downloaded when that version is
   installed. Pages are always served from that one copy, so the app never runs half old and half new files.
   A new release = a new VERSION below = a fresh copy fetched in the background, used from the next start.

   VERSION is stamped by _build/stamp.sh, which must be run before every release, together with
   APP_VERSION in app.js. If it does not change, phones that already have the app will NOT get the update. */
const VERSION = "2026.11.17-034927";
const CACHE = "fuel-" + VERSION;
const SHELL = ["./", "index.html", "style.css", "app.js", "foods.js", "vendor.js", "manifest.webmanifest", "icon-180.png", "icon-512.png",
  "fonts/vt323-latin-400-normal.woff2", "fonts/vt323-latin-ext-400-normal.woff2",
  "fonts/jetbrains-mono-latin-400-normal.woff2", "fonts/jetbrains-mono-latin-ext-400-normal.woff2",
  "fonts/jetbrains-mono-latin-700-normal.woff2", "fonts/jetbrains-mono-latin-ext-700-normal.woff2"];

self.addEventListener("install", (e) => {
  // "?v=" + cache:"reload" make sure these come fresh from the server, never from a stale copy in between
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u + "?v=" + VERSION, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fuel-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// the page asks which version is in charge, to know whether it should restart into new files
self.addEventListener("message", (e) => { if (e.data === "version" && e.ports[0]) e.ports[0].postMessage(VERSION); });

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // other sites (food database, AI) go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("index.html", { ignoreSearch: true }) : null);
    if (hit) return hit;
    try {
      const res = await fetch(req, { cache: "no-cache" }); // anything outside the kept copy is always checked with the server, never a 10-minute-old copy
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (req.mode === "navigate" && (await cache.match("index.html", { ignoreSearch: true }))) || Response.error();
    }
  })());
});
