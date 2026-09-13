// The 7 days of a week at a glance -- training, food targets, and logged
// adherence per day -- plus prev/next navigation through the whole block,
// not just whichever week state.currentDate happens to be in.
import { qs, qsa, escapeHtml, startOfWeek, endOfWeek, addDays, dateRange, formatDayLabel,
  formatDateShort, statusLabel, todayStr } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';
import { renderRoute } from '../router.js';

function dayTypeFromSession(sessionType){
  return sessionType === 'upper' || sessionType === 'lower' ? 'lift' : sessionType === 'run' ? 'run' : sessionType === 'rest' ? 'rest' : null;
}

function statusDotHtml(status){
  if (!status) return '<span class="status-dot status-dot-none" title="Not logged"></span>';
  return `<span class="status-dot status-dot-${status}" title="${escapeHtml(statusLabel(status))}"></span>`;
}

// The training line: the session title, plus today's actual distance for a
// run day (the session title alone -- "Run -- easy" -- doesn't say how far).
function trainingLine(session, run){
  if (!session) return null;
  if (session.session_type === 'run' && run) {
    const detail = run.detail ? `${run.distance_km}km, ${run.detail}` : `${run.distance_km}km ${run.effort}`;
    return `${session.title} — ${detail}`;
  }
  return session.title;
}

// One row per slot_order for this day type. Same "a week-specific row wins
// over the generic (week_number: null) one for the same slot" precedence
// get_day_bundle() uses for Today -- meal_templates supports the override,
// even though nothing in the seed data actually uses it yet.
function mealsForDay(dayType, weekNumber, mealTemplates){
  if (!dayType) return [];
  const bySlot = {};
  mealTemplates
    .filter((m) => m.day_type === dayType && (m.week_number === weekNumber || m.week_number === null))
    .sort((a, b) => (a.week_number === null ? 0 : 1) - (b.week_number === null ? 0 : 1)) // generic first, override applied over it below
    .forEach((m) => { bySlot[m.slot_order] = m; });
  return Object.values(bySlot).sort((a, b) => a.slot_order - b.slot_order);
}

function mealsListHtml(meals){
  if (!meals.length) return '';
  return `<ul class="week-day-meals">${meals.map((m) => `
    <li><span class="week-meal-time">${escapeHtml(m.time_label)}</span><span class="week-meal-name">${escapeHtml(m.name)}</span></li>`).join('')}</ul>`;
}

