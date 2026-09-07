// Stops (legs) management, living in the persistent masthead next to the
// stamp row it edits — not a routed screen, since it needs to be reachable
// from every screen the same way the stamps themselves are always visible.
import { db } from './db.js';
import { state, notifyTripChanged } from './state.js';
import { qs, escapeHtml, toast, friendlyError, formatDateMed } from './utils.js';
import { exportLegPdf } from './print.js';

let panelOpen = false;
let addOpen = false;
let editingId = null;

function sortedLegs(){
  return state.legs.slice().sort((a, b) => a.sort_order - b.sort_order);
}

function fieldsHtml(leg = {}){
  const idPrefix = leg.id || 'new';
  return `
    <div class="field"><label>Name</label><input type="text" data-f="name" value="${escapeHtml(leg.name || '')}" placeholder="e.g. Chicago"></div>
    <div class="field-row">
      <div class="field"><label>City</label><input type="text" data-f="city" value="${escapeHtml(leg.city || '')}"></div>
      <div class="field"><label>Region / state</label><input type="text" data-f="region" value="${escapeHtml(leg.region || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Arrive</label><input type="date" data-f="arrive_date" value="${leg.arrive_date || ''}"></div>
      <div class="field"><label>Depart</label><input type="date" data-f="depart_date" value="${leg.depart_date || ''}"></div>
    </div>
    <div class="field field-checkbox">
      <input type="checkbox" id="leg-shared-${idPrefix}" data-f="is_shared" ${leg.is_shared ? 'checked' : ''}>
      <label for="leg-shared-${idPrefix}">Shared — visible to anyone else signed in (e.g. a Vegas stop you're both attending)</label>
    </div>
  `;
}

function rowHtml(leg, idx, total){
  if (editingId === leg.id) {
    return `
      <div class="stop-form" data-id="${leg.id}">
        ${fieldsHtml(leg)}
        <div class="form-actions">
          <button type="button" class="btn btn-quiet" data-action="cancel-edit">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="save-edit">Save stop</button>
        </div>
      </div>`;
  }
  const dates = leg.arrive_date && leg.depart_date
    ? `${formatDateMed(leg.arrive_date)} – ${formatDateMed(leg.depart_date)}`
    : 'Dates TBC';
  return `
    <div class="stop-row" data-id="${leg.id}">
      <div class="stop-row-main">
        <div class="stop-row-name">${escapeHtml(leg.name)}${leg.is_shared ? ' <span class="pill pill-held">Shared</span>' : ''}</div>
        <div class="stop-row-meta">${escapeHtml(dates)}</div>
      </div>
      <div class="stop-row-actions">
        <button type="button" data-action="up" ${idx === 0 ? 'disabled' : ''} aria-label="Move earlier">&#9650;</button>
        <button type="button" data-action="down" ${idx === total - 1 ? 'disabled' : ''} aria-label="Move later">&#9660;</button>
        <button type="button" data-action="export" aria-label="Export stop as PDF">&#128196;</button>
        <button type="button" data-action="edit" aria-label="Edit stop">&#9998;</button>
        <button type="button" data-action="delete" aria-label="Delete stop">&#10005;</button>
      </div>
    </div>`;
}

function addFormHtml(){
  return `
    <div class="stop-form" data-mode="add">
      ${fieldsHtml({})}
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel-add">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save-add">Add stop</button>
      </div>
    </div>`;
}

function readForm(form){
  const v = (f) => qs(`[data-f="${f}"]`, form).value;
  const c = (f) => qs(`[data-f="${f}"]`, form).checked;
  return {
    name: v('name').trim(),
    city: v('city').trim(),
    region: v('region').trim() || null,
    arrive_date: v('arrive_date') || null,
    depart_date: v('depart_date') || null,
    is_shared: c('is_shared')
  };
}

function render(){
  const panel = qs('#stopsPanel');
  if (!panel) return;
  const legs = sortedLegs();
  panel.innerHTML = `
    ${legs.map((leg, idx) => rowHtml(leg, idx, legs.length)).join('') || '<p class="section-note" style="color:rgba(247,239,221,0.5);">No stops yet.</p>'}
    ${addOpen ? addFormHtml() : '<button type="button" class="stops-toggle" data-action="open-add" style="width:100%;margin-top:10px;">+ Add stop</button>'}
  `;
}

async function refreshLegsAndRender(){
  state.legs = await db.legs.list(state.trip.id);
  render();
  notifyTripChanged(); // lets the header stamps / other screens pick up the change too
}

async function handleClick(e){
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'open-add') { addOpen = true; editingId = null; render(); return; }
  if (action === 'cancel-add') { addOpen = false; render(); return; }
  if (action === 'edit') { editingId = e.target.closest('[data-id]').dataset.id; addOpen = false; render(); return; }
  if (action === 'cancel-edit') { editingId = null; render(); return; }

  if (action === 'export') {
    const id = e.target.closest('[data-id]').dataset.id;
    const leg = state.legs.find((l) => l.id === id);
    if (leg) exportLegPdf(leg);
    return;
  }

  if (action === 'save-add' || action === 'save-edit') {
    const form = btn.closest('[data-id], [data-mode]');
    const values = readForm(form);
    if (!values.name || !values.city) { toast('Give the stop a name and city first'); return; }
    try {
      if (action === 'save-add') {
        const maxSort = state.legs.reduce((m, l) => Math.max(m, l.sort_order), 0);
        await db.legs.create({ trip_id: state.trip.id, sort_order: maxSort + 1, ...values });
        addOpen = false;
        toast('Stop added');
      } else {
        await db.legs.update(form.dataset.id, values);
        editingId = null;
        toast('Stop updated');
      }
      await refreshLegsAndRender();
    } catch (err) { toast(friendlyError(err)); }
    return;
  }

  if (action === 'delete') {
    if (!window.confirm("Delete this stop? Anything already linked to it (bookings, places, itinerary items) keeps its own dates but loses the stop link.")) return;
    const id = e.target.closest('[data-id]').dataset.id;
    try {
      await db.legs.remove(id);
      toast('Stop deleted');
      await refreshLegsAndRender();
    } catch (err) { toast(friendlyError(err)); }
    return;
  }

  if (action === 'up' || action === 'down') {
    const legs = sortedLegs();
    const id = e.target.closest('[data-id]').dataset.id;
    const idx = legs.findIndex((l) => l.id === id);
    const swapIdx = action === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= legs.length) return;
    try {
      await Promise.all([
        db.legs.update(legs[idx].id, { sort_order: legs[swapIdx].sort_order }),
        db.legs.update(legs[swapIdx].id, { sort_order: legs[idx].sort_order })
      ]);
      await refreshLegsAndRender();
    } catch (err) { toast(friendlyError(err)); }
  }
}

// Called once at boot.
export function initStopsPanel(){
  const toggle = qs('#stopsToggle');
  const panel = qs('#stopsPanel');
  toggle.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.hidden = !panelOpen;
    toggle.textContent = panelOpen ? 'Hide stops' : 'Manage stops';
    if (panelOpen) render();
  });
  panel.addEventListener('click', handleClick);
}

// Called whenever the trip/legs reload elsewhere (e.g. after an edit made
// from here already refreshed itself, but also on the broader tripchange
// event so an fx-rate edit etc. doesn't leave this panel stale).
export function refreshStopsPanel(){
  if (panelOpen) render();
}
