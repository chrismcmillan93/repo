// Weight over time (raw points secondary, 7-day rolling average the signal),
// a day-by-day history of what was actually stuck to, current streaks, and
// adherence per week. It runs from the start of the old Block 2 (so the weight
// line is unbroken across the switch to the Edale plan and its nutrition plan)
// to today, and weeks are labelled by the Edale plan's week numbers once it
// starts. No chart library -- a small inline SVG
// line, dependency-free like everything else here.
import { qs, qsa, escapeHtml, addDays, dateRange, todayStr, round1,
  startOfWeek, endOfWeek, formatDateFull, formatDateShort } from '../utils.js';
import { loadNutrition } from '../nutrition.js';
import { db } from '../db.js';
import { state } from '../state.js';
import { renderRoute } from '../router.js';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function rollingAverage(points, windowSize){
  // points: [{date, weight}] sorted ascending, weight may be null.
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowPoints = points.slice(windowStart, i + 1).filter((p) => p.weight !== null);
    out.push(windowPoints.length ? windowPoints.reduce((s, p) => s + p.weight, 0) / windowPoints.length : null);
  }
  return out;
}

function weightChartSvg(points, avg){
  const withValue = points.map((p, i) => ({ x: i, raw: p.weight, avg: avg[i] })).filter((p) => p.raw !== null || p.avg !== null);
  if (!withValue.length) return '<p class="section-note">No weight logged yet.</p>';

  const width = 640, height = 200, padX = 12, padY = 16;
  const n = points.length;
  const allVals = points.map((p) => p.weight).concat(avg).filter((v) => v !== null && v !== undefined);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const range = (max - min) || 1;
  const xFor = (i) => padX + (i / Math.max(n - 1, 1)) * (width - padX * 2);
  const yFor = (v) => height - padY - ((v - min) / range) * (height - padY * 2);

  const rawPoints = points.map((p, i) => p.weight !== null ? `${xFor(i)},${yFor(p.weight)}` : null).filter(Boolean);
  const avgPoints = avg.map((v, i) => v !== null ? `${xFor(i)},${yFor(v)}` : null).filter(Boolean);

  const dots = points.map((p, i) => p.weight !== null ? `<circle cx="${xFor(i)}" cy="${yFor(p.weight)}" r="2.5" class="chart-raw-dot"></circle>` : '').join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="weight-chart" role="img" aria-label="Weight over time, raw points and 7-day average">
      <polyline points="${rawPoints.join(' ')}" class="chart-raw-line"></polyline>
      ${dots}
      <polyline points="${avgPoints.join(' ')}" class="chart-avg-line"></polyline>
    </svg>`;
}

// Current streak of days actually stuck to (status === 'yes'), ending today
// and walking backwards. A 'partial' or 'no' day -- or a day never logged
// at all -- breaks it, same as it would for real.
function computeStreak(logByDate, key){
  let streak = 0;
  let d = todayStr();
  while (logByDate[d] && logByDate[d][key] === 'yes') {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

function statusWord(status){
  return status === 'yes' ? 'yes' : status === 'partial' ? 'partial' : status === 'no' ? 'no' : 'not logged';
}

function historyGridHtml(block, endDate, logByDate){
  const gridStart = startOfWeek(block.start_date);
  const gridEnd = endOfWeek(endDate);
  const gridDates = dateRange(gridStart, gridEnd);

  const header = WEEKDAY_LETTERS.map((l) => `<span class="history-weekday">${l}</span>`).join('');

  const cells = gridDates.map((d) => {
    if (d < block.start_date || d > endDate) {
      return '<span class="history-cell history-cell-empty" aria-hidden="true"></span>';
    }
    const log = logByDate[d];
    const nutrition = log ? log.nutrition_status : null;
    const training = log ? log.training_status : null;
    const label = `${formatDateFull(d)}: nutrition ${statusWord(nutrition)}, training ${statusWord(training)}`;
    return `
      <button type="button" class="history-cell" data-date="${d}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        <span class="history-cell-half history-status-${nutrition || 'none'}"></span>
        <span class="history-cell-half history-status-${training || 'none'}"></span>
      </button>`;
  }).join('');

  return `<div class="history-grid">${header}${cells}</div>`;
}

export async function render(main){
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const nut = await loadNutrition();
  const block = await db.blocks.getLatest().catch(() => null);
  const starts = [block && block.start_date, nut && nut.plan.start_date, state.plan && state.plan.start_date].filter(Boolean).sort();
  const ends = [block && block.end_date, nut && nut.plan.end_date, state.plan && state.plan.end_date].filter(Boolean).sort();
  if (!starts.length) {
    main.innerHTML = '<div class="empty-state"><strong>No plan yet.</strong></div>';
    return;
  }
  const startDate = starts[0];
  // Cap at today so the grid never pads into the future, but never let that
  // push endDate *before* the start either (viewing this before anything has
  // started would otherwise give an inverted, empty range everywhere below).
  const lastDate = ends[ends.length - 1];
  const cappedToToday = todayStr() < lastDate ? todayStr() : lastDate;
  const endDate = cappedToToday < startDate ? startDate : cappedToToday;
  const period = { start_date: startDate, end_date: endDate };
  const [planWeeks, logs] = await Promise.all([
    state.plan ? db.planWeeks.list(state.plan.plan_version).catch(() => []) : Promise.resolve([]),
    db.dailyLogs.listRange(state.session.user.id, startDate, endDate)
  ]);
  const logByDate = Object.fromEntries(logs.map((l) => [l.log_date, l]));
  const allDates = dateRange(startDate, endDate);
  const points = allDates.map((d) => ({ date: d, weight: logByDate[d] && logByDate[d].weight_kg != null ? Number(logByDate[d].weight_kg) : null }));
  const avg = rollingAverage(points, 7);

  const daysLogged = allDates.filter((d) => logByDate[d] && (logByDate[d].nutrition_status || logByDate[d].training_status)).length;
  const nutritionStreak = computeStreak(logByDate, 'nutrition_status');
  const trainingStreak = computeStreak(logByDate, 'training_status');

  // The next Monday weigh-in target from the plan (weeks 1-6 have one), next to your latest weight.
  const today = todayStr();
  const nextTarget = planWeeks.find((w) => w.weight_target_kg_monday != null && w.start_date >= startOfWeek(today));
  const latest = [...points].reverse().find((p) => p.weight !== null);
  const targetNote = nextTarget
    ? `<p class="section-note">Monday weigh-in target: <strong>${Number(nextTarget.weight_target_kg_monday).toFixed(1)} kg</strong> (${escapeHtml(formatDateShort(nextTarget.start_date))})${latest ? ` · latest weigh-in ${latest.weight} kg` : ''}.</p>`
    : '';

  // One row per Mon-Sun week from the start; Edale plan weeks are labelled "Wk N", earlier ones by date.
  const weekRows = [];
  for (let ws = startOfWeek(startDate); ws <= endDate; ws = addDays(ws, 7)) {
    const first = ws < startDate ? startDate : ws;
    const last = addDays(ws, 6) < endDate ? addDays(ws, 6) : endDate;
    const weekDates = dateRange(first, last);
    const pw = planWeeks.find((w) => ws >= w.start_date && ws <= w.end_date);
    const label = pw ? `Wk ${pw.week_number}` : `w/c ${formatDateShort(ws)}`;
    const count = (key, val) => weekDates.filter((d) => logByDate[d] && logByDate[d][key] === val).length;
    const cellHtml = (key) => `
      <div class="week-grid-cell">
        <span class="week-grid-yes" style="flex-grow:${count(key, 'yes') || 0.01}"></span>
        <span class="week-grid-partial" style="flex-grow:${count(key, 'partial') || 0.01}"></span>
        <span class="week-grid-no" style="flex-grow:${count(key, 'no') || 0.01}"></span>
      </div>`;
    weekRows.push(`
      <div class="week-grid-row">
        <span class="week-grid-label">${escapeHtml(label)}</span>
        ${cellHtml('nutrition_status')}
        ${cellHtml('training_status')}
      </div>`);
  }

  main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Weight</h2>
      ${weightChartSvg(points, avg)}
      ${targetNote}
      <p class="chart-legend"><span class="legend-swatch legend-avg"></span>7-day average <span class="legend-swatch legend-raw"></span>daily reading</p>
    </section>

    <section class="panel">
      <h2 class="panel-title">Streaks</h2>
      <div class="adherence-grid">
        <div class="adherence-stat"><span class="adherence-num streak-num-nutrition">${nutritionStreak}</span><span class="adherence-label">day nutrition streak</span></div>
        <div class="adherence-stat"><span class="adherence-num streak-num-training">${trainingStreak}</span><span class="adherence-label">day training streak</span></div>
        <div class="adherence-stat"><span class="adherence-num">${daysLogged}/${allDates.length}</span><span class="adherence-label">days logged</span></div>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Day by day</h2>
      <p class="panel-summary">Top half of each day is nutrition, bottom half is training. Tap a day to open it.</p>
      ${historyGridHtml(period, endDate, logByDate)}
      <p class="chart-legend">
        <span class="legend-swatch legend-yes"></span>yes
        <span class="legend-swatch legend-partial"></span>partial
        <span class="legend-swatch legend-no"></span>no
        <span class="legend-swatch legend-none"></span>not logged
      </p>
    </section>

    <section class="panel">
      <h2 class="panel-title">Adherence by week</h2>
      <div class="week-grid-head"><span></span><span>Nutrition</span><span>Training</span></div>
      ${weekRows.join('')}
    </section>
  `;

  qsa('.history-cell:not(.history-cell-empty)', main).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentDate = btn.dataset.date;
      if (window.location.hash === '#/today') {
        renderRoute();
      } else {
        window.location.hash = '#/today';
      }
    });
  });
}
