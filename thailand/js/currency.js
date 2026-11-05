// Quick GBP <-> THB converter, top right of the header. Type in either box and
// the other updates (both directions). Live rate, display-only: it is never
// written to the database and never touches trip.thb_rate (that's the saved
// *budget* rate the Costs screen uses).
//
// Rate sources, tried in order — free, keyless, CORS-enabled (same two the USA
// app uses, same "one provider being down shouldn't kill it" reasoning):
// frankfurter.app, then open.er-api.com. The last good rate is kept in
// localStorage so the converter still works with no signal, labelled with when
// it was fetched. With nothing cached at all it falls back to the trip's saved
// thb_rate and says so — it never shows a rate without saying where it's from.
import { qs } from './utils.js';
import { state } from './state.js';

const CACHE_KEY = 'th-fx-gbp-thb';
const FRESH_MS = 10 * 60 * 1000; // don't refetch more often than this
const TIMEOUT_MS = 6000;

let rate = null;          // THB per £1
let rateAt = null;        // ms timestamp the rate was fetched
let source = 'none';      // 'live' | 'cached' | 'trip' | 'none'
let lastEdited = 'gbp';   // which box the user typed in last
let inflight = null;

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && typeof c.rate === 'number' && c.rate > 0 && typeof c.at === 'number') return c;
  } catch (_) { /* ignore */ }
  return null;
}
function writeCache(r, at) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rate: r, at })); } catch (_) { /* private mode */ }
}

function timeoutSignal() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
}
async function fetchRate(url, pick) {
  const res = await fetch(url, { signal: timeoutSignal() });
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  const r = pick(await res.json());
  if (typeof r !== 'number' || !(r > 0)) throw new Error(url + ' -> no THB rate');
  return r;
}
async function fetchLive() {
  try {
    return await fetchRate('https://api.frankfurter.app/latest?from=GBP&to=THB', (d) => d && d.rates && d.rates.THB);
  } catch (err) {
    console.warn('[fx] frankfurter failed, trying fallback', err);
    return fetchRate('https://open.er-api.com/v6/latest/GBP', (d) => d && d.rates && d.rates.THB);
  }
}

// Refresh the rate. Resolves to true if a live rate was obtained. A failure
// clears `inflight` so the next call genuinely retries (same lesson as the USA
// app's fxRate.js).
function refresh(force) {
  if (inflight) return inflight;
  if (!force && source === 'live' && rateAt && Date.now() - rateAt < FRESH_MS) return Promise.resolve(true);
  if (navigator.onLine === false) return Promise.resolve(false);
  inflight = fetchLive()
    .then((r) => { rate = r; rateAt = Date.now(); source = 'live'; writeCache(r, rateAt); return true; })
    .catch((err) => { console.warn('[fx] live rate unavailable', err); return false; })
    .then((ok) => { inflight = null; return ok; });
  return inflight;
}

function adoptBestKnownRate() {
  if (source === 'live') return;
  const c = readCache();
  if (c) { rate = c.rate; rateAt = c.at; source = 'cached'; return; }
  const t = state.trip && Number(state.trip.thb_rate);
  if (t > 0) { rate = t; rateAt = null; source = 'trip'; return; }
  rate = null; source = 'none';
}

/* ---------------- parsing / formatting ---------------- */

function parse(v) {
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const fmtGbp = (n) => (Math.round(n * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtThb = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 });

/* ---------------- UI ---------------- */

function statusText() {
  const when = (ts) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (rate == null) return 'No rate available yet — connect once to load it.';
  const base = '£1 = ฿' + rate.toFixed(2);
  if (source === 'live') return base + ' · live, updated ' + when(rateAt);
  if (source === 'cached') return base + ' · offline — last saved rate from ' + when(rateAt);
  return base + ' · trip budget rate (not live)';
}

function render() {
  const note = qs('#fxStatus');
  if (note) note.textContent = statusText();
  recalc();
}

function recalc() {
  const gbp = qs('#fxGbp'), thb = qs('#fxThb');
  if (!gbp || !thb) return;
  if (rate == null) return;
  if (lastEdited === 'gbp') {
    const g = parse(gbp.value);
    thb.value = g == null ? '' : fmtThb(g * rate);
  } else {
    const t = parse(thb.value);
    gbp.value = t == null ? '' : fmtGbp(t / rate);
  }
}

export function initCurrencyConverter() {
  const btn = qs('#fxBtn'), panel = qs('#fxPanel');
  if (!btn || !panel) return;
  const gbp = qs('#fxGbp'), thb = qs('#fxThb');

  const setOpen = (open) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      adoptBestKnownRate();
      render();
      refresh(false).then(() => { adoptBestKnownRate(); render(); });
      (lastEdited === 'gbp' ? gbp : thb).focus();
    }
  };

  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(panel.hidden); });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { if (!panel.hidden) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });

  // Typing in one box converts into the other; the box being typed in is never reformatted under the cursor.
  gbp.addEventListener('input', () => { lastEdited = 'gbp'; recalc(); });
  thb.addEventListener('input', () => { lastEdited = 'thb'; recalc(); });
  // Tidy the number a person just typed once they leave the box.
  gbp.addEventListener('blur', () => { const g = parse(gbp.value); if (g != null) gbp.value = fmtGbp(g); });
  thb.addEventListener('blur', () => { const t = parse(thb.value); if (t != null) thb.value = fmtThb(t); });
  // Select-all on focus so typing replaces the figure (parse() ignores the thousands commas).
  gbp.addEventListener('focus', () => gbp.select());
  thb.addEventListener('focus', () => thb.select());

  qs('#fxRefresh').addEventListener('click', async () => {
    qs('#fxStatus').textContent = 'Updating…';
    await refresh(true);
    adoptBestKnownRate();
    render();
  });

  // Warm the cache on load (when online) so the last rate is there for offline use, and
  // pick up the cached/trip rate straight away so the button works before first open.
  adoptBestKnownRate();
  refresh(false).then(() => adoptBestKnownRate());
  window.addEventListener('online', () => refresh(true).then(() => { adoptBestKnownRate(); if (!panel.hidden) render(); }));
}
