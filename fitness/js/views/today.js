// The default view: what to eat today, what training to do today, and the
// end-of-day review for the date currently in state.currentDate.
//
// Rendering strategy: build the whole screen once per date load, then only
// ever patch the DOM in place after that (toggling a tick, updating the
// running totals, fading a save-status pill) rather than re-rendering the
// whole view on every interaction. This is what keeps the notes textarea
// safe -- it is never destroyed and recreated while someone might be
// mid-sentence in it. The one exception is the training section, which is
// re-rendered on its own when a Weights / Cardio / Both pick changes.
import { qs, qsa, escapeHtml, formatDateFull, statusLabel, startOfWeek, endOfWeek, dateRange, formatDayLabel,
  addDays, toast, friendlyError, debounce, round1, renderStatusPill, sessionTypeLabel } from '../utils.js';
import { mealAccordionHtml, wireMealAccordionToggles } from '../mealCard.js';
import { planChipsHtml, planLinesHtml, planModeHelpHtml, planWeekHtml } from '../planDay.js';
import { sessionOptions, pickTitle } from '../sessionChoices.js';
import { loadNutrition, inNutritionPlan, buildDay, effectiveWeight, sessionFacts, describeScaling, adjustEnabled, setAdjustEnabled } from '../nutrition.js';
import { sourcesFor, effectiveDay, swapDays, resetWeek, dayOptionsHtml } from '../daySwap.js';
import { db } from '../db.js';
import { state } from '../state.js';
import * as offlineQueue from '../offlineQueue.js';

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

// ---- nutrition plan (v4), scaled to your weight ---------------------------
// For dates inside the nutrition plan, the day's meals, kcal target and day
// type come from js/nutrition.js (scaled to your weigh-ins) and replace what
// the day bundle carries from Block 2's older meal tables. Outside the plan
// (Block 2's own dates), the bundle's meals are used as before.
let nutritionInfo = null; // { day, weightInfo } for the date on screen, or null

async function applyNutrition(bundle){
  nutritionInfo = null;
  const nut = await loadNutrition();
  if (!inNutritionPlan(nut, state.currentDate)) return;
  const weightInfo = await effectiveWeight(userId(), state.currentDate);
  const { miles, isRaceDay } = sessionFacts(bundle);
  const day = buildDay(nut, { date: state.currentDate, weight: weightInfo.weight, enabled: adjustEnabled(), miles, isRaceDay });
  bundle.day_type = day.key;
  bundle.meals = day.meals;
  bundle.target = { kcal_target: day.totals.kcal, protein_floor_g: Number(nut.plan.protein_floor_g) };
  nutritionInfo = { day, weightInfo };
}

