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

// Dates from Postgres `date` columns are plain "YYYY-MM-DD" with no
// timezone. Parse as local calendar dates so a date never shifts a day
// depending on the viewer's timezone.
export function parseLocalDate(dateStr){
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateInputValue(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr(){
  return toDateInputValue(new Date());
}

export function addDays(dateStr, n){
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateInputValue(d);
}

// ISO day-of-week: 1=Mon .. 7=Sun.
export function isoDow(dateStr){
  const d = parseLocalDate(dateStr);
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

export function startOfWeek(dateStr){
  return addDays(dateStr, -(isoDow(dateStr) - 1));
}

export function endOfWeek(dateStr){
  return addDays(dateStr, 7 - isoDow(dateStr));
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

export function formatDateFull(dateStr){
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateShort(dateStr){
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDayLabel(dateStr){
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long' });
}

export function daysUntil(dateStr){
  const target = parseLocalDate(dateStr);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = target.getTime() - todayMidnight.getTime();
  return Math.round(ms / 86400000);
}

export function dayTypeLabel(dayType){
  return dayType === 'lift' ? 'Lift day' : dayType === 'run' ? 'Run day' : dayType === 'rest' ? 'Rest day' : 'Off block';
}

export function statusLabel(status){
  return status === 'yes' ? 'Yes' : status === 'partial' ? 'Partial' : status === 'no' ? 'No' : 'Not set';
}

export function round1(n){
  return Math.round(n * 10) / 10;
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

export function debounce(fn, ms){
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// One shared inline status pill next to whatever was just edited. Never
// blocks the field it sits next to, never a modal. Shared between Today
// (meals/exercises/weight/notes/review) and Week (prep/shopping checks) --
// every save in this app reports through the same three states.
export function renderStatusPill(el, mode, retry){
  if (!el) return;
  el.classList.remove('is-saving', 'is-saved', 'is-error');
  if (mode === 'saving') {
    el.textContent = 'Saving…';
    el.classList.add('is-saving');
  } else if (mode === 'saved') {
    el.textContent = 'Saved';
    el.classList.add('is-saved');
    setTimeout(() => { if (el.textContent === 'Saved') el.textContent = ''; }, 1800);
  } else if (mode === 'queued') {
    el.innerHTML = "Couldn't save — will retry automatically. ";
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry-btn';
    btn.textContent = 'Retry now';
    btn.addEventListener('click', retry);
    el.appendChild(btn);
    el.classList.add('is-error');
  }
}
