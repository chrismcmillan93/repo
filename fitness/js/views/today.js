// The default view: what to eat today, what training to do today, and the
// end-of-day review for the date currently in state.currentDate.
//
// Rendering strategy: build the whole screen once per date load, then only
// ever patch the DOM in place after that (toggling a tick, updating the
// running totals, fading a save-status pill) rather than re-rendering the
// whole view on every interaction. This is what keeps the notes textarea
// safe -- it is never destroyed and recreated while someone might be
// mid-sentence in it.
import { qs, qsa, escapeHtml, formatDateFull, dayTypeLabel, statusLabel,
  daysUntil, addDays, toast, friendlyError, debounce, round1, renderStatusPill } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';
import * as offlineQueue from '../offlineQueue.js';

const RACE_DATE = '2026-11-08';

function userId(){ return state.session.user.id; }

function saveKey(kind, extra){
  return `${kind}:${state.currentDate}${extra ? ':' + extra : ''}`;
}

async function saveLogField(fields, statusEl){
  renderStatusPill(statusEl, 'saving');
  const key = saveKey('log');
  const payload = { userId: userId(), logDate: state.currentDate, fields };
  const run = () => db.dailyLogs.upsert(payload.userId, payload.logDate, payload.fields);
  const res = await offlineQueue.save({ key, kind: 'daily_log', payload, run });
  if (res.ok) {
    state.dayBundle.log = { ...(state.dayBundle.log || {}), ...res.result };
    renderStatusPill(statusEl, 'saved');
  } else {
    renderStatusPill(statusEl, 'queued', () => saveLogField(fields, statusEl));
    toast(`Couldn't save — ${friendlyError(res.error)}. Will retry.`);
  }
  return res;
}

async function saveCheck(itemId, isChecked, statusEl){
  const key = saveKey('check', itemId);
  const payload = { userId: userId(), logDate: state.currentDate, itemId, isChecked };
  const run = () => db.dailyChecks.upsert(payload.userId, payload.logDate, payload.itemId, payload.isChecked);
  const res = await offlineQueue.save({ key, kind: 'daily_check', payload, run });
  if (res.ok) {
    renderStatusPill(statusEl, 'saved');
  } else {
    renderStatusPill(statusEl, 'queued', () => saveCheck(itemId, isChecked, statusEl));
    toast(`Couldn't save that tick — ${friendlyError(res.error)}. Will retry.`);
  }
  return res;
}

function fuelBarHtml(kind, label, consumed, target, unit){
  // The track always represents 0..displayMax. With nothing to display past
  // target, displayMax = target and the target notch sits flush at the
  // right edge ("reaching the edge of the bar" reads as "at target"). Going
  // over widens displayMax so the overflow segment is still visible within
  // the same fixed-width bar, with the notch sliding left to mark exactly
  // where target was.
  const displayMax = target ? Math.max(target * 1.25, consumed, 1) : Math.max(consumed, 1);
  const basePct = target ? Math.min(consumed, target) / displayMax * 100 : (consumed / displayMax * 100);
  const overAmount = target && consumed > target ? consumed - target : 0;
  const overPct = overAmount / displayMax * 100;
  const targetPct = target ? target / displayMax * 100 : null;
  // Calories: a ceiling, going over is the caution colour. Protein: a
  // floor, going over is still a win (rendered as the affirmative colour).
  const overClass = kind === 'kcal' ? 'fuel-over-caution' : 'fuel-over-good';
  return `
    <div class="fuel-row">
      <div class="fuel-row-head">
        <span class="fuel-label">${label}</span>
        <span class="fuel-figure"><span class="fuel-num">${round1(consumed)}</span><span class="fuel-of">/${target ?? '—'}${unit}</span></span>
      </div>
      <div class="fuel-track">
        <div class="fuel-fill" style="width:${basePct}%"></div>
        ${overPct ? `<div class="fuel-fill fuel-fill-over ${overClass}" style="left:${targetPct}%;width:${overPct}%"></div>` : ''}
        ${targetPct !== null ? `<div class="fuel-target-mark" style="left:${targetPct}%"></div>` : ''}
      </div>
    </div>`;
}

