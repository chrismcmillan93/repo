// Bootstraps the Goals & Progress app: wires up the sign-in forms, reacts to
// auth state, and — once signed in — proves the authenticated round-trip to
// the `goals` schema actually works by seeding + fetching `life_areas`.
//
// This is intentionally the whole app for now (build step 2: auth shell).
// Areas/goals CRUD, the dashboard, and everything else come in later steps.

import { supabase } from './supabaseClient.js';
import {
  requestSignIn,
  verifyCode,
  signOut,
  getCurrentSession,
  onAuthStateChange,
  readAuthErrorFromUrl
} from './auth.js';

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');

const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('auth-email');
const authError = document.getElementById('auth-error');
const authSent = document.getElementById('auth-sent');
const authSubmit = document.getElementById('auth-submit');
const authRetry = document.getElementById('auth-retry');

const codeForm = document.getElementById('code-form');
const codeInput = document.getElementById('auth-code');
const codeSubmit = document.getElementById('code-submit');

const userEmailEl = document.getElementById('auth-user-email');
const logoutBtn = document.getElementById('logout-btn');

const connStatus = document.getElementById('conn-status');
const areasList = document.getElementById('areas-list');

let pendingEmail = '';
let hasRunConnectionCheck = false;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function showAuthScreen() {
  appShell.style.display = 'none';
  authScreen.style.display = '';
}

function showApp(user) {
  authScreen.style.display = 'none';
  appShell.style.display = '';
  userEmailEl.textContent = user.email || '';
  if (!hasRunConnectionCheck) {
    hasRunConnectionCheck = true;
    runConnectionCheck();
  }
}

function handleSession(session) {
  if (session && session.user) {
    showApp(session.user);
  } else {
    hasRunConnectionCheck = false;
    showAuthScreen();
  }
}

/**
 * Proves the authenticated fetch works end to end: calls seed_default_areas()
 * (safe to call repeatedly — see §0 of the build spec) then reads back
 * life_areas, which only succeeds if the schema is exposed, RLS is scoped
 * correctly, and the client is pointed at the right schema.
 */
async function runConnectionCheck() {
  connStatus.textContent = 'Checking the goals schema…';
  areasList.innerHTML = '';

  const { error: seedError } = await supabase.rpc('seed_default_areas');
  if (seedError) {
    connStatus.innerHTML =
      'Could not reach the <code>goals</code> schema yet: <strong>' +
      escapeHtml(seedError.message || String(seedError)) +
      '</strong>. If this says "not found" or similar, the schema probably ' +
      'still needs adding under Settings → API → Exposed schemas (see §8 of the build spec).';
    return;
  }

  const { data, error } = await supabase
    .from('life_areas')
    .select('id, name, colour, sort_order')
    .is('archived_at', null)
    .order('sort_order', { ascending: true });

  if (error) {
    connStatus.innerHTML =
      'Signed in, but the fetch against <code>life_areas</code> failed: <strong>' +
      escapeHtml(error.message || String(error)) + '</strong>.';
    return;
  }

  connStatus.textContent = data.length
    ? 'Signed in and reading life_areas from the goals schema:'
    : 'Signed in — connection works, but life_areas came back empty.';

  areasList.innerHTML = data.map((area) => (
    '<li><span class="area-dot" style="background:' + escapeHtml(area.colour || '#999') + '"></span>' +
    escapeHtml(area.name) + '</li>'
  )).join('');
}

function setupAuthForm() {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';
    authSubmit.disabled = true;
    authSubmit.textContent = 'Sending…';
    try {
      const email = emailInput.value.trim();
      await requestSignIn(email);
      pendingEmail = email;
      authForm.style.display = 'none';
      authSent.style.display = '';
      codeInput.focus();
    } catch (err) {
      authError.textContent = err.message || 'Something went wrong sending that link.';
      authError.style.display = '';
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = 'Send magic link';
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';
    const token = codeInput.value.trim();
    if (!token || !pendingEmail) return;
    codeSubmit.disabled = true;
    codeSubmit.textContent = 'Verifying…';
    try {
      await verifyCode(pendingEmail, token);
      // success fires onAuthStateChange, which swaps in the app shell
    } catch (err) {
      authError.textContent = err.message || "That code wasn't accepted.";
      authError.style.display = '';
      codeInput.value = '';
      codeInput.focus();
    } finally {
      codeSubmit.disabled = false;
      codeSubmit.textContent = 'Verify code';
    }
  });

  authRetry.addEventListener('click', () => {
    authSent.style.display = 'none';
    authForm.style.display = '';
    authError.style.display = 'none';
    emailInput.value = '';
    codeInput.value = '';
    pendingEmail = '';
    emailInput.focus();
  });
}

function setupLogout() {
  logoutBtn.addEventListener('click', async () => {
    await signOut();
    window.location.reload();
  });
}

function showAuthErrorFromUrl(info) {
  const desc = (info.error_description || '').replace(/\+/g, ' ');
  const code = info.error_code || info.error || '';
  authError.textContent = desc ? (desc + ' (' + code + ')') : ('Sign-in failed: ' + code);
  authError.style.display = '';
}

async function bootstrap() {
  setupAuthForm();
  setupLogout();

  const urlError = readAuthErrorFromUrl();

  onAuthStateChange((session) => handleSession(session));

  const session = await getCurrentSession();
  handleSession(session);

  if (!session && urlError) {
    showAuthErrorFromUrl(urlError);
  }
}

bootstrap();
