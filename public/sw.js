// FishFlower service worker: the offline shell for the /flow section.
// Registered by FlowPwa with scope "/flow" (production only). Data offline-ness
// is NOT handled here — lib/flowSync.ts's outbox and localStorage snapshots
// already cover flow data; this worker only makes the app itself (HTML, JS,
// CSS, fonts, icons) load without a connection.
//
// Bump VERSION to drop every old cache on the next activation.
const VERSION = "flow-sw-v1";
const PAGE_CACHE = `${VERSION}-pages`;
const ASSET_CACHE = `${VERSION}-assets`;

// The shell fallback: an offline launch of a page we've never cached serves the
// flow list, which then hydrates from local snapshots/outbox where it can.
const SHELL = "/flow";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([SHELL, "/flow.webmanifest", "/flow-icon-192.png", "/flow-icon-512.png"]))
      .catch(() => { /* offline install — pages cache fills as they're visited */ })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Cross-origin (Supabase, Realtime, …) is never touched — the outbox owns
  // offline data; caching API responses here would serve stale flows.
  if (url.origin !== self.location.origin) return;
  // App Router client-navigation payloads (?_rsc=) go straight to the network:
  // their cache keys churn, and on failure Next falls back to a full navigation,
  // which the navigate branch below serves from cache.
  if (url.searchParams.has("_rsc")) return;

  // Hashed build assets are immutable — cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Page navigations: network-first (online always gets the freshest HTML),
  // falling back to the cached copy of that URL, then the cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const hit = await cache.match(req);
          if (hit) return hit;
          const shell = await cache.match(SHELL);
          if (shell) return shell;
          return Response.error();
        }
      })
    );
    return;
  }

  // Everything else same-origin (manifest, icons, public/ files):
  // stale-while-revalidate — serve the cache, refresh it in the background.
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || refresh;
    })
  );
});