function nutritionNoteHtml(){
  if (!nutritionInfo) return '';
  return `<p class="nutrition-note">${escapeHtml(describeScaling(nutritionInfo.day, nutritionInfo.weightInfo))}</p>
    <label class="nutrition-toggle"><input type="checkbox" id="adjustToggle" ${adjustEnabled() ? 'checked' : ''}> Adjust to my weight</label>`;
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

// Today's meal row is the shared Meal-N accordion (mealCard.js), just with
// the tickable itemId/checked options Plan's read-only version omits.
function mealRowHtml(meal, dayType, checked, idx){
  const itemId = `meal:${dayType}:${meal.slot_order}`;
  return mealAccordionHtml(meal, idx, { itemId, checked });
}

// One tick per session. Ids are session:lift / session:run / session:rest --
// the same shape Goals' "Today's training" card reads and writes.
const TICK_LABEL = { lift: 'Mark session done', run: 'Mark run done', rest: 'Rested up' };
function sessionTickRowHtml(sessionType, checked){
  const itemId = `session:${sessionType}`;
  const label = TICK_LABEL[sessionType] || 'Mark session done';
  return `
    <li class="tick-row ${checked ? 'is-checked' : ''}" data-item-id="${escapeHtml(itemId)}">
      <button type="button" class="tick-box" aria-pressed="${checked}" aria-label="${escapeHtml(label)}"></button>
      <div class="tick-body"><div class="tick-name">${escapeHtml(label)}</div></div>
      <span class="tick-status" aria-live="polite"></span>
    </li>`;
}

function statusButtonsHtml(group, current, values = ['yes', 'partial', 'no']){
  return values.map((v) => `
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

// Today's date nav spans everything that has content: Block 2 (nutrition)
// and the Edale plan, from whichever starts first to whichever ends last.
export function dateBounds(){
  const starts = [state.currentBlock && state.currentBlock.start_date, state.plan && state.plan.start_date].filter(Boolean);
  const ends = [state.currentBlock && state.currentBlock.end_date, state.plan && state.plan.end_date].filter(Boolean);
  return {
    min: starts.length ? starts.sort()[0] : null,
    max: ends.length ? ends.sort().slice(-1)[0] : null
  };
}

function sessionSummaryLabel(bundle){
  const s = bundle.sessions || [];
  if (!s.length) return 'Pick a session';
  return s.map((x) => sessionTypeLabel(x.session_type)).join(' + ');
}

function renderHeader(main, bundle){
  // Scroll freely through everything that has content, not just "this
  // calendar week". (An earlier version capped forward navigation at the end
  // of the current real-world week, which meant that on the last day of a
  // week the "next day" button was disabled entirely.)
  const { min: minDate, max: maxDate } = dateBounds();
  const canBack = !minDate || state.currentDate > minDate;
  const canForward = !maxDate || state.currentDate < maxDate;
  const pw = bundle.plan && bundle.plan.week;
  const weekLabel = pw
    ? `Week ${pw.week_number} of ${pw.total_weeks} · ${pw.phase}`
    : bundle.week ? `Nutrition week ${bundle.week.week_number} of 8` : 'No plan week';

  qs('#todayHeader', main).innerHTML = `
    <div class="date-nav">
      <button type="button" class="date-nav-btn" id="prevDay" ${canBack ? '' : 'disabled'} aria-label="Previous day">‹</button>
      <div class="date-nav-label">
        <div class="date-nav-day">${escapeHtml(formatDateFull(state.currentDate))}</div>
        <div class="date-nav-sub">${escapeHtml(weekLabel)} · ${escapeHtml(sessionSummaryLabel(bundle))}</div>
      </div>
      <button type="button" class="date-nav-btn" id="nextDay" ${canForward ? '' : 'disabled'} aria-label="Next day">›</button>
    </div>
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

// Weekly notes and (Mondays, weeks 1-6) the weigh-in target. Shown above the
// day's session so the week's context is read before the day's plan.
function weekPanelHtml(bundle){
  const pw = bundle.plan && bundle.plan.week;
  if (!pw) return '';
  const isMonday = bundle.day_of_week === 1;
  const inner = planWeekHtml(pw, { showWeightTarget: isMonday });
  if (!inner) return '';
  return `<section class="panel panel-week-note">
    <h2 class="panel-title">Week ${pw.week_number} · ${escapeHtml(pw.phase)} · ${escapeHtml(pw.load)}</h2>
    ${inner}
  </section>`;
}

// Same objects get_day_bundle() builds for a pick, so a pick can be applied
// locally (offline, or if the refetch fails) without a different code path.
function pickSessions(picks, names = {}){
  const out = [];
  if (picks.weights) out.push({ session_type: 'lift', source: 'pick', title: pickTitle('weights', names.weights), summary: `Picked: ${names.weights || 'weights'}`, run: null });
  if (picks.cardio) out.push({ session_type: 'run', source: 'pick', title: pickTitle('cardio', names.cardio), summary: `Picked: ${names.cardio || 'cardio'}`, run: null });
  return out;
}

// "Which session did you do?" dropdowns, shown under the pick buttons for
// whichever of Weights / Cardio is picked. Optional: leave it on "Not
// specified" and the day just reads "Weights session" / "Cardio session".
function pickSessionSelectsHtml(picks, names){
  return ['weights', 'cardio'].filter((k) => picks[k]).map((k) => `
    <label class="swap-field pick-session-field"><span>Which ${k === 'weights' ? 'weights' : 'cardio'} session?</span>
      <select data-pick-session="${k}">
        <option value="">Not specified</option>
        ${sessionOptions(k).map((n) => `<option value="${escapeHtml(n)}" ${names[k] === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
      </select></label>`).join('');
}

function pickerHtml(picks, hasPlannedDay, names = {}){
  const active = picks.weights && picks.cardio ? 'both' : picks.weights ? 'weights' : picks.cardio ? 'cardio' : null;
  const btn = (key, label) => `<button type="button" class="segmented-btn ${active === key ? 'is-active' : ''}" data-pick="${key}" aria-pressed="${active === key}">${label}</button>`;
  const group = `
    <div class="segmented pick-group" role="group" aria-label="Pick today's session">
      ${btn('weights', 'Weights')}${btn('cardio', 'Cardio')}${btn('both', 'Both')}
    </div>
    <span class="save-status" id="pickStatus" aria-live="polite"></span>
    ${pickSessionSelectsHtml(picks, names)}`;
  if (hasPlannedDay && !active) {
    return `<section class="panel panel-pick"><details class="pick-more">
      <summary>Do something different today?</summary>
      <p class="panel-summary">Pick Weights, Cardio or Both instead of the planned session. Tap your pick again to go back to the plan.</p>
      ${group}</details></section>`;
  }
  return `<section class="panel panel-pick">
    <h2 class="panel-title">${hasPlannedDay ? 'Your pick for today' : 'Pick today\'s session'}</h2>
    <p class="panel-summary">${hasPlannedDay ? 'Replaces the planned session. Tap your pick again to go back to the plan.' : 'Nothing is planned for today. Weights, cardio or both — your call.'}</p>
    ${group}</section>`;
}

// ---- swapping with another day this week ----------------------------------
// Context for the swap control: this week's dates, planned days and swaps.
// Loaded alongside the day bundle; null when the date is outside the plan.
let swapCtx = null;

async function loadSwapContext(bundle){
  swapCtx = null;
  if (!bundle.plan || !state.plan) return;
  const weekStart = startOfWeek(state.currentDate);
  const weekEnd = endOfWeek(state.currentDate);
  try {
    const [planDays, swaps] = await Promise.all([
      db.planDays.listRange(state.plan.plan_version, weekStart, weekEnd),
      db.daySwaps.listRange(userId(), weekStart, weekEnd)
    ]);
    swapCtx = { dates: dateRange(weekStart, weekEnd), planByDate: Object.fromEntries(planDays.map((p) => [p.date, p])), swaps };
  } catch (e) { /* swapping is optional; the rest of Today still works */ }
}

function swapTodayHtml(bundle){
  if (!swapCtx || !swapCtx.dates.includes(state.currentDate)) return '';
  const sources = sourcesFor(swapCtx.dates, swapCtx.swaps);
  const swappedFrom = sources[state.currentDate] !== state.currentDate ? sources[state.currentDate] : null;
  const opts = dayOptionsHtml(swapCtx.dates, sources, swapCtx.planByDate, { exclude: state.currentDate });
  return `<section class="panel panel-swap"><details class="pick-more" ${swappedFrom ? 'open' : ''}>
    <summary>Swap with another day this week${swappedFrom ? ' (swapped)' : ''}</summary>
    ${swappedFrom ? `<p class="panel-summary">Showing ${escapeHtml(formatDayLabel(swappedFrom))}'s planned session.</p>` : '<p class="panel-summary">Trade today\'s planned session with another day, e.g. do your lift today and the run later. Only this week changes.</p>'}
    <div class="swap-row">
      <label class="swap-field"><span>Swap with</span><select id="todaySwapWith">${opts}</select></label>
    </div>
    <div class="swap-actions">
      <button type="button" class="btn btn-primary" id="todaySwapGo">Swap</button>
      ${swapCtx.swaps.length ? '<button type="button" class="btn btn-quiet" id="todaySwapReset">Reset this week</button>' : ''}
      <span class="save-status" id="todaySwapStatus" aria-live="polite"></span>
    </div>
  </details></section>`;
}

function wireTodaySwap(main, bundle){
  const go = qs('#todaySwapGo', main);
  if (!go) return;
  const statusEl = qs('#todaySwapStatus', main);
  async function run(fn){
    renderStatusPill(statusEl, 'saving');
    try {
      await fn();
      const fresh = await db.getDayBundle(state.currentDate);
      Object.assign(bundle, { sessions: fresh.sessions, plan: fresh.plan, picks: fresh.picks });
      await loadSwapContext(bundle);
      renderHeader(main, bundle);
      renderMealsAndTraining(main, bundle);
      computeTotals(main, bundle);
    } catch (err) {
      renderStatusPill(statusEl, 'queued', () => run(fn));
      toast(`Couldn't swap — ${friendlyError(err)}.`);
    }
  }
  go.addEventListener('click', () => {
    const other = qs('#todaySwapWith', main).value;
    run(() => swapDays(userId(), swapCtx.dates, swapCtx.swaps, state.currentDate, other));
  });
  const reset = qs('#todaySwapReset', main);
  if (reset) reset.addEventListener('click', () => run(() => resetWeek(userId(), swapCtx.dates)));
}

function sessionPanelHtml(session, checks){
  const st = session.session_type;
  const checked = !!checks[`session:${st}`];
  const d = session.plan_day;
  const detail = d ? `${planChipsHtml(d)}${planLinesHtml(d)}${planModeHelpHtml(d)}` : '';
  return `<section class="panel panel-session">
    <h2 class="panel-title">${escapeHtml(session.title)}</h2>
    ${detail}
    <ul class="tick-list">${sessionTickRowHtml(st, checked)}</ul>
  </section>`;
}

function renderMealsAndTraining(main, bundle){
  const checks = bundle.checks || {};
  const picks = bundle.picks || { weights: false, cardio: false };
  const mealsHtml = bundle.day_type
    ? `<section class="panel">
        <h2 class="panel-title">Meals</h2>
        ${nutritionNoteHtml()}
        <ul class="tick-list">${(bundle.meals || []).map((m, i) => mealRowHtml(m, bundle.day_type, !!checks[`meal:${bundle.day_type}:${m.slot_order}`], i + 1)).join('')}</ul>
      </section>`
    : '';

  const sessions = bundle.sessions || [];
  const hasPlannedDay = !!(bundle.plan && bundle.plan.has_day);
  const trainingHtml = weekPanelHtml(bundle)
    + sessions.map((s) => sessionPanelHtml(s, checks)).join('')
    + pickerHtml(picks, hasPlannedDay, bundle.pick_sessions || {})
    + swapTodayHtml(bundle);

  qs('#mealsAndTraining', main).innerHTML = trainingHtml + mealsHtml;

  qsa('.tick-row', main).forEach((row) => {
    const btn = qs('.tick-box', row);
    const statusEl = qs('.tick-status', row);
    btn.addEventListener('click', async () => {
      const nowChecked = !row.classList.contains('is-checked');
      row.classList.toggle('is-checked', nowChecked);
      btn.setAttribute('aria-pressed', String(nowChecked));
      bundle.checks = { ...(bundle.checks || {}), [row.dataset.itemId]: nowChecked };
      computeTotals(main, bundle);
      await saveCheck(row.dataset.itemId, nowChecked, statusEl);
    });
  });

  wirePicker(main, bundle);
  wireTodaySwap(main, bundle);

  const adjust = qs('#adjustToggle', main);
  if (adjust) {
    adjust.addEventListener('change', async () => {
      setAdjustEnabled(adjust.checked);
      await applyNutrition(bundle);
      renderMealsAndTraining(main, bundle);
      computeTotals(main, bundle);
    });
  }

  // Expand/collapse a meal's foods list -- separate from the tick-box above,
  // and independent of the checked state (opening a meal to look at it
  // shouldn't mark it eaten, and ticking it shouldn't force it open).
  wireMealAccordionToggles(main);
}

function wirePicker(main, bundle){
  const group = qs('.pick-group', main);
  if (!group) return;
  const statusEl = qs('#pickStatus', main);
  qsa('[data-pick]', group).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.pick;
      const cur = bundle.picks || { weights: false, cardio: false };
      const curKey = cur.weights && cur.cardio ? 'both' : cur.weights ? 'weights' : cur.cardio ? 'cardio' : null;
      // Tapping the active pick again clears it (back to the plan / empty day).
      const next = key === curKey
        ? { weights: false, cardio: false }
        : { weights: key === 'weights' || key === 'both', cardio: key === 'cardio' || key === 'both' };
      const plannedSessions = cur.weights || cur.cardio ? null : bundle.sessions;
      bundle.picks = next;
      bundle.checks = { ...(bundle.checks || {}), 'pick:weights': next.weights, 'pick:cardio': next.cardio };
      // A kind that is no longer picked loses its chosen session name.
      const names = bundle.pick_sessions || {};
      const off = ['weights', 'cardio'].filter((k) => !next[k] && names[k]);
      bundle.pick_sessions = { weights: next.weights ? names.weights || null : null, cardio: next.cardio ? names.cardio || null : null };
      if (off.length) await db.pickSessions.remove(userId(), state.currentDate, off).catch(() => {});
      renderStatusPill(statusEl, 'saving');
      const [a, b] = await Promise.all([
        saveCheck('pick:weights', next.weights, statusEl),
        saveCheck('pick:cardio', next.cardio, statusEl)
      ]);
      if (!a.ok || !b.ok) return;
      // Prefer the server's view of the day; fall back to applying the pick
      // locally if the refetch fails (e.g. offline).
      try {
        const fresh = await db.getDayBundle(state.currentDate);
        bundle.sessions = fresh.sessions;
        bundle.picks = fresh.picks;
        bundle.pick_sessions = fresh.pick_sessions;
      } catch (e) {
        if (next.weights || next.cardio) bundle.sessions = pickSessions(next, bundle.pick_sessions);
        else if (plannedSessions) bundle.sessions = plannedSessions;
      }
      renderHeader(main, bundle);
      renderMealsAndTraining(main, bundle);
      computeTotals(main, bundle);
    });
  });

  // Naming the specific session that was done.
  qsa('[data-pick-session]', main).forEach((sel) => {
    sel.addEventListener('change', async () => {
      const kind = sel.dataset.pickSession;
      const value = sel.value;
      try {
        if (value) await db.pickSessions.set(userId(), state.currentDate, kind, value);
        else await db.pickSessions.remove(userId(), state.currentDate, [kind]);
        bundle.pick_sessions = { ...(bundle.pick_sessions || {}), [kind]: value || null };
        bundle.sessions = pickSessions(bundle.picks || {}, bundle.pick_sessions);
        renderHeader(main, bundle);
        renderMealsAndTraining(main, bundle);
        computeTotals(main, bundle);
      } catch (err) {
        sel.value = (bundle.pick_sessions || {})[kind] || '';
        toast(`Couldn't save the session — ${friendlyError(err)}.`);
      }
    });
  });
}

