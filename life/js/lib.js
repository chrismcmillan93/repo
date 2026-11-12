// Goal maths and the shared "tick a task" behaviour.
import * as store from './store.js';
import { todayStr, addDays, parseLocalDate, formatDateShort, startOfWeek, isoDow } from './fit/utils.js';

const DAY = 86400000;
export function daysBetween(a, b){
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / DAY);
}
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Percent complete: numeric goals from start/current/target, otherwise the share of steps done.
export function goalPct(g, steps){
  if (g.measure === 'numeric' && g.start_value != null && g.target_value != null && Number(g.target_value) !== Number(g.start_value)) {
    const cur = g.current_value != null ? Number(g.current_value) : Number(g.start_value);
    return clamp(100 * (cur - Number(g.start_value)) / (Number(g.target_value) - Number(g.start_value)));
  }
  const mine = steps.filter((s) => s.goal_id === g.id);
  return mine.length ? clamp(100 * mine.filter((s) => s.done_on).length / mine.length) : 0;
}

// Where a steady pace would have you today; null with no target date.
export function goalExpected(g, today = todayStr()){
  if (!g.target_date) return null;
  const span = daysBetween(g.start_date, g.target_date);
  return span <= 0 ? 100 : clamp(100 * daysBetween(g.start_date, today) / span);
}

// 'done' | 'stalled' (no progress for 14 days) | 'behind' (8+ points under pace) | 'on'
export function goalState(g, pct, exp, today = todayStr()){
  if (pct >= 100) return 'done';
  if (daysBetween(g.last_progress_on || g.start_date, today) >= 14) return 'stalled';
  if (exp != null && pct < exp - 8) return 'behind';
  return 'on';
}
export const STATE = { on: ['On pace', 'good'], behind: ['Behind', 'warn'], stalled: ['Stalled', 'bad'], done: ['Done', 'good'] };

// For a numeric goal with a date: the weekly rate now needed to land on time.
export function needLine(g, today = todayStr()){
  if (g.measure !== 'numeric' || g.target_value == null || !g.target_date) return '';
  const cur = g.current_value != null ? Number(g.current_value) : Number(g.start_value);
  const left = Math.abs(Number(g.target_value) - cur);
  const days = daysBetween(today, g.target_date);
  if (left === 0) return '';
  if (days <= 0) return `Target date has passed with ${round2(left)} ${g.unit} still to go.`;
  const perWeek = left / (days / 7);
  const planned = Math.abs(Number(g.target_value) - Number(g.start_value)) / (Math.max(1, daysBetween(g.start_date, g.target_date)) / 7);
  const base = `${round2(left)} ${g.unit} to go: you need ${round2(perWeek)} ${g.unit} a week to land on ${formatDateShort(g.target_date)}`;
  return perWeek > planned * 1.05 ? `${base} (the original pace was ${round2(planned)}).` : `${base}.`;
}
function round2(n){ return Math.round(n * 100) / 100; }

export async function touchGoal(goalId){
  if (goalId) await store.goals.set(goalId, { last_progress_on: todayStr() });
}

// Tick or untick a task: moves its commitment, stamps its goal, and queues the
// next occurrence of a repeating task.
export async function setTaskDone(task, done){
  const today = todayStr();
  await store.tasks.set(task.id, done ? { status: 'done', done_on: today } : { status: 'open', done_on: null });
  if (task.commitment_id) {
    const [c] = await store.commitments.list((q) => q.eq('id', task.commitment_id));
    if (c) await store.commitments.set(c.id, { done_count: Math.max(0, c.done_count + (done ? 1 : -1)) });
  }
  if (done) {
    await touchGoal(task.goal_id);
    if (task.repeat) {
      const step = { daily: 1, weekly: 7, monthly: 30 }[task.repeat];
      await store.tasks.add({ title: task.title, status: 'open', due_date: addDays(task.due_date || today, step), goal_id: task.goal_id, repeat: task.repeat });
    }
  }
}

// Open tasks whose date has passed move to today and count one more carry-over.
export async function carryOver(openTasks){
  const today = todayStr();
  const late = openTasks.filter((t) => t.status === 'open' && t.due_date && t.due_date < today);
  await Promise.all(late.map((t) => store.tasks.set(t.id, { due_date: today, carried_count: t.carried_count + 1 })));
  late.forEach((t) => { t.due_date = today; t.carried_count += 1; });
}

// "Kept" is about the week, so monthly commitments (which stay open all month) are left out.
export function keptPct(list){
  const weekly = list.filter((c) => c.cadence !== 'monthly');
  const n = weekly.reduce((a, c) => a + c.target_count, 0);
  return n ? Math.round(100 * weekly.reduce((a, c) => a + Math.min(c.done_count, c.target_count), 0) / n) : 0;
}

