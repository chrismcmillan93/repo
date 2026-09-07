import { db } from '../db.js';
import { state, getViewCurrency } from '../state.js';
import {
  qs, escapeHtml, formatMoney, convertToView,
  formatDayMonth, formatDateMed, formatTime, daysUntil, typePillClass
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

// A shared item's cost is shown in its own native currency, never converted
// through this trip's fx_rate -- it's someone else's spend, on someone
// else's trip, and applying our rate to it would misrepresent their figure.
function sharedItemHtml(item){
  const place = item.places || null;
  const timeText = item.start_time ? `${formatTime(item.start_time)}${item.end_time ? '–' + formatTime(item.end_time) : ''}` : '';
  return `
    <li class="shared-item">
      <div class="shared-item-head">
        <span class="shared-item-date">${escapeHtml(formatDateMed(item.day))}${timeText ? ' &middot; ' + escapeHtml(timeText) : ''}</span>
        <span class="pill ${typePillClass(item.type)}">${escapeHtml(item.type)}</span>
      </div>
      <div class="shared-item-title">${escapeHtml(item.title)}</div>
      ${place ? `<div class="row-card-meta">${escapeHtml(place.name)}${place.address ? ' &middot; ' + escapeHtml(place.address) : ''}${place.rating ? ` &middot; ★ ${escapeHtml(String(place.rating))}` : ''}${place.maps_url ? ` &middot; <a href="${escapeHtml(place.maps_url)}" target="_blank" rel="noopener">Map</a>` : ''}</div>` : ''}
      ${item.notes ? `<div class="row-card-meta">${escapeHtml(item.notes)}</div>` : ''}
      ${item.estimated_cost ? `<div class="row-card-meta">${escapeHtml(formatMoney(item.estimated_cost, item.currency))}</div>` : ''}
    </li>`;
}

function sharedElsewhereHtml(sharedLegs, sharedItems){
  return `
    <section class="section">
      <div class="section-head"><h2>Also there</h2><span class="section-note">Shared stops from someone else's trip</span></div>
      ${sharedLegs.map((leg) => {
        const items = sharedItems
          // An unpicked choice-group alternative isn't part of the plan --
          // same rule as the cost totals (see costs.js).
          .filter((i) => i.leg_id === leg.id && i.is_selected !== false)
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
              <ul class="list-plain shared-item-list" style="margin-top:10px;">
                ${items.map(sharedItemHtml).join('')}
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
