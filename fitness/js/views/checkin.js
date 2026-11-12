// Surfaces every Monday: morning weight, leak count, one win, one challenge.
// Prior weeks' check-ins are readable below regardless of what day it is.
import { qs, qsa, escapeHtml, isoDow, formatDateShort, toast, friendlyError } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';

export async function render(main){
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const plan = state.plan;
  if (!plan) {
    main.innerHTML = '<div class="empty-state"><strong>No plan yet.</strong></div>';
    return;
  }
  const weeks = await db.planWeeks.list(plan.plan_version);
  // Before the plan starts, week 1 is shown so you can see what the first check-in looks like.
  const currentWeek = weeks.find((w) => state.currentDate >= w.start_date && state.currentDate <= w.end_date)
    || (state.currentDate > plan.end_date ? weeks[weeks.length - 1] : weeks[0]);
  const [checkins, oldCheckins] = await Promise.all([
    db.planCheckins.list(state.session.user.id, plan.plan_version),
    // Block 2's check-ins, kept as history below the new ones.
    db.blocks.getLatest().then((b) => (b ? db.weeklyCheckins.list(state.session.user.id, b.id) : [])).catch(() => [])
  ]);
  const checkinByWeek = Object.fromEntries(checkins.map((c) => [c.week_number, c]));
  const isMonday = isoDow(state.currentDate) === 1;
  const existing = currentWeek ? checkinByWeek[currentWeek.week_number] : null;
  const targetNote = currentWeek && currentWeek.weight_target_kg_monday != null
    ? `<p class="section-note">This Monday's target: <strong>${Number(currentWeek.weight_target_kg_monday).toFixed(1)} kg</strong>.</p>` : '';

  const formHtml = currentWeek ? `
    <section class="panel">
      <h2 class="panel-title">Week ${currentWeek.week_number} check-in</h2>
      ${targetNote}
      ${!isMonday ? '<p class="section-note">This surfaces automatically on Mondays — you can still fill it in early or catch up here any day.</p>' : ''}
      <form id="checkinForm" class="checkin-form">
        <label class="field-label" for="ciWeight">Morning weight (kg)</label>
        <input type="number" step="0.1" min="0" id="ciWeight" value="${existing && existing.weight_kg != null ? existing.weight_kg : ''}">

        <label class="field-label" for="ciLeaks">Leaks this week</label>
        <input type="number" step="1" min="0" id="ciLeaks" value="${existing && existing.leak_count != null ? existing.leak_count : ''}">

        <label class="field-label" for="ciWin">One win</label>
        <textarea id="ciWin" rows="2">${escapeHtml(existing ? existing.win || '' : '')}</textarea>

        <label class="field-label" for="ciChallenge">One thing that was hard</label>
        <textarea id="ciChallenge" rows="2">${escapeHtml(existing ? existing.challenge || '' : '')}</textarea>

        <button type="submit" class="btn btn-primary">${existing ? 'Update check-in' : 'Save check-in'}</button>
        <span class="save-status" id="checkinStatus" aria-live="polite"></span>
      </form>
    </section>` : '';

  const historyRows = (list, label) => list.map((c) => `
          <li class="checkin-history-row">
            <div class="checkin-history-head">
              <strong>${label} ${c.week_number}</strong>
              <span>${c.weight_kg != null ? `${c.weight_kg}kg` : 'no weight'} · ${c.leak_count != null ? `${c.leak_count} leak${c.leak_count === 1 ? '' : 's'}` : 'no leak count'}</span>
            </div>
            ${c.win ? `<p class="checkin-history-line"><strong>Win:</strong> ${escapeHtml(c.win)}</p>` : ''}
            ${c.challenge ? `<p class="checkin-history-line"><strong>Hard:</strong> ${escapeHtml(c.challenge)}</p>` : ''}
          </li>`).join('');
  const historyHtml = checkins.length || oldCheckins.length ? `
    <section class="panel">
      <h2 class="panel-title">Previous check-ins</h2>
      <ul class="checkin-history">
        ${historyRows(checkins, 'Week')}
        ${historyRows(oldCheckins, 'Block 2 · Week')}
      </ul>
    </section>` : '';

  main.innerHTML = formHtml + historyHtml;

  const form = qs('#checkinForm', main);
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = qs('#checkinStatus', main);
      statusEl.textContent = 'Saving…';
      const fields = {
        weight_kg: qs('#ciWeight', main).value === '' ? null : Number(qs('#ciWeight', main).value),
        leak_count: qs('#ciLeaks', main).value === '' ? null : Number(qs('#ciLeaks', main).value),
        win: qs('#ciWin', main).value,
        challenge: qs('#ciChallenge', main).value
      };
      try {
        await db.planCheckins.upsert(state.session.user.id, plan.plan_version, currentWeek.week_number, fields);
        statusEl.textContent = 'Saved';
        toast('Check-in saved');
        render(main);
      } catch (err) {
        statusEl.textContent = "Couldn't save — try again.";
        toast(friendlyError(err));
      }
    });
  }
}
