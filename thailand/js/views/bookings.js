// Pre-trip to-do checklist — "book this restaurant", "check visa rules", etc.
import { esc, toast, friendlyError, URGENCY_COLOR, URGENCY_RANK } from '../utils.js';
import { state } from '../state.js';
import { db } from '../db.js';

let wired = false;
let mainEl = null;
let draft = '';

function rowHtml(b) {
  return '<div class="row"><div class="row-main">' +
    '<button class="check ' + (b.is_done ? 'checked' : '') + '" data-action="toggle-booking" data-id="' + b.id + '" aria-label="Toggle done">' + (b.is_done ? '✓' : '') + '</button>' +
    '<div style="flex:1;min-width:0;">' +
    '<span class="badge" style="background:' + (URGENCY_COLOR[b.urgency] || URGENCY_COLOR.low) + ';margin-right:0.4rem;">' + esc(b.urgency) + '</span>' +
    '<span class="item-title ' + (b.is_done ? 'checked' : '') + '">' + esc(b.title) + '</span>' +
    (b.deadline_label ? '<div class="deadline" style="margin-top:0.25rem;">' + esc(b.deadline_label) + '</div>' : '') +
    (b.notes ? '<div class="item-desc">' + esc(b.notes) + '</div>' : '') +
    '</div></div>' +
    '<div class="row-actions"><button class="icon-btn" data-action="delete-booking" data-id="' + b.id + '" aria-label="Delete">🗑</button></div></div>';
}

function rerender() { if (mainEl) render(mainEl); }
async function withErrorToast(fn) { try { await fn(); } catch (err) { toast(friendlyError(err)); } }

function wire(main) {
  if (wired) return;
  wired = true;
  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'toggle-booking') {
      const b = state.bookings.find((x) => x.id === btn.dataset.id);
      if (!b) return;
      b.is_done = !b.is_done;
      rerender();
      await withErrorToast(() => db.bookings.update(b.id, { is_done: b.is_done }));
    } else if (btn.dataset.action === 'delete-booking') {
      const id = btn.dataset.id;
      state.bookings = state.bookings.filter((x) => x.id !== id);
      rerender();
      await withErrorToast(() => db.bookings.remove(id));
    } else if (btn.dataset.action === 'add-booking') {
      if (!draft.trim()) return;
      const maxOrder = state.bookings.length ? Math.max(...state.bookings.map((b) => b.sort_order)) : -1;
      const values = { trip_id: state.trip.id, title: draft.trim(), urgency: 'low', sort_order: maxOrder + 1 };
      draft = '';
      await withErrorToast(async () => {
        const created = await db.bookings.create(values);
        state.bookings.push(created);
      });
      rerender();
    }
  });
  main.addEventListener('input', (e) => {
    if (e.target.dataset.role === 'draft-booking') draft = e.target.value;
  });
}

export async function render(main) {
  mainEl = main;
  wire(main);
  const sorted = state.bookings.slice().sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    return (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
  });
  const rows = sorted.length ? sorted.map(rowHtml).join('') : '<div class="empty">Nothing on the checklist yet.</div>';
  main.innerHTML =
    '<div class="page-head"><p class="page-title">Pre-trip bookings</p><p class="page-lede">Reservations, activities and admin to sort before you fly.</p></div>' +
    '<div class="panel"><div class="panel-body" style="border-top:none;padding-top:0.9rem;">' + rows +
    '<div class="add-row"><input class="input input-title" placeholder="Add something to book or check…" data-role="draft-booking" value="' + esc(draft) + '">' +
    '<button class="btn-add" data-action="add-booking">+ Add</button></div>' +
    '</div></div>';
}
