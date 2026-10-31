// Thailand tracker service worker. Scope: this directory only (it is served from
// /thailand/sw.js, so the default scope is /thailand/ — never widen it).
//
// What it does:
//   * Precaches the app shell. The file list is DISCOVERED at install time by
//     reading index.html (stylesheets, scripts, manifest, icons), following the
//     ES-module imports through js/, and reading the manifest's icons — so adding
//     a new module or view needs no edit here.
//   * Caches the supabase-js CDN script and the Google Fonts CSS + font files so
//     the page renders properly offline (css/style.css falls back to system fonts
//     if a font isn't cached).
//   * Serves the shell stale-while-revalidate: instant from cache, refreshed in
//     the background, new files used on the next load.
//   * NEVER touches Supabase REST calls (cross-origin, not intercepted). Offline
//     DATA lives in IndexedDB, written by js/db.js — not here.
//   * Never calls skipWaiting() by itself. A new worker waits until the page
//     (js/pwa.js) asks, via an "Update" prompt, by posting {type:'SKIP_WAITING'}.
//
// BUMP VERSION whenever you want installed copies to pick up a changed shell
// (any edit under thailand/ that must reach already-installed phones: html, css,
// js, icons, manifest). Changing this file's bytes is what makes browsers install
// a new worker; the new version value also renames the caches so the old ones
// are deleted on activate.
const VERSION = 'v1';
const SHELL_CACHE = 'thailand-shell-' + VERSION;
const EXT_CACHE = 'thailand-ext-' + VERSION;
const PREFIX = 'thailand-';

const SCOPE = new URL('./', self.registration.scope);
const INDEX_URL = new URL('index.html', SCOPE).href;
const SELF_URL = new URL('sw.js', SCOPE).href;
// Sibling apps that live under this scope but are NOT part of this app: leave alone.
const EXCLUDED_PREFIXES = ['legacy/', 'uat/'].map((p) => new URL(p, SCOPE).href);

const FONT_CSS_HOST = 'fonts.googleapis.com';
const FONT_FILE_HOST = 'fonts.gstatic.com';
const SCRIPT_CDN_HOST = 'cdn.jsdelivr.net';

/* ------------------------------ discovery ------------------------------ */

function stripComments(text, kind) {
  if (kind === 'html') return text.replace(/<!--[\s\S]*?-->/g, '');
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // CSS has no // comments (and url(//host/x) is valid), so only JS gets line-comment stripping.
  return kind === 'js' ? noBlock.replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1') : noBlock;
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[2] !== undefined ? m[2] : m[3]) : null;
}

// Every <link href> / <script src> in the page (rel=stylesheet|manifest|icon|apple-touch-icon|modulepreload).
function htmlReferences(html, base) {
  const refs = [];
  for (const m of stripComments(html, 'html').matchAll(/<(link|script)\b[^>]*>/gi)) {
    const tag = m[0];
    const raw = m[1].toLowerCase() === 'link' ? attr(tag, 'href') : attr(tag, 'src');
    if (!raw) continue;
    if (m[1].toLowerCase() === 'link' && !/\b(stylesheet|manifest|icon|apple-touch-icon|modulepreload)\b/i.test(attr(tag, 'rel') || '')) continue;
    refs.push(new URL(raw, base).href);
  }
  return refs;
}

