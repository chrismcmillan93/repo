// Printable itinerary export -- either the whole trip or a single leg,
// merging itinerary items, flights, accommodation and transport into one
// day-by-day timeline. No PDF library: this repo has no build step, so the
// document is opened as a standalone page in a new tab with its own
// self-contained print stylesheet, and window.print() lets the browser's
// own "Save as PDF" do the actual conversion.
import { db } from './db.js';
import { state } from './state.js';
import { escapeHtml, formatMoney, formatDateFull, formatDateMed, dateRange, toast } from './utils.js';

const TYPE_LABEL = { fixed: 'Fixed', planned: 'Planned', idea: 'Idea' };
const TRANSPORT_LABEL = { hire_car: 'Hire car', transfer: 'Transfer', rideshare: 'Rideshare', rail: 'Rail', other: 'Transport' };

function legForDay(day, legs){
  return legs.find((l) => l.arrive_date && l.depart_date && day >= l.arrive_date && day <= l.depart_date) || null;
}

function pdLine(time, html){ return { time: time || '12:00', html }; }

// One day's events, gathered from every source and interleaved by time.
// Flights/accommodation/transport are trip-wide (not leg-scoped in the
// schema), so this matches purely on date -- correct whether `day` comes
// from a whole-trip range or a single leg's range, with no risk of the
// same booking appearing twice the way leg-scoped sections would at a
// shared boundary date (e.g. a flight day that's both "last day here" and
// "first day there").
function buildDayLines(day, data){
  const lines = [];

  data.itineraryItems
    // An unpicked choice-group alternative isn't part of the plan (see
    // costs.js / overview.js for the same rule).
    .filter((i) => i.day === day && i.is_selected !== false)
    .forEach((i) => {
      const time = i.start_time ? i.start_time.slice(0, 5) : '';
      const timeRange = time ? `${time}${i.end_time ? '–' + i.end_time.slice(0, 5) : ''}` : 'All day';
      lines.push(pdLine(time, `
        <div class="pd-line"><span class="pd-time">${escapeHtml(timeRange)}</span>
        <div class="pd-body"><b>${escapeHtml(i.title)}</b> <span class="pd-tag">${escapeHtml(TYPE_LABEL[i.type] || i.type)}</span>
        ${i.notes ? `<br>${escapeHtml(i.notes)}` : ''}
        ${i.estimated_cost ? `<br><small>${escapeHtml(formatMoney(i.estimated_cost, i.currency))}</small>` : ''}</div></div>`));
    });

  data.flights.forEach((f) => {
    const route = `${f.from_airport || f.from_city || '?'} → ${f.to_airport || f.to_city || '?'}`;
    if (f.depart_at && f.depart_at.slice(0, 10) === day) {
      const time = f.depart_at.slice(11, 16);
      lines.push(pdLine(time, `
        <div class="pd-line"><span class="pd-time">${escapeHtml(time)}</span>
        <div class="pd-body"><b>Flight — ${escapeHtml(f.label)}</b><br>${escapeHtml(route)}${f.flight_number ? ' &middot; ' + escapeHtml(f.flight_number) : ''}${f.booking_reference ? ' &middot; Ref ' + escapeHtml(f.booking_reference) : ''}</div></div>`));
    } else if (f.arrive_at && f.arrive_at.slice(0, 10) === day) {
      const time = f.arrive_at.slice(11, 16);
      lines.push(pdLine(time, `
        <div class="pd-line"><span class="pd-time">${escapeHtml(time)}</span>
        <div class="pd-body"><b>Lands — ${escapeHtml(f.label)}</b><br>${escapeHtml(route)}</div></div>`));
    }
  });

  data.accommodations.forEach((a) => {
    if (a.check_in === day) {
      lines.push(pdLine('00:01', `
        <div class="pd-line"><span class="pd-time">Check in</span>
        <div class="pd-body"><b>${escapeHtml(a.name)}</b>${a.address ? `<br><small>${escapeHtml(a.address)}</small>` : ''}${a.booking_reference ? `<br><small>Ref ${escapeHtml(a.booking_reference)}</small>` : ''}</div></div>`));
    }
    if (a.check_out === day) {
      lines.push(pdLine('23:58', `
        <div class="pd-line"><span class="pd-time">Check out</span>
        <div class="pd-body"><b>${escapeHtml(a.name)}</b></div></div>`));
    }
  });

  data.transport.forEach((t) => {
    const label = TRANSPORT_LABEL[t.type] || t.type;
    if (t.pickup_at && t.pickup_at.slice(0, 10) === day) {
      const time = t.pickup_at.slice(11, 16);
      lines.push(pdLine(time, `
        <div class="pd-line"><span class="pd-time">${escapeHtml(time)}</span>
        <div class="pd-body"><b>${escapeHtml(label)}${t.provider ? ' &middot; ' + escapeHtml(t.provider) : ''}</b><br>${escapeHtml(t.pickup_location || 'Pickup TBC')} → ${escapeHtml(t.dropoff_location || 'Dropoff TBC')}</div></div>`));
    } else if (t.dropoff_at && t.dropoff_at.slice(0, 10) === day) {
      const time = t.dropoff_at.slice(11, 16);
      lines.push(pdLine(time, `
        <div class="pd-line"><span class="pd-time">${escapeHtml(time)}</span>
        <div class="pd-body"><b>${escapeHtml(label)} drop-off${t.provider ? ' &middot; ' + escapeHtml(t.provider) : ''}</b><br>${escapeHtml(t.dropoff_location || 'Dropoff TBC')}</div></div>`));
    }
  });

  lines.sort((a, b) => a.time.localeCompare(b.time));
  return lines;
}

