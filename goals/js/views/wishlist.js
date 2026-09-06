// Wishlist: a backlog of ideas, not goals — idea → planned → booked → done,
// with a rough cost. For things like a travel list where "is this actually
// happening yet" is the whole question, not a percent-complete arc.

import * as db from '../db.js';
import { escapeHtml, formatNumber, wishlistStatusLabel } from '../utils.js';
import { loadingHtml, errorHtml, emptyStateHtml, areaDotHtml } from './shared.js';

const STATUSES = ['idea', 'planned', 'booked', 'done'];

export async function renderWishlist(root) {
  root.innerHTML = loadingHtml('Loading your wishlist…');
  try {
    const [areas, items] = await Promise.all([
      db.listAreas(),
      db.listWishlistItems()
    ]);

    if (!areas.length) {
      root.innerHTML = emptyStateHtml('No life areas yet', 'Visit Areas & Goals to add one first — the wishlist is organised by area.');
      return;
    }

    const byArea = new Map(areas.map((a) => [a.id, { area: a, items: [] }]));
    items.forEach((it) => { const bucket = byArea.get(it.area_id); if (bucket) bucket.items.push(it); });

    root.innerHTML = [...byArea.values()].map((b) => areaSectionHtml(b.area, b.items)).join('');
    bindPage(root);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function areaSectionHtml(area, items) {
  return `
    <section class="card">
      <p class="card-eyebrow">${areaDotHtml(area.colour)}${escapeHtml(area.name)}</p>
      ${items.length ? `<ul class="wishlist-list">${items.map(rowHtml).join('')}</ul>${totalsHtml(items)}` : emptyStateHtml('Nothing on the list yet', 'Add the first idea below.')}
      <form class="wishlist-add-form form-row" data-add-for="${area.id}">
        <input type="text" name="title" placeholder="New idea" required>
        <input type="number" step="any" name="estimated_cost" placeholder="Cost">
        <input type="text" name="unit" placeholder="£" maxlength="8" style="max-width:60px;">
        <input type="text" name="target_period" placeholder="When? (e.g. 2027)" maxlength="40">
        <button type="submit" class="btn btn-quiet btn-sm">Add</button>
      </form>
    </section>
  `;
}

function rowHtml(item) {
  const cost = item.estimated_cost !== null && item.estimated_cost !== undefined
    ? `~${formatNumber(item.estimated_cost, item.unit)}` : null;
  return `
    <li class="wishlist-row">
      <div class="wishlist-row-main">
        <span class="wishlist-title">${escapeHtml(item.title)}</span>
        ${cost ? `<span class="wishlist-cost">${escapeHtml(cost)}</span>` : ''}
      </div>
      <div class="wishlist-row-meta">
        <select class="wishlist-status-select status-${item.status}" data-wishlist-id="${item.id}">
          ${STATUSES.map((s) => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${wishlistStatusLabel(s)}</option>`).join('')}
        </select>
        ${item.target_period ? `<span class="pill-quiet">${escapeHtml(item.target_period)}</span>` : ''}
        <button type="button" class="btn btn-quiet btn-sm" data-archive-wishlist="${item.id}">Archive</button>
      </div>
      ${item.notes ? `<p class="wishlist-notes">${escapeHtml(item.notes)}</p>` : ''}
    </li>
  `;
}

/** Sums cost by unit (mixed currencies shown separately rather than wrongly combined), excluding done items. */
function totalsHtml(items) {
  const open = items.filter((it) => it.status !== 'done' && it.estimated_cost !== null && it.estimated_cost !== undefined);
  if (!open.length) return '';
  const byUnit = new Map();
  open.forEach((it) => {
    const key = it.unit || '';
    byUnit.set(key, (byUnit.get(key) || 0) + Number(it.estimated_cost));
  });
  const parts = [...byUnit.entries()].map(([unit, sum]) => formatNumber(sum, unit));
  return `<p class="wishlist-total">Not yet done: ${parts.join(' + ')} across ${open.length} idea${open.length === 1 ? '' : 's'}</p>`;
}

function bindPage(root) {
  root.querySelectorAll('.wishlist-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await db.setWishlistStatus(sel.dataset.wishlistId, sel.value);
      renderWishlist(root);
    });
  });

  root.querySelectorAll('[data-archive-wishlist]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.archiveWishlistItem(btn.dataset.archiveWishlist);
      renderWishlist(root);
    });
  });

  root.querySelectorAll('.wishlist-add-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim();
      if (!title) return;
      await db.createWishlistItem({
        area_id: form.dataset.addFor,
        title,
        estimated_cost: fd.get('estimated_cost'),
        unit: fd.get('unit'),
        target_period: fd.get('target_period')
      });
      renderWishlist(root);
    });
  });
}
