// Goal maths and the shared "tick a task" behaviour.
import * as store from './store.js';
import { todayStr, addDays, parseLocalDate, formatDateShort } from './fit/utils.js';

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

export function keptPct(list){
  const n = list.reduce((a, c) => a + c.target_count, 0);
  return n ? Math.round(100 * list.reduce((a, c) => a + Math.min(c.done_count, c.target_count), 0) / n) : 0;
}
