// Printable itinerary export. Same approach as usa/js/print.js: no PDF
// library, no build step — build a standalone HTML document with its own
// print stylesheet, open it in a new tab, and let the browser's own
// "Save as PDF" (via window.print()) do the actual conversion.
//
// Unlike usa's flights/accommodations/transport (trip-wide, date-matched
// against a real `date` column), this schema's days are free-text labels
// ("13 Nov") and accommodations/items are leg-scoped, not date-scoped — so
// this reuses the exact same day-by-day, time-ordered timeline the on-screen
// Itinerary view uses (dayTimeline in utils.js) rather than re-deriving it,
// and places flights in one list up top and each leg's accommodation once
// per leg rather than trying to match free-text dates.
import { state } from './state.js';
import { esc, dayTimeline, STATUS_COLOR, toast } from './utils.js';

function dayEntries(legId, day) {
  return state.itineraryEntries
    .filter((e) => e.leg_id === legId && e.day_label === day)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function statusBadge(status) {
  return status ? `<span class="pd-tag" style="border-color:${STATUS_COLOR[status] || STATUS_COLOR.PROPOSED};color:${STATUS_COLOR[status] || STATUS_COLOR.PROPOSED};">${esc(status)}</span>` : '';
}

function descHtml(e) {
  return e.description ? `<div class="pd-desc">${esc(e.description)}</div>` : '';
}

function entryLineHtml(e, cls) {
  return `<div class="pd-line ${cls}"><span class="pd-time">${esc(e.time_label || '—')}</span>
    <div class="pd-body">${esc(e.text)}${statusBadge(e.status)}${descHtml(e)}</div></div>`;
}

function rowHtml(row) {
  if (row.type === 'choice') {
    const chosen = row.group.options.find((e) => e.is_selected) || row.group.options[0];
    const other = row.group.options.find((e) => e !== chosen);
    return entryLineHtml(chosen, 'pd-main') +
      (other ? `<div class="pd-alt">Not chosen: ${esc(other.text)}</div>` : '');
  }
  if (row.type === 'main') return entryLineHtml(row.entry, 'pd-main');
  if (row.type === 'transit') return `<div class="pd-line pd-transit"><span class="pd-time">🚗</span><div class="pd-body">${esc(row.entry.text)}${descHtml(row.entry)}</div></div>`;
  return entryLineHtml(row.entry, '');
}

function daySectionHtml(leg, day) {
  const entries = dayEntries(leg.id, day);
  const { rows, dayStatus } = dayTimeline(entries);

  return `<div class="pd-day">
    <div class="pd-day-head">${esc(day)}${dayStatus ? statusBadge(dayStatus) : ''}</div>
    ${rows.length ? rows.map(rowHtml).join('') : '<p class="pd-empty">Nothing scheduled.</p>'}
  </div>`;
}

function legAccommodationHtml(leg) {
  const a = state.accommodations.find((x) => x.leg_id === leg.id);
  if (!a) return '';
  return `<div class="pd-accom"><b>${esc(a.name)}</b>${a.address ? ` — ${esc(a.address)}` : ''}
    <br><small>${esc(a.check_in_label || '')}${a.check_in_label && a.check_out_label ? ' → ' : ''}${esc(a.check_out_label || '')}</small></div>`;
}

function legSectionHtml(leg) {
  return `<div class="pd-leg">
    <div class="pd-leg-head">${esc(leg.leg_number)} · ${esc(leg.name)} <span class="pd-leg-dates">${esc(leg.dates_label)}</span></div>
    ${legAccommodationHtml(leg)}
    ${(leg.days || []).map((day) => daySectionHtml(leg, day)).join('')}
  </div>`;
}

function flightsHtml() {
  if (!state.flightLegs.length) return '';
  const rows = state.flightLegs.map((f) => `
    <div class="pd-line"><span class="pd-time">${esc(f.confirmation || '—')}</span>
    <div class="pd-body"><b>${esc(f.route)}</b> — ${esc(f.airline)}${f.when_label ? ` · ${esc(f.when_label)}` : ''}
    ${f.detail ? `<br><small>${esc(f.detail)}</small>` : ''}</div></div>`).join('');
  return `<div class="pd-day"><div class="pd-day-head">Flights</div>${rows}</div>`;
}

const DOC_STYLE = `
  :root{ --ink:#0E2A2E; --gold:#B5791F; --rule:#ddd; }
  *{ box-sizing:border-box; }
  body{ font-family: Georgia, 'Times New Roman', serif; color:var(--ink); margin:0; padding:32px 40px; }
  h1{ font-family: Georgia, serif; font-size:24px; margin:0 0 4px; }
  .pd-sub{ color:#666; font-size:13px; margin:0 0 24px; }
  .pd-leg{ margin-bottom:22px; }
  .pd-leg-head{ font-weight:bold; font-size:15px; text-transform:uppercase; letter-spacing:.03em; border-bottom:2px solid var(--gold); padding-bottom:5px; margin-bottom:8px; }
  .pd-leg-dates{ font-weight:normal; color:#666; font-size:12px; text-transform:none; letter-spacing:normal; }
  .pd-accom{ font-size:12px; margin-bottom:10px; color:#444; }
  .pd-day{ margin-bottom:14px; page-break-inside: avoid; }
  .pd-day-head{ font-weight:bold; font-size:12px; text-transform:uppercase; letter-spacing:.03em; color:var(--gold); border-bottom:1px solid var(--rule); padding-bottom:3px; margin-bottom:6px; }
  .pd-line{ display:flex; gap:12px; padding:4px 0; border-bottom:1px dotted var(--rule); font-size:13px; }
  .pd-line:last-child{ border-bottom:none; }
  .pd-line.pd-main .pd-body{ font-weight:bold; }
  .pd-time{ flex:0 0 56px; font-weight:bold; color:var(--ink); font-size:12px; }
  .pd-line.pd-main .pd-time{ color:var(--gold); }
  .pd-body{ flex:1; line-height:1.4; }
  .pd-body small{ color:#666; font-weight:normal; }
  .pd-desc{ font-weight:normal; font-style:italic; color:#666; font-size:11px; margin-top:2px; }
  .pd-transit .pd-body{ font-style:italic; color:#555; }
  .pd-alt{ font-size:11px; color:#999; font-style:italic; padding:2px 0 2px 68px; }
  .pd-tag{ font-size:9px; text-transform:uppercase; letter-spacing:.03em; border:1px solid #ccc; border-radius:3px; padding:1px 5px; margin-left:6px; }
  .pd-empty{ font-size:12px; color:#999; font-style:italic; margin:0; padding:4px 0; }
  @media print{ body{ padding:0 20px; } }
`;

function buildDoc() {
  const trip = state.trip;
  const title = trip ? trip.name + ' — Itinerary' : 'Itinerary';
  const first = state.legs[0], last = state.legs[state.legs.length - 1];
  // dates_label is "13–16 Nov" — split on the en dash and take the trip's
  // very first day plus its very last (already "Nov"-suffixed) day.
  const startDay = first ? first.dates_label.split('–')[0].trim() : '';
  const endPart = last ? (last.dates_label.split('–')[1] || last.dates_label).trim() : '';
  const subtitle = first && last ? `${startDay} Nov – ${endPart}` : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_STYLE}</style></head>
<body>
  <h1>${esc(title)}</h1>
  <p class="pd-sub">${esc(subtitle)}</p>
  ${flightsHtml()}
  ${state.legs.map(legSectionHtml).join('')}
</body></html>`;
}

export function exportItineraryPdf() {
  if (!state.trip) return;
  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to export a PDF'); return; }
  win.document.open();
  win.document.write(buildDoc());
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before invoking print — calling
  // it synchronously can race the write above in some browsers.
  win.setTimeout(() => win.print(), 300);
}