// Relative static/dynamic ES-module specifiers: import x from './a.js', import './a.js', export … from './a.js', import('./a.js').
function moduleImports(js, base) {
  const out = [];
  const re = /\b(?:import|export)\s*(?:[^'"();]*?\s*from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of stripComments(js, 'js').matchAll(re)) {
    const spec = m[1] || m[2];
    if (spec && /^\.{0,2}\//.test(spec)) out.push(new URL(spec, base).href);
  }
  return out;
}

// @import url(...) / url(...) in a stylesheet.
function cssUrls(css, base) {
  const out = [];
  for (const m of stripComments(css, 'css').matchAll(/(?:@import\s+(?:url\()?|url\()\s*['"]?([^'")\s]+)['"]?\s*\)?/g)) {
    if (!m[1].startsWith('data:')) out.push(new URL(m[1], base).href);
  }
  return out;
}

function sameOrigin(url) { return new URL(url).origin === SCOPE.origin; }
function inShell(url) {
  return sameOrigin(url) && url.startsWith(SCOPE.href) && url !== SELF_URL &&
    !EXCLUDED_PREFIXES.some((p) => url.startsWith(p));
}

async function fetchFresh(url, init) {
  // 'reload' skips the HTTP cache (GitHub Pages sends max-age=600) so an install never captures stale files.
  const res = await fetch(url, Object.assign({ cache: 'reload' }, init));
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res;
}

async function discoverShell(cache) {
  const required = new Set();   // same-origin files the app can't run without
  const optional = new Set();   // discovered by regex; a miss is logged, not fatal
  const externals = new Set();  // CDN script / font CSS

  const queue = [];
  async function visit(url, kind, isRequired) {
    if (!inShell(url) || required.has(url) || optional.has(url)) return;
    (isRequired ? required : optional).add(url);
    queue.push([url, kind, isRequired]);
  }

  required.add(INDEX_URL);
  const indexRes = await fetchFresh(INDEX_URL);
  await cache.put(INDEX_URL, indexRes.clone());
  const html = await indexRes.text();

  for (const ref of htmlReferences(html, INDEX_URL)) {
    if (sameOrigin(ref)) {
      const kind = /\.css(\?|$)/.test(ref) ? 'css' : /\.m?js(\?|$)/.test(ref) ? 'js' : 'other';
      await visit(ref, kind, true);
    } else externals.add(ref);
  }

  while (queue.length) {
    const [url, kind, isRequired] = queue.shift();
    let res;
    try { res = await fetchFresh(url); }
    catch (err) {
      if (isRequired) throw err;
      console.warn('[sw] optional shell file missing, skipped:', url);
      optional.delete(url);
      continue;
    }
    await cache.put(url, res.clone());
    if (kind === 'js') {
      for (const dep of moduleImports(await res.text(), url)) await visit(dep, 'js', false);
    } else if (kind === 'css') {
      for (const dep of cssUrls(await res.text(), url)) {
        if (sameOrigin(dep)) await visit(dep, 'other', false); else externals.add(dep);
      }
    } else if (/manifest/.test(url)) {
      try {
        const manifest = JSON.parse(await res.text());
        for (const icon of manifest.icons || []) await visit(new URL(icon.src, url).href, 'other', true);
      } catch (err) { console.warn('[sw] manifest unreadable', err); }
    }
  }
  return { externals: [...externals] };
}

// Cache the CDN script (required — nothing runs without it) and the font CSS
// plus its latin / latin-ext font files (best effort; system fonts are the fallback).
async function cacheExternals(urls) {
  const ext = await caches.open(EXT_CACHE);
  for (const url of urls) {
    const host = new URL(url).hostname;
    if (host === SCRIPT_CDN_HOST) {
      // CORS fetch (jsDelivr sends ACAO:*) so we can verify it's a real 200 rather than caching an opaque error.
      const res = await fetchFresh(url, { mode: 'cors' });
      await ext.put(url, res);
    } else if (host === FONT_CSS_HOST) {
      try {
        const res = await fetchFresh(url, { mode: 'cors' });
        const css = await res.clone().text();
        await ext.put(url, res);
        await cacheFontFiles(ext, css);
      } catch (err) { console.warn('[sw] font CSS not cached; system fonts will be used offline', err); }
    }
  }
}

async function cacheFontFiles(ext, css) {
  // Google's CSS labels each @font-face block with its subset: "/* latin */ @font-face {…}".
  const blocks = css.split(/(?=\/\*\s*[a-z-]+\s*\*\/\s*@font-face)/);
  for (const block of blocks) {
    const subset = (block.match(/^\/\*\s*([a-z-]+)\s*\*\//) || [])[1];
    if (subset !== 'latin' && subset !== 'latin-ext') continue; // other subsets are cached on demand
    for (const m of block.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
      try { await ext.put(m[1], await fetchFresh(m[1], { mode: 'cors' })); }
      catch (err) { console.warn('[sw] font file not cached', m[1], err); }
    }
  }
}

/* ------------------------------ lifecycle ------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const { externals } = await discoverShell(shell);
    await cacheExternals(externals);
    // No skipWaiting() here on purpose — see the header comment.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, EXT_CACHE]);
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim(); // first install: take over the already-open page (does NOT bypass the update prompt)
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); // only ever on the page's explicit request
});

/* -------------------------------- fetch -------------------------------- */

async function staleWhileRevalidate(event, request, cacheName, { lookup = request, refreshUrl = request.url, fetchInit } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(lookup, { ignoreSearch: false, ignoreVary: true });
  const refresh = fetch(refreshUrl, fetchInit).then(async (res) => {
    // Opaque (status 0) responses are fine for no-cors CDN requests; otherwise only keep good ones.
    if (res.ok || res.type === 'opaque') await cache.put(lookup, res.clone());
    return res;
  });
  if (cached) {
    const settled = refresh.catch(() => {}); // offline revalidation failing is expected
    event.waitUntil(settled);               // keep the worker alive until the cache is refreshed
    return cached;
  }
  return refresh;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin: only the three hosts we cache. Everything else (Supabase REST,
  // maps, booking links…) is left completely alone.
  if (url.origin !== SCOPE.origin) {
    if (url.hostname === SCRIPT_CDN_HOST || url.hostname === FONT_CSS_HOST) {
      event.respondWith(staleWhileRevalidate(event, req, EXT_CACHE));
    } else if (url.hostname === FONT_FILE_HOST) {
      event.respondWith(cacheFirst(req, EXT_CACHE));
    }
    return;
  }

  // Page loads: the app's own index.html only (/thailand/ and /thailand/index.html).
  // Navigations to legacy/ or uat/ fall through to the network untouched.
  if (req.mode === 'navigate') {
    const path = url.origin + url.pathname;
    if (path === SCOPE.href || path === INDEX_URL) {
      event.respondWith(staleWhileRevalidate(event, req, SHELL_CACHE, {
        lookup: INDEX_URL, refreshUrl: INDEX_URL, fetchInit: { cache: 'no-cache' }
      }));
    }
    return;
  }

  // Shell assets (css, js modules, icons, manifest).
  const bare = url.origin + url.pathname;
  if (inShell(bare)) {
    event.respondWith(staleWhileRevalidate(event, req, SHELL_CACHE, {
      lookup: bare, refreshUrl: bare, fetchInit: { cache: 'no-cache' }
    }));
  }
});
