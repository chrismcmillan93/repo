// Today: nudges, top three, everything due, habits, training and food, the
// week so far, what's coming up, and the evening close.
import * as store from '../store.js';
import { esc, bar, pill, wire, formData, empty } from '../ui.js';
import { todayStr, addDays, startOfWeek, isoDow, toast } from '../fit/utils.js';
import { goalPct, goalExpected, goalState, daysBetween, setTaskDone, carryOver, keptPct, weekCommitments, paceInfo } from '../lib.js';
import { syncFit } from '../fit/feed.js';
import { mountDay } from '../fit/day.js';
import { garmin, loadRecovery, recoveryHtml, syncSummary, syncError, garminPrefs } from '../fit/garmin.js';
import { taskRow, towardsSelect, towardsFields, commitRow, commitActs } from './shared.js';
import { loadCountdowns, countdownRow } from './events.js';
import { dueReviews, periodLabel } from './review.js';

export async function render(root){
  const today = todayStr();
  const weekStart = startOfWeek(today);
  let d = null;
  let closing = false;

  async function load(){
    const [goals, tasks, habits, checks, closed, coming, reviewsDue, cfg] = await Promise.all([
      store.goals.list((q) => q.eq('status', 'active').order('created_at')),
      store.tasks.list((q) => q.or(`status.eq.open,and(status.eq.done,done_on.eq.${today})`).order('created_at')),
      store.habits.list((q) => q.eq('archived', false).order('sort_order').order('created_at')),
      store.habitChecks.listSince(addDays(today, -90)),
      store.journal.list((q) => q.eq('entry_date', today).eq('kind', 'close')),
      loadCountdowns().catch(() => []),
      dueReviews().catch(() => []),
      store.settings.get().catch(() => ({}))
    ]);
    await carryOver(tasks);
    await syncFit(weekStart, goals);
    const [commits, steps] = await Promise.all([weekCommitments(weekStart), store.steps.list()]);
    d = { cfg, goals, tasks, habits, checks, closed: closed.length > 0, coming, reviewsDue, commits, steps, byId: Object.fromEntries(goals.map((g) => [g.id, g])) };
  }

  const dueToday = () => d.tasks.filter((t) => t.due_date === today || t.top_date === today);
  const tops = () => dueToday().filter((t) => t.top_date === today);

  function nudges(){
    const out = [];
    // The Garmin key only lasts up to a year, and the sync stops dead when it lapses.
    const keyEnds = garminPrefs(d.cfg).key_expires;
    if (keyEnds && daysBetween(today, keyEnds) <= 14) {
      const left = daysBetween(today, keyEnds);
      out.push(`<div class="nudge warn"><p>Your Garmin API key ${left < 0 ? 'has expired' : left === 0 ? 'expires today' : `expires in ${left} day${left === 1 ? '' : 's'}`}. Create a new one in Garmin Connect and replace the GARMIN_API_KEY secret in Supabase.</p><div class="btns"><a class="btn sm" href="#/settings">Settings</a></div></div>`);
    }
    const wk = d.reviewsDue.find((r) => r.type === 'week');
    if (wk && isoDow(today) >= 1) out.push(`<div class="nudge warn"><p>${esc(periodLabel('week', wk.start))} hasn't been reviewed. It takes ten minutes and sets this week up.</p><div class="btns"><a class="btn sm" href="#/review">Review it</a></div></div>`);
    d.reviewsDue.filter((r) => r.type !== 'week').forEach((r) => out.push(`<div class="nudge warn"><p>${esc(periodLabel(r.type, r.start))} is over. Time for the ${r.type}ly review.</p><div class="btns"><a class="btn sm" href="#/review">Review it</a></div></div>`));
    d.goals.forEach((g) => {
      const pct = goalPct(g, d.steps);
      if (goalState(g, pct, goalExpected(g)) === 'stalled') {
        out.push(`<div class="nudge"><p><b>${esc(g.title)}</b> has had no progress in ${daysBetween(g.last_progress_on || g.start_date, today)} days.</p><div class="btns"><a class="btn sm" href="#/goals/${g.id}">Open goal</a></div></div>`);
      } else if (!d.commits.some((c) => c.goal_id === g.id)) {
        out.push(`<div class="nudge warn"><p><b>${esc(g.title)}</b> has no commitment this week.</p><div class="btns"><a class="btn sm" href="#/week">Set one</a></div></div>`);
      }
    });
    d.tasks.filter((t) => t.status === 'open' && t.carried_count >= 3).forEach((t) => {
      out.push(`<div class="nudge warn"><p><b>${esc(t.title)}</b> has been carried over ${t.carried_count} times.</p><div class="btns">
        <button class="btn sm" data-act="top" data-id="${t.id}">Do it today</button><button class="btn sm" data-act="sched" data-id="${t.id}">Move to Saturday</button><button class="btn sm" data-act="deltask" data-id="${t.id}">Delete</button></div></div>`);
    });
    d.commits.forEach((c) => {
      const p = paceInfo(c);
      if (!p || c.done_count >= c.target_count) return;
      if (p.behind >= 2) out.push(`<div class="nudge warn"><p><b>${esc(c.title)}</b> is ${p.behind} behind. Do ${p.behind + p.perDay} today to get back on track.</p></div>`);
      if (p.left != null && p.left <= 7) out.push(`<div class="nudge warn"><p><b>${esc(c.title)}</b> is still open and the month ends in ${p.left} day${p.left === 1 ? '' : 's'}.</p></div>`);
    });
    return out.slice(0, 6).join('');
  }

  function streak(h){
    const days = new Set(d.checks.filter((c) => c.habit_id === h.id).map((c) => c.check_date));
    let n = 0;
    for (let day = days.has(today) ? today : addDays(today, -1); days.has(day); day = addDays(day, -1)) n += 1;
    return { n, on: days.has(today) };
  }

  function draw(){
    const due = dueToday(), top = tops(), rest = due.filter((t) => t.top_date !== today);
    const done = due.filter((t) => t.status === 'done').length;
    const wk = keptPct(d.commits), gone = Math.round(isoDow(today) / 7 * 100);
    const star = (t) => (top.length < 3 && t.status === 'open' ? `<button class="btn sm" data-act="top" data-id="${t.id}" title="Make this one of today's top three">Top 3</button>` : '');
    const untop = (t) => `<button class="btn sm ghost" data-act="untop" data-id="${t.id}" title="Remove from top three">×</button>`;
    const missed = due.filter((t) => t.status === 'open');

    root.querySelector('#nudges').innerHTML = nudges();
    root.querySelector('#left').innerHTML = `
      <section class="panel"><h2>Top three <small>${top.filter((t) => t.status === 'done').length} of ${top.length || 3} done</small></h2>
        ${top.length ? top.map((t) => taskRow(t, d.byId, untop(t))).join('') : empty('Pick up to three things that matter most today from the list below, or add them here.')}</section>
      <section class="panel"><h2>Also due today <small>${rest.filter((t) => t.status === 'done').length} of ${rest.length}</small></h2>
        ${rest.length ? rest.map((t) => taskRow(t, d.byId, star(t))).join('') : empty('Nothing else due today.')}
        <form class="add wrapf" data-act="addtask"><input class="field" name="title" placeholder="Add a task for today" aria-label="Add a task for today" required>${towardsSelect(d.commits, d.goals)}<button class="btn">Add</button></form></section>
      <section class="panel"><h2>Close the day <small>Evening</small></h2>
        ${d.closed ? `<p>${pill('Day closed', 'good')} ${done} of ${due.length} done. Reasons are in your journal.</p>`
        : closing ? `<p class="hint">${missed.length ? 'Give each miss one line. It goes in your journal and the task moves to tomorrow.' : 'Everything is done. Nothing to explain.'}</p>
          <form data-act="closeday" class="stack">${missed.map((t) => `<label class="lab">${esc(t.title)}<input class="field" name="why-${t.id}" placeholder="Why was this missed?"></label>`).join('')}
          <div class="btns"><button class="btn pri">Close the day</button><button type="button" class="btn" data-act="closecancel">Not yet</button></div></form>`
        : `<p class="hint">Mark what got done, give a one-line reason for anything missed, and move it to tomorrow.</p><div class="btns"><button class="btn pri" data-act="closeopen">Start evening review</button></div>`}
      </section>`;
    root.querySelector('#weekcard').innerHTML = `<h2>This week so far <small>Day ${isoDow(today)} of 7</small></h2>
      <div class="stats"><div><b class="big">${wk}%</b><span>of commitments kept</span></div><div><b class="big">${gone}%</b><span>of the week gone</span></div></div>
      ${bar(wk, gone, wk + 10 < gone ? 'warn' : 'good')}<div class="btns"><a class="btn sm" href="#/week">Open the week</a></div>`;
    const manual = d.commits.filter((c) => !c.source);
    root.querySelector('#commits').innerHTML = `<h2>Commitments <small><a href="#/week">Add or change</a></small></h2>${manual.length ? manual.map((c) => commitRow(c, { tools: false })).join('') : empty('Nothing set. Add one on the Week tab, e.g. 1 chapter a day.')}`;
    root.querySelector('#habits').innerHTML = `<h2>Habits</h2>${d.habits.length ? d.habits.map((h) => { const s = streak(h);
      return `<label class="row ${s.on ? 'done' : ''}"><input type="checkbox" data-act="habit" data-id="${h.id}" ${s.on ? 'checked' : ''}><span class="rt"><span class="rtitle">${esc(h.title)}</span></span><span class="right">${s.n ? `${s.n} day streak` : 'No streak'}</span></label>`; }).join('') : empty('No habits yet.')}
      <form class="add" data-act="addhabit"><input class="field" name="title" placeholder="Add a daily habit" aria-label="Add a daily habit" required><button class="btn">Add</button></form>`;
    root.querySelector('#coming').innerHTML = `<h2>Coming up <small><a href="#/events">All events</a></small></h2>${d.coming.length ? d.coming.slice(0, 4).map((e) => countdownRow(e)).join('') : empty('No trips or events yet.')}`;
  }

  root.innerHTML = `<div id="nudges" class="stack"></div><div class="cols"><div class="stack" id="left"></div><div class="stack">
    <section class="panel" id="recovery" hidden></section>
    <section class="panel" id="weekcard"></section>
    <section class="panel" id="commits"></section>
    <section class="panel"><h2>Training and food <small><a href="#/health">Open Health</a></small></h2><div id="fit"></div></section>
    <section class="panel" id="habits"></section><section class="panel" id="coming"></section></div></div>`;

  const refresh = async () => { await load(); draw(); };
  const mountFit = () => mountDay(root.querySelector('#fit'), today, { compact: true, onChange: async () => { await syncFit(weekStart, d.goals); d.commits = await weekCommitments(weekStart); draw(); } });
  const find = (id) => d.tasks.find((t) => t.id === id);
  wire(root, {
    ...commitActs({ find: (id) => d.commits.find((c) => c.id === id), refresh, weekStart: () => weekStart }),
    async task(n){ await setTaskDone(find(n.dataset.id), n.checked); await refresh(); },
    async top(n){ await store.tasks.set(n.dataset.id, { top_date: today, due_date: today }); await refresh(); },
    async untop(n){ await store.tasks.set(n.dataset.id, { top_date: null }); await refresh(); },
    async sched(n){ const sat = addDays(weekStart, isoDow(today) >= 6 ? 12 : 5); await store.tasks.set(n.dataset.id, { due_date: sat, carried_count: 0, top_date: null }); toast('Moved to Saturday'); await refresh(); },
    async deltask(n){ await store.tasks.del(n.dataset.id); toast('Deleted'); await refresh(); },
    async addtask(f){
      const v = formData(f);
      await store.tasks.add({ title: v.title.trim(), status: 'open', due_date: today, top_date: tops().length < 3 ? today : null, ...towardsFields(v.towards, d.commits) });
      await refresh();
    },
    async habit(n){ await store.habitChecks.set(n.dataset.id, today, n.checked); await refresh(); },
    async addhabit(f){ await store.habits.add({ title: formData(f).title.trim(), sort_order: d.habits.length }); await refresh(); },
    async garminsync(n){
      n.disabled = true; n.textContent = 'Checking Garmin…';
      try { toast(syncSummary(await garmin.runSync())); } catch (err) { toast(syncError(err)); }
      await recovery();
      await refresh();
      mountFit();
    },
    closeopen(){ closing = true; draw(); },
    closecancel(){ closing = false; draw(); },
    async closeday(f){
      const v = formData(f), due = dueToday(), missed = due.filter((t) => t.status === 'open');
      await Promise.all(missed.map((t) => store.journal.add({ entry_date: today, kind: 'miss', body: `${t.title}: ${(v[`why-${t.id}`] || '').trim() || 'no reason given'}` })));
      await Promise.all(missed.map((t) => store.tasks.set(t.id, { due_date: addDays(today, 1), top_date: null, carried_count: t.carried_count + 1 })));
      await store.journal.add({ entry_date: today, kind: 'close', body: `${due.length - missed.length} of ${due.length} done` });
      closing = false;
      toast('Day closed. Unfinished tasks moved to tomorrow.');
      await refresh();
    }
  });

  await load();
  draw();
  // Last night's sleep, HRV and resting heart rate from Garmin. Hidden until Garmin is connected.
  const recovery = async () => {
    const el = root.querySelector('#recovery');
    try { const html = recoveryHtml(await loadRecovery(today)); el.innerHTML = html; el.hidden = !html; } catch (_) { el.hidden = true; }
  };
  recovery();
  mountFit();
}
