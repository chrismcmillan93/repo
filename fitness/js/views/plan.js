// The plan, read-only: the Edale 50km training plan week by week, the lift
// sessions and lift modes, and the nutrition plan (day types scaled to your
// weight, plus its rules).
import { qs, qsa, escapeHtml, formatDateShort, todayStr, round1 } from '../utils.js';
import { mealAccordionHtml, wireMealAccordionToggles } from '../mealCard.js';
import { planChipsHtml, planLinesHtml, planWeekHtml, modeLabel } from '../planDay.js';
import { loadNutrition, buildDay, effectiveWeight, describeScaling, adjustEnabled, inNutritionPlan } from '../nutrition.js';
import { db } from '../db.js';
import { state } from '../state.js';

// Module-level, not state.js -- purely "which tab is open", not worth a DB
// round trip or persisting. Resets to the first day type on a hard reload.
let activeMealTab = null;

// Same idea for the training plan's week pager. Starts null so render() can
// default it to the plan week containing today (falling back to week 1).
let activeTrainingWeek = null;

// Same Meal-N accordion Today uses (mealCard.js), read-only here.
function mealDayHtml(day){
  const t = day.totals;
  return `
    <div class="plan-meal-block">
      <h3 class="plan-subhead">${escapeHtml(day.label)}${day.appliesTo ? ` · ${escapeHtml(day.appliesTo)}` : ''}</h3>
      <ul class="tick-list">${day.meals.map((m, i) => mealAccordionHtml(m, i + 1)).join('')}</ul>
      <div class="plan-day-totals">
        <span class="plan-day-totals-label">Day total</span>
        <span class="plan-day-totals-figures">${t.kcal} kcal · ${round1(t.protein_g)}g protein · ${round1(t.carbs_g)}g carbs · ${round1(t.fat_g)}g fat</span>
      </div>
    </div>`;
}

function mealTabsHtml(list, active){
  return `
    <div class="segmented segmented-wrap" role="tablist" aria-label="Day type">
      ${list.map((t) => `
        <button type="button" class="segmented-btn ${t.key === active ? 'is-active' : ''}" role="tab" aria-selected="${t.key === active}" data-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>
      `).join('')}
    </div>`;
}

