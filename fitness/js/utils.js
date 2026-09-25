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

// Training log is authored in km (run_plan.distance_km, plus the race
// itself is a "10K") but shown in miles first -- both units shown together
// rather than picking one, since converting on the fly loses the plan's
// own authored figures. detail/effort free text (interval reps in metres,
// "10K pace" as a race-pace reference) is left alone -- only the
// structured distance column gets converted.
export function formatDistance(km){
  const miles = round1(km * 0.621371);
  return `${miles}mi (${round1(km)}km)`;
}

// A day can have more than one session_templates row now (e.g. Monday's AM
// upper lift + PM intervals, Tuesday/Thursday's AM Muay Thai + PM run).
// Resolution is all-or-nothing per day, not per session_type: if any
// week-specific row exists for this (day_of_week, week_number), every
// week-specific row for that day applies and every week_number-IS-NULL
// default for that day is discarded outright -- not just the one sharing a
// session_type. That's what lets week 8 Sunday's race (session_type 'run')
// fully replace the standing 'rest' default rather than sit alongside it,
// while still letting a day with two *different* week-specific rows (the
// actual "two sessions" case) show both. Mirrors the same rule in
// get_day_bundle(). Muay Thai always sorts after the day's other session.
const SESSION_TYPE_ORDER = { upper: 0, lower: 0, run: 1, rest: 2, muay_thai: 3 };
export function resolveSessionsForDay(dow, weekNumber, sessions){
  const forDay = sessions.filter((s) => s.day_of_week === dow);
  const hasOverride = forDay.some((s) => s.week_number === weekNumber);
  return forDay
    .filter((s) => hasOverride ? s.week_number === weekNumber : s.week_number === null)
    .sort((a, b) => (SESSION_TYPE_ORDER[a.session_type] ?? 9) - (SESSION_TYPE_ORDER[b.session_type] ?? 9));
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
