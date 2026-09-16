// The full block, read-only: goal, dates, week-by-week run progression,
// lift prescriptions, meal templates per day type, and the standing rules.
import { qs, qsa, escapeHtml, formatDateShort } from '../utils.js';
import { db } from '../db.js';

const DOW_LABEL = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

function mealTableHtml(dayType, label, meals){
  const rows = meals
    .filter((m) => m.day_type === dayType && m.week_number === null)
    .sort((a, b) => a.slot_order - b.slot_order)
    .map((m) => `
      <tr>
        <td>${escapeHtml(m.time_label)}</td>
        <td>${escapeHtml(m.name)}${m.notes ? `<div class="plan-meal-note">${escapeHtml(m.notes)}</div>` : ''}</td>
        <td>${m.kcal} kcal</td>
        <td>${m.protein_g}g</td>
      </tr>`).join('');
  return `
    <div class="plan-meal-block">
      <h3 class="plan-subhead">${escapeHtml(label)}</h3>
      <table class="plan-table"><tbody>${rows}</tbody></table>
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
  const exercises = (session.session_exercises || []).slice().sort((a, b) => a.order_num - b.order_num);
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
      ${exercises.length ? `<ul class="plan-exercise-list">${exercises.map((ex) => `<li>${escapeHtml(ex.name)} — ${escapeHtml(ex.prescription)}</li>`).join('')}</ul>` : ''}
    </li>`;
}

// One resolved session per day, grouped by week -- not a raw dump of every
// session_templates row (which would show a week's override *and* the
// standing default it replaces, side by side, for the same day).
function weekTrainingHtml(week, sessions, runPlan){
  const days = [1, 2, 3, 4, 5, 6, 7]
    .map((dow) => sessionDayRowHtml(dow, resolveSession(dow, week.week_number, sessions), resolveRun(dow, week.week_number, runPlan)))
    .join('');
  return `
    <div class="plan-week-block">
      <h3 class="plan-subhead">Week ${week.week_number}${week.focus ? ` — ${escapeHtml(week.focus)}` : ''}</h3>
      <ul class="plan-session-list">${days}</ul>
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
      ${weeks.map((w) => weekTrainingHtml(w, sessions, runPlan)).join('')}
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
      ${mealTableHtml('lift', 'Lift days (Mon / Wed / Fri)', meals)}
      ${mealTableHtml('run', 'Run days (Tue / Thu / Sat)', meals)}
      ${mealTableHtml('rest', 'Rest day (Sun)', meals)}
    </section>

    <section class="panel">
      <h2 class="panel-title">Standing rules</h2>
      <ol class="plan-rules-list">
        ${rules.map((r) => `<li><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.detail)}</li>`).join('')}
      </ol>
    </section>
  `;
}
