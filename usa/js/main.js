import { qs, qsa, toast, friendlyError } from './utils.js';
import { db } from './db.js';
import { state, getViewCurrency, setViewCurrency, loadCore } from './state.js';
import { initRouter, renderRoute } from './router.js';
import { renderMasthead } from './views/overview.js';
import { initStopsPanel, refreshStopsPanel } from './legsPanel.js';
import { getLiveRate } from './fxRate.js';
import { exportTripPdf } from './print.js';
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
    const label = state.fxIsLive ? ' (live)' : '';
    note.textContent = `1 GBP = ${Number(state.trip.fx_rate).toFixed(4)} USD${label}`;
  } else {
    note.textContent = 'Rate not set';
  }
}

// Applies a freshly-fetched GBP->USD rate to state.trip.fx_rate in memory
// only — never written to the DB — so every screen's conversions update
// without the user having to open the fx editor at all. If the fetch fails
// (or the trip has no fx_rate at all yet) this is a silent no-op and the
// last saved rate keeps being used. Skipped entirely once the user has
// explicitly saved a rate this page load (state.fxManualOverride) — an
// unrelated edit elsewhere (adding a stop, ticking off a checklist item)
// re-runs loadCore()/applyLiveRate() too, and that must never silently
// swap a deliberately-chosen rate back to live.
async function applyLiveRate(){
  if (!state.trip || state.fxManualOverride) return;
  const rate = await getLiveRate();
  if (!rate || !state.trip || state.fxManualOverride) return;
  state.trip.fx_rate = rate;
  state.fxIsLive = true;
  renderFxNote();
  renderRoute();
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
      <span class="fx-edit-row">
        <input type="number" step="0.0001" min="0.0001" value="${current || ''}" aria-label="GBP to USD rate">
        <button type="button" class="fx-save">Save</button>
        <button type="button" class="fx-cancel">Cancel</button>
      </span>
      <span class="fx-live-hint"></span>
    `;
    btn.replaceWith(form);
    const input = qs('input', form);
    input.focus();
    input.select();

    // The field is already pre-filled with today's live rate whenever one
    // was fetched successfully (see applyLiveRate) — this is just a status
    // line explaining what that number is, and what Save will do to it.
    const hint = qs('.fx-live-hint', form);
    hint.textContent = state.fxIsLive
      ? "This is today's live rate, updating automatically. Save to fix it instead."
      : state.fxManualOverride
        ? "Showing your saved rate — live updates are off until you reload the page."
        : "Live rate unavailable right now — showing the last saved rate.";

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
        state.fxIsLive = false;
        state.fxManualOverride = true;
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

function wireExportButton(){
  qs('#exportTripBtn').addEventListener('click', () => exportTripPdf());
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
  // Fire-and-forget: don't hold up the first render on a network round
  // trip. renderFxNote()/renderRoute() re-run inside applyLiveRate() once
  // (if) it resolves, so the displayed conversions just update in place.
  applyLiveRate();

  if (!routerStarted) {
    routerStarted = true;
    initRouter();
    initStopsPanel();
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
      refreshStopsPanel();
      renderRoute();
      applyLiveRate();
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
  wireExportButton();
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
