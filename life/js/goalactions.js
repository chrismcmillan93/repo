// A goal's one-off actions: tasks linked to the goal (tasks.goal_id), shown on the goal's page with
// their own due dates. Pure (rows in, groups out) so it can be tested on its own.
//
// tasks: [{ id, goal_id, title, status ('open' | 'done' | 'inbox'), due_date, done_on, created_at }]
// Open actions come overdue first, then due today, then later ones by date, then undated by when they
// were added. Done ones are the most recent few, newest first, so a finished action stays visible for a
// while without piling up.
export const DONE_SHOWN = 5;

export function goalActions(tasks, goalId, today){
  const mine = (tasks || []).filter((t) => t.goal_id === goalId);
  const rank = (t) => (!t.due_date ? 3 : t.due_date < today ? 0 : t.due_date === today ? 1 : 2);
  const open = mine.filter((t) => t.status !== 'done').sort((a, b) =>
    rank(a) - rank(b) || (a.due_date || '').localeCompare(b.due_date || '') || (a.created_at || '').localeCompare(b.created_at || ''));
  const done = mine.filter((t) => t.status === 'done').sort((a, b) => (b.done_on || '').localeCompare(a.done_on || '')).slice(0, DONE_SHOWN);
  return { open, done, overdue: open.filter((t) => t.due_date && t.due_date < today).length };
}

// "overdue" / "due today" / "due 12 Dec" / "" for the small label beside an action.
export function dueLabel(t, today, fmt){
  if (!t.due_date) return '';
  if (t.status === 'done') return '';
  if (t.due_date < today) return 'overdue';
  if (t.due_date === today) return 'due today';
  return `due ${fmt(t.due_date)}`;
}
