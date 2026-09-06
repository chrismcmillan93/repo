import { db } from '../db.js';
import { state } from '../state.js';
import { qs, qsa, escapeHtml, toast, friendlyError, formatDateMed } from '../utils.js';

const CATEGORIES = ['admin', 'tickets', 'packing', 'other'];
const CATEGORY_LABEL = { admin: 'Admin', tickets: 'Tickets', packing: 'Packing', other: 'Other' };

let items = [];
let addOpen = false;
let editingId = null;
let containerRef = null;

function rowHtml(item){
  if (editingId === item.id) return formWrap(item, 'edit');
  return `
    <div class="check-row ${item.is_done ? 'is-done' : ''}" data-id="${item.id}">
      <input type="checkbox" data-action="toggle" ${item.is_done ? 'checked' : ''} aria-label="Mark done">
      <div style="flex:1;min-width:0;">
        <div class="check-title">${escapeHtml(item.title)}</div>
        <div class="check-meta">
          ${item.due_date ? `Due ${escapeHtml(formatDateMed(item.due_date))}` : ''}
          ${item.url ? ` &middot; <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Link</a>` : ''}
        </div>
        ${item.notes ? `<div class="check-meta">${escapeHtml(item.notes)}</div>` : ''}
      </div>
      <div class="row-card-actions">
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit">&#9998;</button>
        <button type="button" class="icon-btn" data-action="delete" aria-label="Delete">&#10005;</button>
      </div>
    </div>`;
}

function formFields(item = {}){
  return `
    <div class="field"><label>Title</label><input type="text" data-f="title" value="${escapeHtml(item.title || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Category</label>
        <select data-f="category">${CATEGORIES.map((c) => `<option value="${c}" ${c === (item.category || 'other') ? 'selected' : ''}>${CATEGORY_LABEL[c]}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Due date</label><input type="date" data-f="due_date" value="${item.due_date || ''}"></div>
    </div>
    <div class="field"><label>Link</label><input type="url" data-f="url" value="${escapeHtml(item.url || '')}"></div>
    <div class="field"><label>Notes</label><textarea data-f="notes">${escapeHtml(item.notes || '')}</textarea></div>
  `;
}

function formWrap(item, mode){
  return `
    <div class="inline-form" data-mode="${mode}" ${item.id ? `data-id="${item.id}"` : ''}>
      ${formFields(item)}
      <div class="form-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-action="save">${mode === 'add' ? 'Add item' : 'Save changes'}</button>
      </div>
    </div>`;
}

function readForm(form){
  const v = (f) => qs(`[data-f="${f}"]`, form).value;
  return {
    title: v('title').trim(),
    category: v('category'),
    due_date: v('due_date') || null,
    url: v('url').trim() || null,
    notes: v('notes').trim() || null
  };
}

function renderAll(){
  const openCount = items.filter((i) => !i.is_done).length;
  containerRef.innerHTML = `
    <div id="checklist-root">
      <div class="page-head">
        <h1>Checklist</h1>
        <p class="lede">${openCount} open item${openCount === 1 ? '' : 's'}.</p>
      </div>
      ${addOpen ? formWrap({}, 'add') : '<button type="button" class="add-affordance" data-action="open-add" style="margin-bottom:20px;">+ Add checklist item</button>'}
      ${CATEGORIES.map((cat) => {
        const rows = items.filter((i) => i.category === cat).sort((a, b) => a.sort_order - b.sort_order);
        if (!rows.length) return '';
        return `
          <div class="checklist-group">
            <h3>${CATEGORY_LABEL[cat]}</h3>
            ${rows.map(rowHtml).join('')}
          </div>`;
      }).join('')}
      ${items.length ? '' : '<div class="empty-state"><strong>Nothing on the list yet</strong>Add the first thing you need to sort before departure.</div>'}
    </div>
  `;
  // Scoped to #checklist-root, recreated every render — avoids leaking a
  // listener onto the persistent #app-main node shared by every screen.
  qs('#checklist-root', containerRef).addEventListener('click', handleClick);
}

async function handleClick(e){
  const btn = e.target.closest('button[data-action]');
  const checkbox = e.target.closest('input[data-action="toggle"]');

  if (checkbox) {
    const id = checkbox.closest('[data-id]').dataset.id;
    try {
      await db.checklistItems.update(id, { is_done: checkbox.checked });
      await reload();
      renderAll();
    } catch (err) { toast(friendlyError(err)); }
    return;
  }

  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'open-add') { addOpen = true; editingId = null; renderAll(); return; }
  if (action === 'cancel') { addOpen = false; editingId = null; renderAll(); return; }
  if (action === 'edit') { editingId = e.target.closest('[data-id]').dataset.id; renderAll(); return; }

  if (action === 'delete') {
    if (!window.confirm('Delete this checklist item?')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    try { await db.checklistItems.remove(id); await reload(); renderAll(); toast('Deleted'); }
    catch (err) { toast(friendlyError(err)); }
    return;
  }

  if (action === 'save') {
    const form = btn.closest('.inline-form');
    const values = readForm(form);
    if (!values.title) { toast('Give it a title first'); return; }
    try {
      if (form.dataset.mode === 'add') {
        const maxSort = items.reduce((m, i) => Math.max(m, i.sort_order), -1);
        await db.checklistItems.create({ trip_id: state.trip.id, sort_order: maxSort + 1, ...values });
        addOpen = false;
        toast('Checklist item added');
      } else {
        await db.checklistItems.update(form.dataset.id, values);
        editingId = null;
        toast('Checklist item updated');
      }
      await reload();
      renderAll();
    } catch (err) { toast(friendlyError(err)); }
  }
}

async function reload(){
  items = await db.checklistItems.list();
}

export async function render(container){
  containerRef = container;
  addOpen = false;
  editingId = null;
  await reload();
  renderAll();
}
