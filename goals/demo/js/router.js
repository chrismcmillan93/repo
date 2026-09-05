// Minimal hash-based router. No client-side history routing (which 404s on
// a GitHub Pages refresh) — everything lives under one #/... fragment.

const routes = [];
let rootEl = null;
let currentCleanup = null;

/** @param {string} pattern e.g. '/goal/:id' @param {(root:HTMLElement, params:Object)=>(void|Function)} render */
export function route(pattern, render) {
  const paramNames = [];
  const regex = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  }) + '$');
  routes.push({ regex, paramNames, render });
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
  return { path: path || '/', query };
}

export function navigate(path) {
  window.location.hash = path;
}

async function renderCurrent() {
  const { path, query } = parseHash();
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { /* ignore cleanup errors */ }
  }
  currentCleanup = null;

  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      rootEl.innerHTML = '';
      window.scrollTo(0, 0);
      const cleanup = await r.render(rootEl, { ...params, query });
      if (typeof cleanup === 'function') currentCleanup = cleanup;
      return;
    }
  }
  rootEl.innerHTML = `<div class="card"><p>Page not found.</p><a href="#/">Back to dashboard</a></div>`;
}

export function startRouter(el) {
  rootEl = el;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}
