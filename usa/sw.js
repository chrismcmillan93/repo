// Minimal service worker for the USA trip planner PWA. Two jobs only:
// 1. Satisfy Chrome/Android's installability requirement (a service worker
//    with a fetch handler) so the native install prompt actually fires.
// 2. Cache this app's own static shell (HTML/CSS/JS/icons) for resilience
//    on a flaky connection and a faster repeat load.
//
// Registered from index.html with no explicit scope, so its default scope
// is the directory it lives in (usa/) -- it can never intercept requests
// for goals/thailand/naples/etc. on the same domain.
//
// Deliberately never caches or intercepts cross-origin requests (Supabase,
// fonts, the supabase-js CDN script) -- trip data must always come from
// the network, live, never served stale from a cache.
const CACHE_NAME = 'usa-shell-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {}) // offline-at-install-time is fine, just skip pre-caching
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Cache-first for instant repeat loads, refreshing the cache in the
      // background from the network -- falls back to the network (and its
      // own offline handling) the first time anything isn't cached yet.
      return cached || network;
    })
  );
});
