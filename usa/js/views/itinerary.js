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
let addOptionForGroup = null; // choice_group_id currently showing an "add another option" form

function legForDay(day){
  return state.legs.find((l) => l.arrive_date && l.depart_date && day >= l.arrive_date && day <= l.depart_date) || null;
}

function typePillClass(type){
  return type === 'fixed' ? 'pill-fixed' : type === 'planned' ? 'pill-planned' : 'pill-idea';
}

// Groups a day's flat item list into render units: a standalone item, or one
// choice card per choice_group_id (its options collapse into a single unit
// positioned at the group's shared sort_order).
function buildUnits(dayItems){
  const seen = new Set();
  const units = [];
  dayItems.forEach((item) => {
    if (item.choice_group_id) {
      if (seen.has(item.choice_group_id)) return;
      seen.add(item.choice_group_id);
      const options = dayItems
        .filter((i) => i.choice_group_id === item.choice_group_id)
        .sort((a, b) => a.sort_order - b.sort_order);
      units.push({ kind: 'choice', groupId: item.choice_group_id, options, sortOrder: options[0].sort_order });
    } else {
      units.push({ kind: 'single', item, sortOrder: item.sort_order });
    }
  });
  return units.sort((a, b) => a.sortOrder - b.sortOrder);
}

function unitKey(unit){ return unit.kind === 'choice' ? unit.groupId : unit.item.id; }
function unitMembers(unit){ return unit.kind === 'choice' ? unit.options : [unit.item]; }

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

function itemTimeText(item){
  return item.start_time ? `${formatTime(item.start_time)}${item.end_time ? '–' + formatTime(item.end_time) : ''}` : '';
}

/* ---------------- standalone items ---------------- */

