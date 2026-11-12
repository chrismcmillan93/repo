// Life app service worker. Three jobs:
//  1. Make the app installable and open with no signal: the app's own files are
//     network-first (always fresh online), falling back to the last copy offline.
//  2. Read-only offline data: Supabase reads (GET /rest/v1 and the get_day_bundle
//     RPC) are network-first too, and the last answer is kept so screens still show
//     your data with no signal. Writes are never cached or queued: offline they
//     fail and the app says so. Auth and Edge Function calls are never touched.
//     Cached data is wiped on sign-out (main.js posts 'clear-data').
//  3. Show push notifications from the life-push Edge Function.
// Bump VERSION to clear old caches after adding or removing shell files.
const VERSION = 'v2';
const SHELL = `life-shell-${VERSION}`;
const DATA = 'life-data';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/main.js', 'js/auth.js', 'js/config.js', 'js/supabaseClient.js', 'js/store.js', 'js/ui.js', 'js/lib.js', 'js/theme.js', 'js/pwa.js', 'js/importer.js', 'js/playbookContent.js',
  'js/fit/analysis.js', 'js/fit/day.js', 'js/fit/daySwap.js', 'js/fit/db.js', 'js/fit/feed.js', 'js/fit/garmin.js', 'js/fit/nutrition.js', 'js/fit/posters.js', 'js/fit/sessionChoices.js',
  'js/fit/state.js', 'js/fit/supabaseClient.js', 'js/fit/utils.js', 'js/fit/week.js', 'js/fit/weekLists.js',
  'js/views/career.js', 'js/views/events.js', 'js/views/goals.js', 'js/views/health.js', 'js/views/journal.js', 'js/views/lists.js', 'js/views/playbook.js',
  'js/views/review.js', 'js/views/settings.js', 'js/views/shared.js', 'js/views/tasks.js', 'js/views/today.js', 'js/views/week.js'
];
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(FILES.map((f) => c.add(new Request(f, { cache: 'no-cache' })).catch(() => {})));
    await c.add(CDN).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('life-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'clear-data') e.waitUntil(caches.delete(DATA));
});

async function networkFirst(req, cacheName, key = req){
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) {
      // Tell the page this came from the offline copy.
      const h = new Headers(hit.headers); h.set('x-life-offline', '1');
      return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers: h });
    }
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.method !== 'GET' || !url.pathname.startsWith(new URL(self.registration.scope).pathname) || url.pathname.endsWith('/sw.js')) return;
    e.respondWith((async () => {
      try { return await networkFirst(new Request(req, { cache: 'no-cache' }), SHELL, req); }
      catch (err) {
        if (req.mode === 'navigate') { const c = await caches.open(SHELL); const page = await c.match('index.html') || await c.match('./'); if (page) return page; }
        throw err;
      }
    })());
    return;
  }
  if (req.url.startsWith(CDN)) { e.respondWith(networkFirst(req, SHELL)); return; }
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) {
    if (req.method === 'GET') { e.respondWith(networkFirst(req, DATA, req.url)); return; }
    if (req.method === 'POST' && url.pathname.endsWith('/rpc/get_day_bundle')) {
      e.respondWith((async () => {
        const body = await req.clone().text();
        return networkFirst(req, DATA, `${req.url}?__body=${encodeURIComponent(body)}`);
      })());
    }
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Life', {
    body: d.body || '', tag: d.tag || 'life', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || '#/today' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '#/today', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) { await win.focus(); return win.navigate ? win.navigate(target) : null; }
    return self.clients.openWindow(target);
  })());
});
