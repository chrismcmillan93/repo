// Install button, service worker registration and push subscription.
import { supabase } from './supabaseClient.js';
import * as store from './store.js';

let deferred = null;
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function registerSw(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered:', err.message));
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