export async function render(main){
  const weekStart = startOfWeek(state.currentDate);
  const weekEnd = endOfWeek(state.currentDate);
  const days = dateRange(weekStart, weekEnd);
  const today = todayStr();

  // getLatest(), not a date-scoped lookup -- this needs to resolve to the
  // block regardless of which week is currently being paged to, including
  // weeks entirely before or after it (see the inBlock() guard below).
  const block = await db.blocks.getLatest().catch(() => null);
  const [sessions, targets, runPlan, weeks, mealTemplates, logs] = await Promise.all([
    block ? db.sessionTemplates.list(block.id) : Promise.resolve([]),
    block ? db.weekTargets.list(block.id) : Promise.resolve([]),
    block ? db.runPlan.list(block.id) : Promise.resolve([]),
    block ? db.blockWeeks.list(block.id) : Promise.resolve([]),
    block ? db.mealTemplates.list(block.id) : Promise.resolve([]),
    state.session ? db.dailyLogs.listRange(state.session.user.id, weekStart, weekEnd) : Promise.resolve([])
  ]);
  const logByDate = Object.fromEntries(logs.map((l) => [l.log_date, l]));
  const weekRow = weeks.find((w) => weekStart >= w.start_date && weekStart <= w.end_date) || null;
  const weekNumber = weekRow ? weekRow.week_number : null;
  const inBlock = (d) => block && d >= block.start_date && d <= block.end_date;

  function sessionFor(dow){
    const override = sessions.find((s) => s.day_of_week === dow && s.week_number === weekNumber);
    return override || sessions.find((s) => s.day_of_week === dow && s.week_number === null);
  }
  function targetFor(dayType){
    return weekNumber ? targets.find((t) => t.week_number === weekNumber && t.day_type === dayType) : null;
  }
  function runFor(dow){
    return weekNumber ? runPlan.find((r) => r.week_number === weekNumber && r.day_of_week === dow) : null;
  }

  const rows = days.map((d, i) => {
    const dow = i + 1;
    const session = inBlock(d) ? sessionFor(dow) : null;
    const dayType = session ? dayTypeFromSession(session.session_type) : null;
    const target = dayType ? targetFor(dayType) : null;
    const run = dayType === 'run' ? runFor(dow) : null;
    const log = logByDate[d];
    const isToday = d === today;
    const training = session ? trainingLine(session, run) : (block ? '—' : 'Outside block');
    const food = target ? `${target.kcal_target} kcal · ${target.protein_floor_g}g protein` : '';
    const meals = dayType ? mealsForDay(dayType, weekNumber, mealTemplates) : [];
    return `
      <li class="week-day-row ${isToday ? 'is-today' : ''}" data-date="${d}">
        <button type="button" class="week-day-btn">
          <span class="week-day-name">${escapeHtml(formatDayLabel(d))}</span>
          <span class="week-day-date">${escapeHtml(formatDateShort(d))}</span>
          <span class="week-day-training">${escapeHtml(training)}</span>
          <span class="week-day-food">${escapeHtml(food)}</span>
          <span class="week-day-dots">
            ${statusDotHtml(log ? log.nutrition_status : null)}
            ${statusDotHtml(log ? log.training_status : null)}
          </span>
        </button>
        ${mealsListHtml(meals)}
      </li>`;
  }).join('');

  const daysLogged = days.filter((d) => logByDate[d] && (logByDate[d].nutrition_status || logByDate[d].training_status)).length;
  const count = (key, val) => days.filter((d) => logByDate[d] && logByDate[d][key] === val).length;

  // Bounded to the block's own range -- there's nothing useful to page to
  // beyond it -- but otherwise open in both directions, same "scroll
  // through previous and upcoming" rule as Today's date nav.
  const blockFirstWeekStart = block ? startOfWeek(block.start_date) : null;
  const blockLastWeekStart = block ? startOfWeek(block.end_date) : null;
  const canBack = !blockFirstWeekStart || weekStart > blockFirstWeekStart;
  const canForward = !blockLastWeekStart || weekStart < blockLastWeekStart;

  main.innerHTML = `
    <section class="panel">
      <div class="date-nav">
        <button type="button" class="date-nav-btn" id="prevWeek" ${canBack ? '' : 'disabled'} aria-label="Previous week">‹</button>
        <div class="date-nav-label">
          <div class="date-nav-day">${weekRow ? `Week ${weekRow.week_number} of 8` : 'Outside the block'}</div>
          <div class="date-nav-sub">${escapeHtml(formatDateShort(weekStart))} – ${escapeHtml(formatDateShort(weekEnd))}</div>
        </div>
        <button type="button" class="date-nav-btn" id="nextWeek" ${canForward ? '' : 'disabled'} aria-label="Next week">›</button>
      </div>
      <ul class="week-day-list">${rows}</ul>
    </section>
    <section class="panel">
      <h2 class="panel-title">Adherence</h2>
      <div class="adherence-grid">
        <div class="adherence-stat"><span class="adherence-num">${daysLogged}/7</span><span class="adherence-label">days logged</span></div>
        <div class="adherence-stat"><span class="adherence-num">${count('nutrition_status', 'yes')}/${count('nutrition_status', 'partial')}/${count('nutrition_status', 'no')}</span><span class="adherence-label">nutrition yes/partial/no</span></div>
        <div class="adherence-stat"><span class="adherence-num">${count('training_status', 'yes')}/${count('training_status', 'partial')}/${count('training_status', 'no')}</span><span class="adherence-label">training yes/partial/no</span></div>
      </div>
    </section>
  `;

  qs('#prevWeek', main).addEventListener('click', () => {
    if (!canBack) return;
    state.currentDate = addDays(weekStart, -7);
    render(main);
  });
  qs('#nextWeek', main).addEventListener('click', () => {
    if (!canForward) return;
    state.currentDate = addDays(weekStart, 7);
    render(main);
  });

  qsa('.week-day-btn', main).forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.closest('.week-day-row').dataset.date;
      state.currentDate = date;
      if (window.location.hash === '#/today') {
        renderRoute();
      } else {
        window.location.hash = '#/today';
      }
    });
  });
}
