// Shared helpers: formatting, DOM shortcuts, toasts. No framework, no build step.

export function qs(sel, root = document){ return root.querySelector(sel); }
export function qsa(sel, root = document){ return Array.from(root.querySelectorAll(sel)); }

export function escapeHtml(str){
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CURRENCY_SYMBOL = { GBP: '£', USD: '$' };

export function currencySymbol(code){
  return CURRENCY_SYMBOL[code] || (code ? code + ' ' : '');
}

export function formatNumber(amount){
  const n = Number(amount);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The symbol always prefixes the number: "£500", never "500£".
export function formatMoney(amount, currency){
  if (amount === null || amount === undefined || amount === '') return '—';
  return `${currencySymbol(currency)}${formatNumber(amount)}`;
}

// Converts a stored amount for display, honouring the trip rules:
// - GBP-denominated amounts never convert, regardless of the view toggle.
// - USD-denominated amounts convert to GBP (divide by fx_rate) only when the
//   view toggle is GBP; otherwise shown as-is.
// fx_rate is defined as: 1 home_currency (GBP) unit = fx_rate spend_currency (USD) units.
export function displayAmount(amount, currency, trip, viewCurrency){
  const n = amount === null || amount === undefined || amount === '' ? null : Number(amount);
  if (n === null || Number.isNaN(n)) return { value: null, currency: currency || 'GBP', converted: false };
  if (currency === 'GBP' || !currency) {
    return { value: n, currency: 'GBP', converted: false };
  }
  // currency is USD (or another spend currency)
  if (viewCurrency === 'GBP') {
    const rate = trip && trip.fx_rate ? Number(trip.fx_rate) : 1;
    return { value: n / rate, currency: 'GBP', converted: true };
  }
  return { value: n, currency, converted: false };
}

// Renders a money figure as HTML, marking converted figures so they're never
// mistaken for a real stored amount.
export function renderMoney(amount, currency, trip, viewCurrency){
  const d = displayAmount(amount, currency, trip, viewCurrency);
  if (d.value === null) return '<span class="money">—</span>';
  const prefix = d.converted ? '≈ ' : '';
  const cls = d.converted ? 'money money-converted' : 'money';
  return `<span class="${cls}">${prefix}${escapeHtml(formatMoney(d.value, d.currency))}</span>`;
}

// Full conversion into a target currency, for rollups/aggregates where many
// line items of different native currencies are combined into one number
// (Overview stat tiles, Costs breakdown). Unlike displayAmount, this always
// converts — the "GBP never converts" rule is a per-line-item display rule,
// not a rule about how sums are computed.
export function convertToView(amount, currency, trip, viewCurrency){
  const n = amount === null || amount === undefined || amount === '' ? 0 : Number(amount);
  if (Number.isNaN(n)) return 0;
  const rate = trip && trip.fx_rate ? Number(trip.fx_rate) : 1;
  const from = currency || 'GBP';
  if (from === viewCurrency) return n;
  if (viewCurrency === 'GBP') return n / rate; // from USD
  return n * rate; // to USD, from GBP
}

export function formatDateShort(dateStr){
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateFull(dateStr){
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateMed(dateStr){
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// timestamptz fields are entered via <input type="datetime-local"> (no
// timezone) and read back the same naive way, by string-slicing rather than
// going through Date/toLocaleString — that would apply the *viewer's*
// timezone and shift the displayed time. This app has one traveller and no
// stated timezone requirement, so we treat these as plain wall-clock values.
export function toDatetimeLocalValue(isoStr){
  if (!isoStr) return '';
  return isoStr.slice(0, 16);
}

export function formatDateTimeNaive(isoStr){
  if (!isoStr) return '';
  const datePart = isoStr.slice(0, 10);
  const timePart = isoStr.slice(11, 16);
  return `${formatDateShort(datePart)}, ${timePart}`;
}

export function formatTime(timeStr){
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

// Dates from Postgres `date` columns are plain "YYYY-MM-DD" with no timezone.
// Parse as local calendar dates so "17 May" never shifts a day depending on
// the viewer's timezone.
export function parseLocalDate(dateStr){
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysUntil(dateStr){
  const target = parseLocalDate(dateStr);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = target.getTime() - todayMidnight.getTime();
  return Math.round(ms / 86400000);
}

export function addDays(dateStr, n){
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateInputValue(d);
}

export function toDateInputValue(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateRange(startStr, endStr){
  const out = [];
  let cur = startStr;
  while (cur <= endStr) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

let toastTimer = null;
export function toast(message){
  const host = qs('#toast-host');
  if (!host) return;
  host.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

export function friendlyError(err){
  if (!err) return 'Something went wrong.';
  return err.message || String(err);
}

export function mapsSearchUrl(name, city, region){
  const q = [name, city, region].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
