// Every race in the Edale 50km plan with a days-only countdown, and a place
// to record the finish time once the race has happened. Races are read-only
// plan data; finish times are the signed-in user's own (race_results).
import { qs, qsa, escapeHtml, formatDateFull, daysUntil, countdownLabel,
  formatFinishTime, parseFinishTime, toast, friendlyError, renderStatusPill } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';

const STATUS_LABEL = { planned: 'Planned', entered: 'Entered' };

function raceCardHtml(race, result){
  const days = daysUntil(race.race_date);
  const canRecord = days <= 0;
  const year = race.race_date.slice(0, 4);
  const big = days > 0 ? `<span class="race-days-num">${days}</span><span class="race-days-unit">${days === 1 ? 'day' : 'days'}</span>`
    : days === 0 ? '<span class="race-days-num race-days-today">Today</span>'
    : `<span class="race-days-num race-days-past">${Math.abs(days)}</span><span class="race-days-unit">${Math.abs(days) === 1 ? 'day ago' : 'days ago'}</span>`;
  return `
    <li class="race-card" data-race-id="${escapeHtml(race.id)}">
      <div class="race-card-top">
        <div class="race-card-info">
          <h3 class="race-name">${escapeHtml(race.name)}</h3>
          <div class="race-date">${escapeHtml(formatDateFull(race.race_date))} ${escapeHtml(year)}${race.start_time ? ` · ${escapeHtml(race.start_time)}` : ''}</div>
          ${race.role ? `<div class="race-role">${escapeHtml(race.role)}</div>` : ''}
          <span class="race-status race-status-${escapeHtml(race.status)}">${escapeHtml(STATUS_LABEL[race.status] || race.status)}</span>
        </div>
        <div class="race-countdown-box" aria-label="${escapeHtml(countdownLabel(days))}">${big}</div>
      </div>
      <div class="race-result">
        <label class="race-result-label" for="finish-${escapeHtml(race.id)}">Finish time</label>
        <div class="race-result-row">
          <input type="text" inputmode="numeric" autocomplete="off" class="race-result-input" id="finish-${escapeHtml(race.id)}"
            placeholder="${canRecord ? 'h:mm:ss' : 'Open on race day'}" value="${result ? escapeHtml(formatFinishTime(result.finish_time_seconds)) : ''}" ${canRecord ? '' : 'disabled'}>
          <button type="button" class="btn btn-primary race-result-save" ${canRecord ? '' : 'disabled'}>Save</button>
          ${result ? '<button type="button" class="btn btn-quiet race-result-clear">Clear</button>' : ''}
        </div>
        <span class="save-status race-result-status" aria-live="polite"></span>
      </div>
    </li>`;
}

export async function render(main){
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const plan = state.plan;
  if (!plan) {
    main.innerHTML = '<div class="empty-state"><strong>No races yet.</strong><p>The training plan has not been loaded.</p></div>';
    return;
  }
  const [races, results] = await Promise.all([
    db.races.list(plan.plan_version),
    db.raceResults.list(state.session.user.id).catch(() => [])
  ]);
  const resultByRace = Object.fromEntries(results.map((r) => [r.race_id, r]));

  main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Races</h2>
      <p class="panel-summary">${races.length} races on the way to Edale. All planned, none booked yet.</p>
      <ul class="race-list">${races.map((r) => raceCardHtml(r, resultByRace[r.id])).join('')}</ul>
    </section>`;

  qsa('.race-card', main).forEach((card) => {
    const raceId = card.dataset.raceId;
    const input = qs('.race-result-input', card);
    const statusEl = qs('.race-result-status', card);
    const saveBtn = qs('.race-result-save', card);
    const clearBtn = qs('.race-result-clear', card);

    async function save(){
      const seconds = parseFinishTime(input.value);
      if (seconds === null) {
        toast('Enter the time as h:mm:ss (or mm:ss).');
        return;
      }
      renderStatusPill(statusEl, 'saving');
      try {
        const saved = await db.raceResults.upsert(state.session.user.id, raceId, seconds, null);
        resultByRace[raceId] = saved;
        input.value = formatFinishTime(saved.finish_time_seconds);
        renderStatusPill(statusEl, 'saved');
        if (!qs('.race-result-clear', card)) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-quiet race-result-clear';
          b.textContent = 'Clear';
          b.addEventListener('click', clear);
          saveBtn.after(b);
        }
      } catch (err) {
        renderStatusPill(statusEl, 'queued', save);
        toast(`Couldn't save — ${friendlyError(err)}.`);
      }
    }

    async function clear(){
      renderStatusPill(statusEl, 'saving');
      try {
        await db.raceResults.remove(state.session.user.id, raceId);
        delete resultByRace[raceId];
        input.value = '';
        const b = qs('.race-result-clear', card);
        if (b) b.remove();
        renderStatusPill(statusEl, 'saved');
      } catch (err) {
        toast(`Couldn't clear — ${friendlyError(err)}.`);
      }
    }

    saveBtn.addEventListener('click', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    if (clearBtn) clearBtn.addEventListener('click', clear);
  });
}
