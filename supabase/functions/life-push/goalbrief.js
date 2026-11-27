// The goal-action lines for the morning brief: one-off actions (tasks linked to a goal) that are overdue, due today
// or due tomorrow, named with their goal. Plain JavaScript with no Deno or browser APIs, so the app's tests can
// import and check it (life/tests/goalbrief.test.mjs).
//
// tasks: [{ title, due_date, goal_id, status }]; goals: [{ id, title }] (active goals only: an action on a
// paused or dropped goal is never announced); today / tomorrow: 'YYYY-MM-DD'.
// Returns at most three lines, each naming up to `perLine` actions then "+N more", so the brief stays short.
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function goalActionLines(tasks, goals, today, tomorrow, perLine = 3){
  const name = Object.fromEntries((goals || []).map((g) => [g.id, g.title]));
  const mine = (tasks || []).filter((t) => t.goal_id && name[t.goal_id] != null && t.due_date && t.status !== 'done');
  const byDate = (a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title);
  const show = (t) => `${clip(t.title, 40)} (${clip(name[t.goal_id], 24)})`;
  const line = (label, list) => {
    if (!list.length) return null;
    const more = list.length > perLine ? `, +${list.length - perLine} more` : '';
    return `${label}: ${list.slice(0, perLine).map(show).join(', ')}${more}`;
  };
  return [
    line('Overdue', mine.filter((t) => t.due_date < today).sort(byDate)),
    line('Goal actions today', mine.filter((t) => t.due_date === today).sort(byDate)),
    line('Tomorrow', mine.filter((t) => t.due_date === tomorrow).sort(byDate))
  ].filter(Boolean);
}

// The evening line: goal actions still open that are overdue or due today ("Goal actions still open: ..."),
// overdue ones first. Same naming and caps as the morning lines. Nothing due means no line.
export function goalActionsOpenTonight(tasks, goals, today, perLine = 3){
  const name = Object.fromEntries((goals || []).map((g) => [g.id, g.title]));
  const mine = (tasks || []).filter((t) => t.goal_id && name[t.goal_id] != null && t.due_date && t.due_date <= today && t.status !== 'done')
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title));
  if (!mine.length) return [];
  const show = (t) => `${clip(t.title, 40)} (${clip(name[t.goal_id], 24)})`;
  const more = mine.length > perLine ? `, +${mine.length - perLine} more` : '';
  return [`Goal actions still open: ${mine.slice(0, perLine).map(show).join(', ')}${more}`];
}
