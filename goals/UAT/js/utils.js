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

// Currency symbols prefix the number with no space (£500), same as how
// anyone would actually write it; anything else — a word or abbreviation
// like "km" or "min" — suffixes with a space (58 min), unchanged.
const CURRENCY_SYMBOLS = new Set(['£', '$', '€', '¥', '₹', '₩', '₽', '₺', '₫', '₴', '₦', '₱', '฿', '₡', '₪', '₸']);

export function formatNumber(n, unit) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  const str = Number.isInteger(num) ? String(num) : num.toFixed(1);
  if (!unit) return str;
  return CURRENCY_SYMBOLS.has(unit.trim()) ? `${unit}${str}` : `${str} ${unit}`;
}

const HORIZON_LABELS = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', long_term: 'Long-term' };
const STATUS_LABELS = { active: 'Active', paused: 'Paused', achieved: 'Achieved', dropped: 'Dropped' };
const MEASURE_LABELS = { numeric: 'Numeric', milestone: 'Milestones', pass_fail: 'Pass/fail', narrative: 'Narrative' };
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

function inlineFormat(escapedLine) {
  return escapedLine
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

/**
 * Simple, dependency-free markdown-ish rendering: paragraphs, *bold*,
 * _italic_, "# / ## / ###" headings, and "- " bullet lists with one level
 * of nesting via a 2-space (or tab) indent. Enough for journal-style notes
 * and full notebook pages alike — everything still goes through
 * escapeHtml() line by line, so raw HTML in a note can never leak through.
 */
export function renderNote(text) {
  if (!text) return '';
  const out = [];
  let para = [];
  const listStack = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; }
  };
  const closeListsAbove = (depth) => {
    while (listStack.length > depth) { out.push('</ul>'); listStack.pop(); }
  };

  String(text).split('\n').forEach((line) => {
    const trimmed = line.trim();

    if (trimmed === '') {
      flushPara();
      closeListsAbove(0);
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeListsAbove(0);
      const tag = heading[1].length === 1 ? 'h3' : (heading[1].length === 2 ? 'h4' : 'h5');
      out.push(`<${tag} class="note-heading">${inlineFormat(escapeHtml(heading[2]))}</${tag}>`);
      return;
    }

    const item = line.match(/^(\s*)[-•]\s+(.*)$/);
    if (item) {
      flushPara();
      const depth = Math.min(2, Math.floor(item[1].replace(/\t/g, '  ').length / 2));
      closeListsAbove(depth + 1);
      while (listStack.length <= depth) { out.push('<ul>'); listStack.push(listStack.length); }
      out.push(`<li>${inlineFormat(escapeHtml(item[2]))}</li>`);
      return;
    }

    closeListsAbove(0);
    para.push(inlineFormat(escapeHtml(line)));
  });

  flushPara();
  closeListsAbove(0);
  return out.join('');
}
