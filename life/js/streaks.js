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
// Slips before the quit date or after today are ignored.
export function streakInfo(quit, slips, today){
  const start = quit.started_on;
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
