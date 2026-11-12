import { esc, pill, options, formData } from '../ui.js';
import { formatDateShort, todayStr, toast } from '../fit/utils.js';
import { paceInfo, bumpCommitment, makeRecurring, addCommitment, CADENCE_UNIT } from '../lib.js';
import * as store from '../store.js';

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

// ---------------- commitments (shared by Week, Goals and Today) ----------------
export function cadenceText(c){
  if (c.source) return 'From Health';
  if (c.cadence === 'daily') return `${c.target_count / 7} a day, ${c.target_count} for the week`;
  return `${c.target_count} ${CADENCE_UNIT[c.cadence] || 'a week'}`;
}

// One commitment: title, how often, pace, and a stepper. `tools: false` hides repeat/delete.
export function commitRow(c, { tools = true } = {}){
  const p = paceInfo(c);
  const done = c.done_count >= c.target_count;
  const chips = [pill(cadenceText(c), c.source ? '' : c.cadence === 'monthly' ? 'goal' : '')];
  if (c.rule_id) chips.push(pill('↻ Repeats'));
  if (done) chips.push(pill(c.cadence === 'monthly' ? 'Done this month' : c.cadence === 'daily' ? 'Done for the week' : 'Done', 'good'));
  else if (p && p.behind != null) chips.push(p.behind ? pill(`${p.behind} behind: do ${p.behind + p.perDay} today`, 'warn') : p.onTrack ? pill('On track', 'good') : pill('Due today'));
  else if (p && p.left != null) chips.push(pill(`${p.left} day${p.left === 1 ? '' : 's'} left`, p.left <= 7 ? 'warn' : ''));
  const stepper = c.source ? `<span class="right"><b>${c.done_count}/${c.target_count}</b></span>`
    : `<span class="step"><button data-act="dec" data-id="${c.id}" aria-label="One fewer">−</button><b>${c.done_count}/${c.target_count}</b><button data-act="inc" data-id="${c.id}" aria-label="One more">+</button>
      ${tools ? `${c.rule_id ? '' : `<button class="btn sm ghost" data-act="repeat" data-id="${c.id}" title="Make this come back every ${c.cadence === 'monthly' ? 'month' : 'week'}">Repeat</button>`}<button class="btn sm ghost" data-act="delcommit" data-id="${c.id}" aria-label="Delete">×</button>` : ''}</span>`;
  return `<div class="row ${done ? 'done' : ''}"><span class="rt"><span class="rtitle">${esc(c.title)}</span><span class="rmeta">${chips.join('')}</span></span>${stepper}</div>`;
}

// "1 hike a month" / "1 chapter a day": how many, how often, and whether it repeats.
// Pass goalId to fix the goal, or goals to show a chooser.
export function commitFormHtml({ goals = [], goalId = null } = {}){
  return `<form class="add wrapf" data-act="addcommit">
      <input class="field" name="title" required placeholder="e.g. Read 1 chapter" aria-label="New commitment">
      <label class="lab">How many<input class="field" style="width:5em" type="number" min="1" max="99" name="n" value="1"></label>
      <label class="lab">Every<select class="field" name="cadence"><option value="daily">Day</option><option value="weekly" selected>Week</option><option value="monthly">Month</option></select></label>
      ${goalId ? `<input type="hidden" name="goal" value="${esc(goalId)}">` : `<select class="field" name="goal" aria-label="Goal">${options(goals.map((g) => [g.id, g.title]), null, 'No goal')}</select>`}
      <label class="check"><input type="checkbox" name="repeat" checked> Repeat automatically</label>
      <button class="btn pri">Commit</button></form>
    <p class="hint">Daily counts as 7 for the week, so if you miss a day you can do 2 the next. Monthly ones stay open all month. Weekly ones reset each Monday.</p>`;
}

// Handlers for the commitment buttons and form, merged into a view's wire() map.
//   find(id): the commitment in the view's loaded list; refresh(): reload and redraw;
//   weekStart(): the Monday of the week being looked at.
export function commitActs({ find, refresh, weekStart }){
  return {
    async inc(n){ await bumpCommitment(find(n.dataset.id), 1); await refresh(); },
    async dec(n){ await bumpCommitment(find(n.dataset.id), -1); await refresh(); },
    async delcommit(n){ await store.commitments.del(n.dataset.id); await refresh(); },
    async repeat(n){ await makeRecurring(find(n.dataset.id)); toast('It will now come back automatically'); await refresh(); },
    async addcommit(f){
      const v = formData(f);
      await addCommitment({ title: v.title, n: v.n, cadence: v.cadence, repeat: !!v.repeat, goal_id: v.goal || null }, weekStart());
      toast(v.repeat ? 'Added. It will repeat.' : 'Added');
      await refresh();
    }
  };
}