// A meal's own foods breakdown (fitness.meal_foods, via get_day_bundle's
// nested `foods`) is empty until that data is entered by hand -- fall back
// to a single "food" built from the meal's own name/totals so the accordion
// never opens onto a blank list before that data exists.
function mealFoods(meal){
  if (meal.foods && meal.foods.length) return meal.foods;
  return [{ name: meal.name, weight_g: null, kcal: meal.kcal, protein_g: meal.protein_g, carbs_g: meal.carbs_g ?? 0, fat_g: meal.fat_g ?? 0 }];
}

function foodRowHtml(food){
  const weight = food.weight_g != null ? `${food.weight_g}g` : '—';
  return `
    <li class="meal-food-row">
      <div class="meal-food-top">
        <span class="meal-food-name">${escapeHtml(food.name)}</span>
        <span class="meal-food-weight">${escapeHtml(weight)}</span>
      </div>
      <div class="meal-food-macro">${food.kcal ?? 0} kcal · ${food.protein_g ?? 0}g protein · ${food.carbs_g ?? 0}g carbs · ${food.fat_g ?? 0}g fat</div>
    </li>`;
}

// A collapsed-by-default accordion, not the old flat "05:30 · macros ·
// name" row -- "Meal 1"/"Meal 2" plus a glanceable macro summary up top,
// the actual foods (one row each, with weight in grams) only on expand.
// Still a .tick-row underneath (kept alongside the new .meal-acc class) so
// the existing generic tick-box wiring and computeTotals() selector need no
// changes -- only the internal layout changed.
function mealRowHtml(meal, dayType, checked, idx){
  const itemId = `meal:${dayType}:${meal.slot_order}`;
  const carbs = meal.carbs_g ?? 0;
  const fat = meal.fat_g ?? 0;
  const foods = mealFoods(meal);
  return `
    <li class="tick-row meal-acc ${checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(itemId)}" data-kcal="${meal.kcal}" data-protein="${meal.protein_g}" data-carbs="${carbs}" data-fat="${fat}">
      <div class="meal-acc-header">
        <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark Meal ${idx} as eaten"></button>
        <button type="button" class="meal-acc-summary" aria-expanded="false">
          <span class="meal-acc-title-row">
            <span class="meal-acc-title">Meal ${idx} <span class="meal-acc-time">${escapeHtml(meal.time_label)}</span></span>
            <span class="meal-acc-chevron" aria-hidden="true">⌄</span>
          </span>
          <span class="meal-acc-macro">${meal.kcal} kcal · ${meal.protein_g}g protein · ${carbs}g carbs · ${fat}g fat</span>
        </button>
        <span class="tick-status" aria-live="polite"></span>
      </div>
      <div class="meal-acc-body" hidden>
        <ul class="meal-food-list">${foods.map(foodRowHtml).join('')}</ul>
        ${meal.notes ? `<div class="tick-notes">${escapeHtml(meal.notes)}</div>` : ''}
      </div>
    </li>`;
}

// One tick for the whole session, same shape as a run/rest day -- this app
// tracks "did the session happen", not set-by-set completion.
function liftRowHtml(sessionType, checked){
  const itemId = `session:${sessionType}`;
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(itemId)}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark today's session as done"></button>
      <div class="tick-body"><div class="tick-name">Mark session done</div></div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

function runRowHtml(run, sessionType, checked){
  const itemId = `session:${sessionType}`;
  const detail = run.detail ? `${run.distance_km}km — ${run.detail}` : `${run.distance_km}km, ${run.effort}`;
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(itemId)}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark today's run as done"></button>
      <div class="tick-body">
        <div class="tick-name">${escapeHtml(detail)}</div>
      </div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

