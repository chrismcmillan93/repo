// Per-leg shortlist (things to do/eat/see) + day-by-day itinerary, combined in
// one collapsible panel per leg — same combined shape as the live app's
// "locations" panel (renderLocations() in thailand/index.html), not split into
// separate Itinerary/Places screens the way usa/ does it.
import { esc, toast, friendlyError, costLine, tagsRowHtml, ratingAndLinkHtml, reservationBadgeHtml, CATEGORY_COLORS } from '../utils.js';
import { state } from '../state.js';
import { db } from '../db.js';

const ui = {
  expandedLegs: {},
  itinOpen: {},
  categoryFilter: {},
  drafts: {}, // legId -> { title, cost }
  itinDrafts: {} // "legId:day" -> { time, text }
};
let wired = false;
let mainEl = null;

function legItems(legId) {
  return state.items.filter((i) => i.leg_id === legId).sort((a, b) => a.sort_order - b.sort_order);
}
function legEntries(legId, day) {
  return state.itineraryEntries.filter((e) => e.leg_id === legId && e.day_label === day).sort((a, b) => a.sort_order - b.sort_order);
}

function itemRowHtml(item, idx, total) {
  const day = item.day_label ? '<span class="badge" style="background:var(--blue);margin-right:0.3rem;">' + esc(item.day_label) + '</span>' : '';
  const cat = '<span class="badge" style="background:' + (CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other) + ';margin-right:0.4rem;">' + esc(item.category) + '</span>';
  return '<div class="row"><div class="row-main">' +
    '<button class="check ' + (item.is_checked ? 'checked' : '') + '" data-action="toggle-item" data-id="' + item.id + '" aria-label="Toggle add to trip">' + (item.is_checked ? '✓' : '') + '</button>' +
    '<div style="flex:1;min-width:0;">' + day + cat +
    '<span class="item-title ' + (item.is_checked ? 'checked' : '') + '">' + esc(item.title) + '</span>' +
    (item.description ? '<div class="item-desc">' + esc(item.description) + '</div>' : '') +
    (item.notes ? '<div class="item-desc">' + esc(item.notes) + '</div>' : '') +
    tagsRowHtml(item.tags) +
    '<div class="item-meta"><span class="item-cost">' + esc(costLine(item, state.trip)) + '</span>' + ratingAndLinkHtml(item) + reservationBadgeHtml(item) + '</div>' +
    '</div></div>' +
    '<div class="row-actions">' +
    '<button class="icon-btn" ' + (idx === 0 ? 'disabled' : '') + ' data-action="move-item" data-dir="up" data-id="' + item.id + '" aria-label="Move up">↑</button>' +
    '<button class="icon-btn" ' + (idx === total - 1 ? 'disabled' : '') + ' data-action="move-item" data-dir="down" data-id="' + item.id + '" aria-label="Move down">↓</button>' +
    '<button class="icon-btn" data-action="delete-item" data-id="' + item.id + '" aria-label="Delete">🗑</button>' +
    '</div></div>';
}

function itinSectionHtml(leg) {
  const open = !!ui.itinOpen[leg.id];
  const count = state.itineraryEntries.filter((e) => e.leg_id === leg.id).length;
  let body = '';
  if (open) {
    body = (leg.days || []).map((day) => {
      const entries = legEntries(leg.id, day);
      const rows = entries.length === 0
        ? '<div class="itin-empty">Nothing scheduled yet</div>'
        : entries.map((e, idx) => (
          '<div class="itin-row"><span class="itin-time">' + esc(e.time_label || '—') + '</span>' +
          '<span style="flex:1;">' + esc(e.text) + '</span>' +
          '<button class="icon-btn" data-action="itin-delete" data-id="' + e.id + '" aria-label="Delete">🗑</button></div>'
        )).join('');
      const key = leg.id + ':' + day;
      const draft = ui.itinDrafts[key] || { time: '', text: '' };
      return '<div class="itin-day"><div class="itin-daylabel">' + esc(day) + '</div>' + rows +
        '<div class="add-row" style="margin-top:0.3rem;">' +
        '<input class="input" style="width:4.4rem;" placeholder="Time" data-role="itin-draft-time" data-key="' + esc(key) + '" value="' + esc(draft.time) + '">' +
        '<input class="input" style="flex:1;" placeholder="Add to ' + esc(day) + '…" data-role="itin-draft-text" data-key="' + esc(key) + '" value="' + esc(draft.text) + '">' +
        '<button class="icon-btn" data-action="itin-add" data-leg="' + leg.id + '" data-day="' + esc(day) + '" aria-label="Add">➕</button></div></div>';
    }).join('');
  }
  return '<div class="itin-wrap"><button class="itin-head" data-action="toggle-itin" data-id="' + leg.id + '">' +
    '<span class="itin-title">📅 Itinerary</span><span class="itin-count">' + count + ' scheduled</span>' +
    '<span class="chev ' + (open ? 'open' : '') + '">⌄</span></button>' +
    (open ? '<div class="itin-body">' + body + '</div>' : '') + '</div>';
}

