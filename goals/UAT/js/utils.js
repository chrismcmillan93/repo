// Small shared helpers: formatting, escaping, dates. No dependencies.

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' (en-GB), tolerant of null/invalid input. */
export function formatDateDMY(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

/** e.g. "12 days ago", "today", "in 3 days" — used for "last updated" / countdowns. */
export function relativeDays(isoDate) {
  if (!isoDate) return '';
  const diff = daysBetween(todayISO(), isoDate);
  if (diff === 0) return 'today';
  if (diff > 0) return diff === 1 ? 'in 1 day' : `in ${diff} days`;
  const ago = Math.abs(diff);
  return ago === 1 ? '1 day ago' : `${ago} days ago`;
}

/** Whole days from dateA to dateB (both 'YYYY-MM-DD'), positive if B is after A. */
export function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

export function clamp01(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

/** Formats a 0..1 fraction (numeric, possibly string from Postgres) as "N%". Returns '—' for null. */
export function formatPercent(fraction) {
  const n = fraction === null || fraction === undefined ? null : Number(fraction);
  if (n === null || Number.isNaN(n)) return '—';
  return Math.round(n * 100) + '%';
}

export function formatNumber(n, unit) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  const str = Number.isInteger(num) ? String(num) : num.toFixed(1);
  return unit ? `${str} ${unit}` : str;
}

const HORIZON_LABELS = { annual: 'Annual', quarterly: 'Quarterly', long_term: 'Long-term' };
const STATUS_LABELS = { active: 'Active', paused: 'Paused', achieved: 'Achieved', dropped: 'Dropped' };
const MEASURE_LABELS = { numeric: 'Numeric', milestone: 'Milestones', narrative: 'Narrative' };
const DECISION_LABELS = { continue: 'Continue', adjust: 'Adjust', pause: 'Pause', complete: 'Complete', drop: 'Drop' };
const PERIOD_LABELS = { month: 'Month', quarter: 'Quarter', year: 'Year' };

export function horizonLabel(v) { return HORIZON_LABELS[v] || v; }
export function statusLabel(v) { return STATUS_LABELS[v] || v; }
export function measureLabel(v) { return MEASURE_LABELS[v] || v; }
export function decisionLabel(v) { return DECISION_LABELS[v] || v; }
export function periodTypeLabel(v) { return PERIOD_LABELS[v] || v; }

export function isOverdue(goal) {
  return goal && goal.status === 'active' && goal.target_date && goal.target_date < todayISO();
}

/** Simple, dependency-free markdown-ish rendering: escapes HTML, then applies
 *  paragraphs, *bold*, and line breaks. Enough for journal-style notes. */
export function renderNote(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const withBold = escaped.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  return withBold.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}