function restRowHtml(sessionType, checked){
  const itemId = `session:${sessionType}`;
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(itemId)}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="Mark today as rested"></button>
      <div class="tick-body"><div class="tick-name">Rested up</div></div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

function statusButtonsHtml(group, current){
  return ['yes', 'partial', 'no'].map((v) => `
    <button type="button" class="status-btn status-${v} ${current === v ? 'is-active' : ''}" data-group="${group}" data-value="${v}">${statusLabel(v)}</button>
  `).join('');
}

// No week_targets column exists for carbs/fat (kcal and protein are the
// only macros this app sets a target for), so these can't be a
// target-vs-consumed bar the way calories/protein are -- just the running
// total, same fuel-label/fuel-figure treatment, no track underneath.
function fuelStatHtml(label, consumed, unit){
  return `
    <div class="fuel-row fuel-row-simple">
      <div class="fuel-row-head">
        <span class="fuel-label">${label}</span>
        <span class="fuel-figure"><span class="fuel-num">${round1(consumed)}</span><span class="fuel-of">${unit}</span></span>
      </div>
    </div>`;
}

function computeTotals(main, bundle){
  let kcal = 0, protein = 0, carbs = 0, fat = 0;
  qsa('.tick-row[data-kcal]', main).forEach((row) => {
    if (row.classList.contains('is-checked')) {
      kcal += Number(row.dataset.kcal);
      protein += Number(row.dataset.protein);
      carbs += Number(row.dataset.carbs || 0);
      fat += Number(row.dataset.fat || 0);
    }
  });
  const target = bundle.target || {};
  qs('#fuelPanel', main).innerHTML =
    fuelBarHtml('kcal', 'Calories', kcal, target.kcal_target, ' kcal') +
    fuelBarHtml('protein', 'Protein', protein, target.protein_floor_g, 'g') +
    fuelStatHtml('Carbs', carbs, 'g') +
    fuelStatHtml('Fat', fat, 'g');
}

async function loadWeightContext(bundle){
  const yesterday = addDays(state.currentDate, -1);
  const weekAgo = addDays(state.currentDate, -7);
  let logs = [];
  try {
    logs = await db.dailyLogs.listRange(userId(), weekAgo, state.currentDate);
  } catch (e) { /* weight context is a nice-to-have, don't block the page on it */ }
  const yWeight = logs.find((l) => l.log_date === yesterday && l.weight_kg != null);
  const withWeight = logs.filter((l) => l.weight_kg != null);
  const avg = withWeight.length ? withWeight.reduce((s, l) => s + Number(l.weight_kg), 0) / withWeight.length : null;
  return { yesterday: yWeight ? Number(yWeight.weight_kg) : null, avg: avg !== null ? round1(avg) : null };
}

function renderHeader(main, bundle){
  // Scroll freely through the whole block, not just "this calendar week" --
  // bounded by the block's own start/end so there's always somewhere real
  // to land, but otherwise open in both directions. (An earlier version
  // capped forward navigation at the end of the current real-world week,
  // which meant that on the last day of a week -- like the day before this
  // block started -- the "next day" button was disabled entirely, with no
  // way to reach tomorrow's actual content.)
  const minDate = state.currentBlock ? state.currentBlock.start_date : null;
  const maxDate = state.currentBlock ? state.currentBlock.end_date : null;
  const canBack = !minDate || state.currentDate > minDate;
  const canForward = !maxDate || state.currentDate < maxDate;
  const daysToRace = daysUntil(RACE_DATE);
  const weekLabel = bundle.week ? `Week ${bundle.week.week_number} of 8` : 'Outside the current block';
  const raceLabel = daysToRace > 0 ? `10K in ${daysToRace} day${daysToRace === 1 ? '' : 's'}` : daysToRace === 0 ? 'Race day' : 'Race complete';

  qs('#todayHeader', main).innerHTML = `
    <div class="date-nav">
      <button type="button" class="date-nav-btn" id="prevDay" ${canBack ? '' : 'disabled'} aria-label="Previous day">‹</button>
      <div class="date-nav-label">
        <div class="date-nav-day">${escapeHtml(formatDateFull(state.currentDate))}</div>
        <div class="date-nav-sub">${escapeHtml(weekLabel)} · ${escapeHtml(dayTypeLabel(bundle.day_type))}</div>
      </div>
      <button type="button" class="date-nav-btn" id="nextDay" ${canForward ? '' : 'disabled'} aria-label="Next day">›</button>
    </div>
    <div class="race-countdown">${escapeHtml(raceLabel)}</div>
  `;

  qs('#prevDay', main).addEventListener('click', () => {
    state.currentDate = addDays(state.currentDate, -1);
    render(main);
  });
  qs('#nextDay', main).addEventListener('click', () => {
    if (!canForward) return;
    state.currentDate = addDays(state.currentDate, 1);
    render(main);
  });
}

