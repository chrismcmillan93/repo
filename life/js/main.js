// Boot: sign-in (shared with Goals and Fitness), theme, tabs and hash routing.
// Routes look like #/health/week/2026-11-30; each view gets a fresh root element
// and the path segments after its name.
import { LIFE_START, beforeStart } from './start.js';
import { diffDays } from './streaks.js';
import { supabase } from './supabaseClient.js';
import { requestSignIn, verifyCode, signOut, getCurrentSession, onAuthStateChange, readAuthErrorFromUrl } from './auth.js';
import { setUser } from './store.js';
import { initTheme } from './theme.js';
import { state as fitState } from './fit/state.js';
import { escapeHtml, formatDateFull, todayStr, toast } from './fit/utils.js';
import { registerSw, clearOfflineData } from './pwa.js';
import { loadAway } from './away.js';
import { initLock, appBlocked, privateBlocked, lockFormHtml, bindLockForm, clearLock } from './lock.js';

const TABS = [['today', 'Today'], ['goals', 'Goals'], ['week', 'Week'], ['review', 'Review'], ['tasks', 'To-dos'], ['health', 'Health'], ['quit', 'Giving up'], ['lists', 'Lists'], ['career', 'Career'], ['events', 'Events'], ['journal', 'Journal'], ['wrapped', 'Wrapped'], ['playbook', 'Playbook'], ['settings', 'Settings']];
const $ = (s) => document.querySelector(s);
let signedIn = false;
let renderToken = 0;

// Forgotten PIN: signing out clears the lock on this device.
async function forgotPin(){
  clearLock(); clearOfflineData(); await signOut(); toast('Signed out. The lock is cleared on this device.');
  $('#lock').hidden = true; $('#lock').innerHTML = '';
}

async function route(){
  if (!signedIn) return;
  const lockEl = $('#lock');
  if (appBlocked()) {
    lockEl.hidden = false;
    lockEl.innerHTML = `<div class="panel lockpanel">${lockFormHtml()}</div>`;
    bindLockForm(lockEl, { onUnlock: () => { lockEl.hidden = true; lockEl.innerHTML = ''; route(); }, onForgot: forgotPin });
    return;
  }
  lockEl.hidden = true; lockEl.innerHTML = '';
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = TABS.some((t) => t[0] === parts[0]) ? parts[0] : 'today';
  const link = (k) => { const t = TABS.find((x) => x[0] === k); return `<a href="#/${k}" class="${k === name ? 'on' : ''}"${k === name ? ' aria-current="page"' : ''}>${t[1]}</a>`; };
  $('#tabs').innerHTML = MENU.map(([group, keys]) => keys.length === 1
    ? `<div class="menugroup single">${link(keys[0])}</div>`
    : `<details class="menugroup"${keys.includes(name) ? ' open' : ''}><summary>${group}</summary>${keys.map(link).join('')}</details>`).join('');
  $('#here').textContent = (TABS.find((t) => t[0] === name) || TABS[0])[1];
  closeMenu();
  const token = ++renderToken;
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = '<p class="hint">Loading…</p>';
  $('#main').replaceChildren(root);
  window.scrollTo(0, 0);
  if (name === 'quit' && privateBlocked()) {
    root.innerHTML = `<section class="panel">${lockFormHtml('Giving up is locked.')}</section>`;
    bindLockForm(root, { onUnlock: route, onForgot: forgotPin });
    return;
  }
  if (beforeStart(todayStr()) && name !== 'settings') {
    const n = diffDays(todayStr(), LIFE_START);
    root.innerHTML = `<section class="panel"><h2>Life starts on ${formatDateFull(LIFE_START)}</h2>
      <p class="big">${n}</p><p class="hint">day${n === 1 ? '' : 's'} to go</p>
      <p>A fresh plan, from day one. Until then nothing is tracked, nothing is due and no reminders are sent. Settings is open if you want to set the app up first.</p>
      <div class="btns"><a class="btn" href="#/settings">Open Settings</a></div></section>`;
    return;
  }
  try {
    const view = await import(`./views/${name}.js`);
    if (token !== renderToken) return;
    await view.render(root, parts.slice(1));
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    const schema = /schema must be one of|PGRST106/i.test(err.message || '');
    const offline = !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(err.message || '');
    root.innerHTML = `<section class="panel"><h2>Couldn't load this screen</h2><p>${escapeHtml(err.message || String(err))}</p>
      ${offline ? '<p class="hint">You seem to be offline and this screen has not been opened on this device before, so there is no saved copy yet.</p>' : ''}
      ${schema ? '<p class="hint">One-time setup: in the Supabase dashboard open Project Settings, Data API, and add <b>life</b> to "Exposed schemas" (keep the existing entries), then reload.</p>' : ''}
      <div class="btns"><button class="btn" id="retry">Try again</button></div></section>`;
    root.querySelector('#retry').addEventListener('click', route);
  }
}

