// Review: a guided look back over a week, month or quarter. Step through every
// active goal (worst first) with a rating and a decision, then reflect. Decisions
// are applied to the goals when the review is completed. Drafts save as you go.
import * as store from '../store.js';
import { esc, bar, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, addDays, startOfWeek, formatDateShort, toast } from '../fit/utils.js';
import { goalPct, goalExpected, goalState, STATE, keptPct } from '../lib.js';

const TYPES = [['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter']];
const DECISIONS = [['continue', 'Keep going as is'], ['adjust', 'Adjust the plan or target'], ['pause', 'Pause it'], ['complete', 'Mark it achieved'], ['stop', 'Drop it']];
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The most recently finished period of a type, plus the current one.
export function periods(type, today = todayStr()){
  const [y, m] = today.split('-').map(Number);
  if (type === 'week') {
    const cur = startOfWeek(today), prev = addDays(cur, -7);
    return [{ start: prev, end: addDays(prev, 6) }, { start: cur, end: addDays(cur, 6) }];
  }
  if (type === 'month') {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return [{ start: `${py}-${pad(pm)}-01`, end: `${py}-${pad(pm)}-${lastDay(py, pm)}` }, { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${lastDay(y, m)}` }];
  }
  const q = Math.floor((m - 1) / 3), qy = q === 0 ? y - 1 : y, qm = q === 0 ? 10 : (q - 1) * 3 + 1;
  return [{ start: `${qy}-${pad(qm)}-01`, end: `${qy}-${pad(qm + 2)}-${lastDay(qy, qm + 2)}` }, { start: `${y}-${pad(q * 3 + 1)}-01`, end: `${y}-${pad(q * 3 + 3)}-${lastDay(y, q * 3 + 3)}` }];
}

export function periodLabel(type, start){
  const d = new Date(start + 'T00:00:00');
  if (type === 'week') return `Week of ${formatDateShort(start)}`;
  if (type === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

// The finished week / month / quarter reviews still to do (for Today's nudge).
export async function dueReviews(){
  const done = await store.reviews.list((q) => q.eq('status', 'complete').gte('period_start', addDays(todayStr(), -120)));
  return TYPES.map(([t]) => ({ type: t, ...periods(t)[0] })).filter((p) => !done.some((r) => r.period_type === p.type && r.period_start === p.start));
}

export async function render(root, params){
  if (params[0]) return flow(root, params[0]);
  const [list, due] = await Promise.all([store.reviews.list((q) => q.order('period_start', { ascending: false }).limit(60)), dueReviews()]);
  const pick = (type, p, hint) => `<button class="btn" data-act="start" data-type="${type}" data-start="${p.start}" data-end="${p.end}">${esc(periodLabel(type, p.start))}${hint ? ` <span class="hint">${hint}</span>` : ''}</button>`;
  root.innerHTML = `<section class="panel"><h2>Start a review</h2>
      ${due.length ? `<p class="sub">Ready now</p><div class="btns">${due.map((p) => pick(p.type, p, '')).join('')}</div>` : '<p class="hint">Every finished week, month and quarter has been reviewed.</p>'}
      <p class="sub">Or the one in progress</p><div class="btns">${TYPES.map(([t]) => pick(t, periods(t)[1], 'so far')).join('')}</div>
      <p class="hint">Sunday: review the week and set next week's commitments. First of the month: review the month.</p></section>
    <section class="panel"><h2>Past reviews</h2>${list.length ? list.map((r) => `<a class="row" href="#/review/${r.id}"><span class="rt"><span class="rtitle">${esc(periodLabel(r.period_type, r.period_start))}</span>
      <span class="rmeta">${pill(r.status === 'complete' ? 'Complete' : 'Draft', r.status === 'complete' ? 'good' : 'warn')}${r.rating ? `<span>${r.rating}/5</span>` : ''}${r.focus_next ? `<span>Next: ${esc(r.focus_next)}</span>` : ''}</span></span></a>`).join('') : empty('No reviews yet.')}</section>`;
  wire(root, {
    async start(n){
      const { type, start, end } = n.dataset;
      const [ex] = await store.reviews.list((q) => q.eq('period_type', type).eq('period_start', start));
      const r = ex || await store.reviews.add({ period_type: type, period_start: start, period_end: end });
      location.hash = `#/review/${r.id}`;
    }
  });
}