function renderMealsAndTraining(main, bundle){
  if (!bundle.block) {
    qs('#mealsAndTraining', main).innerHTML = `<div class="empty-state"><strong>No training block covers this date.</strong><p>Add one via a migration or SQL insert, or navigate to a date inside the current block.</p></div>`;
    return;
  }
  const checks = bundle.checks || {};
  const mealsHtml = bundle.day_type
    ? `<section class="panel">
        <h2 class="panel-title">Meals</h2>
        <ul class="tick-list">${(bundle.meals || []).map((m, i) => mealRowHtml(m, bundle.day_type, !!checks[`meal:${bundle.day_type}:${m.slot_order}`], i + 1)).join('')}</ul>
      </section>`
    : '';

  let trainingBody = '';
  if (bundle.session) {
    const st = bundle.session.session_type;
    if (st === 'upper' || st === 'lower') {
      trainingBody = `<ul class="tick-list">${liftRowHtml(st, !!checks[`session:${st}`])}</ul>`;
    } else if (st === 'run' && bundle.run) {
      trainingBody = `<ul class="tick-list">${runRowHtml(bundle.run, st, !!checks[`session:${st}`])}</ul>`;
    } else if (st === 'rest') {
      trainingBody = `<ul class="tick-list">${restRowHtml(st, !!checks[`session:${st}`])}</ul>`;
    }
  }
  const trainingHtml = bundle.session
    ? `<section class="panel">
        <h2 class="panel-title">${escapeHtml(bundle.session.title)}</h2>
        ${bundle.session.summary ? `<p class="panel-summary">${escapeHtml(bundle.session.summary)}</p>` : ''}
        ${trainingBody}
      </section>`
    : '';

  qs('#mealsAndTraining', main).innerHTML = mealsHtml + trainingHtml;

  qsa('.tick-row', main).forEach((row) => {
    const btn = qs('.tick-box', row);
    const statusEl = qs('.tick-status', row);
    btn.addEventListener('click', async () => {
      const nowChecked = !row.classList.contains('is-checked');
      row.classList.toggle('is-checked', nowChecked);
      btn.setAttribute('aria-pressed', String(nowChecked));
      computeTotals(main, bundle);
      await saveCheck(row.dataset.itemId, nowChecked, statusEl);
    });
  });

  // Expand/collapse a meal's foods list -- separate from the tick-box above,
  // and independent of the checked state (opening a meal to look at it
  // shouldn't mark it eaten, and ticking it shouldn't force it open).
  qsa('.meal-acc-summary', main).forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      qs('.meal-acc-body', btn.closest('.meal-acc')).hidden = expanded;
    });
  });
}

