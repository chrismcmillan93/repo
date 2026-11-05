// "Install app" button: the native browser install flow where it exists
// (Android/Chrome/Edge, desktop Chrome/Edge), manual step-by-step
// instructions where it doesn't (iOS Safari has no install API at all --
// "Add to Home Screen" is a manual Share-sheet action only).
import { qs } from './utils.js';

let deferredPrompt = null;

function detectIOS(){
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support, not "iPad".
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
}

function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function initInstall(){
  const btn = qs('#installBtn');
  if (!btn) return;

  // Already installed and running as a standalone app -- nothing to offer.
  if (isStandalone()) return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const iOS = detectIOS();
  btn.hidden = false;

  // Fires on Android/Chrome/Edge when the browser's own install criteria
  // are met -- captured so the button can trigger the native prompt
  // directly instead of the browser's own (easy to miss) UI.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    deferredPrompt = null;
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      await promptEvent.userChoice;
      return;
    }
    const panel = qs('#installInstructions');
    if (!panel) return;
    qs('#installStepsIOS').hidden = !iOS;
    qs('#installStepsAndroid').hidden = iOS;
    panel.hidden = !panel.hidden;
  });

  qs('#installInstructionsClose')?.addEventListener('click', () => {
    qs('#installInstructions').hidden = true;
  });
}
