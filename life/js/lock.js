// App lock: a PIN screen, stored on this device only. It is there to stop casual glances
// at an unlocked phone (including the app-switcher preview). It is NOT encryption: anyone
// with the unlocked browser's developer tools could get around it, and your data is still
// protected by your sign-in. Scope is either the whole app, or only the private parts
// (the Giving up tab and its panel on Today).
//
// Locks on a fresh open, and again once you've been away from the app longer than the chosen
// time ("0" = as soon as you leave). Wrong PINs slow down: after 5, a growing wait.
// Signing out clears the lock on this device, which is also the way back in if the PIN is forgotten.
const KEY = 'life-lock';           // { salt, hash, scope: 'app' | 'private', minutes }
const HIDDEN = 'life-lock-hidden'; // when the app was last put away
const TRIES = 'life-lock-tries';   // { n, until } wrong-PIN counter

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage blocked */ } };
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPin(pin, salt){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, key, 256));
}

let locked = false;
let bound = false;
let onChange = () => {};

export const lockConfig = () => read(KEY);
export const isLocked = () => locked && !!lockConfig();
export const appBlocked = () => isLocked() && lockConfig().scope === 'app'; // the whole app is covered
export const privateBlocked = () => isLocked();                              // the private parts are covered (either scope)

function cover(on){
  let el = document.getElementById('lockcover');
  if (!el) {
    el = document.createElement('div'); el.id = 'lockcover'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<b>Life</b>'; document.body.appendChild(el);
  }
  const cfg = lockConfig();
  // A blank cover for the app switcher: always for the whole-app lock, only on the Giving up tab for the private one.
  el.hidden = !(on && cfg && (cfg.scope === 'app' || /^#\/quit/.test(location.hash)));
}

const stamp = () => { if (lockConfig()) { try { localStorage.setItem(HIDDEN, String(Date.now())); } catch (_) { /* ignore */ } } };

function shouldLock(cfg){
  const gone = Date.now() - Number(localStorage.getItem(HIDDEN) || 0);
  return !(cfg.minutes > 0 && gone <= cfg.minutes * 60000);
}

function onVisibility(){
  const cfg = lockConfig();
  if (!cfg) { cover(false); return; }
  if (document.hidden) { stamp(); cover(true); return; }
  if (!locked && shouldLock(cfg)) { locked = true; cover(false); onChange(); return; }
  cover(false);
}

// Call once after sign-in, before the first screen. `cb` runs when the lock state changes.
export function initLock(cb){
  if (cb) onChange = cb;
  const cfg = lockConfig();
  locked = !!cfg && shouldLock(cfg);
  if (!bound) { bound = true; document.addEventListener('visibilitychange', onVisibility); window.addEventListener('pagehide', stamp); }
  cover(false);
}

export async function checkPin(pin){
  const cfg = lockConfig();
  if (!cfg) return { ok: true };
  const t = read(TRIES) || { n: 0, until: 0 };
  if (Date.now() < t.until) return { ok: false, wait: Math.ceil((t.until - Date.now()) / 1000) };
  if (await hashPin(String(pin), cfg.salt) === cfg.hash) { write(TRIES, null); locked = false; return { ok: true }; }
  const n = t.n + 1;
  const wait = n >= 5 ? Math.min(900, 30 * 2 ** (n - 5)) : 0;
  write(TRIES, { n, until: wait ? Date.now() + wait * 1000 : 0 });
  return { ok: false, wait, left: Math.max(0, 5 - n) };
}

export async function setPin(pin, scope, minutes){
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('The PIN must be 4 to 8 digits.');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  write(KEY, { salt, hash: await hashPin(String(pin), salt), scope: scope === 'private' ? 'private' : 'app', minutes: Math.max(0, Number(minutes) || 0) });
  if (!lockConfig()) throw new Error('This browser is not letting the app store a lock (private browsing?).');
  write(TRIES, null); write(HIDDEN, null);
  locked = false;
}

export async function turnOff(pin){
  const r = await checkPin(pin);
  if (!r.ok) return r;
  write(KEY, null); write(TRIES, null); write(HIDDEN, null); locked = false; cover(false);
  return { ok: true };
}

export function lockNow(){ if (lockConfig()) { locked = true; onChange(); } }
export function clearLock(){ write(KEY, null); write(TRIES, null); write(HIDDEN, null); locked = false; cover(false); }

// The unlock form, shown full-screen (whole-app lock) or inline in place of Giving up (private lock).
export function lockFormHtml(note){
  return `<form class="lockform stack" data-lockform><h2>Locked</h2><p class="hint">${note || 'Enter your PIN to carry on.'}</p>
    <input class="field" id="lockPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-label="PIN" required>
    <div class="btns"><button class="btn pri">Unlock</button></div><p class="hint" data-lockmsg aria-live="polite"></p>
    <p class="hint"><a href="#" data-lockforgot>Forgot your PIN? Sign out.</a> That clears the lock on this device.</p></form>`;
}

export function bindLockForm(host, { onUnlock, onForgot }){
  const f = host.querySelector('[data-lockform]');
  if (!f) return;
  const msg = f.querySelector('[data-lockmsg]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await checkPin(f.querySelector('#lockPin').value.trim());
    if (r.ok) { onUnlock(); return; }
    f.querySelector('#lockPin').value = '';
    msg.textContent = r.wait ? `Too many wrong tries. Wait ${r.wait} second${r.wait === 1 ? '' : 's'}.` : `Wrong PIN. ${r.left} tr${r.left === 1 ? 'y' : 'ies'} before it slows you down.`;
  });
  f.querySelector('[data-lockforgot]').addEventListener('click', (e) => { e.preventDefault(); onForgot(); });
  const pin = f.querySelector('#lockPin'); if (pin) pin.focus();
}
