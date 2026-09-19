// The 7 days of a week at a glance -- training, food targets, and logged
// adherence per day -- prev/next navigation through the whole block, and
// (only on the real current week, never a paged one) a "This week" section:
// prep tasks and the shopping list, both checkable and both weekly-cadence
// rather than daily.
import { qs, qsa, escapeHtml, startOfWeek, endOfWeek, addDays, dateRange, formatDayLabel,
  formatDateShort, statusLabel, todayStr, toast, friendlyError, renderStatusPill } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';
import { renderRoute } from '../router.js';
import * as offlineQueue from '../offlineQueue.js';

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

// Groups tasks under every day they're valid to prep on -- prep_day_of_week
// is an array (e.g. [3, 4], "Wednesday or Thursday" -- either day works,
// it's one prep session not two) so a task is grouped by its whole set of
// valid days, not repeated once per day in that set: a [3, 4] task gets one
// "Wednesday or Thursday" heading and one row, not a "Wednesday" heading
// and a "Thursday" heading each showing the same task. Groups are ordered
// by their earliest day.
const WEEKDAY_NAMES = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };

function groupPrepTasksByDaySet(tasks){
  const groups = new Map(); // "3,4" -> { days: [3, 4], tasks: [...] }
  tasks.forEach((t) => {
    const days = (t.prep_day_of_week || []).slice().sort((a, b) => a - b);
    if (!days.length) return;
    const key = days.join(',');
    if (!groups.has(key)) groups.set(key, { days, tasks: [] });
    groups.get(key).tasks.push(t);
  });
  return Array.from(groups.values()).sort((a, b) => a.days[0] - b.days[0]);
}

function daySetLabel(days){
  return days.map((d) => WEEKDAY_NAMES[d]).join(' or ');
}

// Category order follows the items' own sort_order (first item seen per
// category), not alphabetical -- matches how the list was actually
// written, protein-then-carbs-then-veg rather than A-Z.
function groupShoppingByCategory(items){
  const byCategory = new Map();
  items.forEach((item) => {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  });
  return byCategory;
}

function prepTaskRowHtml(task, checked){
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-task-id="${task.id}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark ${escapeHtml(task.title)} as done"></button>
      <div class="tick-body">
        <div class="tick-name">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="tick-notes">${escapeHtml(task.description)}</div>` : ''}
      </div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

function shoppingItemRowHtml(item, checked){
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-item-id="${item.id}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark ${escapeHtml(item.item)} as bought"></button>
      <div class="tick-body">
        ${item.weekly_quantity ? `<div class="tick-top-line"><span class="tick-macro">${escapeHtml(item.weekly_quantity)}</span></div>` : ''}
        <div class="tick-name">${escapeHtml(item.item)}</div>
        ${item.notes ? `<div class="tick-notes">${escapeHtml(item.notes)}</div>` : ''}
      </div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

function prepTasksSectionHtml(tasks, checkByTask){
  const groups = groupPrepTasksByDaySet(tasks);
  if (!groups.length) {
    return `<section class="panel"><h2 class="panel-title">Prep tasks</h2><p class="section-note">Nothing on the prep list for this block yet.</p></section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel-title">Prep tasks</h2>
      ${groups.map((g) => `
        <h3 class="plan-subhead">${escapeHtml(daySetLabel(g.days))}</h3>
        <ul class="tick-list">${g.tasks.map((t) => prepTaskRowHtml(t, !!checkByTask[t.id])).join('')}</ul>
      `).join('')}
    </section>`;
}

function shoppingListSectionHtml(byCategory, checkByItem){
  if (!byCategory.size) {
    return `<section class="panel"><h2 class="panel-title">Shopping list</h2><p class="section-note">Nothing on the shopping list for this block yet.</p></section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel-title">Shopping list</h2>
      ${Array.from(byCategory.entries()).map(([category, items]) => `
        <h3 class="plan-subhead">${escapeHtml(category)}</h3>
        <ul class="tick-list">${items.map((item) => shoppingItemRowHtml(item, !!checkByItem[item.id])).join('')}</ul>
      `).join('')}
    </section>`;
}

async function savePrepCheck(weekStartDate, taskId, isChecked, statusEl, retryTarget){
  const key = `prep_check:${weekStartDate}:${taskId}`;
  const payload = { userId: state.session.user.id, weekStartDate, taskId, isChecked };
  const run = () => db.prepChecks.upsert(payload.userId, payload.weekStartDate, payload.taskId, payload.isChecked);
  const res = await offlineQueue.save({ key, kind: 'prep_check', payload, run });
  if (res.ok) {
    renderStatusPill(statusEl, 'saved');
  } else {
    renderStatusPill(statusEl, 'queued', () => savePrepCheck(weekStartDate, taskId, isChecked, statusEl));
    toast(`Couldn't save — ${friendlyError(res.error)}. Will retry.`);
  }
}

