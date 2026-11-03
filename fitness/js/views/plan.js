// The plan, read-only: the Edale 50km training plan week by week, the lift
// sessions and lift modes, Block 2's nutrition (weekly targets, meal templates)
// and the standing rules.
import { qs, qsa, escapeHtml, formatDateShort, todayStr, round1 } from '../utils.js';
import { mealAccordionHtml, wireMealAccordionToggles } from '../mealCard.js';
import { planChipsHtml, planLinesHtml, planWeekHtml, modeLabel } from '../planDay.js';
import { db } from '../db.js';
import { state } from '../state.js';

const MEAL_DAY_TABS = [
  { key: 'lift', tabLabel: 'Lift', heading: 'Lift days (Mon / Wed / Fri)' },
  { key: 'run', tabLabel: 'Run', heading: 'Run days (Tue / Thu / Sat)' },
  { key: 'rest', tabLabel: 'Rest', heading: 'Rest day (Sun)' }
];

// Module-level, not state.js -- this is purely "which tab is open," not
// data worth a DB round trip or persisting across sessions. Resets to
// 'lift' on a hard reload; fine either way per the brief.
let activeMealTab = 'lift';

// Same idea for the training plan's week pager -- which week is showing is UI
// state, not worth persisting. Starts null so render() can default it to
// whichever plan week contains today (falling back to week 1) on first load.
let activeTrainingWeek = null;

