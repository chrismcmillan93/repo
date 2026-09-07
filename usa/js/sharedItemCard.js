// Rendering for a "shared elsewhere" itinerary item -- someone else's plan
// on a leg they've marked shared with everyone else signed in (see
// usa.legs.is_shared in CLAUDE.md). Used by both the Overview "Also there"
// section and the Itinerary per-day badge, so the same card looks the same
// wherever it shows up.
import { escapeHtml, formatMoney, formatDateMed, formatTime, typePillClass } from './utils.js';

// Whose plan this is: the traveller's own name if they've set one, falling
// back to their trip's name (older trips created before traveller_name
// existed), and finally a generic label so this never renders blank.
export function travellerLabel(item){
  const trip = item.trips;
  return (trip && (trip.traveller_name || trip.name)) || 'Someone';
}

// A shared item's cost/time show as entered -- cost is never converted
// through this trip's fx_rate, since it's someone else's spend on someone
// else's trip. `showDate` is off when the caller already displays the date
// via its own context (e.g. one day's group in the Itinerary view).
export function sharedItemHtml(item, { showDate = true } = {}){
  const place = item.places || null;
  const timeText = item.start_time ? `${formatTime(item.start_time)}${item.end_time ? '–' + formatTime(item.end_time) : ''}` : '';
  const dateText = showDate ? formatDateMed(item.day) : '';
  return `
    <li class="shared-item">
      <div class="shared-item-head">
        <span class="shared-item-date">${escapeHtml(dateText)}${dateText && timeText ? ' &middot; ' : ''}${escapeHtml(timeText)}</span>
        <span class="pill ${typePillClass(item.type)}">${escapeHtml(item.type)}</span>
      </div>
      <div class="shared-item-title">${escapeHtml(item.title)}</div>
      ${place ? `<div class="row-card-meta">${escapeHtml(place.name)}${place.address ? ' &middot; ' + escapeHtml(place.address) : ''}${place.rating ? ` &middot; ★ ${escapeHtml(String(place.rating))}` : ''}${place.maps_url ? ` &middot; <a href="${escapeHtml(place.maps_url)}" target="_blank" rel="noopener">Map</a>` : ''}</div>` : ''}
      ${item.notes ? `<div class="row-card-meta">${escapeHtml(item.notes)}</div>` : ''}
      ${item.estimated_cost ? `<div class="row-card-meta">${escapeHtml(formatMoney(item.estimated_cost, item.currency))}</div>` : ''}
    </li>`;
}
