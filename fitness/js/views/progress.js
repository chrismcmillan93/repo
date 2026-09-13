// Weight over the block (raw points secondary, 7-day rolling average the
// signal), adherence per week, and a days-logged streak. No chart library --
// a small inline SVG line, dependency-free like everything else here.
import { qs, escapeHtml, parseLocalDate, addDays, dateRange, todayStr, round1 } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';

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
  if (!withValue.length) return '<p class="section-note">No weight logged yet this block.</p>';

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
    <svg viewBox="0 0 ${width} ${height}" class="weight-chart" role="img" aria-label="Weight over the block, raw points and 7-day average">
      <polyline points="${rawPoints.join(' ')}" class="chart-raw-line"></polyline>
      ${dots}
      <polyline points="${avgPoints.join(' ')}" class="chart-avg-line"></polyline>
    </svg>`;
}

function computeStreak(logByDate){
  let streak = 0;
  let d = todayStr();
  while (logByDate[d] && (logByDate[d].nutrition_status || logByDate[d].training_status)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export async function render(main){
  const block = await db.blocks.getLatest();
  if (!block) {
    main.innerHTML = '<div class="empty-state"><strong>No training block yet.</strong></div>';
    return;
  }
  const endDate = todayStr() < block.end_date ? todayStr() : block.end_date;
  const [weeks, logs] = await Promise.all([
    db.blockWeeks.list(block.id),
    db.dailyLogs.listRange(state.session.user.id, block.start_date, endDate)
  ]);
  const logByDate = Object.fromEntries(logs.map((l) => [l.log_date, l]));
  const allDates = dateRange(block.start_date, endDate);
  const points = allDates.map((d) => ({ date: d, weight: logByDate[d] && logByDate[d].weight_kg != null ? Number(logByDate[d].weight_kg) : null }));
  const avg = rollingAverage(points, 7);

  const daysLogged = allDates.filter((d) => logByDate[d] && (logByDate[d].nutrition_status || logByDate[d].training_status)).length;
  const streak = computeStreak(logByDate);

  const weekRows = weeks.map((w) => {
    const weekDates = dateRange(w.start_date, w.end_date < endDate ? w.end_date : endDate);
    const count = (key, val) => weekDates.filter((d) => logByDate[d] && logByDate[d][key] === val).length;
    const cellHtml = (key) => `
      <div class="week-grid-cell">
        <span class="week-grid-yes" style="flex-grow:${count(key, 'yes') || 0.01}"></span>
        <span class="week-grid-partial" style="flex-grow:${count(key, 'partial') || 0.01}"></span>
        <span class="week-grid-no" style="flex-grow:${count(key, 'no') || 0.01}"></span>
      </div>`;
    if (w.start_date > endDate) return '';
    return `
      <div class="week-grid-row">
        <span class="week-grid-label">Wk ${w.week_number}</span>
        ${cellHtml('nutrition_status')}
        ${cellHtml('training_status')}
      </div>`;
  }).join('');

  main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Weight</h2>
      ${weightChartSvg(points, avg)}
      <p class="chart-legend"><span class="legend-swatch legend-avg"></span>7-day average <span class="legend-swatch legend-raw"></span>daily reading</p>
    </section>
    <section class="panel">
      <h2 class="panel-title">Adherence by week</h2>
      <div class="week-grid-head"><span></span><span>Nutrition</span><span>Training</span></div>
      ${weekRows}
    </section>
    <section class="panel">
      <h2 class="panel-title">Consistency</h2>
      <div class="adherence-grid">
        <div class="adherence-stat"><span class="adherence-num">${daysLogged}/${allDates.length}</span><span class="adherence-label">days logged</span></div>
        <div class="adherence-stat"><span class="adherence-num">${streak}</span><span class="adherence-label">day streak</span></div>
      </div>
    </section>
  `;
}
