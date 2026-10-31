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

/* ---------------- "Install app" button ---------------- */
// Chrome/Edge/Android fire `beforeinstallprompt`; we hold it and show a button
// that triggers the real install dialog. iOS Safari has no such API, so there
// the same button reveals the manual "Share → Add to Home Screen" steps.
// Hidden once installed/standalone, or after the user dismisses it.
const DISMISS_KEY = 'th-install-dismissed';

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function dismissed() { try { return !!localStorage.getItem(DISMISS_KEY); } catch (_) { return false; } }

export function initInstallButton() {
  const bar = document.getElementById('installBar');
  if (!bar || isStandalone() || dismissed()) return;
  const btn = document.getElementById('installBtn');
  const hint = document.getElementById('installHint');
  const close = document.getElementById('installClose');
  let deferred = null;

  const hide = () => { bar.hidden = true; };
  close.addEventListener('click', () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* session-only dismissal */ }
    hide();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    bar.hidden = false;
  });
  window.addEventListener('appinstalled', () => { deferred = null; hide(); });

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      hide();
    } else {
      hint.hidden = !hint.hidden; // iOS: toggle the manual steps
    }
  });

  if (isIos()) {
    hint.textContent = 'Tap the Share icon in Safari’s toolbar, then “Add to Home Screen”.';
    bar.hidden = false;
  }
}
