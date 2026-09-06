import { db } from '../db.js';
import { state, legLabel } from '../state.js';
import { getViewCurrency } from '../state.js';
import {
  qs, qsa, escapeHtml, toast, friendlyError, renderMoney,
  formatDateMed, formatDateTimeNaive, toDatetimeLocalValue
} from '../utils.js';

let activeTab = 'flights';
let openAddForTab = new Set();
let editingId = null;
let containerRef = null;
let cache = { flights: [], accommodations: [], transport: [] };

const STATUS_OPTIONS = ['placeholder', 'held', 'booked'];

function statusPill(status){
  return `<span class="pill pill-${status}">${status}</span>`;
}
function paidPill(isPaid){
  return isPaid ? '<span class="pill pill-paid">Paid</span>' : '<span class="pill pill-unpaid">Unpaid</span>';
}
function legSelectHtml(selectedId){
  const opts = state.legs.map((l) => `<option value="${l.id}" ${l.id === selectedId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('');
  return `<select data-f="leg_id"><option value="">Unassigned</option>${opts}</select>`;
}
function statusSelectHtml(selected){
  return `<select data-f="status">${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}

/* ---------------- FLIGHTS ---------------- */

function flightRowHtml(f){
  const route = `${f.from_airport || f.from_city || '?'} → ${f.to_airport || f.to_city || '?'}`;
  return `
    <div class="row-card ${f.status === 'placeholder' ? 'is-placeholder-row' : ''}" data-id="${f.id}" data-table="flights">
      <div class="row-card-head">
        <div>
          <div class="row-card-title">${escapeHtml(f.label)}</div>
          <div class="row-card-meta">${escapeHtml(route)}${f.depart_at ? ' · ' + escapeHtml(formatDateTimeNaive(f.depart_at)) : ''}</div>
          <div class="row-card-meta">${f.airline ? escapeHtml(f.airline) + ' ' : ''}${f.flight_number ? escapeHtml(f.flight_number) : ''}${f.booking_reference ? ' · Ref ' + escapeHtml(f.booking_reference) : ''}</div>
        </div>
        <div class="row-card-actions">
          <button type="button" class="icon-btn" data-action="edit" aria-label="Edit">&#9998;</button>
          <button type="button" class="icon-btn" data-action="delete" aria-label="Delete">&#10005;</button>
        </div>
      </div>
      <div class="booking-row-grid" style="margin-top:10px;align-items:center;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${statusPill(f.status)}${paidPill(f.is_paid)}</div>
        <div>${renderMoney(f.actual_amount ?? f.budget_amount, f.currency, state.trip, getViewCurrency())}</div>
      </div>
      ${f.booking_url ? `<div class="row-card-meta" style="margin-top:6px;"><a href="${escapeHtml(f.booking_url)}" target="_blank" rel="noopener">Booking link</a></div>` : ''}
      ${f.notes ? `<div class="row-card-meta" style="margin-top:6px;">${escapeHtml(f.notes)}</div>` : ''}
    </div>`;
}

function flightFormHtml(f = {}){
  return `
    <div class="field"><label>Label</label><input type="text" data-f="label" placeholder="e.g. UK → Austin" value="${escapeHtml(f.label || '')}"></div>
    <div class="field-row">
      <div class="field"><label>From (airport/city)</label><input type="text" data-f="from_airport" placeholder="AUS" value="${escapeHtml(f.from_airport || '')}"></div>
      <div class="field"><label>To (airport/city)</label><input type="text" data-f="to_airport" placeholder="LAS" value="${escapeHtml(f.to_airport || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Airline</label><input type="text" data-f="airline" value="${escapeHtml(f.airline || '')}"></div>
      <div class="field"><label>Flight number</label><input type="text" data-f="flight_number" value="${escapeHtml(f.flight_number || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Departs</label><input type="datetime-local" data-f="depart_at" value="${toDatetimeLocalValue(f.depart_at)}"></div>
      <div class="field"><label>Arrives</label><input type="datetime-local" data-f="arrive_at" value="${toDatetimeLocalValue(f.arrive_at)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Budget (GBP)</label><input type="number" step="0.01" data-f="budget_amount" value="${f.budget_amount ?? ''}"></div>
      <div class="field"><label>Actual (GBP)</label><input type="number" step="0.01" data-f="actual_amount" value="${f.actual_amount ?? ''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Status</label>${statusSelectHtml(f.status || 'placeholder')}</div>
      <div class="field field-checkbox" style="align-self:end;"><input type="checkbox" id="paid-flight" data-f="is_paid" ${f.is_paid ? 'checked' : ''}><label for="paid-flight">Paid</label></div>
    </div>
    <div class="field"><label>Booking reference</label><input type="text" data-f="booking_reference" value="${escapeHtml(f.booking_reference || '')}"></div>
    <div class="field"><label>Booking link</label><input type="url" data-f="booking_url" value="${escapeHtml(f.booking_url || '')}"></div>
    <div class="field"><label>Notes</label><textarea data-f="notes">${escapeHtml(f.notes || '')}</textarea></div>
  `;
}

function readFlightForm(form){
  const v = (f) => qs(`[data-f="${f}"]`, form).value;
  return {
    label: v('label').trim(),
    from_airport: v('from_airport').trim() || null,
    to_airport: v('to_airport').trim() || null,
    airline: v('airline').trim() || null,
    flight_number: v('flight_number').trim() || null,
    depart_at: v('depart_at') || null,
    arrive_at: v('arrive_at') || null,
    budget_amount: v('budget_amount') ? parseFloat(v('budget_amount')) : null,
    actual_amount: v('actual_amount') ? parseFloat(v('actual_amount')) : null,
    status: v('status'),
    is_paid: qs('[data-f="is_paid"]', form).checked,
    booking_reference: v('booking_reference').trim() || null,
    booking_url: v('booking_url').trim() || null,
    notes: v('notes').trim() || null,
    currency: 'GBP'
  };
}

/* ---------------- ACCOMMODATION ---------------- */

const ACCOM_TYPES = ['hotel', 'apartment', 'airbnb', 'other'];

function accommodationRowHtml(a){
  return `
    <div class="row-card ${a.status === 'placeholder' ? 'is-placeholder-row' : ''}" data-id="${a.id}" data-table="accommodations">
      <div class="row-card-head">
        <div>
          <div class="row-card-title">${escapeHtml(a.name)}</div>
          <div class="row-card-meta">${a.leg_id ? escapeHtml(legLabel(a.leg_id)) + ' · ' : ''}${a.check_in ? formatDateMed(a.check_in) : '?'} – ${a.check_out ? formatDateMed(a.check_out) : '?'}${a.nights ? ` (${a.nights} night${a.nights === 1 ? '' : 's'})` : ''}</div>
          ${a.address ? `<div class="row-card-meta">${escapeHtml(a.address)}</div>` : ''}
        </div>
        <div class="row-card-actions">
          <button type="button" class="icon-btn" data-action="edit" aria-label="Edit">&#9998;</button>
          <button type="button" class="icon-btn" data-action="delete" aria-label="Delete">&#10005;</button>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
        ${statusPill(a.status)}${paidPill(a.is_paid)}
        <span class="gym-flag ${a.has_gym ? '' : 'is-missing'}">${a.has_gym ? '✓ Gym' : '✕ No gym'}</span>
        ${a.free_cancellation ? '<span class="pill pill-held">Free cancellation</span>' : ''}
        ${a.rating ? `<span class="pill pill-planned">★ ${a.rating}${a.rating_count ? ' (' + a.rating_count + ')' : ''}</span>` : ''}
      </div>
      <div class="booking-row-grid" style="margin-top:10px;align-items:center;">
        <div>${a.cancellation_deadline ? 'Cancel by ' + escapeHtml(formatDateMed(a.cancellation_deadline)) : ''}</div>
        <div>${renderMoney(a.actual_amount ?? a.budget_amount, a.currency, state.trip, getViewCurrency())}</div>
      </div>
      ${a.maps_url ? `<div class="row-card-meta" style="margin-top:6px;"><a href="${escapeHtml(a.maps_url)}" target="_blank" rel="noopener">Map</a></div>` : ''}
    </div>`;
}

function accommodationFormHtml(a = {}){
  return `
    <div class="field"><label>Name</label><input type="text" data-f="name" value="${escapeHtml(a.name || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Leg</label>${legSelectHtml(a.leg_id)}</div>
      <div class="field"><label>Type</label>
        <select data-f="type">${ACCOM_TYPES.map((t) => `<option value="${t}" ${t === (a.type || 'other') ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Check in</label><input type="date" data-f="check_in" value="${a.check_in || ''}"></div>
      <div class="field"><label>Check out</label><input type="date" data-f="check_out" value="${a.check_out || ''}"></div>
    </div>
    <div class="field"><label>Address</label><input type="text" data-f="address" value="${escapeHtml(a.address || '')}"></div>
    <div class="field"><label>Maps link</label><input type="url" data-f="maps_url" value="${escapeHtml(a.maps_url || '')}"></div>
    <div class="field-row">
      <div class="field field-checkbox" style="align-self:end;"><input type="checkbox" id="gym-acc" data-f="has_gym" ${a.has_gym ? 'checked' : ''}><label for="gym-acc">Has gym</label></div>
      <div class="field field-checkbox" style="align-self:end;"><input type="checkbox" id="fc-acc" data-f="free_cancellation" ${a.free_cancellation ? 'checked' : ''}><label for="fc-acc">Free cancellation</label></div>
    </div>
    <div class="field"><label>Cancellation deadline</label><input type="date" data-f="cancellation_deadline" value="${a.cancellation_deadline || ''}"></div>
    <div class="field-row">
      <div class="field"><label>Rating</label><input type="number" step="0.1" min="0" max="5" data-f="rating" value="${a.rating ?? ''}"></div>
      <div class="field"><label>Rating count</label><input type="number" data-f="rating_count" value="${a.rating_count ?? ''}"></div>
    </div>
    <div class="field"><label>Rating source</label><input type="text" data-f="rating_source" value="${escapeHtml(a.rating_source || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Budget (GBP)</label><input type="number" step="0.01" data-f="budget_amount" value="${a.budget_amount ?? ''}"></div>
      <div class="field"><label>Actual (GBP)</label><input type="number" step="0.01" data-f="actual_amount" value="${a.actual_amount ?? ''}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Status</label>${statusSelectHtml(a.status || 'placeholder')}</div>
      <div class="field field-checkbox" style="align-self:end;"><input type="checkbox" id="paid-acc" data-f="is_paid" ${a.is_paid ? 'checked' : ''}><label for="paid-acc">Paid</label></div>
    </div>
    <div class="field"><label>Booking reference</label><input type="text" data-f="booking_reference" value="${escapeHtml(a.booking_reference || '')}"></div>
  `;
}

function readAccommodationForm(form){
  const v = (f) => qs(`[data-f="${f}"]`, form).value;
  const c = (f) => qs(`[data-f="${f}"]`, form).checked;
  return {
    name: v('name').trim(),
    leg_id: v('leg_id') || null,
    type: v('type'),
    check_in: v('check_in') || null,
    check_out: v('check_out') || null,
    address: v('address').trim() || null,
    maps_url: v('maps_url').trim() || null,
    has_gym: c('has_gym'),
    free_cancellation: c('free_cancellation'),
    cancellation_deadline: v('cancellation_deadline') || null,
    rating: v('rating') ? parseFloat(v('rating')) : null,
    rating_count: v('rating_count') ? parseInt(v('rating_count'), 10) : null,
    rating_source: v('rating_source').trim() || null,
    budget_amount: v('budget_amount') ? parseFloat(v('budget_amount')) : null,
    actual_amount: v('actual_amount') ? parseFloat(v('actual_amount')) : null,
    status: v('status'),
    is_paid: c('is_paid'),
    booking_reference: v('booking_reference').trim() || null,
    currency: 'GBP'
  };
}

/* ---------------- TRANSPORT ---------------- */

const TRANSPORT_TYPES = ['hire_car', 'transfer', 'rideshare', 'rail', 'other'];
const TRANSPORT_LABEL = { hire_car: 'Hire car', transfer: 'Transfer', rideshare: 'Rideshare', rail: 'Rail', other: 'Other' };

function transportRowHtml(t){
  return `
    <div class="row-card ${t.status === 'placeholder' ? 'is-placeholder-row' : ''}" data-id="${t.id}" data-table="transport">
      <div class="row-card-head">
        <div>
          <div class="row-card-title">${TRANSPORT_LABEL[t.type] || t.type}${t.provider ? ' · ' + escapeHtml(t.provider) : ''}</div>
          <div class="row-card-meta">${t.leg_id ? escapeHtml(legLabel(t.leg_id)) + ' · ' : ''}${escapeHtml(t.pickup_location || 'Pickup TBC')} → ${escapeHtml(t.dropoff_location || 'Dropoff TBC')}</div>
          ${t.pickup_at ? `<div class="row-card-meta">Pickup ${escapeHtml(formatDateTimeNaive(t.pickup_at))}</div>` : ''}
        </div>
        <div class="row-card-actions">
          <button type="button" class="icon-btn" data-action="edit" aria-label="Edit">&#9998;</button>
          <button type="button" class="icon-btn" data-action="delete" aria-label="Delete">&#10005;</button>
        </div>
      </div>
      <div class="booking-row-grid" style="margin-top:10px;align-items:center;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${statusPill(t.status)}${paidPill(t.is_paid)}</div>
        <div>${renderMoney(t.actual_amount ?? t.budget_amount, t.currency, state.trip, getViewCurrency())}</div>
      </div>
      ${t.notes ? `<div class="row-card-meta" style="margin-top:6px;">${escapeHtml(t.notes)}</div>` : ''}
    </div>`;
}

function transportFormHtml(t = {}){
  return `
    <div class="field-row">
      <div class="field"><label>Type</label>
        <select data-f="type">${TRANSPORT_TYPES.map((x) => `<option value="${x}" ${x === (t.type || 'other') ? 'selected' : ''}>${TRANSPORT_LABEL[x]}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Leg</label>${legSelectHtml(t.leg_id)}</div>
    </div>
    <div class="field"><label>Provider</label><input type="text" data-f="provider" value="${escapeHtml(t.provider || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Pickup location</label><input type="text" data-f="pickup_location" value="${escapeHtml(t.pickup_location || '')}"></div>
      <div class="field"><label>Dropoff location</label><input type="text" data-f="dropoff_location" value="${escapeHtml(t.dropoff_location || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Pickup time</label><input type="datetime-local" data-f="pickup_at" value="${toDatetimeLocalValue(t.pickup_at)}"></div>
      <div class="field"><label>Dropoff time</label><input type="datetime-local" data-f="dropoff_at" value="${toDatetimeLocalValue(t.dropoff_at)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Currency</label>
        <select data-f="currency"><option value="GBP" ${(t.currency || 'GBP') === 'GBP' ? 'selected' : ''}>GBP</option><option value="USD" ${t.currency === 'USD' ? 'selected' : ''}>USD</option></select>
      </div>
      <div class="field"><label>Status</label>${statusSelectHtml(t.status || 'placeholder')}</div>
    </div>
    <div class="field-row">
      <div class="field"><label>Budget</label><input type="number" step="0.01" data-f="budget_amount" value="${t.budget_amount ?? ''}"></div>
      <div class="field"><label>Actual</label><input type="number" step="0.01" data-f="actual_amount" value="${t.actual_amount ?? ''}"></div>
    </div>
    <div class="field field-checkbox"><input type="checkbox" id="paid-transport" data-f="is_paid" ${t.is_paid ? 'checked' : ''}><label for="paid-transport">Paid</label></div>
    <div class="field"><label>Booking reference</label><input type="text" data-f="booking_reference" value="${escapeHtml(t.booking_reference || '')}"></div>
    <div class="field"><label>Notes</label><textarea data-f="notes">${escapeHtml(t.notes || '')}</textarea></div>
  `;
}

function readTransportForm(form){
  const v = (f) => qs(`[data-f="${f}"]`, form).value;
  return {
    type: v('type'),
    leg_id: v('leg_id') || null,
    provider: v('provider').trim() || null,
    pickup_location: v('pickup_location').trim() || null,
    dropoff_location: v('dropoff_location').trim() || null,
    pickup_at: v('pickup_at') || null,
    dropoff_at: v('dropoff_at') || null,
    currency: v('currency'),
    status: v('status'),
    budget_amount: v('budget_amount') ? parseFloat(v('budget_amount')) : null,
    actual_amount: v('actual_amount') ? parseFloat(v('actual_amount')) : null,
    is_paid: qs('[data-f="is_paid"]', form).checked,
    booking_reference: v('booking_reference').trim() || null,
    notes: v('notes').trim() || null
  };
}

/* ---------------- shared tab plumbing ---------------- */

const TAB_CONFIG = {
  flights: { table: db.flights, rowHtml: flightRowHtml, formHtml: flightFormHtml, readForm: readFlightForm, label: 'flight', addLabel: 'Add flight' },
  accommodations: { table: db.accommodations, rowHtml: accommodationRowHtml, formHtml: accommodationFormHtml, readForm: readAccommodationForm, label: 'accommodation', addLabel: 'Add accommodation' },
  transport: { table: db.transport, rowHtml: transportRowHtml, formHtml: transportFormHtml, readForm: readTransportForm, label: 'transport item', addLabel: 'Add transport' }
};

function wrapForm(inner, mode, id){
  return `
    <div class="inline-form" data-mode="${mode}" ${id ? `data-id="${id}"` : ''}>
      ${inner}
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save">${mode === 'add' ? 'Save booking' : 'Save changes'}</button>
      </div>
    </div>`;
}

function tabHtml(tab){
  const cfg = TAB_CONFIG[tab];
  const rows = cache[tab] || [];
  const addOpen = openAddForTab.has(tab);
  return `
    <div>
      ${addOpen ? wrapForm(cfg.formHtml(), 'add') : `<button type="button" class="add-affordance" data-action="open-add">+ ${cfg.addLabel}</button>`}
      <div style="margin-top:12px;">
        ${rows.length ? rows.map((r) => editingId === r.id ? wrapForm(cfg.formHtml(r), 'edit', r.id) : cfg.rowHtml(r)).join('') : `<div class="empty-state"><strong>Nothing here yet</strong>Add a placeholder — you can fill in the details later.</div>`}
      </div>
    </div>`;
}

function renderAll(){
  containerRef.innerHTML = `
    <div class="page-head">
      <h1>Bookings</h1>
      <p class="lede">Flights, accommodation and transport. Placeholders are meant to exist before they're confirmed.</p>
    </div>
    <div class="tabs">
      <button type="button" data-tab="flights" class="${activeTab === 'flights' ? 'is-active' : ''}">Flights</button>
      <button type="button" data-tab="accommodations" class="${activeTab === 'accommodations' ? 'is-active' : ''}">Accommodation</button>
      <button type="button" data-tab="transport" class="${activeTab === 'transport' ? 'is-active' : ''}">Transport</button>
    </div>
    <div id="tab-body">${tabHtml(activeTab)}</div>
  `;
  wireEvents();
}

function wireEvents(){
  qsa('.tabs button', containerRef).forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      editingId = null;
      renderAll();
    });
  });

  const body = qs('#tab-body', containerRef);
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const cfg = TAB_CONFIG[activeTab];
    const action = btn.dataset.action;

    if (action === 'open-add') { openAddForTab.add(activeTab); renderAll(); return; }
    if (action === 'cancel') {
      openAddForTab.delete(activeTab);
      editingId = null;
      renderAll();
      return;
    }
    if (action === 'edit') {
      editingId = e.target.closest('[data-id]').dataset.id;
      renderAll();
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Delete this ${cfg.label}?`)) return;
      const id = e.target.closest('[data-id]').dataset.id;
      try {
        await cfg.table.remove(id);
        await reload(activeTab);
        renderAll();
        toast('Deleted');
      } catch (err) { toast(friendlyError(err)); }
      return;
    }
    if (action === 'save') {
      const form = btn.closest('.inline-form');
      const values = cfg.readForm(form);
      try {
        if (form.dataset.mode === 'add') {
          await cfg.table.create({ trip_id: state.trip.id, ...values });
          openAddForTab.delete(activeTab);
          toast('Booking saved');
        } else {
          await cfg.table.update(form.dataset.id, values);
          editingId = null;
          toast('Booking saved');
        }
        await reload(activeTab);
        renderAll();
      } catch (err) { toast(friendlyError(err)); }
    }
  });
}

async function reload(tab){
  cache[tab] = await TAB_CONFIG[tab].table.list();
}

export async function render(container){
  containerRef = container;
  openAddForTab = new Set();
  editingId = null;
  const [flights, accommodations, transport] = await Promise.all([
    db.flights.list(), db.accommodations.list(), db.transport.list()
  ]);
  cache = { flights, accommodations, transport };
  renderAll();
}
