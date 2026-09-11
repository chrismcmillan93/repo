import { qs, esc, toast, friendlyError } from './utils.js';
import { state, loadCore } from './state.js';
import { initRouter, renderRoute } from './router.js';
import { APP_PIN } from './config.js';

const PIN_KEY = 'thailand-uat-pin-ok';
const pinScreen = qs('#pinScreen');
const appShell = qs('#appShell');
let routerStarted = false;
let countdownTimer = null;

/* ---------------- header: countdown + flight card ---------------- */

function renderCountdown() {
  clearInterval(countdownTimer);
  const target = state.trip ? new Date(state.trip.target_departure).getTime() : null;
  function tick() {
    const diff = target ? Math.max(0, target - Date.now()) : 0;
    const pad = (n) => String(n).padStart(2, '0');
    qs('#cdDays').textContent = target ? Math.floor(diff / 86400000) : '–';
    qs('#cdHours').textContent = target ? pad(Math.floor((diff % 86400000) / 3600000)) : '–';
    qs('#cdMins').textContent = target ? pad(Math.floor((diff % 3600000) / 60000)) : '–';
    qs('#cdSecs').textContent = target ? pad(Math.floor((diff % 60000) / 1000)) : '–';
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function renderFlightCard() {
  const legs = state.flightLegs;
  if (!legs.length) { qs('#flightCard').innerHTML = '<p class="section-note">No flights logged yet.</p>'; return; }
  const rows = legs.map((f, idx) => (
    (idx > 0 ? '<div class="flight-divider"></div>' : '') +
    '<div class="flight-row"><span class="flight-route">' + esc(f.route) + '</span>' +
    '<span class="flight-right">' + esc(f.confirmation || '—') + '</span></div>' +
    '<div class="flight-meta">' + esc(f.airline) + (f.when_label ? ' · ' + esc(f.when_label) : '') + '</div>' +
    (f.detail ? '<div class="flight-meta">' + esc(f.detail) + '</div>' : '')
  )).join('');
  qs('#flightCard').innerHTML = rows;
}

/* ---------------- PIN gate ---------------- */

function showApp(show) {
  pinScreen.hidden = show;
  appShell.hidden = !show;
}

function wirePinForm() {
  const form = qs('#pinForm');
  const error = qs('#pinError');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = qs('#pinInput').value.trim();
    if (val !== APP_PIN) {
      error.textContent = "That's not the right PIN.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    try { window.sessionStorage.setItem(PIN_KEY, '1'); } catch (e2) { /* ignore */ }
    showApp(true);
    enterApp();
  });
}

function wireLockButton() {
  qs('#lockBtn').addEventListener('click', () => {
    try { window.sessionStorage.removeItem(PIN_KEY); } catch (e) { /* ignore */ }
    qs('#pinInput').value = '';
    showApp(false);
  });
}

function pinAlreadyOk() {
  try { return window.sessionStorage.getItem(PIN_KEY) === '1'; } catch (e) { return false; }
}

/* ---------------- boot sequencing ---------------- */

async function enterApp() {
  try {
    await loadCore();
  } catch (err) {
    toast(friendlyError(err));
    return;
  }

  renderCountdown();
  renderFlightCard();

  if (!routerStarted) {
    routerStarted = true;
    initRouter();
    window.addEventListener('th:tripchange', async () => {
      await loadCore();
      renderCountdown();
      renderFlightCard();
      renderRoute();
    });
  }

  await renderRoute();
}

async function boot() {
  wirePinForm();
  wireLockButton();
  if (pinAlreadyOk()) {
    showApp(true);
    await enterApp();
  } else {
    showApp(false);
    qs('#pinInput').focus();
  }
}

boot();
