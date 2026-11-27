// Days-since maths for the Giving up tracker. Pure functions, no network, so they can be
// tested on their own. A slip on a date restarts the current run from that date; the best
// run, the number of slips and the clean days in the last 30 are kept, so one slip never
// erases what came before it.
const DAY = 864e5;
export const diffDays = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);

export const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730];

export function milestoneLabel(n){
  if (n >= 730) return `${Math.round(n / 365)} years`;
  if (n === 365) return '1 year';
  if (n === 7) return '1 week';
  if (n === 14) return '2 weeks';
  return `${n} day${n === 1 ? '' : 's'}`;
}

// quit: { started_on }, slips: [{ slip_date }], today: 'YYYY-MM-DD'.
// Slips before the quit date or after today are ignored. A quit date in the future gives
// `upcoming` = days until it starts (undefined once it has started).
export function streakInfo(quit, slips, today){
  const start = quit.started_on;
  // Not started yet (a future quit date): nothing to count, nothing to slip against.
  if (start > today) return { current: 0, longest: 0, since: start, slips: 0, slipDays: 0, lastSlip: null, span30: 0, clean30: 0, next: null, prev: 0, upcoming: diffDays(today, start), runBefore: () => 0 };
  const valid = slips.filter((s) => s.slip_date >= start && s.slip_date <= today);
  const slipDays = [...new Set(valid.map((s) => s.slip_date))].sort();
  const points = [start, ...slipDays.filter((d) => d > start)]; // where a run begins
  const last = points[points.length - 1];
  const gaps = points.map((p, i) => diffDays(p, i + 1 < points.length ? points[i + 1] : today));
  const current = diffDays(last, today);
  const lo = start > add(today, -29) ? start : add(today, -29);
  const span30 = Math.max(0, diffDays(lo, today) + 1);
  const next = MILESTONES.find((m) => m > current) || null;
  const prev = [...MILESTONES].reverse().find((m) => m <= current) || 0;
  return {
    current, longest: Math.max(...gaps), since: last,
    slips: valid.length, slipDays: slipDays.length, lastSlip: slipDays.length ? slipDays[slipDays.length - 1] : null,
    span30, clean30: Math.max(0, span30 - slipDays.filter((d) => d >= lo).length),
    next, prev,
    // The run that a slip on `date` would end, for the message after logging one.
    runBefore: (date) => { const earlier = points.filter((p) => p < date); return earlier.length ? diffDays(earlier[earlier.length - 1], date) : 0; }
  };
}

