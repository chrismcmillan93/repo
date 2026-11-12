// Goals: the list with pace bars, and one goal's breakdown from long term down
// to this week's commitments and today's actions.
import * as store from '../store.js';
import { esc, bar, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, startOfWeek, formatDateShort, toast } from '../fit/utils.js';
import { goalPct, goalExpected, goalState, STATE, needLine, daysBetween, setTaskDone, touchGoal, keptPct, weekCommitments } from '../lib.js';
import { syncFit } from '../fit/feed.js';
import { importFromGoalsApp, importSummary } from '../importer.js';
import { commitRow, commitFormHtml, commitActs } from './shared.js';

const AREAS = ['Health', 'Career', 'Money', 'Learning', 'Relationships', 'Home', 'Personal'];
const LEVELS = [['year', 'This year'], ['quarter', 'This quarter'], ['month', 'This month']];

export async function render(root, params){
  const today = todayStr(), weekStart = startOfWeek(today);
  let d = null, sel = params[0] || null, mode = 'view';

  async function load(){
    const goals = await store.goals.list((q) => q.neq('status', 'stopped').order('created_at'));
    await syncFit(weekStart, goals);
    const [steps, commits, tasks] = await Promise.all([
      store.steps.list((q) => q.order('due_date', { nullsFirst: false }).order('sort_order')),
      weekCommitments(weekStart),
      store.tasks.list((q) => q.not('goal_id', 'is', null).or(`status.eq.open,and(status.eq.done,done_on.eq.${today})`))
    ]);
    d = { goals, steps, commits, tasks };
    if (!sel || !goals.some((g) => g.id === sel)) sel = goals[0] ? goals[0].id : null;
  }

  function formHtml(g){
    const v = g || { area: 'Personal', measure: 'steps', start_date: today, unit: '' };
    return `<section class="panel"><h2>${g ? 'Edit goal' : 'New goal'}</h2><form data-act="save" class="stack">
      <label class="lab">Goal<input class="field" name="title" required value="${esc(v.title || '')}" placeholder="e.g. Build a £12,000 emergency fund"></label>
      <label class="lab">Why it matters<input class="field" name="why" value="${esc(v.why || '')}"></label>
      <div class="wrapf"><label class="lab">Area<select class="field" name="area">${options(AREAS.map((a) => [a, a]), v.area)}</select></label>
        <label class="lab">Start<input class="field" type="date" name="start_date" required value="${v.start_date}"></label>
        <label class="lab">Target date<input class="field" type="date" name="target_date" value="${v.target_date || ''}"></label></div>
      <div class="wrapf"><label class="lab">Measured by<select class="field" name="measure">${options([['steps', 'Steps ticked off'], ['numeric', 'A number']], v.measure)}</select></label>
        <label class="lab">Start value<input class="field" type="number" step="any" name="start_value" value="${v.start_value ?? ''}"></label>
        <label class="lab">Target value<input class="field" type="number" step="any" name="target_value" value="${v.target_value ?? ''}"></label>
        <label class="lab">Unit<input class="field" name="unit" value="${esc(v.unit || '')}" placeholder="kg, £, books"></label></div>
      <label class="lab">Fed automatically from Health<select class="field" name="auto_source">${options([['fitness_weight', 'My weigh-ins set the current value'], ['fitness_training', 'Training sessions count as progress']], v.auto_source, 'No')}</select></label>
      <div class="btns"><button class="btn pri">Save</button><button type="button" class="btn" data-act="cancel">Cancel</button></div></form></section>`;
  }

  function detailHtml(g){
    const pct = goalPct(g, d.steps), exp = goalExpected(g), st = goalState(g, pct, exp);
    const steps = d.steps.filter((s) => s.goal_id === g.id);
    const cs = d.commits.filter((c) => c.goal_id === g.id);
    const ts = d.tasks.filter((t) => t.goal_id === g.id && (t.due_date === today || t.done_on === today));
    const alerts = [];
    if (st === 'stalled') alerts.push(`No progress in ${daysBetween(g.last_progress_on || g.start_date, today)} days.`);
    const need = needLine(g); if (need) alerts.push(need);
    if (!steps.length) alerts.push('No breakdown yet. Add what has to be true this year, this quarter and this month.');
    const rung = ([lvl, label]) => { const list = steps.filter((s) => s.level === lvl);
      return `<div class="rung"><div class="lv">${label}</div><div class="body">${list.length ? list.map((s) => `<span class="mini ${s.done_on ? 'done' : ''}"><input type="checkbox" data-act="step" data-id="${s.id}" ${s.done_on ? 'checked' : ''} aria-label="Done">
        <span style="flex:1;min-width:0">${esc(s.title)}${s.due_date ? ` <span class="hint">by ${formatDateShort(s.due_date)}${!s.done_on && s.due_date < today ? ' · overdue' : ''}</span>` : ''}</span><button class="btn sm ghost" data-act="delstep" data-id="${s.id}" aria-label="Delete step">×</button></span>`).join('') : '<span class="hint">Nothing set.</span>'}</div></div>`; };
    return `<section class="panel"><h2>${esc(g.title)} <small>${g.target_date ? `Due ${formatDateShort(g.target_date)}` : 'No target date'}</small></h2>
      ${g.why ? `<p class="hint">${esc(g.why)}</p>` : ''}
      ${alerts.map((a) => `<div class="nudge ${st === 'stalled' ? '' : 'warn'}"><p>${esc(a)}</p></div>`).join('')}
      <div class="ladder">
        <div class="rung"><div class="lv">Long term</div><div class="body"><span>${pct}% done${exp != null ? `, ${exp}% expected by today` : ''} ${pill(STATE[st][0], STATE[st][1])}${g.status === 'paused' ? pill('Paused') : ''}</span>${bar(pct, exp, STATE[st][1])}
          ${g.measure === 'numeric' ? `<form class="add" data-act="value"><label class="lab" style="flex:1">Now (${esc(g.unit)}), from ${g.start_value ?? '?'} to ${g.target_value ?? '?'}<input class="field" type="number" step="any" name="v" value="${g.current_value ?? g.start_value ?? ''}" ${g.auto_source === 'fitness_weight' ? 'disabled' : ''}></label>${g.auto_source === 'fitness_weight' ? '<span class="hint">Set by your weigh-ins</span>' : '<button class="btn">Update</button>'}</form>` : ''}</div></div>
        ${LEVELS.map(rung).join('')}
        <div class="rung"><div class="lv">Add a step</div><div class="body"><form class="add wrapf" data-act="addstep"><input class="field" name="title" required placeholder="What has to be true?" aria-label="Step">
          <select class="field" name="level" aria-label="Level">${options(LEVELS, 'month')}</select><input class="field" type="date" name="due_date" aria-label="Due date"><button class="btn">Add</button></form></div></div>
        <div class="rung live"><div class="lv">Commit</div><div class="body">${cs.length ? cs.map((c) => commitRow(c)).join('') + bar(keptPct(cs))
          : `<span>${pill('No commitment set', 'bad')} A goal with nothing to do this week does not move.</span>`}
          <p class="sub">Add a commitment</p>${commitFormHtml({ goalId: g.id })}</div></div>
        <div class="rung live"><div class="lv">Today</div><div class="body">${ts.length ? ts.map((t) => `<label class="mini ${t.status === 'done' ? 'done' : ''}"><input type="checkbox" data-act="task" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}><span>${esc(t.title)}</span></label>`).join('') : '<span class="hint">Nothing planned for today.</span>'}
          <form class="add" data-act="addtask"><input class="field" name="title" required placeholder="Add today's action" aria-label="Add today's action"><button class="btn">Add</button></form></div></div>
      </div>
      <div class="btns"><button class="btn sm" data-act="edit">Edit</button><button class="btn sm" data-act="status" data-v="${g.status === 'paused' ? 'active' : 'paused'}">${g.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button class="btn sm" data-act="status" data-v="achieved">Mark achieved</button><button class="btn sm" data-act="status" data-v="stopped">Drop this goal</button></div></section>`;
  }

  function draw(){
    const g = d.goals.find((x) => x.id === sel);
    const list = d.goals.map((x) => { const pct = goalPct(x, d.steps), exp = goalExpected(x), st = x.status === 'achieved' ? 'done' : goalState(x, pct, exp);
      return `<button class="goalbtn ${x.id === sel ? 'on' : ''}" data-act="pick" data-id="${x.id}"><span class="gh"><b>${esc(x.title)}</b>${x.status === 'paused' ? pill('Paused') : pill(STATE[st][0], STATE[st][1])}</span>
        ${bar(pct, exp, STATE[st][1])}<span class="rmeta"><span>${esc(x.area)}</span>${x.target_date ? `<span>Due ${formatDateShort(x.target_date)}</span>` : ''}<span>${pct}% done${exp != null ? `, ${exp}% expected` : ''}</span></span></button>`; }).join('');
    root.innerHTML = `<div class="cols g"><section class="panel"><h2>Goals <small>The line marks where you should be today</small></h2>
      ${list || empty('No goals yet. Add one, or bring your goals over from the Goals app.')}
      <div class="btns"><button class="btn pri" data-act="new">New goal</button><button class="btn" data-act="import">Import from the Goals app</button></div></section>
      <div class="stack">${mode === 'new' ? formHtml(null) : mode === 'edit' && g ? formHtml(g) : g ? detailHtml(g) : ''}</div></div>`;
  }

  const refresh = async () => { await load(); draw(); };
  const num = (v) => (v === '' || v == null ? null : Number(v));
  wire(root, {
    ...commitActs({ find: (id) => d.commits.find((c) => c.id === id), refresh: () => refresh(), weekStart: () => weekStart }),
    pick(n){ sel = n.dataset.id; mode = 'view'; draw(); },
    new(){ mode = 'new'; draw(); },
    edit(){ mode = 'edit'; draw(); },
    cancel(){ mode = 'view'; draw(); },
    async save(f){
      const v = formData(f);
      const row = { title: v.title.trim(), why: v.why.trim(), area: v.area, start_date: v.start_date, target_date: v.target_date || null, measure: v.measure,
        start_value: num(v.start_value), target_value: num(v.target_value), unit: v.unit.trim(), auto_source: v.auto_source || null };
      if (mode === 'edit') await store.goals.set(sel, row);
      else { const g = await store.goals.add({ ...row, current_value: row.start_value, last_progress_on: today }); sel = g.id; }
      mode = 'view';
      await refresh();
    },
    async value(f){ await store.goals.set(sel, { current_value: num(formData(f).v), last_progress_on: today }); toast('Updated'); await refresh(); },
    async addstep(f){ const v = formData(f); await store.steps.add({ goal_id: sel, title: v.title.trim(), level: v.level, due_date: v.due_date || null }); await refresh(); },
    async step(n){ await store.steps.set(n.dataset.id, { done_on: n.checked ? today : null }); if (n.checked) await touchGoal(sel); await refresh(); },
    async delstep(n){ await store.steps.del(n.dataset.id); await refresh(); },
    async task(n){ await setTaskDone(d.tasks.find((t) => t.id === n.dataset.id), n.checked); await refresh(); },
    async addtask(f){ await store.tasks.add({ title: formData(f).title.trim(), status: 'open', due_date: today, goal_id: sel }); await refresh(); },
    async status(n){ await store.goals.set(sel, { status: n.dataset.v }); toast(n.dataset.v === 'stopped' ? 'Goal dropped' : 'Saved'); await refresh(); },
    async import(){
      toast(importSummary(await importFromGoalsApp()));
      await refresh();
    }
  });
  await refresh();
}
