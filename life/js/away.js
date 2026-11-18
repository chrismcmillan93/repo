// Away mode: a date you're back on. Until then nothing counts against you:
//   - no nudges, review prompts or push notifications (life-push reads the same setting)
//   - open tasks don't carry over, and goals can't turn "stalled" (the quiet clock starts
//     again on the return date, see lib.js quietSince)
//   - weekly / daily / monthly repeats that would have ended before you're back aren't
//     created, and Health's automatic weekly commitments aren't filled in
//   - reviews for periods that ended before the return date are skipped
// Nothing logged is deleted. Switching it on resets the slate once (resetForBreak).
// Stored in life.settings.data.away = { until: 'YYYY-MM-DD', applied: bool }; `applied`
// is false when it was set from outside the app (the reset then runs on the next open).
import * as store from './store.js';
import { todayStr, addDays } from './fit/utils.js';

let until = null;
export const awayUntil = () => until;
export const isAway = (today = todayStr()) => !!until && today < until;

const pad = (n) => String(n).padStart(2, '0');
function periodEnd(c){
  if (c.cadence !== 'monthly') return addDays(c.week_start, 6);
  const [y, m] = c.week_start.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
// Was this commitment's week / month already over by the time you're back?
export const periodOver = (c, back = until) => !!back && periodEnd(c) <= back;

// The one-off tidy-up: overdue open tasks move to the return date with their carry-over
// count cleared, and repeat-generated commitments with nothing done (that were over by
// then) are removed. Anything with progress, and everything else, is left alone.
export async function resetForBreak(back){
  const [late, generated] = await Promise.all([
    store.tasks.list((q) => q.eq('status', 'open').lt('due_date', back)),
    store.commitments.list((q) => q.not('rule_id', 'is', null).eq('done_count', 0).lt('week_start', back))
  ]);
  const empty = generated.filter((c) => periodOver(c, back));
  await Promise.all(late.map((t) => store.tasks.set(t.id, { due_date: back, top_date: null, carried_count: 0 })));
  await Promise.all(empty.map((c) => store.commitments.del(c.id)));
  return { tasks: late.length, commitments: empty.length };
}

// Read the setting at sign-in. If it was switched on from outside the app, apply the reset now.
export async function loadAway(){
  const cfg = await store.settings.get();
  until = (cfg.away && cfg.away.until) || null;
  if (until && cfg.away.applied === false) {
    await resetForBreak(until);
    await store.settings.save({ ...cfg, away: { ...cfg.away, applied: true } });
  }
  return cfg;
}

export async function startAway(back){
  const cfg = await store.settings.get();
  const done = await resetForBreak(back);
  await store.settings.save({ ...cfg, away: { until: back, applied: true } });
  until = back;
  return done;
}

export async function endAway(){
  const { away, ...rest } = await store.settings.get();
  await store.settings.save(rest);
  until = null;
}
