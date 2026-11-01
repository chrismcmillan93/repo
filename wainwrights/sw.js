// Wainwrights service worker: installability, fast cold launches, offline page,
// and "new version ready" notices.
//
// - Everything is relative to this file, so the scope is this folder (wainwrights/). The
//   beta app in beta/ has its own, more specific worker and caches ("wainwrights-beta-*");
//   this one only ever touches caches named "wainwrights-prod-*".
// - Launch speed: files are served from the cache straight away, so a cold start from
//   the home screen paints without waiting on the network.
// - Staying current: after serving a page load, the worker checks every shell file
//   against the server in the background (conditional requests, so unchanged files
//   cost almost nothing). Anything that changed is saved and the page is told
//   ("update-ready"), and pwa.js shows a "New version ready - Reload" bar. The launch
//   itself never waits for this. Bump CACHE when the shell list changes.
// - Only two kinds of request are handled: same-origin GETs inside this folder, and a
//   short allow-list of third-party *libraries and fonts* (supabase-js on jsDelivr,
//   Google Fonts), which are public and not user data. Supabase API calls, Open-Meteo,
//   postcodes.io and everything else are never intercepted or cached, so signed-in
//   data is always live.
// - Same-origin cache keys drop the query string and fragment, so a hike's secret
//   share token (hike.html?t=...) or an auth code is never written to Cache Storage.
// - A page load with nothing cached and no network shows offline.html.
const CACHE = "wainwrights-prod-v3";
const SHELL = [
  "./", "index.html", "leaderboard.html", "challenges.html", "planner.html", "hike.html", "admin.html", "admin.js",
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
const CHECK_EVERY_MS = 30 * 1000;   // don't re-check the whole shell more often than this

const keyFor = url => { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; };
const shellKeys = () => new Set(SHELL.map(p => keyFor(new URL(p, self.registration.scope).href)));
const cacheable = res => res && (res.type === "opaque" || (res.ok && (res.type === "basic" || res.type === "cors")));

async function notifyUpdate(){
  const all = await self.clients.matchAll({ type: "window" });
  all.forEach(c => c.postMessage({ type: "update-ready" }));
}

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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter(k => k.startsWith("wainwrights-prod-") && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    // A new worker means new files: tell any page still showing the old version.
    if (old.length) await notifyUpdate();
  })());
});

// ---- background check of the whole shell -------------------------------------------
let lastCheck = 0;
async function sameBytes(a, b){
  const [x, y] = await Promise.all([a.clone().arrayBuffer(), b.clone().arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return false;
  const p = new Uint8Array(x), q = new Uint8Array(y);
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
}
async function checkShell(){
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  const cache = await caches.open(CACHE);
  let changed = false;
  await Promise.all(SHELL.map(async p => {
    try {
      const url = new URL(p, self.registration.scope).href;
      const key = keyFor(url);
      // no-cache = ask the server whether it changed (a tiny 304 when it hasn't), instead
      // of trusting the browser's own HTTP cache, which can be up to ~10 minutes stale.
      const fresh = await fetch(url, { cache: "no-cache" });
      if (!fresh.ok) return;
      const old = await cache.match(key);
      const etagOld = old && old.headers.get("etag"), etagNew = fresh.headers.get("etag");
      if (old && etagOld && etagNew && etagOld === etagNew) return;
      if (old && await sameBytes(old, fresh)) return;     // e.g. same file, different ETag
      await cache.put(key, fresh.clone());
      changed = true;
    } catch (e) { /* offline or flaky: try again next launch */ }
  }));
  if (changed) await notifyUpdate();
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const sameOrigin = req.url.startsWith(self.registration.scope);
  const thirdParty = !sameOrigin && THIRD_PARTY.some(re => re.test(req.url));
  if (!sameOrigin && !thirdParty) return;
  event.respondWith(respond(event, req, sameOrigin ? keyFor(req.url) : req.url, sameOrigin));
});

async function respond(event, req, key, sameOrigin){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) {
    if (req.mode === "navigate") event.waitUntil(checkShell());
    else if (!sameOrigin || !shellKeys().has(key)) {
      // third-party libraries/fonts and any same-origin extras: refresh quietly for next time
      event.waitUntil(fetch(req, sameOrigin ? { cache: "no-cache" } : undefined)
        .then(res => { if (cacheable(res)) return cache.put(key, res.clone()); })
        .catch(() => {}));
    }
    return hit;
  }
  try {
    const res = await fetch(req);
    if (cacheable(res)) cache.put(key, res.clone());
    return res;
  } catch (e) {
    if (req.mode === "navigate") {
      const off = await cache.match(keyFor(new URL("offline.html", self.registration.scope)));
      if (off) return off;
    }
    return Response.error();
  }
}
