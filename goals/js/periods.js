// Period boundary math for the review flow — mirrors the logic in
// goals.pending_reviews() so client-side period pickers agree with the
// server's idea of "the month/quarter/year that just closed".

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

export function monthBounds(y, m) {
  return { start: toISO(y, m, 1), end: toISO(y, m, daysInMonth(y, m)) };
}

export function quarterBounds(y, q) {
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return { start: toISO(y, startMonth, 1), end: toISO(y, endMonth, daysInMonth(y, endMonth)) };
}

export function yearBounds(y) {
  return { start: toISO(y, 1, 1), end: toISO(y, 12, 31) };
}

function quarterOf(m) { return Math.floor((m - 1) / 3) + 1; }

/** The most recently completed month/quarter/year, matching pending_reviews(). */
export function previousPeriod(periodType, now) {
  const d = now || new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (periodType === 'month') {
    return m === 1 ? monthBounds(y - 1, 12) : monthBounds(y, m - 1);
  }
  if (periodType === 'quarter') {
    const q = quarterOf(m);
    return q === 1 ? quarterBounds(y - 1, 4) : quarterBounds(y, q - 1);
  }
  return yearBounds(y - 1);
}

export function periodLabel(periodType, periodStart) {
  const [y, m] = periodStart.split('-').map(Number);
  if (periodType === 'month') {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  if (periodType === 'quarter') {
    return `Q${quarterOf(m)} ${y}`;
  }
  return String(y);
}

/** Builds the list of selectable quarter/month/year options going back `count` periods, for manual period selection. */
export function recentPeriods(periodType, count) {
  const out = [];
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (periodType === 'month') {
    let year = y, month = m - 1; // start from the most recently completed month
    for (let i = 0; i < count; i++) {
      if (month < 1) { month = 12; year -= 1; }
      out.push(monthBounds(year, month));
      month -= 1;
    }
  } else if (periodType === 'quarter') {
    let year = y, q = quarterOf(m) - 1;
    for (let i = 0; i < count; i++) {
      if (q < 1) { q = 4; year -= 1; }
      out.push(quarterBounds(year, q));
      q -= 1;
    }
  } else {
    for (let i = 0; i < count; i++) out.push(yearBounds(y - 1 - i));
  }
  return out;
}
