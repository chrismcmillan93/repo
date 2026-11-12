// Week: the commitments made for each goal, the ones fed from Health, the
// scorecard and its trend, and goals that need a decision.
import * as store from '../store.js';
import { esc, bar, pill, wire, formData, empty, options } from '../ui.js';
import { todayStr, addDays, startOfWeek, formatDateShort } from '../fit/utils.js';
import { goalPct, goalExpected, goalState, keptPct, touchGoal } from '../lib.js';
import { syncFit } from '../fit/feed.js';

export async function render(root){
  const today = todayStr(), thisWeek = startOfWeek(today);
  let week = thisWeek, d = null;

  async function load(){
    const goals = await store.goals.list((q) => q.eq('status', 'active').order('created_at'));
    await syncFit(week, goals);
    const [all, steps] = await Promise.all([store.commitments.list((q) => q.gte('week_start', addDays(week, -49)).lte('week_start', week).order('created_at')), store.steps.list()]);
    d = { goals, steps, all, commits: all.filter((c) => c.week_start === week) };
  }

  function draw(){
    const wk = keptPct(d.commits);
    const hist = [7, 6, 5, 4, 3, 2, 1].map((n) => { const ws = addDays(week, -7 * n); const list = d.all.filter((c) => c.week_start === ws); return { n, pct: list.length ? keptPct(list) : null }; });
    const known = hist.filter((h) => h.pct != null);
    const avg = known.length ? Math.round((known.reduce((s, h) => s + h.pct, 0) + wk) / (known.length + 1)) : null;
    const row = (c) => `<div class="row"><span class="rt"><span class="rtitle">${esc(c.title)}</span>${c.source ? `<span class="rmeta">${pill('From Health')}</span>` : ''}</span>
      ${c.source ? `<span class="right"><b>${c.done_count}/${c.target_count}</b></span>` : `<span class="step"><button data-act="dec" data-id="${c.id}" aria-label="One fewer">−</button><b>${c.done_count}/${c.target_count}</b><button data-act="inc" data-id="${c.id}" aria-label="One more">+</button><button class="btn sm ghost" data-act="del" data-id="${c.id}" aria-label="Delete">×</button></span>`}</div>`;
    const groups = d.goals.map((g) => { const cs = d.commits.filter((c) => c.goal_id === g.id);
      return `<p class="sub">${esc(g.title)}</p>${cs.length ? cs.map(row).join('') : `<div class="row"><span class="rt">${pill('No commitment this week', 'bad')}</span></div>`}`; }).join('');
    const loose = d.commits.filter((c) => !c.goal_id || !d.goals.some((g) => g.id === c.goal_id));
    const areas = [...new Set(d.goals.map((g) => g.area))].map((a) => { const cs = d.commits.filter((c) => (d.goals.find((g) => g.id === c.goal_id) || {}).area === a); const k = keptPct(cs);
      return `<div class="rt"><span class="rmeta spread"><b>${esc(a)}</b><span>${cs.length ? k + '%' : 'nothing set'}</span></span>${bar(k, null, !cs.length ? 'bad' : k < 40 ? 'warn' : 'good')}</div>`; }).join('');
    const decide = d.goals.filter((g) => { const p = goalPct(g, d.steps); return ['stalled', 'behind'].includes(goalState(g, p, goalExpected(g))); });

    root.innerHTML = `<div class="weeknav"><button class="btn sm" data-act="prev" aria-label="Previous week">‹</button><b>Week of ${formatDateShort(week)}${week === thisWeek ? ' (this week)' : ''}</b><button class="btn sm" data-act="next" ${week >= thisWeek ? 'disabled' : ''} aria-label="Next week">›</button></div>
      <div class="cols"><section class="panel"><h2>Commitments <small>Set on Sunday, kept by the next</small></h2>
        ${groups}${loose.length ? `<p class="sub">Not tied to a goal</p>${loose.map(row).join('')}` : ''}${!d.commits.length && !d.goals.length ? empty('Add a goal first, then commit to what you will do for it this week.') : ''}
        <form class="add wrapf" data-act="add"><input class="field" name="title" required placeholder="e.g. Send 2 proposals" aria-label="New commitment">
          <label class="lab">Times<input class="field" style="width:5em" type="number" min="1" name="n" value="1"></label>
          <select class="field" name="goal" aria-label="Goal">${options(d.goals.map((g) => [g.id, g.title]), null, 'No goal')}</select><button class="btn pri">Commit</button></form></section>
      <div class="stack"><section class="panel"><h2>Scorecard</h2>
        <div class="stats"><div><b class="big">${wk}%</b><span>kept this week</span></div>${avg != null ? `<div><b class="big">${avg}%</b><span>${known.length + 1}-week average</span></div>` : ''}</div>
        <div class="trend">${hist.map((h) => `<div>${h.pct == null ? '' : h.pct}<span style="height:${h.pct || 0}%"></span>${h.n}w</div>`).join('')}<div class="now">${wk}<span style="height:${Math.max(wk, 2)}%"></span>Now</div></div></section>
        <section class="panel"><h2>By life area</h2>${areas || empty('No goals yet.')}</section>
        <section class="panel"><h2>Needs a decision</h2>${decide.length ? decide.map((g) => `<div class="row"><span class="rt"><span class="rtitle">${esc(g.title)}</span><span class="rmeta">Behind pace or stalled. Recommit this week, change the target, or let it go.</span></span><a class="btn sm" href="#/goals/${g.id}">Decide</a></div>`).join('') : empty('Every active goal is on pace.')}</section></div></div>`;
  }

  const refresh = async () => { await load(); draw(); };
  const bump = async (id, by) => { const c = d.commits.find((x) => x.id === id); await store.commitments.set(id, { done_count: Math.max(0, Math.min(c.target_count, c.done_count + by)) }); if (by > 0) await touchGoal(c.goal_id); await refresh(); };
  wire(root, {
    prev(){ week = addDays(week, -7); return refresh(); },
    next(){ week = addDays(week, 7); return refresh(); },
    inc: (n) => bump(n.dataset.id, 1),
    dec: (n) => bump(n.dataset.id, -1),
    async del(n){ await store.commitments.del(n.dataset.id); await refresh(); },
    async add(f){ const v = formData(f); await store.commitments.add({ week_start: week, title: v.title.trim(), target_count: Math.max(1, Number(v.n) || 1), goal_id: v.goal || null }); await refresh(); }
  });
  await refresh();
}
