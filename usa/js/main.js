import { qs, qsa, toast, friendlyError } from './utils.js';
import { db } from './db.js';
import { state, getViewCurrency, setViewCurrency, loadCore } from './state.js';
import { initRouter, renderRoute } from './router.js';
import { renderMasthead } from './views/overview.js';
import {
  requestSignIn, verifyCode, signOut, getCurrentSession, onAuthStateChange, readAuthErrorFromUrl
} from './auth.js';

const authScreen = qs('#authScreen');
const createTripScreen = qs('#createTripScreen');
const appShell = qs('#appShell');

let pendingEmail = '';
let routerStarted = false;

function showScreen(name){
  authScreen.hidden = name !== 'auth';
  createTripScreen.hidden = name !== 'createTrip';
  appShell.hidden = name !== 'app';
}

/* ---------------- header bits (currency, fx rate, bunting, brand) ---------------- */

function renderBunting(){
  const row = qs('#buntingRow');
  if (!row) return;
  let flags = '';
  for (let i = 0; i < 26; i++) flags += '<svg class="flag-flutter" viewBox="0 0 60 44"><use href="#usflag"></use></svg>';
  row.innerHTML = flags;
}

function renderCurrencyToggle(){
  const active = getViewCurrency();
  qsa('#currencyToggle .toggle-pair button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.currency === active);
  });
}

function renderFxNote(){
  const note = qs('#fxNote');
  if (!note) return;
  if (state.trip && state.trip.fx_rate) {
    note.textContent = `1 GBP = ${Number(state.trip.fx_rate).toFixed(4)} USD`;
  } else {
    note.textContent = 'Rate not set';
  }
}

function renderBrandSub(){
  const sub = qs('#brandSub');
  if (!sub) return;
  sub.textContent = state.legs.length ? state.legs.map((l) => l.name).join(' · ') : '';
}

function renderBrandTitle(){
  const name = state.trip ? state.trip.name : 'Your trip';
  const el = qs('#brandTitleText');
  if (el) el.textContent = name;
  document.title = name;
}

function wireCurrencyToggle(){
  qs('#currencyToggle .toggle-pair').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-currency]');
    if (!btn) return;
    setViewCurrency(btn.dataset.currency);
  });
}

function wireFxEdit(){
  const btn = qs('#fxEditBtn');
  btn.addEventListener('click', () => {
    if (qs('.fx-edit-form')) return; // already open
    const current = state.trip ? state.trip.fx_rate : '';
    const form = document.createElement('span');
    form.className = 'fx-edit-form';
    form.innerHTML = `
      <input type="number" step="0.0001" min="0.0001" value="${current || ''}" aria-label="GBP to USD rate">
      <button type="button" class="fx-save">Save</button>
      <button type="button" class="fx-cancel">Cancel</button>
    `;
    btn.replaceWith(form);
    const input = qs('input', form);
    input.focus();
    input.select();

    function close(restoreBtn){
      form.replaceWith(btn);
      if (restoreBtn) wireFxEdit();
    }
    qs('.fx-cancel', form).addEventListener('click', () => close(true));
    qs('.fx-save', form).addEventListener('click', async () => {
      const val = parseFloat(input.value);
      if (!val || val <= 0) { toast('Enter a rate greater than zero'); return; }
      try {
        state.trip = await db.trips.update(state.trip.id, { fx_rate: val });
        renderFxNote();
        toast('Exchange rate updated');
        close(true);
        renderRoute();
      } catch (err) {
        toast(friendlyError(err));
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') qs('.fx-save', form).click();
      if (e.key === 'Escape') close(true);
    });
  });
}

function wireSignOutButtons(){
  qsa('#signOutBtn, #createTripSignOut').forEach((btn) => {
    btn.addEventListener('click', () => signOut());
  });
}

/* ---------------- sign-in / sign-up forms ---------------- */

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

function wireCreateTripForm(){
  const form = qs('#createTripForm');
  const error = qs('#createTripError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const name = qs('#tripName').value.trim();
    const start = qs('#tripStart').value;
    const end = qs('#tripEnd').value;
    if (!name || !start || !end) return;
    if (end < start) {
      error.textContent = 'End date must be on or after the start date.';
      error.hidden = false;
      return;
    }
    const btn = qs('#createTripSubmit');
    btn.disabled = true;
    try {
      await db.trips.create({
        user_id: state.session.user.id,
        name,
        start_date: start,
        end_date: end,
        home_currency: 'GBP',
        spend_currency: 'USD',
        fx_rate: 1.27
      });
      await enterApp();
    } catch (err) {
      error.textContent = friendlyError(err);
      error.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------------- boot sequencing ---------------- */

async function enterApp(){
  try {
    await loadCore(state.session.user.id);
  } catch (err) {
    toast(friendlyError(err));
    return;
  }

  if (!state.trip) {
    showScreen('createTrip');
    return;
  }

  showScreen('app');
  renderFxNote();
  renderBrandSub();
  renderBrandTitle();
  renderMasthead();
  qs('#signedInAs').textContent = state.session.user.email || '';

  if (!routerStarted) {
    routerStarted = true;
    initRouter();
    window.addEventListener('usa:currencychange', () => {
      renderCurrencyToggle();
      renderRoute();
    });
    window.addEventListener('usa:tripchange', async () => {
      await loadCore(state.session.user.id);
      renderFxNote();
      renderBrandSub();
      renderBrandTitle();
      renderMasthead();
      renderRoute();
    });
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
  renderBunting();
  wireCurrencyToggle();
  wireFxEdit();
  wireAuthForms();
  wireCreateTripForm();
  wireSignOutButtons();
  renderCurrencyToggle();

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
