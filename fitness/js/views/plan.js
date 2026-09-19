// The full block, read-only: goal, dates, week-by-week run progression,
// lift prescriptions, meal templates per day type, and the standing rules.
import { qs, qsa, escapeHtml, formatDateShort, todayStr, round1 } from '../utils.js';
import { mealAccordionHtml, wireMealAccordionToggles } from '../mealCard.js';
import { db } from '../db.js';

const DOW_LABEL = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

const MEAL_DAY_TABS = [
  { key: 'lift', tabLabel: 'Lift', heading: 'Lift days (Mon / Wed / Fri)' },
  { key: 'run', tabLabel: 'Run', heading: 'Run days (Tue / Thu / Sat)' },
  { key: 'rest', tabLabel: 'Rest', heading: 'Rest day (Sun)' }
];

// Module-level, not state.js -- this is purely "which tab is open," not
// data worth a DB round trip or persisting across sessions. Resets to
// 'lift' on a hard reload; fine either way per the brief.
let activeMealTab = 'lift';

// Same idea for Training split's week pager -- which week is showing is UI
// state, not worth persisting. Starts null so render() can default it to
// whichever week contains today (falling back to week 1) on first load.
let activeTrainingWeek = null;

// Same Meal-N accordion Today uses (mealCard.js) -- read-only here (no
// itemId/checked passed, so mealAccordionHtml omits the tick-box), each
// meal's own foods and swap options shown the same way. Replaces the old
// flat Time/Meal/Kcal/Protein/Carbs/Fat table.
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

// Resolution rule (matches fitness.get_day_bundle() and Week's sessionFor()):
// the row for this exact week_number wins if one exists, otherwise fall
// back to the standing week_number IS NULL row for that day_of_week. Never
// render both -- a week with an override should show one session for that
// day, not the override *and* the default underneath it.
function resolveSession(dow, weekNumber, sessions){
  return sessions.find((s) => s.day_of_week === dow && s.week_number === weekNumber)
    || sessions.find((s) => s.day_of_week === dow && s.week_number === null)
    || null;
}

function resolveRun(dow, weekNumber, runPlan){
  return runPlan.find((r) => r.day_of_week === dow && r.week_number === weekNumber) || null;
}

function sessionDayRowHtml(dow, session, run){
  if (!session) {
    return `
      <li class="plan-session-row">
        <div class="plan-session-head">
          <span class="plan-session-day">${DOW_LABEL[dow]}</span>
          <span class="plan-session-title">—</span>
        </div>
      </li>`;
  }
  // Run days: join run_plan for this exact week+day so the distance/effort/
  // detail is the real prescription for that week, not the session
  // template's generic title ("Run — easy" doesn't say how far).
  const runDetail = session.session_type === 'run' && run
    ? (run.detail ? `${run.distance_km}km — ${run.detail}` : `${run.distance_km}km, ${run.effort}`)
    : null;
  return `
    <li class="plan-session-row">
      <div class="plan-session-head">
        <span class="plan-session-day">${DOW_LABEL[dow]}</span>
        <span class="plan-session-title">${escapeHtml(session.title)}</span>
      </div>
      ${runDetail ? `<p class="plan-session-summary">${escapeHtml(runDetail)}</p>` : (session.summary ? `<p class="plan-session-summary">${escapeHtml(session.summary)}</p>` : '')}
    </li>`;
}

// One resolved session per day -- not a raw dump of every session_templates
// row (which would show a week's override *and* the standing default it
// replaces, side by side, for the same day). The week heading/focus is
// shown by the pager nav around this, not repeated here.
function weekTrainingHtml(week, sessions, runPlan){
  const days = [1, 2, 3, 4, 5, 6, 7]
    .map((dow) => sessionDayRowHtml(dow, resolveSession(dow, week.week_number, sessions), resolveRun(dow, week.week_number, runPlan)))
    .join('');
  return `<ul class="plan-session-list">${days}</ul>`;
}

// Same .date-nav markup Today/Week already use for their own prev/next --
// consistent look, no new nav component needed.
function trainingNavHtml(week, totalWeeks, canBack, canForward){
  return `
    <div class="date-nav">
      <button type="button" class="date-nav-btn" id="prevTrainingWeek" ${canBack ? '' : 'disabled'} aria-label="Previous week">‹</button>
      <div class="date-nav-label">
        <div class="date-nav-day">Week ${week.week_number} of ${totalWeeks}</div>
        <div class="date-nav-sub">${escapeHtml(formatDateShort(week.start_date))} – ${escapeHtml(formatDateShort(week.end_date))}${week.focus ? ` · ${escapeHtml(week.focus)}` : ''}</div>
      </div>
      <button type="button" class="date-nav-btn" id="nextTrainingWeek" ${canForward ? '' : 'disabled'} aria-label="Next week">›</button>
    </div>`;
}