function itemRowHtml(item, unit, unitIdx, totalUnits){
  if (editingId === item.id) return itemEditFormHtml(item);
  return `
    <div class="itin-item type-${item.type}" data-id="${item.id}">
      <div class="itin-item-time">${escapeHtml(itemTimeText(item))}</div>
      <div class="itin-item-body">
        <div class="itin-item-title">
          ${escapeHtml(item.title)}
          <span class="pill ${typePillClass(item.type)}">${item.type}</span>
        </div>
        ${itemMetaHtml(item)}
        ${item.notes ? `<div class="itin-item-meta">${escapeHtml(item.notes)}</div>` : ''}
        <div class="itin-item-actions-inline">
          <button type="button" data-action="add-alt">+ Add an alternative option</button>
        </div>
      </div>
      <div class="itin-item-actions">
        ${reorderButtonsHtml(unit, unitIdx, totalUnits)}
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

/* ---------------- choice groups (options) ---------------- */

function choiceCardHtml(unit, unitIdx, totalUnits){
  const { groupId, options } = unit;
  const selected = options.find((o) => o.is_selected) || options[0];

  if (editingId === selected.id) {
    return `
      <div class="itin-item choice-card" data-group="${groupId}">
        <div class="itin-item-time">${escapeHtml(itemTimeText(selected))}</div>
        <div class="itin-item-body">
          <div class="choice-toggle">${choicePillsHtml(options, selected)}</div>
          ${itemEditFormHtml(selected)}
        </div>
      </div>`;
  }

  return `
    <div class="itin-item choice-card" data-group="${groupId}" data-selected-id="${selected.id}">
      <div class="itin-item-time">${escapeHtml(itemTimeText(selected))}</div>
      <div class="itin-item-body">
        <div class="choice-toggle">${choicePillsHtml(options, selected)}</div>
        <div class="itin-item-title">
          ${escapeHtml(selected.title)}
          <span class="pill ${typePillClass(selected.type)}">${selected.type}</span>
        </div>
        ${itemMetaHtml(selected)}
        ${selected.notes ? `<div class="itin-item-meta">${escapeHtml(selected.notes)}</div>` : ''}
        <div class="itin-item-actions-inline">
          <button type="button" data-action="edit-option">Edit</button>
          <button type="button" data-action="delete-option">Remove this option</button>
          <button type="button" data-action="add-option">+ Add another option</button>
        </div>
        ${addOptionForGroup === groupId ? optionFormHtml(groupId) : ''}
      </div>
      <div class="itin-item-actions">
        ${reorderButtonsHtml(unit, unitIdx, totalUnits)}
      </div>
    </div>`;
}

function choicePillsHtml(options, selected){
  return options.map((opt) => `
    <button type="button" class="choice-pill ${opt.id === selected.id ? 'is-active' : ''}" data-action="select-option" data-option-id="${opt.id}">
      ${escapeHtml(opt.title)}
    </button>`).join('');
}

function optionFormHtml(groupId){
  return `
    <div class="inline-form" data-add-option-for="${groupId}">
      <div class="field"><label>Option title</label><input type="text" data-f="title" placeholder="e.g. Sphere: Dead &amp; Company"></div>
      <div class="field-row">
        <div class="field"><label>Start time</label><input type="time" data-f="start_time"></div>
        <div class="field"><label>End time</label><input type="time" data-f="end_time"></div>
      </div>
      <div class="field"><label>Estimated cost (USD)</label><input type="number" step="0.01" data-f="estimated_cost" placeholder="Optional"></div>
      <div class="field"><label>Notes</label><textarea data-f="notes" placeholder="Optional"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel-add-option">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save-add-option">Add option</button>
      </div>
    </div>`;
}

function reorderButtonsHtml(unit, idx, total){
  return `
    <div class="reorder-btns">
      <button type="button" data-action="up" data-unit-kind="${unit.kind}" data-unit-key="${unitKey(unit)}" ${idx === 0 ? 'disabled' : ''} aria-label="Move earlier">&#9650;</button>
      <button type="button" data-action="down" data-unit-kind="${unit.kind}" data-unit-key="${unitKey(unit)}" ${idx === total - 1 ? 'disabled' : ''} aria-label="Move later">&#9660;</button>
    </div>`;
}

/* ---------------- add-to-day form ---------------- */

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
  const items = (itemsByDay.get(day) || []).slice();
  const units = buildUnits(items);
  const leg = legForDay(day);
  return `
    <div class="day-group" data-day="${day}">
      <div class="day-group-head" title="${escapeHtml(formatDateFull(day))}">
        <span class="dow">${formatDateShort(day)}</span>
        ${leg ? `<span class="leg-tag">${escapeHtml(leg.city)}</span>` : ''}
      </div>
      ${units.length
        ? units.map((u, idx) => u.kind === 'choice' ? choiceCardHtml(u, idx, units.length) : itemRowHtml(u.item, u, idx, units.length)).join('')
        : '<p class="section-note">Nothing planned yet.</p>'}
      ${openAddDay === day ? addFormHtml(day) : `<button type="button" class="add-affordance" data-action="open-add" data-day="${day}" style="margin-top:8px;">+ Add to this day</button>`}
    </div>`;
}

/* ---------------- form reading ---------------- */

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

function readOptionForm(form){
  const get = (f) => qs(`[data-f="${f}"]`, form);
  return {
    title: get('title').value.trim(),
    start_time: get('start_time').value || null,
    end_time: get('end_time').value || null,
    estimated_cost: get('estimated_cost').value ? parseFloat(get('estimated_cost').value) : null,
    notes: get('notes').value.trim() || null
  };
}

/* ---------------- data + render lifecycle ---------------- */

async function reload(){
  const [items, places] = await Promise.all([db.itineraryItems.list(state.trip.id), db.places.list(state.trip.id)]);
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
      <p class="lede">Day by day, grouped by leg. Fixed anchors can't move — everything else can. Still deciding between two options for a slot? Add both and toggle.</p>
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

      /* ---- add to day ---- */
      if (action === 'open-add') { openAddDay = day; editingId = null; addOptionForGroup = null; renderAll(); return; }
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

      /* ---- edit / delete a standalone item (or, via the same form, a selected option) ---- */
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

      /* ---- turn a standalone item into the start of a choice group ---- */
      if (action === 'add-alt') {
        try {
          const newGroupId = crypto.randomUUID();
          await db.itineraryItems.update(id, { choice_group_id: newGroupId });
          addOptionForGroup = newGroupId;
          await reload();
          renderAll();
        } catch (err) { toast(friendlyError(err)); }
        return;
      }

      /* ---- choice card actions ---- */
      const cardEl = e.target.closest('[data-group]');
      const groupId = cardEl ? cardEl.dataset.group : null;
      const selectedId = cardEl ? cardEl.dataset.selectedId : null;

      if (action === 'select-option') {
        const optionId = btn.dataset.optionId;
        if (optionId === selectedId) return;
        try {
          const options = (itemsByDay.get(day) || []).filter((i) => i.choice_group_id === groupId);
          await Promise.all(options.map((o) =>
            db.itineraryItems.update(o.id, { is_selected: o.id === optionId })
          ));
          await reload();
          renderAll();
        } catch (err) { toast(friendlyError(err)); }
        return;
      }
      if (action === 'edit-option') { editingId = selectedId; renderAll(); return; }
      if (action === 'delete-option') {
        if (!window.confirm('Remove this option? The other option(s) stay.')) return;
        try {
          await db.itineraryItems.remove(selectedId);
          const remaining = (itemsByDay.get(day) || []).filter((i) => i.choice_group_id === groupId && i.id !== selectedId);
          if (remaining.length === 1) {
            // Down to one option — it's not really a choice any more.
            await db.itineraryItems.update(remaining[0].id, { choice_group_id: null, is_selected: true });
          } else if (remaining.length > 1 && !remaining.some((o) => o.is_selected)) {
            await db.itineraryItems.update(remaining[0].id, { is_selected: true });
          }
          await reload();
          renderAll();
          toast('Option removed');
        } catch (err) { toast(friendlyError(err)); }
        return;
      }
      if (action === 'add-option') { addOptionForGroup = groupId; editingId = null; renderAll(); return; }
      if (action === 'cancel-add-option') { addOptionForGroup = null; renderAll(); return; }
      if (action === 'save-add-option') {
        const form = btn.closest('.inline-form');
        const values = readOptionForm(form);
        if (!values.title) { toast('Give the option a title first'); return; }
        try {
          const groupOptions = (itemsByDay.get(day) || []).filter((i) => i.choice_group_id === groupId);
          const shared = groupOptions[0];
          await db.itineraryItems.create({
            trip_id: state.trip.id,
            leg_id: shared.leg_id,
            day,
            choice_group_id: groupId,
            is_selected: false,
            type: shared.type,
            currency: 'USD',
            sort_order: shared.sort_order,
            ...values
          });
          addOptionForGroup = null;
          await reload();
          renderAll();
          toast('Option added');
        } catch (err) { toast(friendlyError(err)); }
        return;
      }

      /* ---- reorder (unit-level: a choice group moves as one block) ---- */
      if (action === 'up' || action === 'down') {
        const dayItems = itemsByDay.get(day) || [];
        const units = buildUnits(dayItems);
        const kind = btn.dataset.unitKind;
        const key = btn.dataset.unitKey;
        const idx = units.findIndex((u) => u.kind === kind && unitKey(u) === key);
        const swapIdx = action === 'up' ? idx - 1 : idx + 1;
        if (idx < 0 || swapIdx < 0 || swapIdx >= units.length) return;
        const a = units[idx], b = units[swapIdx];
        const aMembers = unitMembers(a), bMembers = unitMembers(b);
        const aVal = a.sortOrder, bVal = b.sortOrder;
        try {
          await Promise.all([
            ...aMembers.map((m) => db.itineraryItems.update(m.id, { sort_order: bVal })),
            ...bMembers.map((m) => db.itineraryItems.update(m.id, { sort_order: aVal }))
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
  addOptionForGroup = null;
  await reload();
  renderAll();
}
