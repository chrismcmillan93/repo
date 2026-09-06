import { db } from '../db.js';
import { state, legLabel } from '../state.js';
import { getViewCurrency } from '../state.js';
import { qs, qsa, escapeHtml, toast, friendlyError, renderMoney, mapsSearchUrl } from '../utils.js';

const CATEGORIES = ['activity', 'hike', 'national_park', 'restaurant', 'bbq', 'coffee', 'bar', 'comedy', 'shopping', 'landmark', 'other'];
const PRICE_OPTIONS = ['', '$', '$$', '$$$', '$$$$'];

let places = [];
let filterLeg = 'all';
let filterCategory = 'all';
let showRejected = false;
let addOpen = false;
let editingId = null;
let containerRef = null;

function categoryLabel(cat){
  return cat.replace(/_/g, ' ');
}

function placeCardHtml(p, { rejected } = {}){
  if (editingId === p.id) return placeFormWrap(p, 'edit');
  const rating = p.rating ? `★ ${p.rating}${p.rating_count ? ` (${p.rating_count})` : ''}` : '<span class="unrated">Not rated yet</span>';
  return `
    <div class="place-card" data-id="${p.id}">
      <div class="place-card-top">
        <div>
          <div class="place-name">${escapeHtml(p.name)}</div>
          <div class="place-category">${escapeHtml(categoryLabel(p.category))}${p.leg_id ? ' · ' + escapeHtml(legLabel(p.leg_id)) : ''}</div>
        </div>
        <div class="place-rating">${rating}</div>
      </div>
      ${p.description ? `<div class="place-desc">${escapeHtml(p.description)}</div>` : ''}
      ${rejected && p.rejection_reason ? `<div class="rejected-reason">${escapeHtml(p.rejection_reason)}</div>` : ''}
      <div class="place-meta-row">
        <span>${p.price_indicator ? escapeHtml(p.price_indicator) : ''}${p.booking_required ? ' · Booking required' : ''}</span>
        ${p.estimated_cost ? renderMoney(p.estimated_cost, p.currency, state.trip, getViewCurrency()) : ''}
      </div>
      ${p.maps_url ? `<a class="place-maps-link" href="${escapeHtml(p.maps_url)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ''}
      <div class="place-card-actions">
        <button type="button" class="btn btn-sm btn-quiet" data-action="edit">Edit</button>
        ${!rejected ? `<button type="button" class="btn btn-sm btn-quiet" data-action="add-itinerary">Add to itinerary</button>` : ''}
        ${!rejected ? `<button type="button" class="btn btn-sm btn-quiet" data-action="reject">Reject</button>` : `<button type="button" class="btn btn-sm btn-quiet" data-action="restore">Restore</button>`}
        <button type="button" class="btn btn-sm btn-danger" data-action="delete">Delete</button>
      </div>
      ${addItineraryFormPlaceholder(p)}
    </div>`;
}

let addItineraryOpenId = null;

function addItineraryFormPlaceholder(p){
  if (addItineraryOpenId !== p.id) return '';
  const leg = state.legs.find((l) => l.id === p.leg_id);
  const defaultDay = leg && leg.arrive_date ? leg.arrive_date : (state.trip ? state.trip.start_date : '');
  return `
    <div class="inline-form" data-itin-for="${p.id}">
      <div class="field"><label>Day</label><input type="date" data-f="day" value="${defaultDay}" min="${state.trip ? state.trip.start_date : ''}" max="${state.trip ? state.trip.end_date : ''}"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel-itinerary">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="confirm-itinerary">Add</button>
      </div>
    </div>`;
}

function placeFormWrap(p, mode){
  return `
    <div class="inline-form place-card" data-mode="${mode}" ${p.id ? `data-id="${p.id}"` : ''} style="grid-column:1/-1;">
      ${placeFormFields(p)}
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save">${mode === 'add' ? 'Add place' : 'Save changes'}</button>
      </div>
    </div>`;
}

function placeFormFields(p = {}){
  return `
    <div class="field"><label>Name</label><input type="text" data-f="name" value="${escapeHtml(p.name || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Leg</label>
        <select data-f="leg_id"><option value="">Unassigned</option>${state.legs.map((l) => `<option value="${l.id}" ${l.id === p.leg_id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Category</label>
        <select data-f="category">${CATEGORIES.map((c) => `<option value="${c}" ${c === (p.category || 'other') ? 'selected' : ''}>${categoryLabel(c)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="field"><label>Description</label><textarea data-f="description">${escapeHtml(p.description || '')}</textarea></div>
    <div class="field"><label>Address</label><input type="text" data-f="address" value="${escapeHtml(p.address || '')}"></div>
    <div class="field"><label>Maps link</label><input type="url" data-f="maps_url" value="${escapeHtml(p.maps_url || '')}" placeholder="Leave blank to auto-generate from name">
    </div>
    <div class="field"><label>Website</label><input type="url" data-f="website_url" value="${escapeHtml(p.website_url || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Rating</label><input type="number" step="0.1" min="0" max="5" data-f="rating" value="${p.rating ?? ''}"></div>
      <div class="field"><label>Rating count</label><input type="number" data-f="rating_count" value="${p.rating_count ?? ''}"></div>
    </div>
    <div class="field"><label>Rating source</label><input type="text" data-f="rating_source" placeholder="e.g. Google, Sept 2026" value="${escapeHtml(p.rating_source || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Price</label>
        <select data-f="price_indicator">${PRICE_OPTIONS.map((x) => `<option value="${x}" ${x === (p.price_indicator || '') ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Estimated cost (USD)</label><input type="number" step="0.01" data-f="estimated_cost" value="${p.estimated_cost ?? ''}"></div>
    </div>
    <div class="field-row">
      <div class="field field-checkbox" style="align-self:end;"><input type="checkbox" id="booking-req" data-f="booking_required" ${p.booking_required ? 'checked' : ''}><label for="booking-req">Booking required</label></div>
      <div class="field field-checkbox" style="align-self:end;"><input type="checkbox" id="shortlisted" data-f="is_shortlisted" ${p.is_shortlisted ? 'checked' : ''}><label for="shortlisted">Shortlisted (a decision, not just a suggestion)</label></div>
    </div>
    <div class="field"><label>Notes</label><textarea data-f="notes">${escapeHtml(p.notes || '')}</textarea></div>
  `;
}

function readPlaceForm(form){
  const v = (f) => qs(`[data-f="${f}"]`, form).value;
  const c = (f) => qs(`[data-f="${f}"]`, form).checked;
  const name = v('name').trim();
  const leg = state.legs.find((l) => l.id === v('leg_id'));
  let mapsUrl = v('maps_url').trim();
  if (!mapsUrl && name) mapsUrl = mapsSearchUrl(name, leg ? leg.city : '', leg ? leg.region : '');
  return {
    name,
    leg_id: v('leg_id') || null,
    category: v('category'),
    description: v('description').trim() || null,
    address: v('address').trim() || null,
    maps_url: mapsUrl || null,
    website_url: v('website_url').trim() || null,
    rating: v('rating') ? parseFloat(v('rating')) : null,
    rating_count: v('rating_count') ? parseInt(v('rating_count'), 10) : null,
    rating_source: v('rating_source').trim() || null,
    price_indicator: v('price_indicator') || null,
    estimated_cost: v('estimated_cost') ? parseFloat(v('estimated_cost')) : null,
    currency: 'USD',
    booking_required: c('booking_required'),
    is_shortlisted: c('is_shortlisted'),
    notes: v('notes').trim() || null
  };
}

function filterBarHtml(){
  const legChips = [{ id: 'all', name: 'All legs' }, ...state.legs].map((l) =>
    `<button type="button" class="filter-chip ${filterLeg === l.id ? 'is-active' : ''}" data-filter="leg" data-value="${l.id}">${escapeHtml(l.name)}</button>`
  ).join('');
  const catChips = ['all', ...CATEGORIES].map((c) =>
    `<button type="button" class="filter-chip ${filterCategory === c ? 'is-active' : ''}" data-filter="category" data-value="${c}">${c === 'all' ? 'All categories' : categoryLabel(c)}</button>`
  ).join('');
  return `
    <div class="filter-bar">${legChips}</div>
    <div class="filter-bar">${catChips}</div>
  `;
}

function matchesFilter(p){
  if (filterLeg !== 'all' && p.leg_id !== filterLeg) return false;
  if (filterCategory !== 'all' && p.category !== filterCategory) return false;
  return true;
}

function renderAll(){
  const active = places.filter((p) => !p.is_rejected && matchesFilter(p));
  const rejected = places.filter((p) => p.is_rejected && matchesFilter(p));

  containerRef.innerHTML = `
    <div id="places-root">
      <div class="page-head">
        <h1>Places</h1>
        <p class="lede">The shortlist — planned, discussed, or merely recommended.</p>
      </div>
      ${addOpen ? placeFormWrap({}, 'add') : '<button type="button" class="add-affordance" data-action="open-add" style="margin-bottom:16px;">+ Add place</button>'}
      ${filterBarHtml()}
      <div class="place-grid">
        ${active.length ? active.map((p) => placeCardHtml(p)).join('') : '<div class="empty-state"><strong>Nothing matches</strong>Try a different filter, or add a place.</div>'}
      </div>
      <button type="button" class="rejected-toggle" data-action="toggle-rejected">${showRejected ? '▾' : '▸'} Rejected (${rejected.length})</button>
      ${showRejected ? `<div class="place-grid rejected-list">${rejected.length ? rejected.map((p) => placeCardHtml(p, { rejected: true })).join('') : '<div class="empty-state">Nothing rejected yet.</div>'}</div>` : ''}
    </div>
  `;
  wireEvents();
}

// Listener is scoped to #places-root, which is recreated by innerHTML on
// every renderAll() call — so this never leaks a listener onto the
// persistent #app-main node shared by every other screen.
function wireEvents(){
  qs('#places-root', containerRef).addEventListener('click', handleClick);
}

async function handleClick(e){
  const filterBtn = e.target.closest('button[data-filter]');
  if (filterBtn) {
    if (filterBtn.dataset.filter === 'leg') filterLeg = filterBtn.dataset.value;
    else filterCategory = filterBtn.dataset.value;
    renderAll();
    return;
  }

  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'toggle-rejected') { showRejected = !showRejected; renderAll(); return; }
  if (action === 'open-add') { addOpen = true; editingId = null; renderAll(); return; }
  if (action === 'cancel') { addOpen = false; editingId = null; renderAll(); return; }

  if (action === 'save') {
    const form = btn.closest('.inline-form');
    const values = readPlaceForm(form);
    if (!values.name) { toast('Give it a name first'); return; }
    try {
      if (form.dataset.mode === 'add') {
        await db.places.create({ trip_id: state.trip.id, ...values });
        addOpen = false;
        toast('Place added');
      } else {
        await db.places.update(form.dataset.id, values);
        editingId = null;
        toast('Place updated');
      }
      await reload();
      renderAll();
    } catch (err) { toast(friendlyError(err)); }
    return;
  }

  const card = e.target.closest('[data-id]');
  const id = card ? card.dataset.id : null;

  if (action === 'edit') { editingId = id; renderAll(); return; }
  if (action === 'delete') {
    if (!window.confirm('Delete this place?')) return;
    try { await db.places.remove(id); await reload(); renderAll(); toast('Place deleted'); }
    catch (err) { toast(friendlyError(err)); }
    return;
  }
  if (action === 'reject') {
    const reason = window.prompt('Why was this rejected?', '');
    if (reason === null) return;
    try {
      await db.places.update(id, { is_rejected: true, rejection_reason: reason || null });
      await reload();
      renderAll();
      toast('Moved to rejected');
    } catch (err) { toast(friendlyError(err)); }
    return;
  }
  if (action === 'restore') {
    try {
      await db.places.update(id, { is_rejected: false, rejection_reason: null });
      await reload();
      renderAll();
      toast('Restored to the shortlist');
    } catch (err) { toast(friendlyError(err)); }
    return;
  }
  if (action === 'add-itinerary') { addItineraryOpenId = id; renderAll(); return; }
  if (action === 'cancel-itinerary') { addItineraryOpenId = null; renderAll(); return; }
  if (action === 'confirm-itinerary') {
    const form = btn.closest('.inline-form');
    const day = qs('[data-f="day"]', form).value;
    if (!day) { toast('Pick a day first'); return; }
    const place = places.find((p) => p.id === id);
    try {
      const existing = await db.itineraryItems.list();
      const dayItems = existing.filter((i) => i.day === day);
      const maxSort = dayItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
      await db.itineraryItems.create({
        trip_id: state.trip.id,
        leg_id: place.leg_id,
        place_id: place.id,
        day,
        title: place.name,
        type: 'idea',
        sort_order: maxSort + 1,
        estimated_cost: place.estimated_cost,
        currency: place.currency || 'USD'
      });
      addItineraryOpenId = null;
      renderAll();
      toast('Added to itinerary');
    } catch (err) { toast(friendlyError(err)); }
  }
}

async function reload(){
  places = await db.places.list();
}

export async function render(container){
  containerRef = container;
  filterLeg = 'all';
  filterCategory = 'all';
  showRejected = false;
  addOpen = false;
  editingId = null;
  addItineraryOpenId = null;
  await reload();
  renderAll();
}