async function showApp(session){
  signedIn = !!session;
  $('#auth').hidden = signedIn;
  $('#app').hidden = !signedIn;
  if (!signedIn) return;
  initMenu();
  setUser(session.user.id);
  fitState.session = session;
  $('#date').textContent = formatDateFull(todayStr());
  try { await loadAway(); } catch (err) { console.warn('Away mode not loaded:', err.message); }
  initLock(route);
  route();
}

// The menu: every section, grouped. Opens from the ☰ button; closes on a choice, Escape or a tap outside.
const MENU = [['Daily', ['today', 'week', 'tasks']], ['Goals and growth', ['goals', 'review', 'career', 'playbook']], ['Life', ['health', 'lists', 'events', 'journal', 'wrapped']], ['Private', ['quit']], ['App', ['settings']]]  // a group of one is a plain link, not a dropdown;
function closeMenu(){ const m = $('#tabs'); if (!m) return; m.hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }
let menuReady = false;
function initMenu(){
  if (menuReady) return; menuReady = true;
  const btn = $('#menuBtn'), menu = $('#tabs');
  btn.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) { const a = menu.querySelector('a.on') || menu.querySelector('a'); if (a) a.focus(); } });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('#tabs')) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); btn.focus(); } });
}
function initAuthForm(){
  const msg = $('#authMsg');
  let email = '';
  $('#emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    email = $('#email').value.trim();
    msg.textContent = 'Sending…';
    try {
      await requestSignIn(email);
      msg.textContent = `Check ${email} for a sign-in link, or type the 6-digit code from the same email.`;
      $('#codeForm').hidden = false;
      $('#code').focus();
    } catch (err) { msg.textContent = `Couldn't send the email: ${err.message}`; }
  });
  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Checking…';
    try { await verifyCode(email, $('#code').value.trim()); } catch (err) { msg.textContent = `That code didn't work: ${err.message}`; }
  });
  const err = readAuthErrorFromUrl() || {};
  if (err.error_description || err.error) {
    msg.textContent = `Sign-in link problem: ${err.error_description || err.error}. Request a new one below.`;
    history.replaceState(null, '', window.location.pathname);
  }
}

async function boot(){
  initTheme($('#themeBtn'));
  initAuthForm();
  $('#signOut').addEventListener('click', async () => { clearLock(); clearOfflineData(); await signOut(); toast('Signed out'); });
  registerSw();
  const net = () => { $('#offline').hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); route(); });
  window.addEventListener('offline', net);
  net();
  window.addEventListener('hashchange', route);
  let lastUser = null;
  const onSession = (session) => {
    const id = session ? session.user.id : null;
    if (id === lastUser && signedIn === !!session) return; // token refreshes shouldn't re-render
    lastUser = id;
    showApp(session);
  };
  onAuthStateChange(onSession);
  try { onSession(await getCurrentSession()); } catch (_) { onSession(null); }
}

boot();
export { supabase };
