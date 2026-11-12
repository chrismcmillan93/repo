// The 7 days of a week at a glance -- training, food targets, and logged
// adherence per day -- prev/next navigation through the whole block, and
// (only on the real current week, never a paged one) a "This week" section:
// prep tasks and the shopping list, both checkable and both weekly-cadence
// rather than daily.
import { qs, qsa, escapeHtml, startOfWeek, endOfWeek, addDays, dateRange, formatDayLabel,
  formatDateShort, statusLabel, todayStr, toast, friendlyError, renderStatusPill,
  resolveSessionsForDay } from '../utils.js';
import { planChipsHtml, planLinesHtml, planWeekHtml } from '../planDay.js';
import { mountCalendar } from '../calendar.js';
import { loadNutrition, inNutritionPlan, buildDay, effectiveWeight, adjustEnabled, pickDayKey, dayTotalsLine } from '../nutrition.js';
import { buildShoppingList, buildPrepTasks, shoppingListHtml, prepTasksHtml } from '../weekLists.js';
import { sourcesFor, effectiveDay, swapDays, resetWeek, dayOptionsHtml } from '../daySwap.js';
import { dateBounds } from './today.js';
import { db } from '../db.js';
import { state } from '../state.js';
import { renderRoute } from '../router.js';
import * as offlineQueue from '../offlineQueue.js';

// A day can have more than one resolved session now (Monday's AM lift + PM
// intervals, Tuesday/Thursday's AM Muay Thai + PM run) -- lift beats run
// beats rest for which meal set/target applies, matching get_day_bundle()'s
// same priority. Muay Thai never sets day_type on its own.
function dayTypeFromSessions(sessionsForDay){
  if (sessionsForDay.some((s) => s.session_type === 'upper' || s.session_type === 'lower')) return 'lift';
  if (sessionsForDay.some((s) => s.session_type === 'run')) return 'run';
  if (sessionsForDay.some((s) => s.session_type === 'rest')) return 'rest';
  return null;
}

function statusDotHtml(status){
  if (!status) return '<span class="status-dot status-dot-none" title="Not logged"></span>';
  return `<span class="status-dot status-dot-${status}" title="${escapeHtml(statusLabel(status))}"></span>`;
}

