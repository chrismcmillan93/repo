// Period boundary math for the review flow — mirrors the logic in
// goals.pending_reviews() so client-side period pickers agree with the
// server's idea of "the month/quarter/year that just closed".

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function dateToISO(d) { return d.toISOString().slice(0, 10); }
function fromISO(s) { return new Date(s + 'T00:00:00Z'); }

export function monthBounds(y, m) {
  return { start: toISO(y, m, 1), end: toISO(y, m, daysInMonth(y, m)) };
}

/** Monday-Sunday ISO week containing the given date. */
export function weekBounds(dateISO) {
  const d = fromISO(dateISO);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() + mondayOffset);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: dateToISO(monday), end: dateToISO(sunday) };
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

/** The period (of the given type) containing dateISO — e.g. "this month", "this week". */
export function periodBoundsContaining(periodType, dateISO) {
  if (periodType === 'week') return weekBounds(dateISO);
  const [y, m] = dateISO.split('-').map(Number);
  if (periodType === 'month') return monthBounds(y, m);
  if (periodType === 'quarter') return quarterBounds(y, quarterOf(m));
  return yearBounds(y);
}

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
  const [y, m, d] = periodStart.split('-').map(Number);
  if (periodType === 'week') {
    return 'Week of ' + new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  if (periodType === 'month') {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  if (periodType === 'quarter') {
    return `Q${quarterOf(m)} ${y}`;
  }
  return String(y);
}

// A goal's horizon decides which calendar granularity its check-ins bucket
// into. annual/long_term fall back to yearly buckets.
export function horizonToPeriodType(horizon) {
  if (horizon === 'weekly') return 'week';
  if (horizon === 'monthly') return 'month';
  if (horizon === 'quarterly') return 'quarter';
  return 'year';
}

function stepMonth(y, m, delta) {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 + 1 };
}
function stepQuarter(y, q, delta) {
  const total = y * 4 + (q - 1) + delta;
  return { y: Math.floor(total / 4), q: ((total % 4) + 4) % 4 + 1 };
}

/**
 * Every period of the given type from fromDateISO through toDateISO
 * inclusive, oldest first — e.g. every month a monthly goal has been open,
 * so a check-in list can show exactly one row per period and make gaps
 * (periods with no entry yet) obvious.
 */
export function enumeratePeriods(periodType, fromDateISO, toDateISO) {
  const out = [];
  if (periodType === 'week') {
    let cursor = weekBounds(fromDateISO).start;
    const last = weekBounds(toDateISO).start;
    while (cursor <= last) {
      out.push(weekBounds(cursor));
      const d = fromISO(cursor); d.setUTCDate(d.getUTCDate() + 7);
      cursor = dateToISO(d);
    }
  } else if (periodType === 'month') {
    const [fy, fm] = fromDateISO.split('-').map(Number);
    const [ty, tm] = toDateISO.split('-').map(Number);
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      out.push(monthBounds(y, m));
      ({ y, m } = stepMonth(y, m, 1));
    }
  } else if (periodType === 'quarter') {
    const [fy, fm] = fromDateISO.split('-').map(Number);
    const [ty, tm] = toDateISO.split('-').map(Number);
    let y = fy, q = quarterOf(fm);
    const targetY = ty, targetQ = quarterOf(tm);
    while (y < targetY || (y === targetY && q <= targetQ)) {
      out.push(quarterBounds(y, q));
      ({ y, q } = stepQuarter(y, q, 1));
    }
  } else {
    const fy = Number(fromDateISO.slice(0, 4)), ty = Number(toDateISO.slice(0, 4));
    for (let y = fy; y <= ty; y++) out.push(yearBounds(y));
  }
  return out;
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
