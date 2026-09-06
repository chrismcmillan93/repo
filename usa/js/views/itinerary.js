import { db } from '../db.js';
import { state } from '../state.js';
import { getViewCurrency } from '../state.js';
import {
  qs, qsa, escapeHtml, toast, friendlyError, renderMoney,
  formatTime, formatDateShort, formatDateFull, dateRange
} from '../utils.js';

let itemsByDay = new Map();
let placesById = new Map();
let openAddDay = null;
let editingId = null;

function legForDay(day){
  return state.legs.find((l) => l.arrive_date && l.depart_date && day >= l.arrive_date && day <= l.depart_date) || null;
}

function typePillClass(type){
  return type === 'fixed' ? 'pill-fixed' : type === 'planned' ? 'pill-planned' : 'pill-idea';
}

function itemMetaHtml(item){
  const parts = [];
  const place = item.place_id ? placesById.get(item.place_id) : null;
  if (place && place.maps_url) {
    parts.push(`<a href="${escapeHtml(place.maps_url)}" target="_blank" rel="noopener">Map</a>`);
  }
  if (place && place.rating) {
    parts.push(`★ ${place.rating}`);
  }
  if (item.estimated_cost) {
    parts.push(renderMoney(item.estimated_cost, item.currency, state.trip, getViewCurrency()));
  }
  return parts.length ? `<div class="itin-item-meta">${parts.join('<span>&middot;</span>')}</div>` : '';
}

function itemRowHtml(item, dayItems, idx){
  if (editingId === item.id) return itemEditFormHtml(item);
  const time = item.start_time
    ? `${formatTime(item.start_time)}${item.end_time ? '–' + formatTime(item.end_time) : ''}`
    : '';
  return `
    <div class="itin-item type-${item.type}" data-id="${item.id}">
      <div class="itin-item-time">${escapeHtml(time)}</div>
      <div class="itin-item-body">
        <div class="itin-item-title">
          ${escapeHtml(item.title)}
          <span class="pill ${typePillClass(item.type)}">${item.type}</span>
        </div>
        ${itemMetaHtml(item)}
        ${item.notes ? `<div class="itin-item-meta">${escapeHtml(item.notes)}</div>` : ''}
      </div>
      <div class="itin-item-actions">
        <div class="reorder-btns">
          <button type="button" class="icon-btn" data-action="up" ${idx === 0 ? 'disabled' : ''} aria-label="Move earlier">&#9650;</button>
          <button type="button" class="icon-btn" data-action="down" ${idx === dayItems.length - 1 ? 'disabled' : ''} aria-label="Move later">&#9660;</button>
        </div>
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit">&#9998;</button>
        <button type="button" class="icon-btn" data-action="delete" aria-label="Delete">&#10005;</button>
      </div>
    </div>`;
}

function itemEditFormHtml(item){
  return `
    <div class="inline-form" data-id="${item.id}" style="width:100%;">
      <div class="field"><label>Title</label><input type="text" data-f="title" value="${escapeHtml(item.title)}"></div>
      <div class="field-row">
        <div class="field"><label>Start time</label><input type="time" data-f="start_time" value="${item.start_time ? item.start_time.slice(0,5) : ''}"></div>
        <div class="field"><label>End time</label><input type="time" data-f="end_time" value="${item.end_time ? item.end_time.slice(0,5) : ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Type</label>
          <select data-f="type">
            <option value="idea" ${item.type === 'idea' ? 'selected' : ''}>Idea</option>
            <option value="planned" ${item.type === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="fixed" ${item.type === 'fixed' ? 'selected' : ''}>Fixed anchor</option>
          </select>
        </div>
        <div class="field"><label>Estimated cost (USD)</label><input type="number" step="0.01" data-f="estimated_cost" value="${item.estimated_cost ?? ''}"></div>
      </div>
      <div class="field"><label>Notes</label><textarea data-f="notes">${escapeHtml(item.notes || '')}</textarea></div>
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel-edit">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save-edit">Save changes</button>
      </div>
    </div>`;
}

function addFormHtml(day){
  return `
    <div class="inline-form" data-add-day="${day}">
      <div class="field"><label>Title</label><input type="text" data-f="title" placeholder="e.g. Coffee at Flat Track"></div>
      <div class="field-row">
        <div class="field"><label>Start time</label><input type="time" data-f="start_time"></div>
        <div class="field"><label>End time</label><input type="time" data-f="end_time"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Type</label>
          <select data-f="type">
            <option value="idea" selected>Idea</option>
            <option value="planned">Planned</option>
            <option value="fixed">Fixed anchor</option>
          </select>
        </div>
        <div class="field"><label>Estimated cost (USD)</label><input type="number" step="0.01" data-f="estimated_cost" placeholder="Optional"></div>
      </div>
      <div class="field"><label>Notes</label><textarea data-f="notes" placeholder="Optional"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel-add">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save-add">Add to day</button>
      </div>
    </div>`;
}