// ---------------- recurring commitments ----------------
// A rule says "N per day / week / month". The app keeps one life.commitments row per
// period from each rule. A daily rule is a weekly row with N x 7 to do, so a missed day
// can be made up later in the week. A monthly row keeps its month's first day in week_start.
const pad = (n) => String(n).padStart(2, '0');
export const monthStart = (iso) => iso.slice(0, 7) + '-01';
export function monthEnd(iso){
  const [y, m] = iso.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
const nextMonth = (iso) => { const [y, m] = iso.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`; };
export const targetFor = (cadence, n) => (cadence === 'daily' ? n * 7 : n);
// The period a commitment added while looking at week `ws` belongs to.
export function periodStartFor(cadence, ws, today = todayStr()){
  if (cadence !== 'monthly') return startOfWeek(ws);
  return monthStart(ws === startOfWeek(today) ? today : ws);
}
export const CADENCE_UNIT = { daily: 'a day', weekly: 'a week', monthly: 'a month' };

let ensured = { at: 0, p: null };
async function createDue(){
  const rules = await store.rules.list();
  if (!rules.length) return;
  const today = todayStr(), thisWeek = startOfWeek(today);
  const floorWeek = addDays(thisWeek, -56), floorMonth = monthStart(addDays(thisWeek, -150));
  const later = (a, b) => (a > b ? a : b);
  const want = [];
  for (const r of rules) {
    const base = { rule_id: r.id, goal_id: r.goal_id, title: r.title, cadence: r.cadence, target_count: targetFor(r.cadence, r.per_period) };
    if (r.cadence === 'monthly') for (let m = later(monthStart(r.start_date), floorMonth); m <= monthStart(today); m = nextMonth(m)) want.push({ ...base, week_start: m });
    else for (let w = later(startOfWeek(r.start_date), floorWeek); w <= thisWeek; w = addDays(w, 7)) want.push({ ...base, week_start: w });
  }
  const have = await store.commitments.list((q) => q.in('rule_id', rules.map((r) => r.id)).gte('week_start', floorMonth));
  const seen = new Set(have.map((c) => `${c.rule_id}|${c.week_start}`));
  await store.upsertIgnore('commitments', want.filter((w) => !seen.has(`${w.rule_id}|${w.week_start}`)), 'user_id,rule_id,week_start');
}
// Creates any recurring commitments that are due (this period and the missed ones since
// the rule began, up to 8 weeks / 5 months back). Cheap to call: remembered for 30 s.
export function ensureRecurring(force = false){
  if (!force && ensured.p && Date.now() - ensured.at < 30000) return ensured.p;
  ensured = { at: Date.now(), p: createDue().catch((err) => { console.warn('Recurring commitments:', err.message); ensured.p = null; }) };
  return ensured.p;
}

// Every commitment that applies to the week starting `ws`: that week's weekly and daily
// ones, plus the monthly ones for the month(s) the week touches.
export async function weekCommitments(ws){
  await ensureRecurring();
  const m1 = monthStart(ws), m2 = monthStart(addDays(ws, 6));
  return store.commitments.list((q) => q.or(`and(cadence.neq.monthly,week_start.eq.${ws}),and(cadence.eq.monthly,week_start.eq.${m1}),and(cadence.eq.monthly,week_start.eq.${m2})`).order('created_at'));
}

export async function addCommitment({ title, n, cadence, repeat, goal_id }, ws){
  cadence = ['daily', 'weekly', 'monthly'].includes(cadence) ? cadence : 'weekly';
  n = Math.max(1, Math.min(99, Number(n) || 1));
  title = String(title).trim();
  const week_start = periodStartFor(cadence, ws);
  let rule_id = null;
  if (repeat) rule_id = (await store.rules.add({ title, goal_id: goal_id || null, cadence, per_period: n, start_date: week_start })).id;
  const row = await store.commitments.add({ title, goal_id: goal_id || null, cadence, target_count: targetFor(cadence, n), week_start, rule_id });
  ensured.p = null;
  return row;
}

export async function bumpCommitment(c, by){
  const done = Math.max(0, Math.min(c.target_count, c.done_count + by));
  if (done === c.done_count) return c;
  const row = await store.commitments.set(c.id, { done_count: done });
  if (by > 0) await touchGoal(c.goal_id);
  return row;
}

// Turn a one-off commitment into a repeating one (from its own period onwards).
export async function makeRecurring(c){
  const per = c.cadence === 'daily' ? Math.max(1, Math.round(c.target_count / 7)) : c.target_count;
  const r = await store.rules.add({ title: c.title, goal_id: c.goal_id, cadence: c.cadence, per_period: per, start_date: c.week_start });
  await store.commitments.set(c.id, { rule_id: r.id });
  ensured.p = null;
}

// Stop repeating: past and current commitments stay as they are, nothing new is created.
export async function stopRepeating(ruleId){
  await store.rules.del(ruleId);
  ensured.p = null;
}

// Change how many per period, from now on: updates the rule and this period's commitment.
export async function setRuleCount(rule, n){
  n = Math.max(1, Math.min(99, Number(n) || 1));
  await store.rules.set(rule.id, { per_period: n });
  const [cur] = await store.commitments.list((q) => q.eq('rule_id', rule.id).eq('week_start', periodStartFor(rule.cadence, startOfWeek(todayStr()))));
  if (cur) { const target = targetFor(rule.cadence, n); await store.commitments.set(cur.id, { target_count: target, done_count: Math.min(cur.done_count, target) }); }
  ensured.p = null;
}

// Where this commitment should be by today, for the current period only.
//   daily:   { perDay, behind, onTrack }  behind = what earlier days were short by (so
//            nothing is "behind" before the day has even started); onTrack = today's
//            share is also already done
//   monthly: { left }              (days left in the month)
export function paceInfo(c, today = todayStr()){
  if (c.source) return null;
  if (c.cadence === 'daily' && c.week_start === startOfWeek(today)) {
    const perDay = c.target_count / 7, dow = isoDow(today);
    return { perDay, behind: Math.max(0, Math.ceil(perDay * (dow - 1)) - c.done_count), onTrack: c.done_count >= Math.ceil(perDay * dow) };
  }
  if (c.cadence === 'monthly' && c.week_start === monthStart(today)) return { left: daysBetween(today, monthEnd(today)) };
  return null;
}