function buildDaySection(day, legs, data){
  const leg = legForDay(day, legs);
  const lines = buildDayLines(day, data);
  return `
    <div class="pd-day">
      <div class="pd-day-head">${escapeHtml(formatDateFull(day))}${leg ? ` &middot; ${escapeHtml(leg.city)}` : ''}</div>
      ${lines.length ? lines.map((l) => l.html).join('') : '<p class="pd-empty">Nothing scheduled.</p>'}
    </div>`;
}

const DOC_STYLE = `
  :root{ --ink:#241D15; --navy:#1B2A4A; --red:#C8362E; --rule:#ddd; }
  *{ box-sizing:border-box; }
  body{ font-family: Georgia, 'Times New Roman', serif; color:var(--ink); margin:0; padding:32px 40px; }
  h1{ font-family: Georgia, serif; font-size:26px; margin:0 0 4px; }
  .pd-sub{ color:#666; font-size:13px; margin:0 0 28px; }
  .pd-day{ margin-bottom:16px; page-break-inside: avoid; }
  .pd-day-head{ font-weight:bold; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--red); border-bottom:2px solid var(--navy); padding-bottom:4px; margin-bottom:8px; }
  .pd-line{ display:flex; gap:14px; padding:6px 0; border-bottom:1px dotted var(--rule); font-size:13px; }
  .pd-line:last-child{ border-bottom:none; }
  .pd-time{ flex:0 0 60px; font-weight:bold; color:var(--navy); }
  .pd-body{ flex:1; line-height:1.45; }
  .pd-body small{ color:#666; }
  .pd-tag{ font-size:10px; text-transform:uppercase; letter-spacing:.03em; color:#888; border:1px solid #ccc; border-radius:3px; padding:1px 5px; }
  .pd-empty{ font-size:12px; color:#999; font-style:italic; margin:0; padding:6px 0; }
  @media print{ body{ padding:0 20px; } }
`;

function buildDoc(title, subtitle, days, legs, data){
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${DOC_STYLE}</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="pd-sub">${escapeHtml(subtitle)}</p>
  ${days.map((d) => buildDaySection(d, legs, data)).join('')}
</body></html>`;
}

async function fetchAllData(tripId){
  const [flights, accommodations, transport, itineraryItems] = await Promise.all([
    db.flights.list(tripId), db.accommodations.list(tripId), db.transport.list(tripId), db.itineraryItems.list(tripId)
  ]);
  return { flights, accommodations, transport, itineraryItems };
}

function openPrintable(html){
  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to export a PDF'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before invoking print --
  // calling it synchronously can race the write above in some browsers.
  win.setTimeout(() => win.print(), 300);
}

export async function exportTripPdf(){
  const trip = state.trip;
  if (!trip) return;
  const data = await fetchAllData(trip.id);
  const days = dateRange(trip.start_date, trip.end_date);
  const subtitle = `${formatDateMed(trip.start_date)} – ${formatDateMed(trip.end_date)} · full itinerary`;
  openPrintable(buildDoc(trip.name, subtitle, days, state.legs, data));
}

export async function exportLegPdf(leg){
  const trip = state.trip;
  if (!trip) return;
  if (!leg.arrive_date || !leg.depart_date) {
    toast('Set arrival and departure dates on this stop first');
    return;
  }
  const data = await fetchAllData(trip.id);
  const days = dateRange(leg.arrive_date, leg.depart_date);
  const subtitle = `${formatDateMed(leg.arrive_date)} – ${formatDateMed(leg.depart_date)} · part of ${trip.name}`;
  openPrintable(buildDoc(leg.name, subtitle, days, state.legs, data));
}