function dayGroupHtml(day){
  const items = (itemsByDay.get(day) || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const leg = legForDay(day);
  return `
    <div class="day-group" data-day="${day}">
      <div class="day-group-head" title="${escapeHtml(formatDateFull(day))}">
        <span class="dow">${formatDateShort(day)}</span>
        ${leg ? `<span class="leg-tag">${escapeHtml(leg.city)}</span>` : ''}
      </div>
      ${items.length ? items.map((item, idx) => itemRowHtml(item, items, idx)).join('') : '<p class="section-note">Nothing planned yet.</p>'}
      ${openAddDay === day ? addFormHtml(day) : `<button type="button" class="add-affordance" data-action="open-add" data-day="${day}" style="margin-top:8px;">+ Add to this day</button>`}
    </div>`;
}

function readForm(form){
  const get = (f) => qs(`[data-f="${f}"]`, form);
  return {
    title: get('title').value.trim(),
    start_time: get('start_time').value || null,
    end_time: get('end_time').value || null,
    type: get('type').value,
    estimated_cost: get('estimated_cost').value ? parseFloat(get('estimated_cost').value) : null,
    notes: get('notes').value.trim() || null
  };
}

async function reload(){
  const [items, places] = await Promise.all([db.itineraryItems.list(), db.places.list()]);
  placesById = new Map(places.map((p) => [p.id, p]));
  itemsByDay = new Map();
  items.forEach((item) => {
    if (!itemsByDay.has(item.day)) itemsByDay.set(item.day, []);
    itemsByDay.get(item.day).push(item);
  });
}

let containerRef = null;

function renderAll(){
  if (!state.trip) { containerRef.innerHTML = '<div class="empty-state">No trip found.</div>'; return; }
  const days = dateRange(state.trip.start_date, state.trip.end_date);
  containerRef.innerHTML = `
    <div class="page-head">
      <h1>Itinerary</h1>
      <p class="lede">Day by day, grouped by leg. Fixed anchors can't move — everything else can.</p>
    </div>
    ${days.map(dayGroupHtml).join('')}
  `;
  wireEvents();
}

function wireEvents(){
  qsa('.day-group', containerRef).forEach((groupEl) => {
    const day = groupEl.dataset.day;

    groupEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'open-add') {
        openAddDay = day;
        editingId = null;
        renderAll();
        return;
      }
      if (action === 'cancel-add') { openAddDay = null; renderAll(); return; }
      if (action === 'save-add') {
        const form = btn.closest('.inline-form');
        const values = readForm(form);
        if (!values.title) { toast('Give it a title first'); return; }
        try {
          const leg = legForDay(day);
          const dayItems = itemsByDay.get(day) || [];
          const maxSort = dayItems.reduce((m, i) => Math.max(m, i.sort_order), -1);
          await db.itineraryItems.create({
            trip_id: state.trip.id,
            leg_id: leg ? leg.id : null,
            day,
            currency: 'USD',
            sort_order: maxSort + 1,
            ...values
          });
          openAddDay = null;
          await reload();
          renderAll();
          toast('Item added');
        } catch (err) { toast(friendlyError(err)); }
        return;
      }

      const itemEl = e.target.closest('[data-id]');
      const id = itemEl ? itemEl.dataset.id : null;

      if (action === 'edit') { editingId = id; renderAll(); return; }
      if (action === 'cancel-edit') { editingId = null; renderAll(); return; }
      if (action === 'save-edit') {
        const form = btn.closest('.inline-form');
        const values = readForm(form);
        if (!values.title) { toast('Give it a title first'); return; }
        try {
          await db.itineraryItems.update(id, values);
          editingId = null;
          await reload();
          renderAll();
          toast('Item updated');
        } catch (err) { toast(friendlyError(err)); }
        return;
      }
      if (action === 'delete') {
        if (!window.confirm('Delete this itinerary item?')) return;
        try {
          await db.itineraryItems.remove(id);
          await reload();
          renderAll();
          toast('Item deleted');
        } catch (err) { toast(friendlyError(err)); }
        return;
      }
      if (action === 'up' || action === 'down') {
        const dayItems = (itemsByDay.get(day) || []).slice().sort((a, b) => a.sort_order - b.sort_order);
        const idx = dayItems.findIndex((i) => i.id === id);
        const swapIdx = action === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= dayItems.length) return;
        const a = dayItems[idx];
        const b = dayItems[swapIdx];
        try {
          await Promise.all([
            db.itineraryItems.update(a.id, { sort_order: b.sort_order }),
            db.itineraryItems.update(b.id, { sort_order: a.sort_order })
          ]);
          await reload();
          renderAll();
        } catch (err) { toast(friendlyError(err)); }
      }
    });
  });
}

export async function render(container){
  containerRef = container;
  openAddDay = null;
  editingId = null;
  await reload();
  renderAll();
}
