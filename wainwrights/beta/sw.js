// Wainwrights (beta) service worker: installability, fast cold launches, offline page.
//
// - Everything is relative to this file, so the scope is this folder (beta/) only.
// - Launch speed: files are served from the cache straight away and refreshed from
//   the network in the background (stale-while-revalidate). A cold start from the
//   home screen therefore paints without waiting on the network. The catch: after a
//   deploy, the first launch still shows the previous version and the next one has
//   the new files. Bump CACHE when the shell list changes.
// - Only two kinds of request are handled: same-origin GETs inside this folder, and a
//   short allow-list of third-party *libraries and fonts* (supabase-js on jsDelivr,
//   Google Fonts), which are public and not user data. Supabase API calls, Open-Meteo,
//   postcodes.io and everything else are never intercepted or cached, so signed-in
//   data is always live.
// - Same-origin cache keys drop the query string and fragment, so a hike's secret
//   share token (hike.html?t=...) or an auth code is never written to Cache Storage.
// - A page load with nothing cached and no network shows offline.html.
const CACHE = "wainwrights-beta-v3";
const SHELL = [
  "./", "index.html", "leaderboard.html", "challenges.html", "planner.html", "hike.html",
  "shared.css", "shared-auth.js", "pwa.js", "fells-data.js", "story.js", "tracker.js",
  "leaderboard.js", "challenges-data.js", "challenges.js", "planner-walks.js", "planner.js", "hike.js",
  "offline.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"
];
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const THIRD_PARTY = [
  /^https:\/\/fonts\.googleapis\.com\//,
  /^https:\/\/fonts\.gstatic\.com\//,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/
];

const keyFor = url => { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; };
const cacheable = res => res && (res.type === "opaque" || (res.ok && res.type === "basic") || (res.ok && res.type === "cors"));

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all([
        ...SHELL.map(p => {
          const u = new URL(p, self.registration.scope).href;
          return fetch(u, { cache: "reload" }).then(r => { if (r.ok) return c.put(keyFor(u), r); });
        }),
        // The library every page needs first; fetched no-cors like the <script> tag does.
        fetch(SUPABASE_JS, { mode: "no-cors" }).then(r => c.put(SUPABASE_JS, r)).catch(() => {})
      ]))
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
  const sameOrigin = req.url.startsWith(self.registration.scope);
  const thirdParty = !sameOrigin && THIRD_PARTY.some(re => re.test(req.url));
  if (!sameOrigin && !thirdParty) return;
  event.respondWith(respond(event, req, sameOrigin ? keyFor(req.url) : req.url));
});

async function respond(event, req, key){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  const refresh = fetch(req).then(res => {
    if (cacheable(res)) cache.put(key, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));   // update for next time; ignore failures
    return hit;
  }
  try {
    return await refresh;
  } catch (e) {
    if (req.mode === "navigate") {
      const off = await cache.match(keyFor(new URL("offline.html", self.registration.scope)));
      if (off) return off;
    }
    return Response.error();
  }
}