function renderWeight(main, bundle, weightCtx){
  const log = bundle.log || {};
  qs('#weightSection', main).innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Weight</h2>
      <div class="weight-row">
        <label class="weight-input-wrap">
          <input type="number" step="0.1" min="0" inputmode="decimal" id="weightInput" value="${log.weight_kg ?? ''}" placeholder="0.0"> <span class="weight-unit">kg</span>
        </label>
        <span class="save-status" id="weightStatus" aria-live="polite"></span>
      </div>
      <div class="weight-context">
        ${weightCtx.yesterday !== null ? `Yesterday ${weightCtx.yesterday}kg` : 'No weight logged yesterday'}
        ${weightCtx.avg !== null ? ` · 7-day avg ${weightCtx.avg}kg` : ''}
      </div>
    </section>
  `;
  const input = qs('#weightInput', main);
  const statusEl = qs('#weightStatus', main);
  input.addEventListener('blur', async () => {
    const val = input.value === '' ? null : Number(input.value);
    await saveLogField({ weight_kg: val }, statusEl);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

function renderReview(main, bundle){
  const log = bundle.log || {};
  qs('#reviewSection', main).innerHTML = `
    <section class="panel">
      <h2 class="panel-title">How did today go?</h2>
      <div class="review-group">
        <span class="review-label">Nutrition</span>
        <div class="status-btn-row" id="nutritionButtons">${statusButtonsHtml('nutrition_status', log.nutrition_status)}</div>
      </div>
      <div class="review-group">
        <span class="review-label">Training</span>
        <div class="status-btn-row" id="trainingButtons">${statusButtonsHtml('training_status', log.training_status)}</div>
      </div>
      <span class="save-status" id="reviewStatus" aria-live="polite"></span>
      <label class="notes-label" for="notesField">Notes</label>
      <textarea id="notesField" class="notes-field" placeholder="What actually happened today — cravings, energy, how the run felt, anything worth remembering.">${escapeHtml(log.notes || '')}</textarea>
      <span class="save-status" id="notesStatus" aria-live="polite"></span>
    </section>
  `;

  const reviewStatus = qs('#reviewStatus', main);
  qsa('.status-btn', main).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const group = btn.dataset.group;
      const value = btn.dataset.value;
      const container = btn.closest('.status-btn-row');
      const wasActive = btn.classList.contains('is-active');
      qsa('.status-btn', container).forEach((b) => b.classList.remove('is-active'));
      const newValue = wasActive ? null : value;
      if (!wasActive) btn.classList.add('is-active');
      await saveLogField({ [group]: newValue }, reviewStatus);
    });
  });

  const notesField = qs('#notesField', main);
  const notesStatus = qs('#notesStatus', main);
  const debouncedSave = debounce(() => saveLogField({ notes: notesField.value }, notesStatus), 800);
  notesField.addEventListener('input', debouncedSave);
}

export async function render(main){
  main.innerHTML = `
    <div id="todayHeader" class="today-header"></div>
    <section class="panel panel-fuel">
      <h2 class="panel-title">Fuel today</h2>
      <div id="fuelPanel"></div>
    </section>
    <div id="mealsAndTraining"></div>
    <div id="weightSection"></div>
    <div id="reviewSection"></div>
  `;

  const bundle = await db.getDayBundle(state.currentDate);
  state.dayBundle = bundle;

  if (!state.currentBlock) {
    // getLatest(), not getCurrent(state.currentDate) -- this needs to find
    // the block regardless of whether the *currently viewed* date happens
    // to fall inside it, since it's only used for the date-nav's own
    // bounds (see renderHeader). getCurrent() returning null for a date
    // just outside the block (the day before it starts, the day after it
    // ends) used to leave canBack/canForward permanently unbounded there
    // instead of correctly bounded to the real block.
    state.currentBlock = await db.blocks.getLatest().catch(() => null);
  }

  renderHeader(main, bundle);
  renderMealsAndTraining(main, bundle);
  computeTotals(main, bundle);
  const weightCtx = await loadWeightContext(bundle);
  renderWeight(main, bundle, weightCtx);
  renderReview(main, bundle);
}
