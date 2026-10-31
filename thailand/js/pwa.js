// Service worker registration + the "new version" prompt.
//
// sw.js deliberately never calls skipWaiting() on its own: a new version
// installs, waits, and this bar asks first. "Update" posts SKIP_WAITING to the
// waiting worker, and once it takes control the page reloads once — so a
// half-edited form is never yanked away by a surprise swap.
//
// Registration uses a path relative to the page (works on any domain/sub-path)
// and only runs on https or localhost: service workers don't exist elsewhere.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const h = location.hostname;
  const secure = location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  if (!secure) return;

  window.addEventListener('load', async () => {
    let reg;
    try { reg = await navigator.serviceWorker.register('sw.js'); }
    catch (err) { console.warn('[pwa] service worker registration failed', err); return; }

    // A worker that was already waiting when this page loaded (user dismissed the bar last time).
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        // 'installed' + an existing controller = an update, not the first install.
        if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(sw);
      });
    });

    // Ask for durable storage so the browser is less eager to evict the offline snapshot.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) { /* best effort */ }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !sessionStorage.getItem('th-sw-updating')) return; // only reload for an update the user chose
    reloading = true;
    sessionStorage.removeItem('th-sw-updating');
    location.reload();
  });
}

function showUpdateBar(worker) {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  const msg = document.createElement('span');
  msg.textContent = 'A new version is available.';
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'Update';
  go.addEventListener('click', () => {
    try { sessionStorage.setItem('th-sw-updating', '1'); } catch (_) { /* reload just won't auto-fire */ }
    worker.postMessage({ type: 'SKIP_WAITING' });
    go.disabled = true; go.textContent = 'Updating…';
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'update-later';
  later.textContent = 'Later';
  later.addEventListener('click', () => bar.remove());
  bar.append(msg, go, later);
  document.body.appendChild(bar);
}
