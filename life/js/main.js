// Boot: sign-in (shared with Goals and Fitness), theme, tabs and hash routing.
// Routes look like #/health/week/2026-11-30; each view gets a fresh root element
// and the path segments after its name.
import { supabase } from './supabaseClient.js';
import { requestSignIn, verifyCode, signOut, getCurrentSession, onAuthStateChange, readAuthErrorFromUrl } from './auth.js';
import { setUser } from './store.js';
import { initTheme } from './theme.js';
import { state as fitState } from './fit/state.js';
import { escapeHtml, formatDateFull, todayStr, toast } from './fit/utils.js';

const TABS = [['today', 'Today'], ['goals', 'Goals'], ['week', 'Week'], ['tasks', 'To-dos'], ['lists', 'Lists'], ['career', 'Career'], ['health', 'Health'], ['events', 'Events'], ['journal', 'Journal']];
const $ = (s) => document.querySelector(s);
let signedIn = false;
let renderToken = 0;

async function route(){
  if (!signedIn) return;
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = TABS.some((t) => t[0] === parts[0]) ? parts[0] : 'today';
  $('#tabs').innerHTML = TABS.map(([k, label]) => `<a href="#/${k}" class="${k === name ? 'on' : ''}">${label}</a>`).join('');
  const active = $('#tabs a.on');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  const token = ++renderToken;
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = '<p class="hint">Loading…</p>';
  $('#main').replaceChildren(root);
  window.scrollTo(0, 0);
  try {
    const view = await import(`./views/${name}.js`);
    if (token !== renderToken) return;
    await view.render(root, parts.slice(1));
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    const schema = /schema must be one of|PGRST106/i.test(err.message || '');
    root.innerHTML = `<section class="panel"><h2>Couldn't load this screen</h2><p>${escapeHtml(err.message || String(err))}</p>
      ${schema ? '<p class="hint">One-time setup: in the Supabase dashboard open Project Settings, Data API, and add <b>life</b> to "Exposed schemas" (keep the existing entries), then reload.</p>' : ''}
      <div class="btns"><button class="btn" id="retry">Try again</button></div></section>`;
    root.querySelector('#retry').addEventListener('click', route);
  }
}

function showApp(session){
  signedIn = !!session;
  $('#auth').hidden = signedIn;
  $('#app').hidden = !signedIn;
  if (!signedIn) return;
  setUser(session.user.id);
  fitState.session = session;
  $('#date').textContent = formatDateFull(todayStr());
  route();
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
  $('#signOut').addEventListener('click', async () => { await signOut(); toast('Signed out'); });
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