// The most common trigger, once there are enough slips for it to mean something.
export function topTrigger(slips){
  const counts = {};
  slips.forEach((s) => { if (s.trigger) counts[s.trigger] = (counts[s.trigger] || 0) + 1; });
  const [name, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return n >= 2 ? { name, n } : null;
}

// Blunt motivation, by where the current run is. Deterministic (changes day to day, not on
// every redraw). {n} is the current number of days ({days} / {them} agree with it for 1). Harsh and to the point, as asked, but
// never about who you are: it's about the next decision.
const PUSH = {
  zero: ['Day zero. Nobody is coming to save you. Get the next hour right.', 'You slipped. Own it, find the trigger, plan for it. Do not make it two.', 'Zero. The only move is tomorrow without it. Start now.'],
  early: ['Early days are where people fold. Do not negotiate with the craving.', '{n} {days}. Do not waste {them} for ten minutes of relief.', 'Every day you hold is one you cannot get back if you throw it away.'],
  mid: ['{n} days. You have proved you can. Do not undo it on a bad evening.', 'The craving lies. It always has. Sit through it.', 'Streaks do not end in a bad week. They end in one bad evening. Watch the evenings.'],
  long: ['{n} days. Protect it. Complacency is the next slip.', 'This is what you are like when you mean it. Stay hard.', 'You did not get {n} days by being comfortable. Do not start now.']
};
export function pushLine(current, today = new Date().toISOString().slice(0, 10)){
  const pool = current === 0 ? PUSH.zero : current < 7 ? PUSH.early : current < 30 ? PUSH.mid : PUSH.long;
  const day = Math.floor(Date.parse(today + 'T12:00:00Z') / 864e5);
  return pool[(day + current) % pool.length].replace('{n}', current).replace('{days}', current === 1 ? 'day' : 'days').replace('{them}', current === 1 ? 'it' : 'them');
}

// ---------------- patterns ----------------
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const PARTS = ['Morning', 'Afternoon', 'Evening', 'Late night'];
const avg = (rows, f) => { const v = rows.map(f).filter((x) => x != null); return v.length ? Math.round(10 * v.reduce((a, b) => a + b, 0) / v.length) / 10 : null; };
const standout = (counts, names) => { // the one clear winner with at least 2 hits, else null (a tie is not a pattern)
  const max = Math.max(...counts);
  const at = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
  return max >= 2 && at.length === 1 ? { name: names[at[0]], n: max } : null;
};

// slips: [{ slip_date, slip_part }]; sleep: [{ day, sleep_s, hrv_last_night }] (the night that
// ended on `day`, i.e. the night before a slip on that date). Needs 3+ slips to say anything
// about weekdays or times; sleep needs 3+ slip days and 7+ other days with data, and says so
// when the sample is small. Describes, never explains: it is a pattern, not a cause.
export function slipPatterns(slips, sleep, started, today, days = []){
  const valid = slips.filter((s) => s.slip_date >= started && s.slip_date <= today);
  const n = valid.length;
  const byDow = Array(7).fill(0);
  valid.forEach((s) => { byDow[new Date(s.slip_date + 'T12:00:00Z').getUTCDay()] += 1; });
  const byPart = PARTS.map((p) => valid.filter((s) => s.slip_part === p).length);
  const partN = byPart.reduce((a, b) => a + b, 0);
  const slipDays = new Set(valid.map((s) => s.slip_date));
  const rows = (sleep || []).filter((r) => r.day >= started && r.day <= today && r.sleep_s);
  const a = rows.filter((r) => slipDays.has(r.day)), b = rows.filter((r) => !slipDays.has(r.day));
  const sleepInfo = a.length >= 3 && b.length >= 7
    ? { slipN: a.length, otherN: b.length, slipH: avg(a, (r) => r.sleep_s / 3600), otherH: avg(b, (r) => r.sleep_s / 3600), slipHrv: avg(a, (r) => r.hrv_last_night), otherHrv: avg(b, (r) => r.hrv_last_night), small: a.length < 6 }
    : null;
  // Body on the day before a slip (stress) and the morning of it (resting heart rate), against all other days.
  // Same thresholds as sleep. `days`: [{ day, avg_stress, resting_hr }].
  const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const byDay = Object.fromEntries((days || []).map((r) => [r.day, r]));
  const drows = (days || []).filter((r) => r.day >= started && r.day <= today);
  const dSlip = drows.filter((r) => slipDays.has(r.day)), dOther = drows.filter((r) => !slipDays.has(r.day));
  // Stress on the day before each slip day, against days whose following day was not a slip.
  const stressBefore = [...slipDays].map((d) => byDay[shift(d, -1)]).filter((r) => r && r.avg_stress != null);
  const stressOther = drows.filter((r) => !slipDays.has(shift(r.day, 1)) && r.avg_stress != null);
  const bodyInfo = (dSlip.length >= 3 && dOther.length >= 7) ? {
    slipRhr: avg(dSlip, (r) => r.resting_hr), otherRhr: avg(dOther, (r) => r.resting_hr),
    slipStress: stressBefore.length >= 3 ? avg(stressBefore, (r) => r.avg_stress) : null, otherStress: stressOther.length >= 7 ? avg(stressOther, (r) => r.avg_stress) : null,
    small: dSlip.length < 6
  } : null;
  return {
    body: bodyInfo,
    n, byDow, dowNames: DOW, byPart, partNames: PARTS, partN,
    topDow: n >= 3 ? standout(byDow, DOW) : null,
    topPart: partN >= 3 ? standout(byPart, PARTS) : null,
    sleep: sleepInfo
  };
}
