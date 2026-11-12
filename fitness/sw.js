// Fitness log service worker. Its job is to make the app installable and to
// let the app shell open without signal; it is deliberately NOT an
// offline-first data layer (Today/Week/Races read live from Supabase, so with
// no signal the shell opens but the data screens say they couldn't load).
//
// Strategy: network-first for this app's own files and for the one CDN script
// the shell needs (supabase-js), falling back to the last copy if the network
// fails. So whenever you are online you always get the freshest code -- a
// deploy is never hidden behind a stale cache -- and there is no "new
// version" prompt to manage. Everything else cross-origin (Supabase API calls,
// Google Fonts) is never touched.
//
// Bump VERSION to drop every old cache on the next load.
const VERSION = 'v2';
const CACHE = `fitness-shell-${VERSION}`;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png'];
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fitness-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    // 'no-cache' makes the browser revalidate with the server instead of reusing
    // its own HTTP cache (GitHub Pages sends max-age=600), otherwise a fresh
    // index.html can load alongside a stale main.js for up to 10 minutes after
    // a deploy. Same-origin only; the CDN script keeps its normal caching.
    const sameOrigin = new URL(request.url).origin === self.location.origin;
    const res = await fetch(sameOrigin ? new Request(request, { cache: 'no-cache' }) : request);
    // The CDN script is requested no-cors, so its response is opaque (status 0); cache it anyway.
    if (res && (res.ok || res.type === 'opaque')) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const shell = await caches.match('index.html') || await caches.match('./');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url === SUPABASE_JS) {
    event.respondWith(networkFirst(req));
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(networkFirst(req));
});
