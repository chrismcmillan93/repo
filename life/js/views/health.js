// Health: one day (session picker, lift exercises, meals and foods), one week,
// the full Edale 50km plan with jump-to-week, and lift progress from Hevy.
import { esc, pill, wire, empty, options, bar } from '../ui.js';
import { todayStr, addDays, startOfWeek, formatDateFull, formatDateShort, formatDayLabel, round1, toast } from '../fit/utils.js';
import { db } from '../fit/db.js';
import { mountDay } from '../fit/day.js';
import { loadWeek, planWeeks } from '../fit/week.js';
import { buildExercises, findPrs, exerciseSummaries, weightLabel } from '../fit/analysis.js';
import { userId } from '../store.js';

const TABS = [['day', 'Day'], ['week', 'Week'], ['plan', 'Full plan'], ['lifts', 'Lifts']];
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function spark(values, w = 96, h = 28){
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${round1(2 + i * (w - 4) / (v.length - 1))},${round1(h - 3 - (x - lo) / span * (h - 6))}`);
  const [lx, ly] = pts[pts.length - 1].split(',');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="var(--accent)" stroke-width="1.6" points="${pts.join(' ')}"/><circle cx="${lx}" cy="${ly}" r="2.4" fill="var(--accent)"/></svg>`;
}

