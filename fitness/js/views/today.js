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
import { qs, qsa, escapeHtml, formatDateFull, statusLabel,
  addDays, toast, friendlyError, debounce, round1, renderStatusPill, sessionTypeLabel } from '../utils.js';
import { mealAccordionHtml, wireMealAccordionToggles } from '../mealCard.js';
import { planChipsHtml, planLinesHtml, planModeHelpHtml, planWeekHtml } from '../planDay.js';
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
function pickSessions(picks){
  const out = [];
  if (picks.weights) out.push({ session_type: 'lift', source: 'pick', title: 'Weights session', summary: 'Picked: weights', run: null });
  if (picks.cardio) out.push({ session_type: 'run', source: 'pick', title: 'Cardio session', summary: 'Picked: cardio', run: null });
  return out;
}

function pickerHtml(picks, hasPlannedDay){
  const active = picks.weights && picks.cardio ? 'both' : picks.weights ? 'weights' : picks.cardio ? 'cardio' : null;
  const btn = (key, label) => `<button type="button" class="segmented-btn ${active === key ? 'is-active' : ''}" data-pick="${key}" aria-pressed="${active === key}">${label}</button>`;
  const group = `
    <div class="segmented pick-group" role="group" aria-label="Pick today's session">
      ${btn('weights', 'Weights')}${btn('cardio', 'Cardio')}${btn('both', 'Both')}
    </div>
    <span class="save-status" id="pickStatus" aria-live="polite"></span>`;
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
        <ul class="tick-list">${(bundle.meals || []).map((m, i) => mealRowHtml(m, bundle.day_type, !!checks[`meal:${bundle.day_type}:${m.slot_order}`], i + 1)).join('')}</ul>
      </section>`
    : '';

  const sessions = bundle.sessions || [];
  const hasPlannedDay = !!(bundle.plan && bundle.plan.has_day);
  const trainingHtml = weekPanelHtml(bundle)
    + sessions.map((s) => sessionPanelHtml(s, checks)).join('')
    + pickerHtml(picks, hasPlannedDay);

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
      } catch (e) {
        if (next.weights || next.cardio) bundle.sessions = pickSessions(next);
        else if (plannedSessions) bundle.sessions = plannedSessions;
      }
      renderHeader(main, bundle);
      renderMealsAndTraining(main, bundle);
      computeTotals(main, bundle);
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
  if (!bundle.day_type) qs('#fuelSection', main).hidden = true;

  renderHeader(main, bundle);
  renderMealsAndTraining(main, bundle);
  computeTotals(main, bundle);
  const weightCtx = await loadWeightContext(bundle);
  renderWeight(main, bundle, weightCtx);
  renderReview(main, bundle);
}
