// Load-spike warning: running distance in the last 7 days against your own recent weekly average.
// A sudden jump in weekly volume is the classic route to an overuse injury, and a 50km build is
// exactly when it happens. Pure functions (no network), so they can be tested on their own.
//
// acts: [{ type_key, local_date, distance_m }] (Garmin activities; only runs count).
// The baseline is the average of up to four earlier 7-day blocks, and a block only counts if all of
// it falls on or after `since` (the fresh-start floor, so nothing before it is read), so the
// warning needs at least two full blocks of history and a baseline of at least 8 km a week:
// against a tiny base a normal week looks like a spike. It is a nudge, not an order: the plan may
// well have asked for the jump, and the text says so.
const DAY = 864e5;
const add = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const isRun = (a) => /run/i.test(a.type_key || '');

export const SPIKE_WARN = 1.3, SPIKE_HIGH = 1.5, MIN_BASE_KM = 8, MIN_BLOCKS = 2;

export function loadSpike(acts, today, since = '0000-00-00'){
  const km = {};
  (acts || []).filter(isRun).forEach((a) => { km[a.local_date] = (km[a.local_date] || 0) + (Number(a.distance_m) || 0) / 1000; });
  const block = (endDay) => { let t = 0; for (let i = 0; i < 7; i++) t += km[add(endDay, -i)] || 0; return t; };
  const recent = block(today);
  const blocks = [];
  for (let k = 1; k <= 4; k++) {
    const end = add(today, -7 * k);
    if (add(end, -6) >= since) blocks.push(block(end));
  }
  if (blocks.length < MIN_BLOCKS) return null;
  const base = blocks.reduce((a, b) => a + b, 0) / blocks.length;
  if (base < MIN_BASE_KM) return null;
  const ratio = recent / base;
  const level = ratio >= SPIKE_HIGH ? 'high' : ratio >= SPIKE_WARN ? 'warn' : null;
  const r1 = (n) => Math.round(n * 10) / 10;
  const pct = Math.round((ratio - 1) * 100);
  return {
    recentKm: r1(recent), baseKm: r1(base), ratio: Math.round(ratio * 100) / 100, pct, level, blocks: blocks.length,
    text: level ? `${r1(recent)} km run in the last 7 days is ${pct}% more than your usual ${r1(base)} km a week. Sudden jumps are how overuse injuries start. If the plan asked for it, carry on; if not, ease back.` : ''
  };
}