// The training for a day, from the v2 plan (or a Weights / Cardio pick, which
// replaces the planned session). Returns { title, detail } -- detail is the
// chips (mode, time cap, optional) and finisher/effort lines from planDay.js,
// so Week can never disagree with Today about what a day contains.
function trainingFor(planDay, picks, names = {}){
  if (picks && (picks.weights || picks.cardio)) {
    // The specific session you named (Full Body #2, Long run...) if you did, else the generic kind.
    const parts = [picks.weights && (names.weights || 'Weights'), picks.cardio && (names.cardio || 'Cardio')].filter(Boolean);
    const label = `${parts.join(' + ')} (your pick)`;
    return { title: label, detail: '' };
  }
  if (!planDay) return null;
  return { title: planDay.session, detail: `${planChipsHtml(planDay)}${planLinesHtml(planDay)}` };
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

// Ticks on the generated shopping list / prep tasks (js/weekLists.js). Saved
// through the offline queue like every other tick.
async function saveListTick(weekStartDate, list, itemKey, isChecked, statusEl){
  const key = `list_tick:${weekStartDate}:${list}:${itemKey}`;
  const payload = { userId: state.session.user.id, weekStartDate, list, itemKey, isChecked };
  const run = () => db.weekListTicks.upsert(payload.userId, payload.weekStartDate, payload.list, payload.itemKey, payload.isChecked);
  const res = await offlineQueue.save({ key, kind: 'list_tick', payload, run });
  if (res.ok) {
    renderStatusPill(statusEl, 'saved');
  } else {
    renderStatusPill(statusEl, 'queued', () => saveListTick(weekStartDate, list, itemKey, isChecked, statusEl));
    toast(`Couldn't save — ${friendlyError(res.error)}. Will retry.`);
  }
}

function wireListTicks(main, weekStartDate){
  qsa('#weekListsSection .tick-row', main).forEach((row) => {
    const btn = qs('.tick-box', row);
    const statusEl = qs('.tick-status', row);
    btn.addEventListener('click', async () => {
      const nowChecked = !row.classList.contains('is-checked');
      row.classList.toggle('is-checked', nowChecked);
      btn.setAttribute('aria-pressed', String(nowChecked));
      await saveListTick(weekStartDate, row.dataset.list, row.dataset.itemKey, nowChecked, statusEl);
    });
  });
}

function swapPanelHtml(days, sources, planByDate, hasSwaps){
  const opts = (selected) => dayOptionsHtml(days, sources, planByDate, { selected });
  return `
    <section class="panel panel-swap" id="swapPanel">
      <h2 class="panel-title">Swap two days</h2>
      <p class="panel-summary">Trade the planned sessions of two days this week, e.g. a run and a lift. Only this week changes; the plan itself is untouched.</p>
      <div class="swap-row">
        <label class="swap-field"><span>Day</span><select id="swapA">${opts(days[0])}</select></label>
        <label class="swap-field"><span>with</span><select id="swapB">${opts(days[1])}</select></label>
      </div>
      <div class="swap-actions">
        <button type="button" class="btn btn-primary" id="swapGo">Swap</button>
        ${hasSwaps ? '<button type="button" class="btn btn-quiet" id="swapReset">Reset this week</button>' : ''}
        <span class="save-status" id="swapStatus" aria-live="polite"></span>
      </div>
    </section>`;
}

function wireSwapPanel(main, days, sources, planByDate, swaps){
  const go = qs('#swapGo', main);
  if (!go) return;
  const status = qs('#swapStatus', main);
  const uid = state.session.user.id;
  async function run(fn){
    renderStatusPill(status, 'saving');
    try {
      await fn();
      render(main);
    } catch (err) {
      renderStatusPill(status, 'queued', () => run(fn));
      toast(`Couldn't swap — ${friendlyError(err)}.`);
    }
  }
  go.addEventListener('click', () => {
    const a = qs('#swapA', main).value;
    const b = qs('#swapB', main).value;
    if (a === b) { toast('Pick two different days.'); return; }
    run(() => swapDays(uid, days, swaps, a, b));
  });
  const reset = qs('#swapReset', main);
  if (reset) reset.addEventListener('click', () => run(() => resetWeek(uid, days)));
}

export async function render(main){
  const weekStart = startOfWeek(state.currentDate);
  const weekEnd = endOfWeek(state.currentDate);
  const days = dateRange(weekStart, weekEnd);
  const today = todayStr();
  // "This week" (prep tasks, shopping list) always means the real current
  // week, not whichever week is being paged to above -- browsing week 5's
  // day list shouldn't surface this week's shopping list.

  // getLatest(), not a date-scoped lookup -- this needs to resolve to the
  // block regardless of which week is currently being paged to, including
  // weeks entirely before or after it (see the inBlock() guard below).
  const block = await db.blocks.getLatest().catch(() => null);
  if (!state.currentBlock) state.currentBlock = block;
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const planVersion = state.plan ? state.plan.plan_version : null;
  const [sessions, targets, weeks, mealTemplates, logs, planDays, planWeeks, picks, swaps, pickNames, listTicks] = await Promise.all([
    // Block 2's archived session templates: nutrition day type only.
    block ? db.sessionTemplates.list(block.id) : Promise.resolve([]),
    block ? db.weekTargets.list(block.id) : Promise.resolve([]),
    block ? db.blockWeeks.list(block.id) : Promise.resolve([]),
    block ? db.mealTemplates.list(block.id) : Promise.resolve([]),
    state.session ? db.dailyLogs.listRange(state.session.user.id, weekStart, weekEnd) : Promise.resolve([]),
    planVersion ? db.planDays.listRange(planVersion, weekStart, weekEnd).catch(() => []) : Promise.resolve([]),
    planVersion ? db.planWeeks.list(planVersion).catch(() => []) : Promise.resolve([]),
    state.session ? db.dayPicks.listRange(state.session.user.id, weekStart, weekEnd).catch(() => []) : Promise.resolve([]),
    state.session ? db.daySwaps.listRange(state.session.user.id, weekStart, weekEnd).catch(() => []) : Promise.resolve([]),
    state.session ? db.pickSessions.listRange(state.session.user.id, weekStart, weekEnd).catch(() => []) : Promise.resolve([]),
    // Ticks for the generated shopping list / prep tasks. Caught on its own so a
    // failure here never takes the day list down with it.
    state.session ? db.weekListTicks.listForWeek(state.session.user.id, weekStart).catch(() => []) : Promise.resolve([])
  ]);
  const logByDate = Object.fromEntries(logs.map((l) => [l.log_date, l]));
  const weekRow = weeks.find((w) => weekStart >= w.start_date && weekStart <= w.end_date) || null;
  const weekNumber = weekRow ? weekRow.week_number : null;
  const inBlock = (d) => block && d >= block.start_date && d <= block.end_date;

  function targetFor(dayType){
    return weekNumber ? targets.find((t) => t.week_number === weekNumber && t.day_type === dayType) : null;
  }

  // Nutrition plan (v4): each day's kcal / protein / meals, scaled to your weight.
  const nut = await loadNutrition();
  const weightInfo = nut && state.session ? await effectiveWeight(state.session.user.id, weekEnd) : { weight: null };

  // Day swaps: a day may show another day's planned session (same week only).
  const planByDate = Object.fromEntries(planDays.map((p) => [p.date, p]));
  const sources = sourcesFor(days, swaps);

  const nDays = []; // [{ date, day }] the week's scaled nutrition, for the shopping list / prep tasks
  const rows = days.map((d, i) => {
    const dow = i + 1;
    const sessionsForDay = inBlock(d) ? resolveSessionsForDay(dow, weekNumber, sessions) : [];
    const dayType = dayTypeFromSessions(sessionsForDay);
    const target = dayType ? targetFor(dayType) : null;
    const log = logByDate[d];
    const isToday = d === today;
    const planDay = effectiveDay(d, sources, planByDate);
    const swappedFrom = sources[d] !== d ? sources[d] : null;
    const dayPicks = {
      weights: picks.some((p) => p.log_date === d && p.item_id === 'pick:weights' && p.is_checked),
      cardio: picks.some((p) => p.log_date === d && p.item_id === 'pick:cardio' && p.is_checked)
    };
    const dayPickNames = {
      weights: (pickNames.find((x) => x.log_date === d && x.kind === 'weights') || {}).session,
      cardio: (pickNames.find((x) => x.log_date === d && x.kind === 'cardio') || {}).session
    };
    const training = trainingFor(planDay, dayPicks, dayPickNames) || { title: 'Pick a session', detail: '' };
    // Dates inside the nutrition plan use it; Block 2's own dates keep their old meal tables.
    const nday = inNutritionPlan(nut, d) ? buildDay(nut, {
      date: d, weight: weightInfo.weight, enabled: adjustEnabled(),
      miles: planDay && planDay.kind === 'long' && planDay.distance_miles != null ? Number(planDay.distance_miles) : null,
      isRaceDay: !!planDay && planDay.type === 'race',
      key: pickDayKey(dayPicks, dayPickNames) || undefined
    }) : null;
    nDays.push({ date: d, day: nday });
    const food = nday ? `${nday.totals.kcal} kcal · ${Math.round(nday.totals.protein_g)}g protein`
      : target ? `${target.kcal_target} kcal · ${target.protein_floor_g}g protein` : '';
    const meals = nday ? nday.meals.map((m) => ({ time_label: m.time_label, name: m.name }))
      : dayType ? mealsForDay(dayType, weekNumber, mealTemplates) : [];
    return `
      <li class="week-day-row ${isToday ? 'is-today' : ''}" data-date="${d}">
        <button type="button" class="week-day-btn">
          <span class="week-day-name">${escapeHtml(formatDayLabel(d))}</span>
          <span class="week-day-date">${escapeHtml(formatDateShort(d))}</span>
          <span class="week-day-training">${escapeHtml(training.title)}</span>
          <span class="week-day-food">${escapeHtml(food)}</span>
          <span class="week-day-dots">
            ${statusDotHtml(log ? log.nutrition_status : null)}
            ${statusDotHtml(log ? log.training_status : null)}
          </span>
        </button>
        ${swappedFrom ? `<div class="week-day-swapnote">⇄ Swapped: showing ${escapeHtml(formatDayLabel(swappedFrom))}'s session</div>` : ''}
        ${training.detail ? `<div class="week-day-plan">${training.detail}</div>` : ''}
        ${mealsListHtml(meals)}
        ${nday ? `<div class="plan-day-totals week-day-totals"><span class="plan-day-totals-label">Day total</span><span class="plan-day-totals-figures">${dayTotalsLine(nday.totals)}</span></div>` : ''}
      </li>`;
  }).join('');

  const daysLogged = days.filter((d) => logByDate[d] && (logByDate[d].nutrition_status || logByDate[d].training_status)).length;
  const count = (key, val) => days.filter((d) => logByDate[d] && logByDate[d][key] === val).length;

  // Bounded to everything that has content (Block 2 and the Edale plan) but
  // otherwise open in both directions.
  const bounds = dateBounds();
  const canBack = !bounds.min || weekStart > startOfWeek(bounds.min);
  const canForward = !bounds.max || weekStart < startOfWeek(bounds.max);
  const planWeek = planWeeks.find((w) => weekStart >= w.start_date && weekStart <= w.end_date) || null;

  // Shopping list and prep tasks come from the nutrition plan for this week; shown for
  // the current week and the next one (when you shop for it).
  const showLists = nDays.some((x) => x.day) && weekStart >= startOfWeek(today) && weekStart <= addDays(startOfWeek(today), 7);
  const tickMap = Object.fromEntries(listTicks.map((t) => [`${t.list}|${t.item_key}`, t.is_checked]));

  main.innerHTML = `
    <section class="panel">
      <div class="date-nav">
        <button type="button" class="date-nav-btn" id="prevWeek" ${canBack ? '' : 'disabled'} aria-label="Previous week">‹</button>
        <div class="date-nav-label">
          <div class="date-nav-day">${planWeek ? `Week ${planWeek.week_number} of ${planWeeks.length} · ${escapeHtml(planWeek.phase)}` : weekRow ? `Nutrition week ${weekRow.week_number} of 8` : 'No plan this week'}</div>
          <div class="date-nav-sub">${escapeHtml(formatDateShort(weekStart))} – ${escapeHtml(formatDateShort(weekEnd))}${planWeek ? ` · ${escapeHtml(planWeek.load)}` : ''}</div>
        </div>
        <button type="button" class="date-nav-btn" id="weekCalBtn" aria-expanded="false" aria-label="Choose a week from a calendar">📅</button>
        <button type="button" class="date-nav-btn" id="nextWeek" ${canForward ? '' : 'disabled'} aria-label="Next week">›</button>
      </div>
      <div id="weekCalendar" class="cal" hidden></div>
      ${planWeek ? `<div class="week-plan-note">${planWeekHtml(planWeek)}</div>` : ''}
      <ul class="week-day-list">${rows}</ul>
    </section>
    ${planWeek ? swapPanelHtml(days, sources, planByDate, swaps.length > 0) : ''}
    ${showLists ? `<div id="weekListsSection">${prepTasksHtml(buildPrepTasks(nDays), tickMap)}${shoppingListHtml(buildShoppingList(nDays), weekStart, tickMap)}</div>` : ''}
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
  // Jump to any week from a calendar instead of paging.
  const calBtn = qs('#weekCalBtn', main);
  const calBox = qs('#weekCalendar', main);
  calBtn.addEventListener('click', () => {
    const open = calBox.hidden;
    calBox.hidden = !open;
    calBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      mountCalendar(calBox, {
        selectedDate: weekStart, minDate: bounds.min, maxDate: bounds.max,
        planStart: state.plan ? state.plan.start_date : null, planEnd: state.plan ? state.plan.end_date : null,
        onPick: (date) => { state.currentDate = date; render(main); }
      });
    }
  });

  wireSwapPanel(main, days, sources, planByDate, swaps);

  qs('#nextWeek', main).addEventListener('click', () => {
    if (!canForward) return;
    state.currentDate = addDays(weekStart, 7);
    render(main);
  });

  if (showLists) wireListTicks(main, weekStart);

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