function renderWeight(main, bundle, weightCtx){
  const log = bundle.log || {};
  const pw = bundle.plan && bundle.plan.week;
  const target = pw && pw.weight_target_kg_monday != null && bundle.day_of_week === 1
    ? `<div class="weight-context">Target this Monday: ${Number(pw.weight_target_kg_monday).toFixed(1)}kg</div>` : '';
  qs('#weightSection', main).innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Weight</h2>
      <div class="weight-row">
        <label class="weight-input-wrap">
          <input type="number" step="0.1" min="0" inputmode="decimal" id="weightInput" value="${log.weight_kg ?? ''}" placeholder="0.0"> <span class="weight-unit">kg</span>
        </label>
        <span class="save-status" id="weightStatus" aria-live="polite"></span>
      </div>
      ${target}
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
    // A new weigh-in rescales today's food (rice, sweet potato, oats, kcal target).
    if (nutritionInfo) {
      await applyNutrition(bundle);
      renderMealsAndTraining(main, bundle);
      computeTotals(main, bundle);
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

const BOOLEAN_GROUPS = new Set(['progress_pics', 'read_pages']);
function boolToYesNo(v){ return v === true ? 'yes' : v === false ? 'no' : null; }

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
      <div class="review-group">
        <span class="review-label">Progress pictures taken</span>
        <div class="status-btn-row status-btn-row-2" id="picsButtons">${statusButtonsHtml('progress_pics', boolToYesNo(log.progress_pics), ['yes', 'no'])}</div>
      </div>
      <div class="review-group">
        <span class="review-label">Read 1 chapter / 10 pages</span>
        <div class="status-btn-row status-btn-row-2" id="readButtons">${statusButtonsHtml('read_pages', boolToYesNo(log.read_pages), ['yes', 'no'])}</div>
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
      // progress_pics / read_pages are stored as true / false / null, the rest as 'yes' | 'partial' | 'no'.
      const stored = newValue !== null && BOOLEAN_GROUPS.has(group) ? newValue === 'yes' : newValue;
      await saveLogField({ [group]: stored }, reviewStatus);
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
    <section class="panel panel-fuel" id="fuelSection">
      <h2 class="panel-title">Fuel today</h2>
      <div id="fuelPanel"></div>
    </section>
    <div id="mealsAndTraining"></div>
    <div id="weightSection"></div>
    <div id="reviewSection"></div>
  `;

  const bundle = await db.getDayBundle(state.currentDate);
  state.dayBundle = bundle;

  // getLatest(), not getCurrent(state.currentDate) -- date-nav bounds need
  // the block/plan regardless of whether the *viewed* date falls inside them.
  if (!state.currentBlock) state.currentBlock = await db.blocks.getLatest().catch(() => null);
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);

  // Nutrition only exists inside Block 2. Outside it, hide the fuel panel
  // rather than showing empty bars.
  await applyNutrition(bundle);
  if (!bundle.day_type) qs('#fuelSection', main).hidden = true;

  await loadSwapContext(bundle);

  renderHeader(main, bundle);
  renderMealsAndTraining(main, bundle);
  computeTotals(main, bundle);
  const weightCtx = await loadWeightContext(bundle);
  renderWeight(main, bundle, weightCtx);
  renderReview(main, bundle);
}
