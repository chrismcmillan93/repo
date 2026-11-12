// Health: one day (session picker, lift exercises, meals and foods), one week,
// the full Edale 50km plan with jump-to-week, and lift progress from Hevy.
import { esc, pill, wire, empty, options, bar } from '../ui.js';
import { todayStr, addDays, startOfWeek, formatDateFull, formatDateShort, formatDayLabel, round1, toast } from '../fit/utils.js';
import { db } from '../fit/db.js';
import { mountDay } from '../fit/day.js';
import { loadWeek, planWeeks } from '../fit/week.js';
import { buildExercises, findPrs, exerciseSummaries, weightLabel, monthSummary } from '../fit/analysis.js';
import { ensureFonts, prStory, monthStory, carouselSlides, shareOrDownload } from '../fit/posters.js';
import { dateRange, endOfWeek } from '../fit/utils.js';
import { userId } from '../store.js';

const TABS = [['day', 'Day'], ['week', 'Week'], ['plan', 'Full plan'], ['progress', 'Progress'], ['checkin', 'Check-in'], ['lifts', 'Lifts']];
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

  // ---- Progress: weight, streaks, day by day, adherence by week ----
  if (tab === 'progress') {
    const start = weeks.length ? (today < weeks[0].start_date ? addDays(today, -83) : addDays(weeks[0].start_date, -21)) : addDays(today, -83);
    const end = today;
    const logs = await db.dailyLogs.listRange(userId(), start, end);
    const byDate = Object.fromEntries(logs.map((l) => [l.log_date, l]));
    const dates = dateRange(start, end);
    const pts = dates.map((d) => (byDate[d] && byDate[d].weight_kg != null ? Number(byDate[d].weight_kg) : null));
    const avg = pts.map((_, i) => { const w = pts.slice(Math.max(0, i - 6), i + 1).filter((v) => v != null); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; });
    const vals = pts.concat(avg).filter((v) => v != null);
    let chart = empty('No weigh-ins yet. Log one on Today or Health → Day.');
    if (vals.length) {
      const W = 640, H = 210, L = 38, R = 10, T = 12, Bm = 24;
      const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
      const x = (i) => L + i * (W - L - R) / Math.max(1, dates.length - 1), y = (v) => T + (hi - v) / (hi - lo || 1) * (H - T - Bm);
      const ticks = []; for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 4))) ticks.push(v);
      const line = (arr) => arr.map((v, i) => (v == null ? null : `${round1(x(i))},${round1(y(v))}`)).filter(Boolean).join(' ');
      const lastI = avg.map((v, i) => (v == null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
      chart = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over the last ${dates.length} days with a 7-day average">
        ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        ${pts.map((v, i) => (v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="2.2" fill="var(--muted)"/>`)).join('')}
        <polyline fill="none" stroke="var(--accent)" stroke-width="2.4" points="${line(avg)}"/>
        ${lastI >= 0 ? `<circle cx="${x(lastI)}" cy="${y(avg[lastI])}" r="4" fill="var(--accent)"/><text x="${Math.min(x(lastI), W - R - 4)}" y="${y(avg[lastI]) - 9}" text-anchor="end" class="strong">${round1(avg[lastI])} kg</text>` : ''}
        <text x="${L}" y="${H - 6}">${shortDate(start)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">Today</text></svg>`;
    }
    const streak = (key) => { let n = 0; for (let d = byDate[today] && byDate[today][key] ? today : addDays(today, -1); byDate[d] && byDate[d][key] === 'yes'; d = addDays(d, -1)) n += 1; return n; };
    const logged = dates.filter((d) => byDate[d] && (byDate[d].nutrition_status || byDate[d].training_status)).length;
    const gStart = startOfWeek(start), gDates = dateRange(gStart, endOfWeek(end));
    const cell = (d) => { if (d < start || d > end) return '<span class="hc empty"></span>'; const l = byDate[d] || {};
      return `<a class="hc" href="#/health/day/${d}" title="${formatDateShort(d)}: food ${l.nutrition_status || 'not logged'}, training ${l.training_status || 'not logged'}"><i class="s-${l.nutrition_status || 'none'}"></i><i class="s-${l.training_status || 'none'}"></i></a>`; };
    const weekRows = [];
    for (let ws = gStart; ws <= end; ws = addDays(ws, 7)) {
      const ds = dateRange(ws < start ? start : ws, addDays(ws, 6) > end ? end : addDays(ws, 6));
      const pw = weeks.find((w) => w.start_date === ws);
      const share = (key) => { const n = ds.length || 1; const c = (v) => ds.filter((d) => byDate[d] && byDate[d][key] === v).length; return `<span class="adh"><i class="s-yes" style="flex-grow:${c('yes')}"></i><i class="s-partial" style="flex-grow:${c('partial')}"></i><i class="s-no" style="flex-grow:${c('no')}"></i><i class="s-none" style="flex-grow:${n - c('yes') - c('partial') - c('no')}"></i></span>`; };
      weekRows.unshift(`<div class="adhrow"><span>${pw ? `Wk ${pw.week_number}` : shortDate(ws)}</span>${share('nutrition_status')}${share('training_status')}</div>`);
    }
    const nextTarget = weeks.find((w) => w.weight_target_kg_monday != null && w.start_date >= startOfWeek(today));
    body.innerHTML = `<section class="panel"><h2>Weight <small>Dots are daily readings, the line is the 7-day average</small></h2>${chart}
        ${nextTarget ? `<p class="hint">Next Monday target: ${Number(nextTarget.weight_target_kg_monday).toFixed(1)} kg (${formatDateShort(nextTarget.start_date)})</p>` : ''}</section>
      <div class="cols"><section class="panel"><h2>Day by day <small>Top: food. Bottom: training.</small></h2>
        <div class="hgrid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l) => `<span class="hw">${l}</span>`).join('')}${gDates.map(cell).join('')}</div>
        <p class="legend"><i class="s-yes"></i>Yes <i class="s-partial"></i>Partly <i class="s-no"></i>No <i class="s-none"></i>Not logged</p></section>
      <div class="stack"><section class="panel"><h2>Streaks</h2><div class="stats"><div><b class="big">${streak('nutrition_status')}</b><span>day food streak</span></div><div><b class="big">${streak('training_status')}</b><span>day training streak</span></div><div><b class="big">${logged}/${dates.length}</b><span>days logged</span></div></div>
        <p class="hint">A streak counts days answered "Yes" to "How did today go?". Partly or no breaks it.</p></section>
        <section class="panel"><h2>Adherence by week <small>Food · Training</small></h2>${weekRows.join('')}</section></div></div>`;
    return;
  }

  // ---- Check-in: one per plan week (weight, leaks, a win, something hard) ----
  if (tab === 'checkin') {
    const wk = weeks.find((w) => w.start_date === params[1]) || weeks.find((w) => today >= w.start_date && today <= w.end_date) || (weeks.length && today > weeks[weeks.length - 1].end_date ? weeks[weeks.length - 1] : weeks[0]);
    if (!wk) { body.innerHTML = `<section class="panel">${empty('The training plan is not loaded.')}</section>`; return; }
    const list = await db.planCheckins.list(userId(), 'v2');
    const ex = list.find((c) => c.week_number === wk.week_number) || {};
    body.innerHTML = `<section class="panel"><h2>Week ${wk.week_number} check-in <small>${formatDateShort(wk.start_date)} · ${esc(wk.phase)}</small></h2>
        <div class="weeknav"><select class="field" data-act="ciweek" aria-label="Week">${options(weeks.map((w) => [w.start_date, `Week ${w.week_number} · ${formatDateShort(w.start_date)}`]), wk.start_date)}</select></div>
        ${wk.weight_target_kg_monday != null ? `<p class="hint">Monday target: ${Number(wk.weight_target_kg_monday).toFixed(1)} kg</p>` : ''}
        <form data-act="checkin" class="stack"><div class="wrapf"><label class="lab">Monday weight (kg)<input class="field" type="number" step="0.1" name="weight_kg" value="${ex.weight_kg ?? ''}"></label>
          <label class="lab">Leaks this week<input class="field" type="number" min="0" step="1" name="leak_count" value="${ex.leak_count ?? ''}"></label></div>
          <label class="lab">One win<textarea class="field" rows="2" name="win">${esc(ex.win || '')}</textarea></label>
          <label class="lab">One thing that was hard<textarea class="field" rows="2" name="challenge">${esc(ex.challenge || '')}</textarea></label>
          <div class="btns"><button class="btn pri">${ex.week_number ? 'Update check-in' : 'Save check-in'}</button></div></form></section>
      <section class="panel"><h2>Previous check-ins</h2>${list.length ? list.map((c) => `<div class="row"><span class="rt"><span class="rtitle">Week ${c.week_number}</span>
        <span class="rmeta"><span>${c.weight_kg != null ? `${c.weight_kg} kg` : 'no weight'}</span><span>${c.leak_count != null ? `${c.leak_count} leak${c.leak_count === 1 ? '' : 's'}` : ''}</span></span>
        ${c.win ? `<span>Win: ${esc(c.win)}</span>` : ''}${c.challenge ? `<span class="hint">Hard: ${esc(c.challenge)}</span>` : ''}</span></div>`).join('') : empty('No check-ins yet.')}</section>`;
    wire(body, {
      ciweek(n){ location.hash = `#/health/checkin/${n.value}`; },
      async checkin(f){
        const v = new FormData(f);
        const num = (k) => (v.get(k) === '' ? null : Number(v.get(k)));
        await db.planCheckins.upsert(userId(), 'v2', wk.week_number, { weight_kg: num('weight_kg'), leak_count: num('leak_count'), win: v.get('win'), challenge: v.get('challenge') });
        toast('Check-in saved');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
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
      <div class="stack"><section class="panel"><h2>Recent personal bests</h2>${prs.length ? prs.slice(0, 10).map((p) => `<div class="row"><span class="rt"><span class="rtitle">${esc(p.title)}</span><span class="rmeta"><span>${weightLabel(p.weight, p.reps, p.dumbbell)}</span><span>${shortDate(p.at)}</span></span></span><span class="right"><b>${round1(p.e1rm)} kg</b><br><span class="up">+${round1(p.e1rm - p.previous)}</span></span></div>`).join('') : empty('No personal bests yet.')}</section>
      ${postPanel()}</div></div>`;
    drawPost();
  }
  // Instagram posts (@cmfitnesslog), drawn on canvas by the Fitness app's own poster code.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const post = { kind: 'pr', pr: 0, month: null, goal: '' };
  function months(){
    const seen = new Map();
    L.workouts.forEach((w) => { const d = new Date(w.start_time); const k = `${d.getFullYear()}-${d.getMonth()}`; if (!seen.has(k)) seen.set(k, `${MONTHS[d.getMonth()]} ${d.getFullYear()}`); });
    return Array.from(seen.entries()).reverse();
  }
  function postPanel(){
    const ms = months();
    if (!post.month && ms.length) post.month = ms[0][0];
    const kinds = [['pr', 'PB story'], ['month', 'Month story'], ['carousel', 'Month carousel']];
    const controls = post.kind === 'pr'
      ? (L.prs.length ? `<label class="lab">Personal best<select class="field" data-act="postpr">${options(L.prs.slice(0, 30).map((p, i) => [i, `${p.title}: ${weightLabel(p.weight, p.reps, p.dumbbell)}, ${shortDate(p.at)}`]), post.pr)}</select></label>` : empty('No personal bests to post yet.'))
      : `<label class="lab">Month<select class="field" data-act="postmonth">${options(ms, post.month)}</select></label>${post.kind === 'carousel' ? `<label class="lab">Next month's focus (last slide)<input class="field" data-act="postgoal" maxlength="90" value="${esc(post.goal)}" placeholder="e.g. 140 kg Romanian deadlift for 5"></label>` : ''}`;
    return `<section class="panel" id="postPanel"><h2>Make a post <small>Stories 9:16, slides 4:5</small></h2>
      <div class="seg">${kinds.map(([k, l]) => `<button class="${post.kind === k ? 'on' : ''}" data-act="postkind" data-k="${k}">${l}</button>`).join('')}</div>${controls}
      <div class="postprev" id="postPreview"></div><div class="btns"><button class="btn pri" data-act="postshare">Share or download</button></div>
      <p class="hint">Nothing is uploaded: your phone's share sheet opens, or the images download.</p></section>`;
  }
  async function buildPost(){
    if (!document.getElementById('poster-fonts')) {
      const l = document.createElement('link'); l.id = 'poster-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Work+Sans:wght@500;600&display=swap';
      document.head.appendChild(l);
    }
    await ensureFonts();
    if (post.kind === 'pr') {
      const pr = L.prs[post.pr]; if (!pr) return [];
      const ex = L.exercises.get(pr.exerciseId);
      return [prStory(pr, ex ? ex.sessions.filter((x) => x.at <= pr.at).slice(-10).map((x) => x.bestE1rm) : [])];
    }
    if (!post.month) return [];
    const [y, m] = post.month.split('-').map(Number);
    const summary = monthSummary(L.exercises, L.workouts, L.prs, y, m);
    if (post.kind === 'month') return [monthStory(summary)];
    const trends = {}, endIso = new Date(y, m + 1, 1).toISOString();
    for (const ex of L.exercises.values()) trends[ex.title] = ex.sessions.filter((x) => x.at < endIso).slice(-10).map((x) => x.bestE1rm);
    return carouselSlides(summary, { trends, nextGoal: post.goal });
  }
  let previewToken = 0;
  async function drawPost(){
    const host = body.querySelector('#postPreview'); if (!host) return;
    const t = ++previewToken, cs = await buildPost();
    if (t !== previewToken) return;
    host.replaceChildren(...cs);
    if (!cs.length) host.innerHTML = '<p class="hint">Nothing to preview yet.</p>';
  }
  const redrawPost = () => { const p = body.querySelector('#postPanel'); if (!p) return; const tmp = document.createElement('div'); tmp.innerHTML = postPanel(); p.replaceWith(tmp.firstElementChild); drawPost(); };
  wire(root, {
    postkind(n){ post.kind = n.dataset.k; redrawPost(); },
    postpr(n){ post.pr = Number(n.value); drawPost(); },
    postmonth(n){ post.month = n.value; drawPost(); },
    postgoal(n){ post.goal = n.value; drawPost(); },
    async postshare(n){
      const cs = await buildPost(); if (!cs.length) { toast('Nothing to post yet'); return; }
      n.disabled = true;
      try { const r = await shareOrDownload(cs, post.kind === 'pr' ? 'cmfitnesslog-pb' : post.kind === 'month' ? 'cmfitnesslog-month' : 'cmfitnesslog-carousel'); if (r === 'downloaded') toast(cs.length > 1 ? `${cs.length} images downloaded` : 'Image downloaded'); }
      catch (err) { toast(err.message); } finally { n.disabled = false; }
    }
  });

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
