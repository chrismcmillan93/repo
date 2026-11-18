// Breaks and trips: dates you're away. While you're in one nothing counts against you:
//   - no nudges, review prompts or push notifications (life-push reads the same setting)
//   - open tasks don't carry over, and goals can't go "stalled" (days inside a break
//     are not counted, see quietDays)
//   - weekly / daily / monthly repeats whose period ended during a break aren't created,
//     and Health's automatic weekly commitments aren't filled in for those weeks
//   - reviews for periods that ended during a break are skipped
// Nothing logged is deleted. Each break gets a tidy-up once (resetForBreak) when it
// starts and again when it ends (so tasks that went overdue meanwhile start clean).
//
// Stored in life.settings.data.breaks = [{ id, name, from, until, started, settled,
// event_id? }]. `from` is the first day away (null = "already away", used for the old
// single "away until" setting, which is migrated into this list on load); `until` is the
// day you're back, so you're away on every day before it. event_id links the optional
// countdown in Events. life-push reads the same list (and still understands the old
// settings.data.away = { until }).
import * as store from './store.js';
import { todayStr, addDays } from './fit/utils.js';

const LOW = '0000-01-01';
let list = [];   // every break, soonest first
let merged = []; // windows with overlapping / back-to-back breaks joined: { name, from, until }

const startOf = (b) => b.from || LOW;
const diff = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const withoutAway = ({ away, ...rest }) => rest;

function remember(next){
  list = [...next].sort((a, b) => (startOf(a) < startOf(b) ? -1 : 1));
  merged = [];
  for (const b of list) {
    const last = merged[merged.length - 1];
    if (last && startOf(b) <= last.until) { if (b.until > last.until) last.until = b.until; }
    else merged.push({ name: b.name, from: startOf(b), until: b.until });
  }
}

export const breakList = () => list;
export const activeBreak = (today = todayStr()) => merged.find((w) => w.from <= today && today < w.until) || null;
export const isAway = (today = todayStr()) => !!activeBreak(today);
export const awayUntil = (today = todayStr()) => { const w = activeBreak(today); return w ? w.until : null; };
// Did a week / month / quarter end during a break (the day you're back counts)?
export const endInBreak = (end) => merged.some((w) => w.from <= end && end <= w.until);

const pad = (n) => String(n).padStart(2, '0');
function periodEnd(c){
  if (c.cadence !== 'monthly') return addDays(c.week_start, 6);
  const [y, m] = c.week_start.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
// Was this commitment's week / month over during a break?
export const periodOver = (c) => endInBreak(periodEnd(c));

// Days since a goal last moved, leaving out the days spent in breaks, so a goal can't
// turn "stalled" because you were away. (Target dates are never moved.)
export function quietDays(g, today = todayStr()){
  const base = g.last_progress_on || g.start_date;
  let days = diff(base, today);
  for (const w of merged) {
    const lo = base > w.from ? base : w.from, hi = today < w.until ? today : w.until;
    if (hi > lo) days -= diff(lo, hi);
  }
  return Math.max(0, days);
}

// The tidy-up for one break: open tasks due before the return date move to it (or to today
// if that has passed) with their carry-over count cleared, and repeat-generated commitments
// with nothing done, whose week or month ended during this break, are removed. Anything
// with progress, and everything else, is left alone.
export async function resetForBreak(b, today = todayStr()){
  const lo = startOf(b), back = b.until, target = back > today ? back : today;
  const [late, generated] = await Promise.all([
    store.tasks.list((q) => q.eq('status', 'open').lt('due_date', back)),
    store.commitments.list((q) => q.not('rule_id', 'is', null).eq('done_count', 0).lt('week_start', back))
  ]);
  const empty = generated.filter((c) => periodEnd(c) >= lo && periodEnd(c) <= back);
  await Promise.all(late.map((t) => store.tasks.set(t.id, { due_date: target, top_date: null, carried_count: 0 })));
  await Promise.all(empty.map((c) => store.commitments.del(c.id)));
  return { tasks: late.length, commitments: empty.length };
}

// Run each break's tidy-up when it starts and when it ends. Returns true if anything was flagged.
async function reconcile(items){
  const today = todayStr();
  let dirty = false;
  for (const b of items) {
    const over = b.until <= today, underway = startOf(b) <= today && !over;
    if (over && !b.settled) { await resetForBreak(b, today); b.started = b.settled = true; dirty = true; }
    else if (underway && !b.started) { await resetForBreak(b, today); b.started = true; dirty = true; }
  }
  return dirty;
}

function normalize(cfg){
  const items = Array.isArray(cfg.breaks) ? cfg.breaks.map((b) => ({ ...b })) : [];
  const legacy = cfg.away && cfg.away.until;
  if (legacy) items.push({ id: newId(), name: 'Away', from: null, until: cfg.away.until, started: cfg.away.applied !== false, settled: false });
  return { items, migrated: !!cfg.away };
}

// Read the breaks at sign-in (before the first screen), migrating the old single date, and
// run any tidy-up that is due.
export async function loadAway(){
  const cfg = await store.settings.get();
  const { items, migrated } = normalize(cfg);
  remember(items);
  const dirty = await reconcile(items);
  if (dirty || migrated) await store.settings.save({ ...withoutAway(cfg), breaks: items });
  return cfg;
}

async function change(fn){
  const cfg = await store.settings.get();
  const { items } = normalize(cfg);
  const result = await fn(items);
  await reconcile(items);
  await store.settings.save({ ...withoutAway(cfg), breaks: items });
  remember(items);
  return result;
}

function check({ from, until }){
  if (!from || !until || until <= from) throw new Error('Pick a return date after the day you leave.');
}
const tripEvent = (name, from, until) => ({ title: name, kind: 'trip', start_date: from, end_date: addDays(until, -1) });

export const addBreak = ({ name, from, until, countdown }) => change(async (items) => {
  check({ from, until });
  const b = { id: newId(), name: String(name || '').trim() || 'Break', from, until, started: false, settled: false };
  if (countdown) b.event_id = (await store.events.add(tripEvent(b.name, from, until))).id;
  items.push(b);
  return b;
});

export const updateBreak = (id, { name, from, until, countdown }) => change(async (items) => {
  check({ from, until });
  const b = items.find((x) => x.id === id);
  if (!b) throw new Error('That break no longer exists.');
  Object.assign(b, { name: String(name || '').trim() || 'Break', from, until, started: false, settled: false });
  if (b.event_id && countdown) await store.events.set(b.event_id, tripEvent(b.name, from, until));
  else if (b.event_id) { await store.events.del(b.event_id); delete b.event_id; }
  else if (countdown) b.event_id = (await store.events.add(tripEvent(b.name, from, until))).id;
  return b;
});

export const removeBreak = (id) => change(async (items) => {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (items[i].event_id) await store.events.del(items[i].event_id);
  items.splice(i, 1);
});
