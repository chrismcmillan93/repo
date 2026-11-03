// Service worker registration and the "Install app" bar.
//
// Registration uses a path relative to the page (works on any domain or
// sub-path) and only runs on https or localhost: service workers don't exist
// elsewhere.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const h = location.hostname;
  const secure = location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  if (!secure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[pwa] service worker registration failed', err));
  });
}

/* ---------------- "Install app" button ---------------- */
// Chrome/Edge/Android fire `beforeinstallprompt`; we hold it and show a button
// that triggers the real install dialog. iOS Safari has no such API, so there
// the same button reveals the manual "Share -> Add to Home Screen" steps.
// Hidden once installed (standalone) or after the user dismisses it.
const DISMISS_KEY = 'fit-install-dismissed';

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