async function saveShoppingCheck(weekStartDate, itemId, isChecked, statusEl){
  const key = `shopping_check:${weekStartDate}:${itemId}`;
  const payload = { userId: state.session.user.id, weekStartDate, itemId, isChecked };
  const run = () => db.shoppingChecks.upsert(payload.userId, payload.weekStartDate, payload.itemId, payload.isChecked);
  const res = await offlineQueue.save({ key, kind: 'shopping_check', payload, run });
  if (res.ok) {
    renderStatusPill(statusEl, 'saved');
  } else {
    renderStatusPill(statusEl, 'queued', () => saveShoppingCheck(weekStartDate, itemId, isChecked, statusEl));
    toast(`Couldn't save — ${friendlyError(res.error)}. Will retry.`);
  }
}

function wirePrepTasks(main, weekStartDate){
  qsa('#prepTasksSection .tick-row', main).forEach((row) => {
    const btn = qs('.tick-box', row);
    const statusEl = qs('.tick-status', row);
    btn.addEventListener('click', async () => {
      const nowChecked = !row.classList.contains('is-checked');
      row.classList.toggle('is-checked', nowChecked);
      btn.setAttribute('aria-pressed', String(nowChecked));
      await savePrepCheck(weekStartDate, row.dataset.taskId, nowChecked, statusEl);
    });
  });
}

function wireShoppingList(main, weekStartDate){
  qsa('#shoppingListSection .tick-row', main).forEach((row) => {
    const btn = qs('.tick-box', row);
    const statusEl = qs('.tick-status', row);
    btn.addEventListener('click', async () => {
      const nowChecked = !row.classList.contains('is-checked');
      row.classList.toggle('is-checked', nowChecked);
      btn.setAttribute('aria-pressed', String(nowChecked));
      await saveShoppingCheck(weekStartDate, row.dataset.itemId, nowChecked, statusEl);
    });
  });
}

export async function render(main){
  const weekStart = startOfWeek(state.currentDate);
  const weekEnd = endOfWeek(state.currentDate);
  const days = dateRange(weekStart, weekEnd);
  const today = todayStr();
  // "This week" (prep tasks, shopping list) always means the real current
  // week, not whichever week is being paged to above -- browsing week 5's
  // day list shouldn't surface this week's shopping list.
  const isThisWeek = weekStart === startOfWeek(today);

  // getLatest(), not a date-scoped lookup -- this needs to resolve to the
  // block regardless of which week is currently being paged to, including
  // weeks entirely before or after it (see the inBlock() guard below).
  const block = await db.blocks.getLatest().catch(() => null);
  const [sessions, targets, runPlan, weeks, mealTemplates, logs, prepTasks, shoppingItems, prepChecks, shoppingChecks] = await Promise.all([
    block ? db.sessionTemplates.list(block.id) : Promise.resolve([]),
    block ? db.weekTargets.list(block.id) : Promise.resolve([]),
    block ? db.runPlan.list(block.id) : Promise.resolve([]),
    block ? db.blockWeeks.list(block.id) : Promise.resolve([]),
    block ? db.mealTemplates.list(block.id) : Promise.resolve([]),
    state.session ? db.dailyLogs.listRange(state.session.user.id, weekStart, weekEnd) : Promise.resolve([]),
    // Caught individually, not left to reject the whole Promise.all -- the
    // day list and adherence above are the core of this screen; "This
    // week"'s prep/shopping data failing to load shouldn't take those down
    // with it. render() below just renders an empty group for whichever
    // one failed.
    block && isThisWeek ? db.prepTasks.list(block.id).catch(() => []) : Promise.resolve([]),
    block && isThisWeek ? db.shoppingListItems.list(block.id).catch(() => []) : Promise.resolve([]),
    block && isThisWeek && state.session ? db.prepChecks.listForWeek(state.session.user.id, weekStart).catch(() => []) : Promise.resolve([]),
    block && isThisWeek && state.session ? db.shoppingChecks.listForWeek(state.session.user.id, weekStart).catch(() => []) : Promise.resolve([])
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

  const prepCheckByTask = Object.fromEntries(prepChecks.map((c) => [c.task_id, c.is_checked]));
  const shoppingCheckByItem = Object.fromEntries(shoppingChecks.map((c) => [c.item_id, c.is_checked]));

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
    ${isThisWeek ? `<div id="prepTasksSection">${prepTasksSectionHtml(prepTasks, prepCheckByTask)}</div>` : ''}
    ${isThisWeek ? `<div id="shoppingListSection">${shoppingListSectionHtml(groupShoppingByCategory(shoppingItems), shoppingCheckByItem)}</div>` : ''}
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

  if (isThisWeek) {
    wirePrepTasks(main, weekStart);
    wireShoppingList(main, weekStart);
  }

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
