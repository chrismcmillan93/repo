// Bootstraps the Goals & Progress app: auth forms, session handling, and
// route registration. Each view lives in js/views/*.js.

import { supabase } from './supabaseClient.js';
import {
  requestSignIn, verifyCode, signOut, getCurrentSession, onAuthStateChange, readAuthErrorFromUrl
} from './auth.js';
import { setCurrentUser } from './state.js';
import { route, startRouter } from './router.js';
import { DEMO_MODE } from './config.js';
import { bindThemePicker } from './theme.js';

import { renderDashboard } from './views/dashboard.js';
import { renderAreas } from './views/areas.js';
import { renderGoalDetail } from './views/goalDetail.js';
import { renderGoalForm } from './views/goalForm.js';
import { renderReviewNew, renderReviewFlow } from './views/reviewFlow.js';
import { renderReviewsArchive, renderReviewDetail } from './views/reviewsArchive.js';
import { renderSearch } from './views/search.js';
import { renderNotesHome, renderNoteForm, renderNoteDetail } from './views/notes.js';

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const viewRoot = document.getElementById('view-root');

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
const demoBanner = document.getElementById('demo-banner');
const themeSelect = document.getElementById('theme-select');
bindThemePicker(themeSelect);

let pendingEmail = '';
let routerStarted = false;
let seededThisSession = false;

function showAuthScreen() {
  appShell.style.display = 'none';
  authScreen.style.display = '';
}

async function showApp(user) {
  authScreen.style.display = 'none';
  appShell.style.display = '';
  userEmailEl.textContent = user.email || '';

  if (!seededThisSession) {
    seededThisSession = true;
    if (!DEMO_MODE) {
      // Safe to call repeatedly (on conflict do nothing) — see §0 of the build spec.
      supabase.rpc('seed_default_areas').then(({ error }) => {
        if (error) console.warn('seed_default_areas failed — is the goals schema exposed yet?', error.message);
      });
    }
  }

  if (!routerStarted) {
    routerStarted = true;
    registerRoutes();
    startRouter(viewRoot);
  }
}

function handleSession(session) {
  if (session && session.user) {
    setCurrentUser(session.user);
    showApp(session.user);
  } else {
    setCurrentUser(null);
    showAuthScreen();
  }
}

function registerRoutes() {
  route('/', renderDashboard);
  route('/areas', renderAreas);
  route('/goal/new', renderGoalForm);
  route('/goal/:id', renderGoalDetail);
  route('/goal/:id/edit', renderGoalForm);
  route('/review/new', renderReviewNew);
  route('/review/:id', renderReviewFlow);
  route('/reviews', renderReviewsArchive);
  route('/reviews/:id', renderReviewDetail);
  route('/search', renderSearch);
  route('/notes', renderNotesHome);
  route('/notes/new', renderNoteForm);
  route('/notes/:id', renderNoteDetail);
}

function setNavActive() {
  const path = window.location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('.app-nav a').forEach((a) => {
    const target = a.getAttribute('data-nav');
    a.classList.toggle('is-active', target === '/' ? path === '/' : path.startsWith(target));
  });
}
window.addEventListener('hashchange', setNavActive);

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
  if (DEMO_MODE) {
    // Sign-in is temporarily disabled — see config.js to re-enable it.
    if (demoBanner) demoBanner.hidden = false;
    logoutBtn.style.display = 'none';
    const demoUser = { id: 'demo-user', email: 'UAT — sign-in disabled, example data' };
    setCurrentUser(demoUser);
    showApp(demoUser);
    return;
  }

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
