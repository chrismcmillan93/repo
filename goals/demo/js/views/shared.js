// Small pieces shared across views: the overdue action bar, star/number
// pickers, and generic loading/empty/error states. Kept together since
// they're each a few lines, not because they're one "thing".

import { escapeHtml, formatDateDMY, todayISO, isOverdue } from '../utils.js';
import * as db from '../db.js';

export function loadingHtml(label) {
  return `<div class="loading-state">${escapeHtml(label || 'Loading…')}</div>`;
}

export function errorHtml(err) {
  const msg = (err && err.message) ? err.message : String(err);
  return `<div class="error-banner">Something went wrong: ${escapeHtml(msg)}</div>`;
}

export function emptyStateHtml(title, body) {
  return `<div class="empty-state"><p class="empty-title">${escapeHtml(title)}</p><p class="empty-body">${escapeHtml(body || '')}</p></div>`;
}

/** A tappable pill that expands to extend/achieve/drop for an overdue goal. Max 3 taps from the dashboard, as the spec requires. */
export function overdueBannerHtml(goal) {
  if (!isOverdue(goal)) return '';
  return `
    <div class="overdue-block" data-overdue-for="${goal.id}">
      <button type="button" class="overdue-pill" data-action="toggle-overdue">⚠ Overdue since ${escapeHtml(formatDateDMY(goal.target_date))}</button>
      <div class="overdue-actions" hidden>
        <div class="overdue-actions-row">
          <button type="button" class="btn btn-quiet btn-sm" data-action="overdue-extend">Extend date</button>
          <button type="button" class="btn btn-quiet btn-sm" data-action="overdue-achieve">Mark achieved</button>
          <button type="button" class="btn btn-quiet btn-sm" data-action="overdue-drop">Drop</button>
        </div>
        <form class="overdue-extend-form" hidden>
          <input type="date" name="new-target" value="${escapeHtml(goal.target_date)}" required>
          <button type="submit" class="btn btn-primary btn-sm">Save new date</button>
        </form>
      </div>
    </div>
  `;
}

/** Wires up the overdue block rendered by overdueBannerHtml(). Calls onChanged() after any successful action. */
export function bindOverdueActions(root, goal, onChanged) {
  const block = root.querySelector(`[data-overdue-for="${goal.id}"]`);
  if (!block) return;
  const actions = block.querySelector('.overdue-actions');
  const extendForm = block.querySelector('.overdue-extend-form');

  block.querySelector('[data-action="toggle-overdue"]').addEventListener('click', () => {
    actions.hidden = !actions.hidden;
  });
  block.querySelector('[data-action="overdue-extend"]').addEventListener('click', () => {
    extendForm.hidden = !extendForm.hidden;
  });
  block.querySelector('[data-action="overdue-achieve"]').addEventListener('click', async () => {
    await db.setGoalStatus(goal.id, 'achieved');
    onChanged();
  });
  block.querySelector('[data-action="overdue-drop"]').addEventListener('click', async () => {
    if (!confirm(`Drop "${goal.title}"? You can still see it in its area's archive.`)) return;
    await db.setGoalStatus(goal.id, 'dropped');
    onChanged();
  });
  extendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newDate = new FormData(extendForm).get('new-target');
    if (!newDate) return;
    await db.changeTargetDate(goal, newDate);
    onChanged();
  });
}

/** 1-5 tap-to-pick control (used for confidence and rating). */
export function pickerHtml(name, selected, labels) {
  const buttons = [1, 2, 3, 4, 5].map((n) => (
    `<button type="button" class="picker-btn ${n === Number(selected) ? 'is-selected' : ''}" data-picker="${name}" data-value="${n}" title="${escapeHtml(labels ? labels[n - 1] : String(n))}">${n}</button>`
  )).join('');
  return `<div class="picker-group" data-picker-group="${name}">${buttons}</div>`;
}

export function bindPicker(root, name, onChange) {
  const group = root.querySelector(`[data-picker-group="${name}"]`);
  if (!group) return;
  group.querySelectorAll('.picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.picker-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      onChange(Number(btn.dataset.value));
    });
  });
}

export function areaDotHtml(colour) {
  return `<span class="area-dot" style="background:${escapeHtml(colour || '#6b7280')}"></span>`;
}

export function statusPillClass(status) {
  return `status-pill status-${status}`;
}