function legPanelHtml(leg) {
  const items = legItems(leg.id);
  const checkedCount = items.filter((i) => i.is_checked).length;
  const open = !!ui.expandedLegs[leg.id];

  let filterBtns = '';
  let displayItems = items;
  if (open) {
    const cats = [];
    items.forEach((i) => { if (cats.indexOf(i.category) === -1) cats.push(i.category); });
    let activeCat = ui.categoryFilter[leg.id] || 'All';
    if (activeCat !== 'All' && cats.indexOf(activeCat) === -1) activeCat = 'All';
    if (cats.length > 1) {
      filterBtns = '<div class="filter-row">' + ['All'].concat(cats).map((c) => {
        const col = c === 'All' ? '#8FB0AC' : (CATEGORY_COLORS[c] || CATEGORY_COLORS.Other);
        const style = activeCat === c ? 'background:' + col + ';border-color:' + col + ';' : 'border-color:' + col + ';color:' + col + ';';
        return '<button class="filter-btn ' + (activeCat === c ? 'active' : '') + '" style="' + style + '" data-action="filter-cat" data-id="' + leg.id + '" data-category="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>';
    }
    displayItems = activeCat === 'All' ? items : items.filter((i) => i.category === activeCat);
  }

  const itemsHtml = !open ? '' : (displayItems.length === 0
    ? '<div class="empty">No plans logged yet — add your first stop below.</div>'
    : displayItems.map((item, idx) => itemRowHtml(item, idx, displayItems.length)).join(''));

  const draft = ui.drafts[leg.id] || { title: '', cost: '' };
  const addRow = !open ? '' : '<div class="add-row">' +
    '<input class="input input-title" placeholder="Add your own item…" data-role="draft-title" data-leg="' + leg.id + '" value="' + esc(draft.title) + '">' +
    '<input class="input input-cost" placeholder="£pp" inputmode="decimal" data-role="draft-cost" data-leg="' + leg.id + '" value="' + esc(draft.cost) + '">' +
    '<button class="btn-add" data-action="add-item" data-leg="' + leg.id + '">+ Add</button></div>';

  return '<div class="panel"><button class="panel-head" data-action="toggle-leg" data-id="' + leg.id + '">' +
    '<div><div class="panel-title"><span class="leg-num">' + esc(leg.leg_number) + '</span> ' + esc(leg.name) + '</div>' +
    '<div class="panel-sub">' + esc(leg.dates_label) + ' · <span class="progress">' + checkedCount + '/' + items.length + ' added</span></div></div>' +
    '<span class="chev ' + (open ? 'open' : '') + '">⌄</span></button>' +
    (open ? '<div class="panel-body">' + itinSectionHtml(leg) + filterBtns + itemsHtml + addRow + '</div>' : '') + '</div>';
}

function rerender() { if (mainEl) render(mainEl); }

async function withErrorToast(fn) {
  try { await fn(); } catch (err) { toast(friendlyError(err)); }
}

function wire(main) {
  if (wired) return;
  wired = true;

  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !main.contains(btn)) return;
    const action = btn.dataset.action;

    if (action === 'toggle-leg') { ui.expandedLegs[btn.dataset.id] = !ui.expandedLegs[btn.dataset.id]; rerender(); }
    else if (action === 'toggle-itin') { ui.itinOpen[btn.dataset.id] = !ui.itinOpen[btn.dataset.id]; rerender(); }
    else if (action === 'filter-cat') { ui.categoryFilter[btn.dataset.id] = btn.dataset.category; rerender(); }
    else if (action === 'toggle-item') {
      const item = state.items.find((i) => i.id === btn.dataset.id);
      if (!item) return;
      item.is_checked = !item.is_checked;
      rerender();
      await withErrorToast(() => db.items.update(item.id, { is_checked: item.is_checked }));
    } else if (action === 'delete-item') {
      const id = btn.dataset.id;
      state.items = state.items.filter((i) => i.id !== id);
      rerender();
      await withErrorToast(() => db.items.remove(id));
    } else if (action === 'move-item') {
      const item = state.items.find((i) => i.id === btn.dataset.id);
      if (!item) return;
      const siblings = legItems(item.leg_id);
      const idx = siblings.findIndex((i) => i.id === item.id);
      const swapIdx = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;
      const swap = siblings[swapIdx];
      const tmp = item.sort_order; item.sort_order = swap.sort_order; swap.sort_order = tmp;
      rerender();
      await withErrorToast(() => Promise.all([
        db.items.update(item.id, { sort_order: item.sort_order }),
        db.items.update(swap.id, { sort_order: swap.sort_order })
      ]));
    } else if (action === 'add-item') {
      const legId = btn.dataset.leg;
      const draft = ui.drafts[legId] || { title: '', cost: '' };
      if (!draft.title || !draft.title.trim()) return;
      const siblings = legItems(legId);
      const maxOrder = siblings.length ? Math.max(...siblings.map((i) => i.sort_order)) : -1;
      const values = {
        leg_id: legId, title: draft.title.trim(), category: 'Other',
        cost_gbp: draft.cost ? (parseFloat(draft.cost) || 0) : 0, sort_order: maxOrder + 1
      };
      ui.drafts[legId] = { title: '', cost: '' };
      await withErrorToast(async () => {
        const created = await db.items.create(values);
        state.items.push(created);
      });
      rerender();
    } else if (action === 'itin-add') {
      const legId = btn.dataset.leg, day = btn.dataset.day;
      const key = legId + ':' + day;
      const draft = ui.itinDrafts[key] || { time: '', text: '' };
      if (!draft.text || !draft.text.trim()) return;
      const siblings = legEntries(legId, day);
      const maxOrder = siblings.length ? Math.max(...siblings.map((e) => e.sort_order)) : -1;
      const values = { leg_id: legId, day_label: day, time_label: draft.time.trim(), text: draft.text.trim(), sort_order: maxOrder + 1 };
      ui.itinDrafts[key] = { time: '', text: '' };
      await withErrorToast(async () => {
        const created = await db.itineraryEntries.create(values);
        state.itineraryEntries.push(created);
      });
      rerender();
    } else if (action === 'itin-delete') {
      const id = btn.dataset.id;
      state.itineraryEntries = state.itineraryEntries.filter((e) => e.id !== id);
      rerender();
      await withErrorToast(() => db.itineraryEntries.remove(id));
    }
  });

  main.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.role === 'draft-title') { ui.drafts[el.dataset.leg] = Object.assign({}, ui.drafts[el.dataset.leg], { title: el.value }); }
    else if (el.dataset.role === 'draft-cost') { ui.drafts[el.dataset.leg] = Object.assign({}, ui.drafts[el.dataset.leg], { cost: el.value }); }
    else if (el.dataset.role === 'itin-draft-time') { ui.itinDrafts[el.dataset.key] = Object.assign({}, ui.itinDrafts[el.dataset.key], { time: el.value }); }
    else if (el.dataset.role === 'itin-draft-text') { ui.itinDrafts[el.dataset.key] = Object.assign({}, ui.itinDrafts[el.dataset.key], { text: el.value }); }
  });
}

export async function render(main) {
  mainEl = main;
  wire(main);
  if (!Object.keys(ui.expandedLegs).length && state.legs.length) ui.expandedLegs[state.legs[0].id] = true;
  const legsHtml = state.legs.map(legPanelHtml).join('');
  main.innerHTML =
    '<div class="page-head"><p class="page-title">Itinerary</p><p class="page-lede">Shortlist things to do, tick off what you\'re adding to the trip, and schedule the day.</p></div>' +
    legsHtml;
}
