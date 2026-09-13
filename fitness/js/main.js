import { qs, qsa, toast, friendlyError } from './utils.js';
import { db } from './db.js';
import { state } from './state.js';
import { initRouter, renderRoute } from './router.js';
import * as offlineQueue from './offlineQueue.js';
import {
  requestSignIn, verifyCode, signOut, getCurrentSession, onAuthStateChange, readAuthErrorFromUrl
} from './auth.js';

const authScreen = qs('#authScreen');
const appShell = qs('#appShell');

let pendingEmail = '';
let routerStarted = false;

function showScreen(name){
  authScreen.hidden = name !== 'auth';
  appShell.hidden = name !== 'app';
}

const REPLAYERS = {
  daily_log: (payload) => db.dailyLogs.upsert(payload.userId, payload.logDate, payload.fields),
  daily_check: (payload) => db.dailyChecks.upsert(payload.userId, payload.logDate, payload.itemId, payload.isChecked)
};

function wireAuthForms(){
  const authForm = qs('#authForm');
  const authError = qs('#authError');
  const authSent = qs('#authSent');
  const codeForm = qs('#codeForm');
  const codeError = qs('#codeError');
  const authRetry = qs('#authRetry');

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.hidden = true;
    const email = qs('#authEmail').value.trim();
    if (!email) return;
    const btn = qs('#authSubmit');
    btn.disabled = true;
    try {
      await requestSignIn(email);
      pendingEmail = email;
      authForm.hidden = true;
      authSent.hidden = false;
    } catch (err) {
      authError.textContent = friendlyError(err);
      authError.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    codeError.hidden = true;
    const code = qs('#authCode').value.trim();
    if (!code) return;
    const btn = qs('#codeSubmit');
    btn.disabled = true;
    try {
      await verifyCode(pendingEmail, code);
      // Success fires onAuthStateChange, which swaps in the app shell.
    } catch (err) {
      codeError.textContent = friendlyError(err);
      codeError.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  authRetry.addEventListener('click', () => {
    authForm.hidden = false;
    authForm.reset();
    authSent.hidden = true;
    pendingEmail = '';
  });
}

function wireSignOut(){
  qs('#signOutBtn').addEventListener('click', () => signOut());
}

async function enterApp(){
  showScreen('app');
  qs('#signedInAs').textContent = state.session.user.email || '';

  if (!routerStarted) {
    routerStarted = true;
    initRouter();
    offlineQueue.initAutoFlush(REPLAYERS, (res) => toast(`Saved ${res.succeeded} pending change${res.succeeded === 1 ? '' : 's'} now you're back online.`));
    // Retry anything left over from a previous session/reload too.
    offlineQueue.flush(REPLAYERS);
  }

  await renderRoute();
}

async function handleSession(session){
  state.session = session;
  if (session && session.user) {
    await enterApp();
  } else {
    routerStarted = false;
    showScreen('auth');
    qs('#authForm').hidden = false;
    qs('#authSent').hidden = true;
  }
}

async function boot(){
  wireAuthForms();
  wireSignOut();

  const urlError = readAuthErrorFromUrl();

  onAuthStateChange((session) => {
    handleSession(session).catch((err) => toast(friendlyError(err)));
  });

  const session = await getCurrentSession();
  await handleSession(session);

  if (!session && urlError) {
    const authError = qs('#authError');
    authError.textContent = urlError.error_description
      ? urlError.error_description.replace(/\+/g, ' ')
      : 'That sign-in link has expired or was already used — request a new one.';
    authError.hidden = false;
  }
}

boot();