async function flow(outer, id){
  // A fresh element per draw, so listeners never stack when the review is reopened.
  const root = document.createElement('div');
  root.className = 'stack';
  outer.replaceChildren(root);
  const today = todayStr();
  const [[r], goals, steps] = await Promise.all([store.reviews.list((q) => q.eq('id', id)), store.goals.list((q) => q.in('status', ['active', 'paused']).order('created_at')), store.steps.list()]);
  if (!r) { root.innerHTML = `<section class="panel">${empty('That review no longer exists.')}<a class="btn" href="#/review">All reviews</a></section>`; return; }
  const [rgs, commits, tasks, misses, wins, closes] = await Promise.all([
    store.reviewGoals.list((q) => q.eq('review_id', id)),
    store.commitments.list((q) => q.gte('week_start', startOfWeek(r.period_start)).lte('week_start', r.period_end)),
    store.tasks.list((q) => q.eq('status', 'done').gte('done_on', r.period_start).lte('done_on', r.period_end)),
    store.journal.list((q) => q.eq('kind', 'miss').gte('entry_date', r.period_start).lte('entry_date', r.period_end).order('entry_date')),
    store.career.list((q) => q.eq('kind', 'win').gte('item_date', r.period_start).lte('item_date', r.period_end)),
    store.journal.list((q) => q.eq('kind', 'close').gte('entry_date', r.period_start).lte('entry_date', r.period_end))
  ]);
  const byGoal = Object.fromEntries(rgs.map((x) => [x.goal_id, x]));
  const rank = { stalled: 0, behind: 1, on: 2, done: 3 };
  const rows = goals.map((g) => { const pct = goalPct(g, steps), exp = goalExpected(g); return { g, pct, exp, st: goalState(g, pct, exp) }; }).sort((a, b) => rank[a.st] - rank[b.st]);
  const locked = r.status === 'complete';
  const dis = locked ? 'disabled' : '';
  const days = Math.round((new Date(Math.min(new Date(r.period_end), new Date(today))) - new Date(r.period_start)) / 864e5) + 1;

  root.innerHTML = `<div class="weeknav"><a class="btn sm" href="#/review">‹ All reviews</a><b>${esc(periodLabel(r.period_type, r.period_start))}</b>${pill(locked ? 'Complete' : 'Draft', locked ? 'good' : 'warn')}</div>
    <section class="panel"><h2>1. Look back <small>${formatDateShort(r.period_start)} to ${formatDateShort(r.period_end)}</small></h2>
      <div class="stats"><div><b class="big">${keptPct(commits)}%</b><span>commitments kept</span></div><div><b class="big">${tasks.length}</b><span>tasks done</span></div>
        <div><b class="big">${closes.length}/${days}</b><span>days closed</span></div><div><b class="big">${wins.length}</b><span>wins logged</span></div></div>
      ${commits.length ? `<p class="sub">Commitments</p>${commits.map((c) => `<div class="row"><span class="rt"><span class="rtitle">${esc(c.title)}</span><span class="rmeta"><span>Week of ${formatDateShort(c.week_start)}</span></span></span><span class="right"><b>${c.done_count}/${c.target_count}</b></span></div>`).join('')}` : ''}
      ${misses.length ? `<p class="sub">What got missed, and why</p>${misses.map((m) => `<div class="row"><span class="rt"><span class="rtitle">${esc(m.body)}</span></span><span class="right">${formatDateShort(m.entry_date)}</span></div>`).join('')}` : ''}
      ${wins.length ? `<p class="sub">Wins</p>${wins.map((w) => `<div class="row"><span class="rt"><span class="rtitle">${esc(w.title)}</span></span></div>`).join('')}` : ''}</section>
    <section class="panel"><h2>2. Each goal <small>Worst first</small></h2>
      ${rows.length ? rows.map(({ g, pct, exp, st }) => { const x = byGoal[g.id] || {};
        return `<form class="goalrev" data-act="goal" data-goal="${g.id}" data-pct="${pct}"><div class="gh"><b>${esc(g.title)}</b>${pill(STATE[st][0], STATE[st][1])}</div>${bar(pct, exp, STATE[st][1])}
          <span class="hint">${pct}% done${exp != null ? `, ${exp}% expected` : ''}</span>
          <div class="wrapf"><label class="lab">How did it go?<select class="field" name="rating" ${dis}>${options([5, 4, 3, 2, 1].map((n) => [n, `${n} / 5`]), x.rating, 'Rate it')}</select></label>
          <label class="lab">Decision<select class="field" name="decision" ${dis}>${options(DECISIONS, x.decision, 'Choose')}</select></label></div>
          <input class="field" name="note" value="${esc(x.note || '')}" placeholder="What changes next ${r.period_type}?" aria-label="Note" ${dis}></form>`; }).join('') : empty('No active goals.')}</section>
    <section class="panel"><h2>3. Reflect</h2><form data-act="reflect" class="stack">
      <label class="lab">What went well<textarea class="field" rows="2" name="went_well" ${dis}>${esc(r.went_well)}</textarea></label>
      <label class="lab">What didn't<textarea class="field" rows="2" name="went_badly" ${dis}>${esc(r.went_badly)}</textarea></label>
      <label class="lab">What I learned<textarea class="field" rows="2" name="learned" ${dis}>${esc(r.learned)}</textarea></label>
      <label class="lab">Focus for next ${r.period_type}<input class="field" name="focus_next" value="${esc(r.focus_next)}" ${dis}></label>
      <label class="lab">Overall<select class="field" name="rating" ${dis}>${options([5, 4, 3, 2, 1].map((n) => [n, `${n} / 5`]), r.rating, 'Rate the ' + r.period_type)}</select></label></form>
      <div class="btns">${locked ? '<button class="btn" data-act="reopen">Reopen</button>' : '<button class="btn pri" data-act="complete">Complete review and apply decisions</button>'}
      ${r.period_type === 'week' ? '<a class="btn" href="#/week">Set next week\'s commitments</a>' : ''}</div></section>`;

  async function saveGoal(f){
    const v = formData(f), goalId = f.dataset.goal, cur = byGoal[goalId];
    const row = { rating: v.rating ? Number(v.rating) : null, decision: v.decision || null, note: (v.note || '').trim(), pct_at_review: Number(f.dataset.pct) };
    byGoal[goalId] = cur ? await store.reviewGoals.set(cur.id, row) : await store.reviewGoals.add({ review_id: id, goal_id: goalId, ...row });
  }
  async function saveReflect(){
    const v = formData(root.querySelector('form[data-act="reflect"]'));
    await store.reviews.set(id, { went_well: v.went_well, went_badly: v.went_badly, learned: v.learned, focus_next: v.focus_next.trim(), rating: v.rating ? Number(v.rating) : null });
  }
  // Save on every change (forms here never submit).
  root.addEventListener('change', async (e) => {
    if (locked) return;
    const f = e.target.closest('form');
    try { if (f && f.dataset.act === 'goal') await saveGoal(f); else if (f) await saveReflect(); } catch (err) { toast(err.message); }
  });
  wire(root, {
    goal(){}, reflect(){},
    async complete(){
      await saveReflect();
      await Promise.all(Array.from(root.querySelectorAll('form[data-act="goal"]')).map(saveGoal));
      const status = { pause: 'paused', complete: 'achieved', stop: 'stopped', continue: 'active' };
      const adjust = [];
      for (const x of Object.values(byGoal)) {
        if (status[x.decision]) await store.goals.set(x.goal_id, { status: status[x.decision] });
        if (x.decision === 'adjust') adjust.push(x.goal_id);
      }
      await store.reviews.set(id, { status: 'complete', completed_at: new Date().toISOString() });
      const focus = formData(root.querySelector('form[data-act="reflect"]')).focus_next.trim();
      if (focus) await store.journal.add({ kind: 'decision', entry_date: today, body: `${periodLabel(r.period_type, r.period_start)} review: next focus is ${focus}` });
      toast(adjust.length ? 'Review complete. Opening the goal to adjust.' : 'Review complete');
      location.hash = adjust.length ? `#/goals/${adjust[0]}` : '#/review';
    },
    async reopen(){ await store.reviews.set(id, { status: 'draft', completed_at: null }); await flow(outer, id); }
  });
}
