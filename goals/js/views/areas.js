// Areas & Goals admin: life-area CRUD (rename, recolour, reorder, archive)
// and a filterable list of goals with links into their detail pages.

import * as db from '../db.js';
import { escapeHtml, statusLabel, horizonLabel } from '../utils.js';
import { loadingHtml, errorHtml, emptyStateHtml, areaDotHtml } from './shared.js';

export async function renderAreas(root, params) {
  root.innerHTML = loadingHtml('Loading areas & goals…');
  try {
    const [active, archived, goals] = await Promise.all([
      db.listAreas(),
      db.listAreas({ includeArchived: true }).then((all) => all.filter((a) => a.archived_at)),
      db.listGoals({ includeArchived: true })
    ]);
    root.innerHTML = renderPage(active, archived, goals, params.query || {});
    bindPage(root, active);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function renderPage(active, archived, goals, query) {
  return `
    <section class="card">
      <p class="card-eyebrow">Life areas</p>
      ${active.length ? `<ul class="area-admin-list">${active.map((a, i) => areaRowHtml(a, i, active.length)).join('')}</ul>` : emptyStateHtml('No areas yet', 'Add your first one below.')}
      <form id="add-area-form" class="form-row">
        <input type="text" name="name" placeholder="New area name" maxlength="60" required>
        <input type="color" name="colour" value="#6b7280">
        <button type="submit" class="btn btn-quiet btn-sm">Add area</button>
      </form>

      ${archived.length ? `
        <details class="archived-details">
          <summary>Archived areas (${archived.length})</summary>
          <ul class="area-admin-list">${archived.map((a) => `
            <li class="area-admin-row">
              ${areaDotHtml(a.colour)}<span class="area-admin-name">${escapeHtml(a.name)}</span>
              <button type="button" class="btn btn-quiet btn-sm" data-unarchive-area="${a.id}">Unarchive</button>
            </li>
          `).join('')}</ul>
        </details>
      ` : ''}
    </section>

    <section class="card">
      <div class="goals-admin-head">
        <p class="card-eyebrow">Goals</p>
        <a class="btn btn-primary btn-sm" href="#/goal/new">+ New goal</a>
      </div>
      ${goalsListHtml(goals, active)}
    </section>
  `;
}

function areaRowHtml(a, index, count) {
  return `
    <li class="area-admin-row" data-area-row="${a.id}">
      <span class="area-admin-order">
        <button type="button" class="reorder-btn" data-move="up" data-area-id="${a.id}" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="reorder-btn" data-move="down" data-area-id="${a.id}" ${index === count - 1 ? 'disabled' : ''}>▼</button>
      </span>
      <form class="area-inline-form" data-area-id="${a.id}">
        <input type="color" name="colour" value="${escapeHtml(a.colour)}">
        <input type="text" name="name" value="${escapeHtml(a.name)}" maxlength="60">
        <button type="submit" class="btn btn-quiet btn-sm">Save</button>
      </form>
      <button type="button" class="btn btn-quiet btn-sm" data-archive-area="${a.id}">Archive</button>
    </li>
  `;
}

function goalsListHtml(goals, areas) {
  if (!goals.length) return emptyStateHtml('No goals yet', 'Create your first goal to start tracking.');
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const rows = goals.map((g) => {
    const area = areaById.get(g.area_id);
    return `
      <li class="goal-admin-row ${g.archived_at ? 'is-archived' : ''}">
        <a href="#/goal/${g.id}" class="goal-admin-title">${area ? areaDotHtml(area.colour) : ''}${escapeHtml(g.title)}</a>
        <span class="status-pill status-${g.status}">${statusLabel(g.status)}</span>
        <span class="pill-quiet">${horizonLabel(g.horizon)}</span>
        ${g.archived_at ? '<span class="pill-quiet">Archived</span>' : ''}
      </li>
    `;
  }).join('');
  return `<ul class="goal-admin-list">${rows}</ul>`;
}

function bindPage(root, active) {
  root.querySelector('#add-area-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await db.createArea({ name: fd.get('name'), colour: fd.get('colour'), sort_order: active.length });
    renderAreas(root, { query: {} });
  });

  root.querySelectorAll('.area-inline-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await db.updateArea(form.dataset.areaId, { name: fd.get('name'), colour: fd.get('colour') });
      renderAreas(root, { query: {} });
    });
  });

  root.querySelectorAll('[data-archive-area]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.archiveArea(btn.dataset.archiveArea);
      renderAreas(root, { query: {} });
    });
  });
  root.querySelectorAll('[data-unarchive-area]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.unarchiveArea(btn.dataset.unarchiveArea);
      renderAreas(root, { query: {} });
    });
  });

  root.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ids = active.map((a) => a.id);
      const idx = ids.indexOf(btn.dataset.areaId);
      const swapWith = btn.dataset.move === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= ids.length) return;
      [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
      await db.reorderAreas(ids);
      renderAreas(root, { query: {} });
    });
  });
}