function ruleList(items){
  return `<ul class="plan-rule-list">${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
}

// The plan's own rules, grouped. Text comes straight from the plan data.
function nutritionRulesHtml(plan){
  const r = plan.rules || {};
  const dinner = r.dinner_rule || {};
  const lr = r.long_run_scaling || {};
  const inRun = lr.in_run_carbs_g_per_hour || {};
  const group = (title, body) => `<details class="plan-rule-group"><summary>${escapeHtml(title)}</summary>${body}</details>`;
  return `
    <section class="panel">
      <h2 class="panel-title">Nutrition rules</h2>
      ${group('Food rules', ruleList(r.food_rules || []))}
      ${group('Dinner and the chicken swap', `<p>${escapeHtml(dinner.default || '')}</p><p>${escapeHtml(dinner.chicken_swap || '')}</p><p class="plan-ex-note">${escapeHtml(dinner.note || '')}</p>`)}
      ${r.treat_slot ? group('Treat slot', `<p>${escapeHtml((r.treat_slot.days || []).join(' and '))}: ${escapeHtml(r.treat_slot.rule)}</p>`) : ''}
      ${group('Long runs and gels', `<p>${escapeHtml(lr.reference || '')}</p><p>${escapeHtml(lr.how || '')} (${escapeHtml(lr.kcal_per_extra_mile)} kcal and ${escapeHtml(lr.carbs_g_per_extra_mile)} g carbs per extra mile.)</p><p>${escapeHtml(lr.gel_note || '')}</p>${ruleList(Object.entries(inRun).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v} g/h`))}<p class="plan-ex-note">${escapeHtml(lr.note || '')}</p>`)}
      ${group('Phases', `<ul class="plan-rule-list">${(r.phase_rules || []).map((p) => `<li><strong>${escapeHtml(p.weeks)}</strong>: ${escapeHtml(p.rule)}</li>`).join('')}</ul>`)}
      ${group('If the scale stalls or drops too fast', ruleList(r.adjust_rules || []))}
      ${group('Assumptions to confirm', ruleList(r.assumptions_to_confirm || []))}
    </section>`;
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
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const plan = state.plan;
  const nut = await loadNutrition();
  if (!plan && !nut) {
    main.innerHTML = '<div class="empty-state"><strong>No plan yet.</strong><p>Add one via a migration or SQL insert.</p></div>';
    return;
  }

  const [planWeeks, planDays, liftTemplates, liftModes, weightInfo] = await Promise.all([
    plan ? db.planWeeks.list(plan.plan_version) : Promise.resolve([]),
    plan ? db.planDays.listRange(plan.plan_version, plan.start_date, plan.end_date) : Promise.resolve([]),
    plan ? db.liftTemplates.list(plan.plan_version).catch(() => []) : Promise.resolve([]),
    plan ? db.liftModes.list(plan.plan_version).catch(() => []) : Promise.resolve([]),
    nut ? effectiveWeight(state.session.user.id, todayStr()) : Promise.resolve({ weight: null })
  ]);

  const daysByWeek = {};
  planDays.forEach((d) => { (daysByWeek[d.week_number] = daysByWeek[d.week_number] || []).push(d); });

  // Nutrition day types, scaled to your weight and shown for today's phase
  // (or the first day of the plan if it hasn't started).
  const refDate = nut && inNutritionPlan(nut, todayStr()) ? todayStr() : nut ? nut.plan.start_date : null;
  const nutDays = nut ? nut.dayTypeList.map((t) => buildDay(nut, { date: refDate, key: t.key, weight: weightInfo.weight, enabled: adjustEnabled() })) : [];
  if (nut && (!activeMealTab || !nut.dayTypes[activeMealTab])) activeMealTab = nut.dayTypeList[0].key;

  main.innerHTML = `
    ${plan ? `<section class="panel">
      <h2 class="panel-title">${escapeHtml(plan.name)}</h2>
      <p class="plan-dates">${escapeHtml(formatDateShort(plan.start_date))} ${escapeHtml(plan.start_date.slice(0, 4))} – ${escapeHtml(formatDateShort(plan.end_date))} ${escapeHtml(plan.end_date.slice(0, 4))}</p>
      <p class="plan-goal">${planWeeks.length} weeks, miles first with km in brackets.</p>
      <div id="trainingPlanNav"></div>
      <div id="trainingPlanContent"></div>
    </section>
    ${liftSessionsHtml(liftTemplates, liftModes)}` : ''}

    ${nut ? `<section class="panel">
      <h2 class="panel-title">Nutrition</h2>
      <p class="plan-dates">${escapeHtml(nut.plan.title)}</p>
      <p class="plan-goal">About ${Number(nut.plan.planned_avg_kcal).toLocaleString('en-GB')} kcal a day on average (${Number(nut.plan.planned_deficit_kcal)} kcal under maintenance). Protein floor ${Number(nut.plan.protein_floor_g)} g, aim ${Number(nut.plan.protein_aim_g)} g.</p>
      <p class="nutrition-note">${escapeHtml(nutDays[0] ? describeScaling(nutDays[0], weightInfo) : '')} Saturday also moves with that week's long run, which Today and Week apply.</p>
      ${mealTabsHtml(nut.dayTypeList, activeMealTab)}
      <div id="mealTemplatesContent"></div>
    </section>
    ${nutritionRulesHtml(nut.plan)}` : ''}
  `;

  if (nut) {
    const renderMealTab = () => {
      const day = nutDays.find((d) => d.key === activeMealTab) || nutDays[0];
      qs('#mealTemplatesContent', main).innerHTML = mealDayHtml(day);
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
