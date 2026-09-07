import { db } from '../db.js';
import { state, getViewCurrency } from '../state.js';
import {
  qs, escapeHtml, formatMoney, convertToView,
  formatDayMonth, formatDateMed, formatTime, daysUntil
} from '../utils.js';

// The countdown and the four-leg stamp row live in the persistent masthead
// (visible on every screen, not just Overview) — see index.html and main.js.
export function renderMasthead(){
  renderCountdown();
  renderStamps();
}

function renderCountdown(){
  const slot = qs('#countdownSlot');
  if (!slot) return;
  const trip = state.trip;
  if (!trip) { slot.innerHTML = ''; return; }
  const toStart = daysUntil(trip.start_date);
  const toEnd = daysUntil(trip.end_date);
  if (toStart > 0) {
    slot.innerHTML = `<span class="num tabular">${toStart}</span><span class="unit">day${toStart === 1 ? '' : 's'} to departure</span>`;
  } else if (toStart <= 0 && toEnd >= 0) {
    const dayNum = Math.abs(toStart) + 1;
    slot.innerHTML = `<span class="num tabular">Day ${dayNum}</span><span class="unit">on the road</span>`;
  } else {
    slot.innerHTML = `<span class="num">Home</span><span class="unit">trip complete</span>`;
  }
}

function renderStamps(){
  const row = qs('#stampRow');
  if (!row || !state.legs.length) return;
  row.innerHTML = state.legs.map((leg) => {
    const isCurrent = leg.arrive_date && leg.depart_date &&
      daysUntil(leg.arrive_date) <= 0 && daysUntil(leg.depart_date) >= 0;
    const dates = leg.arrive_date && leg.depart_date
      ? `${formatDayMonth(leg.arrive_date)} – ${formatDayMonth(leg.depart_date)}`
      : 'Dates TBC';
    return `
      <div class="stamp ${isCurrent ? 'is-current' : ''}">
        <span class="stamp-no">Stop no. ${leg.sort_order}</span>
        <span class="stamp-city">${escapeHtml(leg.city)}</span>
        <span class="stamp-dates">${escapeHtml(dates)}</span>
      </div>`;
  }).join('');
}

function sharedElsewhereHtml(sharedLegs, sharedItems){
  return `
    <section class="section">
      <div class="section-head"><h2>Also there</h2><span class="section-note">Shared stops from someone else's trip</span></div>
      ${sharedLegs.map((leg) => {
        const items = sharedItems
          .filter((i) => i.leg_id === leg.id)
          .sort((a, b) => a.day === b.day ? a.sort_order - b.sort_order : a.day.localeCompare(b.day));
        const dates = leg.arrive_date && leg.depart_date
          ? `${formatDateMed(leg.arrive_date)} – ${formatDateMed(leg.depart_date)}`
          : 'Dates TBC';
        return `
          <div class="row-card">
            <div class="row-card-head">
              <div>
                <div class="row-card-title">${escapeHtml(leg.name)}</div>
                <div class="row-card-meta">${leg.trips ? escapeHtml(leg.trips.name) + ' &middot; ' : ''}${escapeHtml(dates)}</div>
              </div>
            </div>
            ${items.length ? `
              <ul class="list-plain" style="margin-top:10px;">
                ${items.map((i) => `<li><span>${escapeHtml(formatDateMed(i.day))}${i.start_time ? ' &middot; ' + escapeHtml(formatTime(i.start_time)) : ''} &mdash; ${escapeHtml(i.title)}</span></li>`).join('')}
              </ul>
            ` : '<p class="section-note" style="margin-top:8px;">Nothing planned there yet.</p>'}
          </div>`;
      }).join('')}
    </section>`;
}

export async function render(container){
  const [flights, accommodations, transport, checklistItems, sharedLegs, sharedItems] = await Promise.all([
    db.flights.list(state.trip.id),
    db.accommodations.list(state.trip.id),
    db.transport.list(state.trip.id),
    db.checklistItems.list(state.trip.id),
    db.legs.listSharedElsewhere(state.trip.id),
    db.itineraryItems.listSharedElsewhere(state.trip.id)
  ]);

  const trip = state.trip;
  const viewCurrency = getViewCurrency();
  const bookingRows = [...flights, ...accommodations, ...transport];

  let totalBudgeted = 0;
  let totalActual = 0;
  let totalUnbooked = 0;
  bookingRows.forEach((row) => {
    totalBudgeted += convertToView(row.budget_amount || 0, row.currency, trip, viewCurrency);
    totalActual += convertToView(row.actual_amount || 0, row.currency, trip, viewCurrency);
    if (row.status !== 'booked') {
      const best = row.actual_amount ?? row.budget_amount ?? 0;
      totalUnbooked += convertToView(best, row.currency, trip, viewCurrency);
    }
  });

  const openChecklist = checklistItems.filter((c) => !c.is_done);

  const upcomingDeadlines = accommodations
    .filter((a) => a.cancellation_deadline)
    .sort((a, b) => a.cancellation_deadline.localeCompare(b.cancellation_deadline));
  const nextDeadline = upcomingDeadlines[0];

  container.innerHTML = `
    <h1 class="sr-only">Trip overview</h1>
    <section class="section">
      <div class="section-head">
        <h2>Budget</h2>
        <span class="section-note">Flights, accommodation &amp; transport &middot; shown in ${viewCurrency}</span>
      </div>
      <div class="stat-grid">
        <div class="stat-tile">
          <div class="stat-label">Budgeted</div>
          <div class="stat-value tabular">${escapeHtml(formatMoney(totalBudgeted, viewCurrency))}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">Actual so far</div>
          <div class="stat-value tabular">${escapeHtml(formatMoney(totalActual, viewCurrency))}</div>
        </div>
        <div class="stat-tile is-callout">
          <div class="stat-label">Still unbooked</div>
          <div class="stat-value tabular">${escapeHtml(formatMoney(totalUnbooked, viewCurrency))}</div>
        </div>
      </div>
    </section>

    ${sharedLegs.length ? sharedElsewhereHtml(sharedLegs, sharedItems) : ''}

    <section class="section">
      <div class="section-head"><h2>Before you go</h2></div>
      <div class="notice">
        <div class="notice-row"><span>Open checklist items</span><b>${openChecklist.length}</b></div>
        <div class="notice-row"><span>Next cancellation deadline</span><b>${nextDeadline ? `${formatDateMed(nextDeadline.cancellation_deadline)} — ${escapeHtml(nextDeadline.name)}` : 'None set'}</b></div>
      </div>
    </section>
  `;
}
