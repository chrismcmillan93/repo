// Every race in the Edale 50km plan, plus any you add yourself, with a
// days-only countdown and a place to record the finish time once the race has
// happened. Plan races are read-only; races you add are yours (only you can see
// them) and can be deleted. Every race has a Booked tick. Finish times are your own
// (race_results).
import { qs, qsa, escapeHtml, formatDateFull, daysUntil, countdownLabel,
  formatFinishTime, parseFinishTime, toast, friendlyError, renderStatusPill } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';

function raceCardHtml(race, result, booked){
  const days = daysUntil(race.race_date);
  const canRecord = days <= 0;
  const year = race.race_date.slice(0, 4);
  const mine = !!race.user_id;
  const big = days > 0 ? `<span class="race-days-num">${days}</span><span class="race-days-unit">${days === 1 ? 'day' : 'days'}</span>`
    : days === 0 ? '<span class="race-days-num race-days-today">Today</span>'
    : `<span class="race-days-num race-days-past">${Math.abs(days)}</span><span class="race-days-unit">${Math.abs(days) === 1 ? 'day ago' : 'days ago'}</span>`;
  const detail = [race.distance_label, race.role].filter(Boolean).join(' · ');
  return `
    <li class="race-card" data-race-id="${escapeHtml(race.id)}">
      <div class="race-card-top">
        <div class="race-card-info">
          <h3 class="race-name">${escapeHtml(race.name)}</h3>
          <div class="race-date">${escapeHtml(formatDateFull(race.race_date))} ${escapeHtml(year)}${race.start_time ? ` · ${escapeHtml(race.start_time)}` : ''}</div>
          ${detail ? `<div class="race-role">${escapeHtml(detail)}</div>` : ''}
          <label class="race-booked"><input type="checkbox" class="race-booked-box" ${booked ? 'checked' : ''}><span>Booked</span></label>
          ${mine ? '<span class="race-mine">Added by you</span>' : ''}
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
      ${mine ? '<button type="button" class="btn btn-quiet race-delete">Delete this race</button>' : ''}
    </li>`;
}

function addFormHtml(){
  return `
    <section class="panel">
      <details class="race-add" id="raceAdd">
        <summary class="race-add-summary">＋ Add a race</summary>
        <form id="raceAddForm" class="race-add-form" autocomplete="off">
          <label class="swap-field"><span>Name</span><input type="text" id="raceName" required maxlength="120" placeholder="e.g. Preston 10K"></label>
          <label class="swap-field"><span>Date</span><input type="date" id="raceDate" required></label>
          <label class="swap-field"><span>Start time (optional)</span><input type="time" id="raceTime"></label>
          <label class="swap-field"><span>Distance (optional)</span><input type="text" id="raceDistance" maxlength="40" placeholder="e.g. 10K, half, 50 mi"></label>
          <label class="race-booked"><input type="checkbox" id="raceBooked"><span>Booked</span></label>
          <div class="swap-actions">
            <button type="submit" class="btn btn-primary" id="raceAddSave">Add race</button>
            <span class="save-status" id="raceAddStatus" aria-live="polite"></span>
          </div>
        </form>
      </details>
    </section>`;
}

export async function render(main){
  if (!state.plan) state.plan = await db.trainingPlans.get('v2').catch(() => null);
  const plan = state.plan;
  if (!plan) {
    main.innerHTML = '<div class="empty-state"><strong>No races yet.</strong><p>The training plan has not been loaded.</p></div>';
    return;
  }
  const [races, results, bookedRows] = await Promise.all([
    db.races.list(plan.plan_version),
    db.raceResults.list(state.session.user.id).catch(() => []),
    db.raceBooked.list(state.session.user.id).catch(() => [])
  ]);
  const resultByRace = Object.fromEntries(results.map((r) => [r.race_id, r]));
  // Your tick wins; with no tick, a race counts as booked only if it is marked entered (the Edale 50km).
  const bookedOverride = Object.fromEntries(bookedRows.map((r) => [r.race_id, r.booked]));
  const isBooked = (race) => (race.id in bookedOverride ? bookedOverride[race.id] : race.status === 'entered');
  const summaryText = () => {
    const n = races.filter(isBooked).length;
    return `${races.length} races. ${n ? `${n} booked, the rest not booked yet.` : 'None booked yet.'}`;
  };

  main.innerHTML = `
    ${addFormHtml()}
    <section class="panel">
      <h2 class="panel-title">Races</h2>
      <p class="panel-summary" id="raceSummary">${summaryText()}</p>
      <ul class="race-list">${races.map((r) => raceCardHtml(r, resultByRace[r.id], isBooked(r))).join('')}</ul>
    </section>`;

  wireAddForm(main);

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

    // Booked tick: saved per user, applied in place (no page reload).
    const box = qs('.race-booked-box', card);
    box.addEventListener('change', async () => {
      const want = box.checked;
      try {
        await db.raceBooked.set(state.session.user.id, raceId, want);
        bookedOverride[raceId] = want;
        qs('#raceSummary', main).textContent = summaryText();
      } catch (err) {
        box.checked = !want;
        toast(`Couldn't save — ${friendlyError(err)}.`);
      }
    });

    // Your own races can also be deleted.
    const del = qs('.race-delete', card);
    if (del) {
      del.addEventListener('click', async () => {
        const name = qs('.race-name', card).textContent;
        if (!window.confirm(`Delete "${name}"? Any finish time you saved for it goes too.`)) return;
        try {
          await db.races.remove(state.session.user.id, raceId);
          render(main);
        } catch (err) { toast(`Couldn't delete — ${friendlyError(err)}.`); }
      });
    }
  });
}

function wireAddForm(main){
  const form = qs('#raceAddForm', main);
  const statusEl = qs('#raceAddStatus', main);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = qs('#raceName', main).value.trim();
    const date = qs('#raceDate', main).value;
    if (!name || !date) { toast('A race needs a name and a date.'); return; }
    const race = {
      plan_version: state.plan.plan_version,
      race_date: date,
      start_time: qs('#raceTime', main).value || null,
      name,
      distance_label: qs('#raceDistance', main).value.trim() || null,
      status: qs('#raceBooked', main).checked ? 'entered' : 'planned',
      sort_order: 100
    };
    renderStatusPill(statusEl, 'saving');
    try {
      await db.races.create(state.session.user.id, race);
      render(main);
    } catch (err) {
      renderStatusPill(statusEl, 'queued', () => form.requestSubmit());
      const dup = /duplicate|unique/i.test(err.message || '');
      toast(dup ? 'You already have a race with that name on that date.' : `Couldn't add the race — ${friendlyError(err)}.`);
    }
  });
}
