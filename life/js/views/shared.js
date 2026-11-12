import { esc, pill, options } from '../ui.js';
import { formatDateShort, todayStr } from '../fit/utils.js';

export function taskRow(t, goalsById, tools = ''){
  const g = t.goal_id && goalsById[t.goal_id];
  const done = t.status === 'done';
  return `<div class="row ${done ? 'done' : ''}"><input type="checkbox" data-act="task" data-id="${t.id}" ${done ? 'checked' : ''} aria-label="Done">
    <span class="rt"><span class="rtitle">${esc(t.title)}</span><span class="rmeta">
      ${g ? pill(g.title, 'goal') : ''}${t.carried_count ? pill(`Carried over ${t.carried_count} time${t.carried_count === 1 ? '' : 's'}`, t.carried_count >= 3 ? 'bad' : 'warn') : ''}
      ${t.repeat ? pill(`Repeats ${t.repeat}`) : ''}${t.due_date && t.due_date !== todayStr() ? `<span>${formatDateShort(t.due_date)}</span>` : ''}</span></span>${tools}</div>`;
}

// "Counts towards": this week's own commitments, then goals. Value is c:<id> or g:<id>.
export function towardsSelect(commits, goals, name = 'towards'){
  const cs = commits.filter((c) => !c.source);
  return `<select class="field" name="${name}" aria-label="Counts towards"><option value="">No goal</option>
    ${cs.length ? `<optgroup label="This week's commitments">${options(cs.map((c) => [`c:${c.id}`, c.title]))}</optgroup>` : ''}
    ${goals.length ? `<optgroup label="Goals">${options(goals.map((g) => [`g:${g.id}`, g.title]))}</optgroup>` : ''}</select>`;
}

export function towardsFields(value, commits){
  if (!value) return {};
  const [kind, id] = value.split(':');
  if (kind === 'g') return { goal_id: id };
  const c = commits.find((x) => x.id === id);
  return { commitment_id: id, goal_id: c ? c.goal_id : null };
}
