// Notes: a running notebook page per life area — the OneNote-style
// "keep appending to the same document over months" pattern, distinct from
// the dated, atomic goal_updates log. Plain text with light formatting
// (headings, bullets, *bold*, _italic_), not a WYSIWYG editor.

import * as db from '../db.js';
import { escapeHtml, relativeDays, renderNote } from '../utils.js';
import { navigate } from '../router.js';
import { loadingHtml, errorHtml, emptyStateHtml, areaDotHtml } from './shared.js';

export async function renderNotesHome(root) {
  root.innerHTML = loadingHtml('Loading your notes…');
  try {
    const [areas, pages] = await Promise.all([
      db.listAreas(),
      db.listNotePages()
    ]);

    if (!areas.length) {
      root.innerHTML = emptyStateHtml('No life areas yet', 'Visit Areas & Goals to add one first — notes are organised by area.');
      return;
    }

    const byArea = new Map(areas.map((a) => [a.id, { area: a, pages: [] }]));
    pages.forEach((p) => { const bucket = byArea.get(p.area_id); if (bucket) bucket.pages.push(p); });

    root.innerHTML = [...byArea.values()].map((b) => `
      <section class="card">
        <div class="notes-area-head">
          <p class="card-eyebrow">${areaDotHtml(b.area.colour)}${escapeHtml(b.area.name)}</p>
          <a class="btn btn-quiet btn-sm" href="#/notes/new?area=${b.area.id}">+ New note</a>
        </div>
        ${b.pages.length ? `<ul class="notes-list">${b.pages.map(pageRowHtml).join('')}</ul>` : emptyStateHtml('No notes yet', 'Start one above.')}
      </section>
    `).join('');
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function pageRowHtml(p) {
  const snippet = (p.content || '').split('\n').find((l) => l.trim()) || '';
  return `
    <li class="notes-row">
      <a href="#/notes/${p.id}" class="notes-row-title">${escapeHtml(p.title)}</a>
      <p class="notes-row-meta">Updated ${relativeDays(p.updated_at.slice(0, 10))}</p>
      ${snippet ? `<p class="notes-row-snippet">${escapeHtml(snippet.slice(0, 120))}</p>` : ''}
    </li>
  `;
}

export async function renderNoteForm(root, params) {
  root.innerHTML = loadingHtml('Loading…');
  try {
    const areas = await db.listAreas();
    if (!areas.length) {
      root.innerHTML = `<div class="card"><p>Add a life area first. <a href="#/areas">Areas &amp; Goals</a>.</p></div>`;
      return;
    }
    const preselected = (params.query || {}).area || areas[0].id;

    root.innerHTML = `
      <a class="back-link" href="#/notes">← Notes</a>
      <section class="card">
        <p class="card-eyebrow">New note</p>
        <form id="note-form" class="stacked-form">
          <label>Life area
            <select name="area_id">${areas.map((a) => `<option value="${a.id}" ${a.id === preselected ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
          </label>
          <label>Title
            <input type="text" name="title" maxlength="160" required placeholder="e.g. General goals to aim for">
          </label>
          <label>Content <span class="field-hint">(optional to start — you can always add more later)</span>
            <textarea name="content" rows="10" placeholder="# Heading&#10;- a bullet&#10;- another one&#10;&#10;Plain paragraphs work too. *bold* and _italic_ are supported."></textarea>
          </label>
          <p id="form-error" class="form-error" style="display:none;"></p>
          <div class="form-row">
            <button type="submit" class="btn btn-primary">Create note</button>
            <a class="btn btn-quiet" href="#/notes">Cancel</a>
          </div>
        </form>
      </section>
    `;

    const form = root.querySelector('#note-form');
    const errorEl = root.querySelector('#form-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim();
      if (!title) {
        errorEl.textContent = 'Give the note a title.';
        errorEl.style.display = '';
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const created = await db.createNotePage({ area_id: fd.get('area_id'), title, content: fd.get('content') || '' });
        navigate(`/notes/${created.id}`);
      } catch (err) {
        errorEl.textContent = err.message || String(err);
        errorEl.style.display = '';
        submitBtn.disabled = false;
      }
    });
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

export async function renderNoteDetail(root, params) {
  root.innerHTML = loadingHtml('Loading note…');
  try {
    const page = await db.getNotePage(params.id);
    const areas = await db.listAreas({ includeArchived: true });
    const area = areas.find((a) => a.id === page.area_id) || { name: 'Unknown area', colour: '#6b7280' };
    paint(root, page, area, false);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function paint(root, page, area, editing) {
  root.innerHTML = `
    <a class="back-link" href="#/notes">← Notes</a>
    <section class="card">
      <p class="card-eyebrow">${areaDotHtml(area.colour)}${escapeHtml(area.name)}</p>
      ${editing ? editFormHtml(page) : readViewHtml(page)}
    </section>
  `;
  if (editing) bindEditForm(root, page, area);
  else bindReadView(root, page, area);
}

function readViewHtml(page) {
  return `
    <div class="notes-view-head">
      <h1 class="notes-title">${escapeHtml(page.title)}</h1>
      <p class="notes-row-meta">Updated ${relativeDays(page.updated_at.slice(0, 10))} · created ${relativeDays(page.created_at.slice(0, 10))}</p>
    </div>
    <div class="note-content">${page.content && page.content.trim() ? renderNote(page.content) : '<p class="empty-body">Nothing written yet.</p>'}</div>
    <div class="form-row" style="margin-top:16px;">
      <button type="button" class="btn btn-primary btn-sm" data-action="edit">Edit</button>
      <button type="button" class="btn btn-quiet btn-sm" data-action="archive">${page.archived_at ? 'Unarchive' : 'Archive'}</button>
    </div>
  `;
}

function editFormHtml(page) {
  return `
    <form id="note-edit-form" class="stacked-form">
      <label>Title
        <input type="text" name="title" maxlength="160" required value="${escapeHtml(page.title)}">
      </label>
      <label>Content
        <textarea name="content" rows="16">${escapeHtml(page.content || '')}</textarea>
      </label>
      <p id="form-error" class="form-error" style="display:none;"></p>
      <div class="form-row">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-quiet" data-action="cancel-edit">Cancel</button>
      </div>
    </form>
  `;
}

function bindReadView(root, page, area) {
  root.querySelector('[data-action="edit"]').addEventListener('click', () => paint(root, page, area, true));
  root.querySelector('[data-action="archive"]').addEventListener('click', async () => {
    const updated = page.archived_at ? await db.unarchiveNotePage(page.id) : await db.archiveNotePage(page.id);
    paint(root, updated, area, false);
  });
}

function bindEditForm(root, page, area) {
  const form = root.querySelector('#note-edit-form');
  const errorEl = root.querySelector('#form-error');
  root.querySelector('[data-action="cancel-edit"]').addEventListener('click', () => paint(root, page, area, false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    if (!title) {
      errorEl.textContent = 'Give the note a title.';
      errorEl.style.display = '';
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const updated = await db.updateNotePage(page.id, { title, content: fd.get('content') || '' });
      paint(root, updated, area, false);
    } catch (err) {
      errorEl.textContent = err.message || String(err);
      errorEl.style.display = '';
      submitBtn.disabled = false;
    }
  });
}
