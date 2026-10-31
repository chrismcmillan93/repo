// Wainwrights (beta) service worker: installability + an offline-capable app shell.
//
// - Everything is relative to this file, so the scope is this folder (beta/) only.
// - Only same-origin GETs are handled. Supabase, Open-Meteo, postcodes.io, Google
//   Fonts and the supabase-js CDN are never touched or cached, so signed-in data
//   is always live and nothing private is stored.
// - Network first, cache as the fallback: a deploy is picked up on the next load
//   and the cached copy only matters when offline.
// - Cache keys drop the query string and fragment, so a hike's secret share token
//   (hike.html?t=...) or an auth code is never written to Cache Storage.
// Bump CACHE when the shell list changes.
const CACHE = "wainwrights-beta-v1";
const SHELL = [
  "./", "index.html", "leaderboard.html", "challenges.html", "planner.html", "hike.html",
  "shared.css", "shared-auth.js", "pwa.js", "fells-data.js", "story.js", "tracker.js",
  "leaderboard.js", "challenges-data.js", "challenges.js", "planner-walks.js", "planner.js", "hike.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"
];

const keyFor = url => { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; };

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(p => {
        const u = new URL(p, self.registration.scope).href;
        return fetch(u, { cache: "reload" }).then(r => { if (r.ok) return c.put(keyFor(u), r); });
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("wainwrights-beta-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  event.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(keyFor(req.url), copy));
      }
      return res;
    }).catch(() =>
      caches.match(keyFor(req.url)).then(hit => hit || (req.mode === "navigate" ? caches.match(keyFor(new URL("index.html", self.registration.scope))) : undefined))
        .then(hit => hit || Response.error())
    )
  );
});
