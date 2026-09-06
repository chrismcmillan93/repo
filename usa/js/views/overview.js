import { db } from '../db.js';
import { state } from '../state.js';
import {
  escapeHtml, formatMoney, convertToView,
  formatDateShort, formatDateMed, daysUntil
} from '../utils.js';
import { getViewCurrency } from '../state.js';

function flagSvg(){
  return `
  <svg class="hero-flag" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <g transform="translate(60,-140) rotate(10)">
      ${[0,1,2,3,4,5,6].map((i) => `<rect x="-150" y="${i * 54}" width="900" height="27" fill="#B3373C"></rect>`).join('')}
    </g>
    <g transform="translate(-90,-70)">
      <rect x="0" y="0" width="280" height="190" fill="#16233D"></rect>
      ${Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 6 }).map((_, col) =>
          `<circle cx="${28 + col * 44}" cy="${26 + row * 34}" r="5" fill="#EDE7D9"></circle>`
        ).join('')
      ).join('')}
    </g>
  </svg>`;
}

function countdownBlock(trip){
  if (!trip) return '';
  const toStart = daysUntil(trip.start_date);
  const toEnd = daysUntil(trip.end_date);
  if (toStart > 0) {
    return `
      <div class="countdown">
        <span class="num tabular">${toStart}</span>
        <span class="unit">day${toStart === 1 ? '' : 's'} to departure</span>
      </div>`;
  }
  if (toStart <= 0 && toEnd >= 0) {
    const dayNum = Math.abs(toStart) + 1;
    return `
      <div class="countdown">
        <span class="num tabular">Day ${dayNum}</span>
        <span class="unit">on the road</span>
      </div>`;
  }
  return `
    <div class="countdown">
      <span class="num">Home</span>
      <span class="unit">trip complete</span>
    </div>`;
}

function routeBand(trip, legs){
  if (!legs.length) return '';
  return `
    <div class="route">
      ${legs.map((leg) => {
        const isCurrent = leg.arrive_date && leg.depart_date &&
          daysUntil(leg.arrive_date) <= 0 && daysUntil(leg.depart_date) >= 0;
        const dates = leg.arrive_date && leg.depart_date
          ? `${formatDateShort(leg.arrive_date)} – ${formatDateShort(leg.depart_date)}`
          : 'Dates TBC';
        return `
          <div class="route-stop ${isCurrent ? 'is-current' : ''}">
            <span class="route-line"></span>
            <span class="route-num">${leg.sort_order}</span>
            <span class="route-name">${escapeHtml(leg.city)}</span>
            <span class="route-dates">${escapeHtml(dates)}</span>
          </div>`;
      }).join('')}
    </div>`;
}

export async function render(container){
  const [flights, accommodations, transport, checklistItems] = await Promise.all([
    db.flights.list(),
    db.accommodations.list(),
    db.transport.list(),
    db.checklistItems.list()
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
    <section class="hero">
      ${flagSvg()}
      <div class="hero-content">
        <h1 class="sr-only">Trip overview</h1>
        <p class="hero-eyebrow">${trip ? escapeHtml(trip.name) : 'USA 2027'} &middot; ${trip ? formatDateMed(trip.start_date) + ' – ' + formatDateMed(trip.end_date) : ''}</p>
        ${countdownBlock(trip)}
        ${routeBand(trip, state.legs)}
      </div>
    </section>

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

    <section class="section">
      <div class="section-head"><h2>Outstanding</h2></div>
      <ul class="list-plain">
        <li>
          <span>Checklist items open</span>
          <strong class="tabular">${openChecklist.length}</strong>
        </li>
        <li>
          <span>Next cancellation deadline</span>
          <strong>${nextDeadline ? `${formatDateMed(nextDeadline.cancellation_deadline)} — ${escapeHtml(nextDeadline.name)}` : 'None set'}</strong>
        </li>
      </ul>
    </section>
  `;
}
