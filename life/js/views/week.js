// Week: this week's commitments for each goal (daily, weekly and monthly, including the
// repeating ones and those fed from Health), what repeats, the scorecard and trend,
// and goals that need a decision.
import * as store from '../store.js';
import { esc, bar, pill, wire, empty } from '../ui.js';
import { todayStr, addDays, startOfWeek, formatDateShort, toast } from '../fit/utils.js';
import { goalPct, goalExpected, goalState, keptPct, weekCommitments, setRuleCount, stopRepeating, CADENCE_UNIT } from '../lib.js';
import { syncFit } from '../fit/feed.js';
import { commitRow, commitFormHtml, commitActs } from './shared.js';

export async function render(root){
  const today = todayStr(), thisWeek = startOfWeek(today);
  let week = thisWeek, d = null;

  async function load(){
    const goals = await store.goals.list((q) => q.eq('status', 'active').order('created_at'));
    await syncFit(week, goals);
    const [commits, all, steps, rules] = await Promise.all([
      weekCommitments(week),
      store.commitments.list((q) => q.gte('week_start', addDays(week, -49)).lte('week_start', week).order('created_at')),
      store.steps.list(),
      store.rules.list((q) => q.order('created_at'))
    ]);
    d = { goals, steps, all, commits, rules };
  }

  function draw(){
    const wk = keptPct(d.commits);
    const weekly = (list) => list.filter((c) => c.cadence !== 'monthly');
    const hist = [7, 6, 5, 4, 3, 2, 1].map((n) => { const ws = addDays(week, -7 * n); const list = weekly(d.all.filter((c) => c.week_start === ws)); return { n, pct: list.length ? keptPct(list) : null }; });
    const known = hist.filter((h) => h.pct != null);
    const avg = known.length ? Math.round((known.reduce((s, h) => s + h.pct, 0) + wk) / (known.length + 1)) : null;
    const monthly = d.commits.filter((c) => c.cadence === 'monthly');
    const goalOf = (id) => d.goals.find((g) => g.id === id);
    const groups = d.goals.map((g) => { const cs = d.commits.filter((c) => c.goal_id === g.id);
      return `<p class="sub">${esc(g.title)}</p>${cs.length ? cs.map((c) => commitRow(c)).join('') : `<div class="row"><span class="rt">${pill('No commitment this week', 'bad')}</span></div>`}`; }).join('');
    const loose = d.commits.filter((c) => !goalOf(c.goal_id));
    const areas = [...new Set(d.goals.map((g) => g.area))].map((a) => { const cs = d.commits.filter((c) => (goalOf(c.goal_id) || {}).area === a); const k = keptPct(cs);
      return `<div class="rt"><span class="rmeta spread"><b>${esc(a)}</b><span>${weekly(cs).length ? k + '%' : 'nothing set'}</span></span>${bar(k, null, !weekly(cs).length ? 'bad' : k < 40 ? 'warn' : 'good')}</div>`; }).join('');
    const decide = d.goals.filter((g) => { const p = goalPct(g, d.steps); return ['stalled', 'behind'].includes(goalState(g, p, goalExpected(g))); });
    const ruleRow = (r) => { const g = goalOf(r.goal_id);
      return `<div class="row"><span class="rt"><span class="rtitle">${esc(r.title)}</span><span class="rmeta">${g ? pill(g.title, 'goal') : ''}<span>Every ${r.cadence === 'daily' ? 'day' : r.cadence === 'weekly' ? 'week' : 'month'}</span></span></span>
        <span class="step"><input class="field" style="width:4.2em" type="number" min="1" max="99" data-act="rulecount" data-id="${r.id}" value="${r.per_period}" aria-label="How many ${CADENCE_UNIT[r.cadence]}"><span class="hint">${CADENCE_UNIT[r.cadence]}</span><button class="btn sm ghost" data-act="stoprepeat" data-id="${r.id}">Stop</button></span></div>`; };

    root.innerHTML = `<div class="weeknav"><button class="btn sm" data-act="prev" aria-label="Previous week">‹</button><b>Week of ${formatDateShort(week)}${week === thisWeek ? ' (this week)' : ''}</b><button class="btn sm" data-act="next" ${week >= thisWeek ? 'disabled' : ''} aria-label="Next week">›</button></div>
      <div class="cols"><div class="stack"><section class="panel"><h2>Commitments <small>Daily, weekly or monthly</small></h2>
        ${groups}${loose.length ? `<p class="sub">Not tied to a goal</p>${loose.map((c) => commitRow(c)).join('')}` : ''}${!d.commits.length && !d.goals.length ? empty('Add a goal first, then commit to what you will do for it.') : ''}
        <p class="sub">Add a commitment</p>${commitFormHtml({ goals: d.goals })}</section>
        <section class="panel"><h2>Repeating <small>Comes back by itself</small></h2>${d.rules.length ? d.rules.map(ruleRow).join('') : empty('Nothing repeats yet. Tick "Repeat automatically" when you add one, e.g. 1 chapter a day, or 1 hike a month.')}
          ${d.rules.length ? '<p class="hint">Changing the number applies from this period on. Stopping keeps everything already done.</p>' : ''}</section></div>
      <div class="stack"><section class="panel"><h2>Scorecard</h2>
        <div class="stats"><div><b class="big">${wk}%</b><span>kept this week</span></div>${avg != null ? `<div><b class="big">${avg}%</b><span>${known.length + 1}-week average</span></div>` : ''}</div>
        <div class="trend">${hist.map((h) => `<div>${h.pct == null ? '' : h.pct}<span style="height:${h.pct || 0}%"></span>${h.n}w</div>`).join('')}<div class="now">${wk}<span style="height:${Math.max(wk, 2)}%"></span>Now</div></div>
        ${monthly.length ? `<p class="hint">${monthly.filter((c) => c.done_count >= c.target_count).length} of ${monthly.length} monthly commitment${monthly.length === 1 ? '' : 's'} done this month. They're not counted in the weekly percentage.</p>` : ''}</section>
        <section class="panel"><h2>By life area</h2>${areas || empty('No goals yet.')}</section>
        <section class="panel"><h2>Needs a decision</h2>${decide.length ? decide.map((g) => `<div class="row"><span class="rt"><span class="rtitle">${esc(g.title)}</span><span class="rmeta">Behind pace or stalled. Recommit this week, change the target, or let it go.</span></span><a class="btn sm" href="#/goals/${g.id}">Decide</a></div>`).join('') : empty('Every active goal is on pace.')}</section></div></div>`;
  }

  const refresh = async () => { await load(); draw(); };
  wire(root, {
    prev(){ week = addDays(week, -7); return refresh(); },
    next(){ week = addDays(week, 7); return refresh(); },
    ...commitActs({ find: (id) => d.commits.find((c) => c.id === id), refresh, weekStart: () => week }),
    async rulecount(n){ await setRuleCount(d.rules.find((r) => r.id === n.dataset.id), n.value); toast('Saved. It applies from this period.'); await refresh(); },
    async stoprepeat(n){ await stopRepeating(n.dataset.id); toast('Stopped repeating'); await refresh(); }
  });
  await refresh();
}