function runWeekRowHtml(weekNumber, entries){
  const byDow = Object.fromEntries(entries.map((e) => [e.day_of_week, e]));
  const cell = (dow) => {
    const e = byDow[dow];
    if (!e) return '<td>—</td>';
    const label = e.detail ? `${e.distance_km}km — ${e.detail}` : `${e.distance_km}km ${e.effort}`;
    return `<td>${escapeHtml(label)}</td>`;
  };
  return `<tr><td class="plan-week-num">Wk ${weekNumber}</td>${cell(2)}${cell(4)}${cell(6)}${byDow[7] ? cell(7) : '<td>—</td>'}</tr>`;
}

export async function render(main){
  const block = await db.blocks.getLatest();
  if (!block) {
    main.innerHTML = '<div class="empty-state"><strong>No training block yet.</strong><p>Add one via a migration or SQL insert.</p></div>';
    return;
  }

  const [weeks, targets, meals, sessions, runPlan, rules] = await Promise.all([
    db.blockWeeks.list(block.id),
    db.weekTargets.list(block.id),
    db.mealTemplates.list(block.id),
    db.sessionTemplates.list(block.id),
    db.runPlan.list(block.id),
    db.rules.list()
  ]);

  const targetsByWeek = {};
  targets.forEach((t) => {
    targetsByWeek[t.week_number] = targetsByWeek[t.week_number] || {};
    targetsByWeek[t.week_number][t.day_type] = t;
  });

  const runByWeek = {};
  runPlan.forEach((r) => {
    runByWeek[r.week_number] = runByWeek[r.week_number] || [];
    runByWeek[r.week_number].push(r);
  });

  main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">${escapeHtml(block.name)}</h2>
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
      <h2 class="panel-title">Training split</h2>
      <div id="trainingSplitNav"></div>
      <div id="trainingSplitContent"></div>
    </section>

    <section class="panel">
      <h2 class="panel-title">10K progression</h2>
      <table class="plan-table plan-run-table">
        <thead><tr><th>Week</th><th>Tue</th><th>Thu</th><th>Sat</th></tr></thead>
        <tbody>${weeks.map((w) => runWeekRowHtml(w.week_number, runByWeek[w.week_number] || [])).join('')}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2 class="panel-title">Meal templates</h2>
      ${mealTabsHtml(activeMealTab)}
      <div id="mealTemplatesContent"></div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Standing rules</h2>
      <ol class="plan-rules-list">
        ${rules.map((r) => `<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.detail)}</li>`).join('')}
      </ol>
    </section>
  `;

  function renderMealTab(){
    const tab = MEAL_DAY_TABS.find((t) => t.key === activeMealTab);
    qs('#mealTemplatesContent', main).innerHTML = mealDayHtml(tab.key, tab.heading, meals);
    wireMealAccordionToggles(qs('#mealTemplatesContent', main));
  }
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

  // Training split: one week's 7 days at a time instead of all 8 stacked in
  // one scroll. Defaults to whichever week contains today (falling back to
  // the block's first week), same "land somewhere real" idea as Today's own
  // date nav defaulting to today rather than the block start.
  if (weeks.length && (activeTrainingWeek === null || !weeks.some((w) => w.week_number === activeTrainingWeek))) {
    const today = todayStr();
    const currentWeek = weeks.find((w) => today >= w.start_date && today <= w.end_date);
    activeTrainingWeek = (currentWeek || weeks[0]).week_number;
  }

  function renderTrainingWeek(){
    if (!weeks.length) {
      qs('#trainingSplitContent', main).innerHTML = '<p class="section-note">No weeks defined for this block yet.</p>';
      return;
    }
    const week = weeks.find((w) => w.week_number === activeTrainingWeek);
    const canBack = weeks.some((w) => w.week_number < activeTrainingWeek);
    const canForward = weeks.some((w) => w.week_number > activeTrainingWeek);
    qs('#trainingSplitNav', main).innerHTML = trainingNavHtml(week, weeks.length, canBack, canForward);
    qs('#trainingSplitContent', main).innerHTML = weekTrainingHtml(week, sessions, runPlan);

    qs('#prevTrainingWeek', main).addEventListener('click', () => {
      const prevWeek = weeks.filter((w) => w.week_number < activeTrainingWeek).sort((a, b) => b.week_number - a.week_number)[0];
      if (!prevWeek) return;
      activeTrainingWeek = prevWeek.week_number;
      renderTrainingWeek();
    });
    qs('#nextTrainingWeek', main).addEventListener('click', () => {
      const nextWeek = weeks.filter((w) => w.week_number > activeTrainingWeek).sort((a, b) => a.week_number - b.week_number)[0];
      if (!nextWeek) return;
      activeTrainingWeek = nextWeek.week_number;
      renderTrainingWeek();
    });
  }
  renderTrainingWeek();
}