export async function render(root, params){
  const today = todayStr();
  const tab = TABS.some((t) => t[0] === params[0]) ? params[0] : 'day';
  const nav = `<div class="seg">${TABS.map(([k, label]) => `<a class="${tab === k ? 'on' : ''}" href="#/health/${k}">${label}</a>`).join('')}</div>`;
  root.innerHTML = `${nav}<div id="body" class="stack"><p class="hint">Loading…</p></div>`;
  const body = root.querySelector('#body');
  const weeks = await planWeeks();
  const weekSelect = (current) => `<select class="field" data-act="jumpweek" aria-label="Jump to a plan week">${options(weeks.map((w) => [w.start_date, `Week ${w.week_number} · ${formatDateShort(w.start_date)} · ${w.phase}`]), current, weeks.some((w) => w.start_date === current) ? null : 'Jump to a plan week…')}</select>`;

  wire(root, {
    jumpweek(n){ if (n.value) location.hash = `#/health/week/${n.value}`; },
    jumpdate(n){ if (n.value) location.hash = `#/health/${n.dataset.to}/${n.dataset.to === 'week' ? startOfWeek(n.value) : n.value}`; },
    async sync(n){
      n.disabled = true; n.textContent = 'Syncing with Hevy…';
      try { const res = await db.hevy.runSync(); toast(res && res.upserted ? `Synced ${res.upserted} workout${res.upserted === 1 ? '' : 's'} from Hevy` : 'Up to date with Hevy'); }
      catch (err) { toast(err.code === 'not_configured' ? 'Hevy is not connected yet: the API key has to be added in Supabase first.' : `Hevy sync: ${err.message}`); }
      await lifts();
    },
    lift(n){ open = open === n.dataset.id ? null : n.dataset.id; drawLifts(); }
  });

  // ---- Day ----
  if (tab === 'day') {
    const date = /^\d{4}-\d\d-\d\d$/.test(params[1] || '') ? params[1] : today;
    body.innerHTML = `<div class="weeknav"><a class="btn sm" href="#/health/day/${addDays(date, -1)}" aria-label="Previous day">‹</a><b>${esc(formatDateFull(date))}${date === today ? ' (today)' : ''}</b><a class="btn sm" href="#/health/day/${addDays(date, 1)}" aria-label="Next day">›</a>
      <label class="lab inline">Jump to<input class="field" type="date" data-act="jumpdate" data-to="day" value="${date}"></label><a class="btn sm" href="#/health/week/${startOfWeek(date)}">This day's week</a></div>
      <section class="panel"><div id="day"></div></section>`;
    mountDay(body.querySelector('#day'), date, {});
    return;
  }

  // ---- Week ----
  if (tab === 'week') {
    const ws = startOfWeek(/^\d{4}-\d\d-\d\d$/.test(params[1] || '') ? params[1] : today);
    const w = await loadWeek(ws);
    const pw = w.planWeek;
    const rows = w.days.map((d) => {
      const state = d.trained ? pill('Done', 'good') : d.rested ? pill('Rested', 'good') : d.date < today && d.titles.length && !d.plans.every((p) => ['rest', 'travel'].includes(p.type)) ? pill('Missed', 'bad') : '';
      return `<a class="row dayrow ${d.date === today ? 'today' : ''}" href="#/health/day/${d.date}"><span class="dow"><b>${formatDayLabel(d.date).slice(0, 3)}</b>${shortDate(d.date)}</span>
        <span class="rt"><span class="rtitle">${d.titles.length ? d.titles.map(esc).join(' + ') : 'Nothing planned'}${d.picks.weights || d.picks.cardio ? ' ' + pill('Your pick') : ''}</span>
        <span class="rmeta">${d.day ? `<span>${esc(d.day.label)} meals · ${d.day.totals.kcal} kcal · ${round1(d.day.totals.protein_g)}g protein</span><span>${d.mealTicks}/${d.day.meals.length} meals eaten</span>` : '<span>No meal plan</span>'}</span></span>
        <span class="right">${state}</span></a>`; }).join('');
    const kcal = w.days.filter((d) => d.day).map((d) => d.day.totals.kcal);
    body.innerHTML = `<div class="weeknav"><a class="btn sm" href="#/health/week/${addDays(ws, -7)}" aria-label="Previous week">‹</a><b>${pw ? `Week ${pw.week_number} of ${weeks.length} · ` : ''}${formatDateShort(ws)} to ${formatDateShort(w.weekEnd)}</b><a class="btn sm" href="#/health/week/${addDays(ws, 7)}" aria-label="Next week">›</a>
      ${weekSelect(ws)}<label class="lab inline">or a date<input class="field" type="date" data-act="jumpdate" data-to="week" value="${ws}"></label>${ws !== startOfWeek(today) ? `<a class="btn sm" href="#/health/week/${startOfWeek(today)}">This week</a>` : ''}</div>
      ${pw ? `<section class="panel"><h2>${esc(pw.phase)} <small>${esc(pw.load)} load · ${pw.run_miles} mi (${pw.run_km} km) of running</small></h2>${pw.notes ? `<p>${esc(pw.notes)}</p>` : ''}
        ${pw.weight_target_kg_monday != null ? `<p class="hint">Monday weigh-in target ${Number(pw.weight_target_kg_monday).toFixed(1)} kg</p>` : ''}</section>` : `<section class="panel"><p class="hint">This week is outside the Edale 50km plan (${weeks.length ? `${formatDateShort(weeks[0].start_date)} to ${formatDateShort(weeks[weeks.length - 1].end_date)}` : 'not loaded'}). Pick sessions day by day.</p></section>`}
      <section class="panel"><h2>Day by day <small>${kcal.length ? `Average ${Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length)} kcal a day` : ''}</small></h2>${rows}</section>`;
    return;
  }

  // ---- Full plan ----
  if (tab === 'plan') {
    if (!weeks.length) { body.innerHTML = `<section class="panel">${empty('The training plan is not loaded.')}</section>`; return; }
    const [plan, days] = await Promise.all([db.trainingPlans.get('v2'), db.planDays.listRange('v2', weeks[0].start_date, weeks[weeks.length - 1].end_date)]);
    const byDate = {};
    days.forEach((p) => { (byDate[p.date] = byDate[p.date] || []).push(p); });
    const cur = startOfWeek(today);
    const done = weeks.filter((w) => w.end_date < today).length;
    const cell = (date) => { const ps = byDate[date] || [];
      return `<td class="${date === today ? 'today' : ''}"><a href="#/health/day/${date}">${ps.length ? ps.map((p) => `<span class="pd t-${esc(p.type)}">${esc(p.session)}</span>`).join('') : '<span class="pd">-</span>'}</a></td>`; };
    let lastPhase = null;
    const rows = weeks.map((w) => {
      const head = w.phase !== lastPhase ? `<tr class="phase"><th colspan="11">${esc(w.phase)}</th></tr>` : '';
      lastPhase = w.phase;
      return `${head}<tr class="${w.start_date === cur ? 'cur' : w.end_date < today ? 'past' : ''}" id="wk-${w.week_number}"><th><a href="#/health/week/${w.start_date}">${w.week_number}</a></th><td class="nw">${shortDate(w.start_date)}</td><td>${esc(w.load)}</td><td class="nw">${w.run_miles} mi</td>
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => cell(addDays(w.start_date, i))).join('')}</tr>`; }).join('');
    body.innerHTML = `<section class="panel"><h2>${esc(plan ? plan.name : 'Training plan')} <small>${formatDateShort(weeks[0].start_date)} to ${formatDateShort(weeks[weeks.length - 1].end_date)} · ${weeks.length} weeks</small></h2>
        ${bar(100 * done / weeks.length)}<p class="hint">${today < weeks[0].start_date ? `Starts in ${Math.round((new Date(weeks[0].start_date) - new Date(today)) / 864e5)} days.` : `${done} of ${weeks.length} weeks complete.`} Tap a week number for that week, or any session for that day.</p>
        <div class="weeknav">${weekSelect(cur)}</div></section>
      <section class="panel"><div class="scroll"><table class="plan"><thead><tr><th>Wk</th><th>Starts</th><th>Load</th><th>Run</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      ${plan && plan.effort_guide ? `<section class="panel"><h2>Effort guide</h2>${Object.entries(plan.effort_guide).map(([k, v]) => `<div class="row"><span class="rt"><span class="rtitle">${esc(k)}</span><span class="rmeta"><span>${esc(v.talk_test || '')}</span><span>${esc(v.note || '')}</span></span></span><span class="right">${esc(v.treadmill_mph || '')} mph</span></div>`).join('')}</section>` : ''}`;
    const curRow = body.querySelector('tr.cur');
    if (curRow) curRow.scrollIntoView({ block: 'center' });
    return;
  }

  // ---- Lifts (Hevy) ----
  let L = null, open = null;
  function drawLifts(){
    const { sync, summaries, prs, exercises, workouts } = L;
    const list = summaries.map((s) => { const ch = s.change4w; const ex = exercises.get(s.id);
      return `<div class="liftrow"><button class="liftbtn" data-act="lift" data-id="${esc(s.id)}" aria-expanded="${open === s.id}"><span class="rt"><span class="rtitle">${esc(s.title)}</span>
        <span class="rmeta"><span>${s.lastTop ? weightLabel(s.lastTop.weight, s.lastTop.reps, s.dumbbell) : ''}</span><span>${shortDate(s.lastAt)}</span><span>${s.sessions12w}× in 12 wks</span></span></span>
        ${spark(s.trend)}<span class="right"><b>${s.bestE1rm ? `${round1(s.bestE1rm)} kg` : ''}</b>${ch == null ? '' : `<br><span class="${ch > 0.05 ? 'up' : ch < -0.05 ? 'down' : ''}">${ch > 0 ? '+' : ''}${round1(ch)} kg / 4 wks</span>`}</span></button>
        ${open === s.id ? `<div class="scroll"><table class="plan"><thead><tr><th>Date</th><th>Top set</th><th>Sets</th><th>Est. 1RM</th></tr></thead><tbody>${ex.sessions.slice(-8).reverse().map((x) => `<tr><td>${shortDate(x.at)}</td><td>${x.top ? weightLabel(x.top.weight, x.top.reps, ex.dumbbell) : '-'}</td><td>${x.sets.length}</td><td>${x.bestE1rm != null ? round1(x.bestE1rm) : '-'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`; }).join('');
    const month = workouts.filter((w) => w.start_time >= new Date(Date.now() - 28 * 864e5).toISOString()).length;
    body.innerHTML = `<section class="panel"><h2>Hevy <small>${sync && sync.last_run_at ? `Last synced ${new Date(sync.last_run_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'}</small></h2>
        <div class="stats"><div><b class="big">${month}</b><span>workouts in 4 weeks</span></div><div><b class="big">${prs.filter((p) => p.at >= new Date(Date.now() - 28 * 864e5).toISOString()).length}</b><span>personal bests in 4 weeks</span></div><div><b class="big">${summaries.length}</b><span>lifts tracked</span></div></div>
        <div class="btns"><button class="btn pri" data-act="sync">Sync now</button></div><p class="hint">Lifts are logged in Hevy and mirrored here. Dumbbell weights are the total of both dumbbells. Estimated 1RM uses working sets of 1 to 12 reps.</p></section>
      <div class="cols"><section class="panel"><h2>Your lifts <small>Best estimated 1RM, last 12 sessions</small></h2>${list || empty('No lifts in the last 12 weeks. Tap Sync now.')}</section>
      <section class="panel"><h2>Recent personal bests</h2>${prs.length ? prs.slice(0, 10).map((p) => `<div class="row"><span class="rt"><span class="rtitle">${esc(p.title)}</span><span class="rmeta"><span>${weightLabel(p.weight, p.reps, p.dumbbell)}</span><span>${shortDate(p.at)}</span></span></span><span class="right"><b>${round1(p.e1rm)} kg</b><br><span class="up">+${round1(p.e1rm - p.previous)}</span></span></div>`).join('') : empty('No personal bests yet.')}</section></div>`;
  }
  async function lifts(){
    const since = new Date(Date.now() - 400 * 864e5).toISOString();
    try {
      const [sync, sets, workouts] = await Promise.all([db.hevy.syncState(userId()).catch(() => null), db.hevy.listSets(userId(), since), db.hevy.listWorkouts(userId(), since)]);
      const templates = await db.hevy.listTemplates(Array.from(new Set(sets.map((s) => s.exercise_template_id)))).catch(() => []);
      const exercises = buildExercises(sets, Object.fromEntries(templates.map((t) => [t.id, t])));
      L = { sync, workouts, exercises, prs: findPrs(exercises), summaries: exerciseSummaries(exercises) };
      drawLifts();
    } catch (err) { body.innerHTML = `<section class="panel">${empty(`Couldn't load lifts: ${err.message}`)}</section>`; }
  }
  await lifts();
  // Same rule as the Fitness app: refresh quietly when the last sync is over 6 hours old.
  if (L && (!L.sync || !L.sync.last_run_at || Date.now() - new Date(L.sync.last_run_at).getTime() > 6 * 36e5)) {
    db.hevy.runSync().then((res) => { if (res && (res.upserted || res.deleted)) lifts(); }).catch(() => {});
  }
}
