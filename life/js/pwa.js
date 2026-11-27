// Install button, service worker registration and push subscription.
import { supabase } from './supabaseClient.js';
import * as store from './store.js';

let deferred = null;
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function registerSw(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  // A new worker takes over by itself (sw.js calls skipWaiting). If one replaces the worker this
  // page was loaded under, reload once so the page and its files are the same version.
  const had = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((reg) => { reg.update().catch(() => {}); }).catch((err) => console.warn('Service worker not registered:', err.message));
}

// Which build this page is (shown in Settings). Bump with sw.js VERSION on every release.
export const BUILD = '2026-11-27q';

// Force the newest version. The service worker is network-first and revalidates every file
// (`cache: 'no-cache'`, see sw.js), so while it is running a reload always gets fresh files. The old
// version of this button *unregistered* the worker and then reloaded: with no worker the page was
// loaded from the browser's own HTTP/memory cache (GitHub Pages lets files be cached for ~10 min), so
// it came straight back on the same version and the button seemed to do nothing. So: leave the worker
// alone, check the build against the server, ask it to update, re-fetch every file through it (which
// refreshes both its cache and the HTTP cache), then reload. Data and sign-in stay.
// `say(text)` reports progress; resolves true if it reloaded, false if already latest or it failed.
const fresh = (u) => fetch(u, { cache: 'reload' });
export async function refreshApp(say = () => {}){
  try {
    say('Checking…');
    // The file list lives in sw.js (FILES); read it from there so it can never drift from what is cached.
    const sw = await (await fresh('sw.js')).text();
    const files = Array.from(new Set((sw.match(/'[\w./-]+\.(?:js|css|html|webmanifest|png)'/g) || []).map((x) => x.slice(1, -1)))).concat(['./', 'index.html']);
    const latest = ((await (await fresh('js/pwa.js')).text()).match(/BUILD = '([^']+)'/) || [])[1];
    if (latest && latest === BUILD) { say(`You are on the latest build (${BUILD}).`); return false; }
    say(latest ? `Updating to ${latest}…` : 'Updating…');
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update().catch(() => {});
    await Promise.all(files.map((f) => fresh(f).catch(() => {})));
  } catch (err) {
    say(`Couldn't check for updates (${err.message}). Check your connection and try again.`);
    return false;
  }
  location.reload();
  return true;
}

// Wipe cached data (on sign-out), so the next person on this device never sees it offline.
export function clearOfflineData(){
  if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('clear-data');
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('life:installable')); });
window.addEventListener('appinstalled', () => { deferred = null; window.dispatchEvent(new Event('life:installable')); });

export function canPromptInstall(){ return !!deferred; }
export async function promptInstall(){
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  deferred = null;
  return !!(choice && choice.outcome === 'accepted');
}

// ---- push ----
export function pushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function keyBytes(b64){
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function callPush(action){
  const { data, error } = await supabase.functions.invoke('life-push', { body: { action } });
  if (error) {
    let detail = null;
    try { detail = await error.context.json(); } catch (_) { /* not JSON */ }
    throw new Error((detail && (detail.message || detail.error)) || error.message);
  }
  return data;
}
export async function currentSubscription(){
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
export async function enablePush(){
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.' : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await callPush('key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const j = sub.toJSON();
  const device = isIos() ? 'iPhone / iPad' : /android/i.test(navigator.userAgent) ? 'Android' : 'Computer';
  await store.upsertOn('push_subscriptions', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device }, 'endpoint');
  return sub;
}
export async function disablePush(){
  const sub = await currentSubscription();
  if (!sub) return;
  const rows = await store.pushSubs.list((q) => q.eq('endpoint', sub.endpoint));
  await Promise.all(rows.map((r) => store.pushSubs.del(r.id)));
  await sub.unsubscribe();
}
export const sendTestPush = () => callPush('test');