// Same Meal-N accordion Today uses (mealCard.js) -- read-only here (no
// itemId/checked passed, so mealAccordionHtml omits the tick-box), each
// meal's own foods and swap options shown the same way.
function mealDayHtml(dayType, heading, meals){
  const dayMeals = meals
    .filter((m) => m.day_type === dayType && m.week_number === null)
    .sort((a, b) => a.slot_order - b.slot_order);
  // The day type's full total if every meal on it is eaten -- sums each
  // meal's own kcal/protein_g/carbs_g/fat_g (already the "real foods only"
  // total; swap options never count toward it), not a per-food re-sum.
  const totals = dayMeals.reduce((acc, m) => ({
    kcal: acc.kcal + Number(m.kcal),
    protein: acc.protein + Number(m.protein_g),
    carbs: acc.carbs + Number(m.carbs_g ?? 0),
    fat: acc.fat + Number(m.fat_g ?? 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return `
    <div class="plan-meal-block">
      <h3 class="plan-subhead">${escapeHtml(heading)}</h3>
      <ul class="tick-list">${dayMeals.map((m, i) => mealAccordionHtml(m, i + 1)).join('')}</ul>
      <div class="plan-day-totals">
        <span class="plan-day-totals-label">Day total</span>
        <span class="plan-day-totals-figures">${round1(totals.kcal)} kcal · ${round1(totals.protein)}g protein · ${round1(totals.carbs)}g carbs · ${round1(totals.fat)}g fat</span>
      </div>
    </div>`;
}

function mealTabsHtml(active){
  return `
    <div class="segmented" role="tablist" aria-label="Meal day type">
      ${MEAL_DAY_TABS.map((t) => `
        <button type="button" class="segmented-btn ${t.key === active ? 'is-active' : ''}" role="tab" aria-selected="${t.key === active}" data-tab="${t.key}">${t.tabLabel}</button>
      `).join('')}
    </div>`;
}

// ---- training plan (v2) ----------------------------------------------------

function planDayRowHtml(d){
  return `
    <li class="plan-session-row">
      <div class="plan-session-head">
        <span class="plan-session-day">${escapeHtml(d.dow)}</span>
        <span class="plan-session-title">${escapeHtml(d.session)}</span>
      </div>
      <div class="plan-session-date">${escapeHtml(formatDateShort(d.date))}</div>
      ${planChipsHtml(d)}${planLinesHtml(d)}
    </li>`;
}

function trainingWeekHtml(week, days){
  return `
    ${planWeekHtml(week)}
    <ul class="plan-session-list">${days.map(planDayRowHtml).join('')}</ul>`;
}

// Same .date-nav markup Today/Week already use for their own prev/next --
// consistent look, no new nav component needed.
function trainingNavHtml(week, totalWeeks, canBack, canForward){
  return `
    <div class="date-nav">
      <button type="button" class="date-nav-btn" id="prevTrainingWeek" ${canBack ? '' : 'disabled'} aria-label="Previous week">‹</button>
      <div class="date-nav-label">
        <div class="date-nav-day">Week ${week.week_number} of ${totalWeeks} · ${escapeHtml(week.phase)}</div>
        <div class="date-nav-sub">${escapeHtml(formatDateShort(week.start_date))} – ${escapeHtml(formatDateShort(week.end_date))} · ${escapeHtml(week.load)}</div>
      </div>
      <button type="button" class="date-nav-btn" id="nextTrainingWeek" ${canForward ? '' : 'disabled'} aria-label="Next week">›</button>
    </div>`;
}

function liftSessionsHtml(templates, modes){
  if (!templates.length) return '';
  return `
    <section class="panel">
      <h2 class="panel-title">Lift sessions</h2>
      <p class="panel-summary">Matches your Hevy routines in the 50K Race Template folder. The mode changes sets, reps and load, never the exercises.</p>
      ${templates.map((t) => `
        <details class="plan-lift">
          <summary><strong>${escapeHtml(t.name)}</strong> <span class="plan-lift-when">${escapeHtml(t.when_label || '')}</span></summary>
          <ol class="plan-lift-exercises">
            ${(t.exercises || []).map((e) => `<li><span class="plan-ex-name">${escapeHtml(e.name)}</span> <span class="plan-ex-sets">${escapeHtml(e.sets)}</span>${e.note ? `<div class="plan-ex-note">${escapeHtml(e.note)}</div>` : ''}</li>`).join('')}
          </ol>
        </details>`).join('')}
      <h3 class="plan-subhead">Lift modes</h3>
      <dl class="plan-modes">
        ${modes.map((m) => `<dt>${escapeHtml(modeLabel(m.mode))}</dt><dd>${escapeHtml(m.description)}</dd>`).join('')}
      </dl>
    </section>`;
}

export async function render(main){
  const block = await db.blocks.getLatest();
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const plan = state.plan;
  if (!block && !plan) {
    main.innerHTML = '<div class="empty-state"><strong>No plan yet.</strong><p>Add one via a migration or SQL insert.</p></div>';
    return;
  }

  const [weeks, targets, meals, rules, planWeeks, planDays, liftTemplates, liftModes] = await Promise.all([
    block ? db.blockWeeks.list(block.id) : Promise.resolve([]),
    block ? db.weekTargets.list(block.id) : Promise.resolve([]),
    block ? db.mealTemplates.list(block.id) : Promise.resolve([]),
    db.rules.list(),
    plan ? db.planWeeks.list(plan.plan_version) : Promise.resolve([]),
    plan ? db.planDays.listRange(plan.plan_version, plan.start_date, plan.end_date) : Promise.resolve([]),
    plan ? db.liftTemplates.list(plan.plan_version).catch(() => []) : Promise.resolve([]),
    plan ? db.liftModes.list(plan.plan_version).catch(() => []) : Promise.resolve([])
  ]);

  const targetsByWeek = {};
  targets.forEach((t) => {
    targetsByWeek[t.week_number] = targetsByWeek[t.week_number] || {};
    targetsByWeek[t.week_number][t.day_type] = t;
  });
  const daysByWeek = {};
  planDays.forEach((d) => { (daysByWeek[d.week_number] = daysByWeek[d.week_number] || []).push(d); });

  main.innerHTML = `
    ${plan ? `<section class="panel">
      <h2 class="panel-title">${escapeHtml(plan.name)}</h2>
      <p class="plan-dates">${escapeHtml(formatDateShort(plan.start_date))} ${escapeHtml(plan.start_date.slice(0, 4))} – ${escapeHtml(formatDateShort(plan.end_date))} ${escapeHtml(plan.end_date.slice(0, 4))}</p>
      <p class="plan-goal">${planWeeks.length} weeks, miles first with km in brackets.</p>
      <div id="trainingPlanNav"></div>
      <div id="trainingPlanContent"></div>
    </section>
    ${liftSessionsHtml(liftTemplates, liftModes)}` : ''}

    ${block ? `<section class="panel">
      <h2 class="panel-title">${escapeHtml(block.name)} — nutrition</h2>
      <p class="plan-dates">${escapeHtml(formatDateShort(block.start_date))} – ${escapeHtml(formatDateShort(block.end_date))}</p>
      ${block.goal ? `<p class="plan-goal">${escapeHtml(block.goal)}</p>` : ''}
    </section>

    <section class="panel">
      <h2 class="panel-title">Weekly nutrition targets</h2>
      <table class="plan-table plan-targets-table">
        <thead><tr><th>Week</th><th>Lift</th><th>Run</th><th>Rest</th></tr></thead>
        <tbody>
          ${weeks.map((w) => {
            const t = targetsByWeek[w.week_number] || {};
            const cell = (dt) => t[dt] ? `${t[dt].kcal_target} kcal / ${t[dt].protein_floor_g}g` : '—';
            return `<tr><td>Wk ${w.week_number}${w.focus ? `<div class="plan-week-focus">${escapeHtml(w.focus)}</div>` : ''}</td><td>${cell('lift')}</td><td>${cell('run')}</td><td>${cell('rest')}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2 class="panel-title">Meal templates</h2>
      ${mealTabsHtml(activeMealTab)}
      <div id="mealTemplatesContent"></div>
    </section>` : ''}

    <section class="panel">
      <h2 class="panel-title">Standing rules</h2>
      <ol class="plan-rules-list">
        ${rules.map((r) => `<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.detail)}</li>`).join('')}
      </ol>
    </section>
  `;

  if (block) {
    const renderMealTab = () => {
      const tab = MEAL_DAY_TABS.find((t) => t.key === activeMealTab);
      qs('#mealTemplatesContent', main).innerHTML = mealDayHtml(tab.key, tab.heading, meals);
      wireMealAccordionToggles(qs('#mealTemplatesContent', main));
    };
    renderMealTab();

    qsa('.segmented-btn', main).forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === activeMealTab) return;
        activeMealTab = btn.dataset.tab;
        qsa('.segmented-btn', main).forEach((b) => {
          b.classList.toggle('is-active', b.dataset.tab === activeMealTab);
          b.setAttribute('aria-selected', String(b.dataset.tab === activeMealTab));
        });
        renderMealTab();
      });
    });
  }

  if (!plan || !planWeeks.length) return;

  // Defaults to the plan week containing today, or week 1 if the plan has
  // not started yet -- "land somewhere real".
  if (activeTrainingWeek === null || !planWeeks.some((w) => w.week_number === activeTrainingWeek)) {
    const today = todayStr();
    const current = planWeeks.find((w) => today >= w.start_date && today <= w.end_date);
    activeTrainingWeek = (current || planWeeks[0]).week_number;
  }

  function renderTrainingWeek(){
    const week = planWeeks.find((w) => w.week_number === activeTrainingWeek);
    const canBack = planWeeks.some((w) => w.week_number < activeTrainingWeek);
    const canForward = planWeeks.some((w) => w.week_number > activeTrainingWeek);
    qs('#trainingPlanNav', main).innerHTML = trainingNavHtml(week, planWeeks.length, canBack, canForward);
    qs('#trainingPlanContent', main).innerHTML = trainingWeekHtml(week, daysByWeek[week.week_number] || []);

    qs('#prevTrainingWeek', main).addEventListener('click', () => {
      const prev = planWeeks.filter((w) => w.week_number < activeTrainingWeek).pop();
      if (!prev) return;
      activeTrainingWeek = prev.week_number;
      renderTrainingWeek();
    });
    qs('#nextTrainingWeek', main).addEventListener('click', () => {
      const next = planWeeks.find((w) => w.week_number > activeTrainingWeek);
      if (!next) return;
      activeTrainingWeek = next.week_number;
      renderTrainingWeek();
    });
  }
  renderTrainingWeek();
}
