import { esc, toast, friendlyError } from '../utils.js';
import { state } from '../state.js';
import { db } from '../db.js';

const PACK_CATEGORIES = ['Clothing', 'Toiletries & Health', 'Electronics & Gear', 'Documents & Essentials'];
let wired = false;
let mainEl = null;
let drafts = {}; // category -> text

function rowHtml(p) {
  return '<div class="pack-row">' +
    '<button class="check ' + (p.is_checked ? 'checked' : '') + '" data-action="toggle-pack" data-id="' + p.id + '" aria-label="Toggle packed">' + (p.is_checked ? '✓' : '') + '</button>' +
    '<span class="pack-text ' + (p.is_checked ? 'checked' : '') + '" style="flex:1;">' + esc(p.text) + '</span>' +
    '<button class="icon-btn" data-action="delete-pack" data-id="' + p.id + '" aria-label="Delete">🗑</button></div>';
}

function categorySection(cat) {
  const items = state.packingItems.filter((p) => p.category === cat).sort((a, b) => a.sort_order - b.sort_order);
  const rows = items.map(rowHtml).join('');
  const draft = drafts[cat] || '';
  return '<div class="pack-cat">' + esc(cat) + '</div>' + rows +
    '<div class="add-row"><input class="input input-title" placeholder="Add to ' + esc(cat) + '…" data-role="draft-pack" data-category="' + esc(cat) + '" value="' + esc(draft) + '">' +
    '<button class="btn-add" data-action="add-pack" data-category="' + esc(cat) + '">+ Add</button></div>';
}

function rerender() { if (mainEl) render(mainEl); }
async function withErrorToast(fn) { try { await fn(); } catch (err) { toast(friendlyError(err)); } }

function wire(main) {
  if (wired) return;
  wired = true;
  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'toggle-pack') {
      const p = state.packingItems.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      p.is_checked = !p.is_checked;
      rerender();
      await withErrorToast(() => db.packingItems.update(p.id, { is_checked: p.is_checked }));
    } else if (btn.dataset.action === 'delete-pack') {
      const id = btn.dataset.id;
      state.packingItems = state.packingItems.filter((x) => x.id !== id);
      rerender();
      await withErrorToast(() => db.packingItems.remove(id));
    } else if (btn.dataset.action === 'add-pack') {
      const cat = btn.dataset.category;
      const text = (drafts[cat] || '').trim();
      if (!text) return;
      const siblings = state.packingItems.filter((p) => p.category === cat);
      const maxOrder = siblings.length ? Math.max(...siblings.map((p) => p.sort_order)) : -1;
      drafts[cat] = '';
      await withErrorToast(async () => {
        const created = await db.packingItems.create({ trip_id: state.trip.id, category: cat, text, sort_order: maxOrder + 1 });
        state.packingItems.push(created);
      });
      rerender();
    }
  });
  main.addEventListener('input', (e) => {
    if (e.target.dataset.role === 'draft-pack') drafts[e.target.dataset.category] = e.target.value;
  });
}

export async function render(main) {
  mainEl = main;
  wire(main);
  const total = state.packingItems.length;
  const checked = state.packingItems.filter((p) => p.is_checked).length;
  const cats = PACK_CATEGORIES.concat(
    Array.from(new Set(state.packingItems.map((p) => p.category))).filter((c) => PACK_CATEGORIES.indexOf(c) === -1)
  );
  main.innerHTML =
    '<div class="page-head"><p class="page-title">Packing list</p><p class="page-lede"><span class="progress">' + checked + '/' + total + ' packed</span></p></div>' +
    '<div class="panel"><div class="panel-body" style="border-top:none;padding-top:0.9rem;">' +
    cats.map(categorySection).join('') + '</div></div>';
}
