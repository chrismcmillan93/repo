// Playbook: lessons and directives distilled from a set of books, organised
// the same way the source material was — 6 pillars, 24 books. The text is
// static (playbookContent.js); only your per-directive status, note, and any
// linked goal are real data (db.js's playbook* functions → goals.playbook_progress).
//
// Deliberately left out: the source material's "cross-cutting themes" and
// citations pages — that's synthesis about the content, not something to
// act on, and it would work against staying short and to the point here.

import * as db from '../db.js';
import { escapeHtml, playbookStatusLabel } from '../utils.js';
import { navigate } from '../router.js';
import { setGoalFormPrefill } from '../state.js';
import { loadingHtml, errorHtml } from './shared.js';
import { PILLARS, allDirectives } from '../playbookContent.js';

const STATUSES = ['not_started', 'working_on_it', 'adopted'];

// In-memory only — which books are expanded and which notes are open.
// Resets on a fresh page load, survives repaints within a visit.
const expandedBooks = new Set();
const openNotes = new Set();

// A local cache of directive_key -> progress row, refreshed from the network
// only when the route is entered (renderPlaybook below). Expanding a book,
// changing a status, or saving a note all repaint from this cache instead of
// re-fetching and flashing a loading state — that full-page collapse-then-
// rebuild was what reset scroll position to the top on every tap. Status/note
// writes still hit the network, but they patch this cache with the response
// rather than re-fetching everything.
let cachedProgress = null;

export async function renderPlaybook(root) {
  root.innerHTML = loadingHtml('Loading your playbook…');
  try {
    const progressRows = await db.listPlaybookProgress();
    cachedProgress = new Map(progressRows.map((r) => [r.directive_key, r]));
    paint(root);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

/** Rebuilds the DOM from cachedProgress + the module's expand/open state — no network call. Preserves scroll position across the rebuild. */
function paint(root) {
  const scrollY = window.scrollY;

  const all = allDirectives();
  const adopted = all.filter((d) => (cachedProgress.get(d.key) || {}).status === 'adopted').length;
  const working = all.filter((d) => (cachedProgress.get(d.key) || {}).status === 'working_on_it').length;

  root.innerHTML = `
    <section class="card pb-summary">
      <p class="card-eyebrow">Playbook</p>
      <p class="pb-summary-line">${all.length} directives across ${PILLARS.reduce((n, p) => n + p.books.length, 0)} books —
        <strong>${adopted} adopted</strong>, ${working} in progress.</p>
    </section>
    ${PILLARS.map((pillar) => pillarHtml(pillar)).join('')}
  `;
  bindPage(root);

  window.scrollTo(0, scrollY);
}

function pillarHtml(pillar) {
  return `
    <section class="card pb-pillar">
      <p class="card-eyebrow">${pillar.numeral} · ${escapeHtml(pillar.title)}</p>
      <p class="pb-pillar-blurb">${escapeHtml(pillar.blurb)}</p>
      <div class="pb-books">${pillar.books.map((b) => bookHtml(b)).join('')}</div>
    </section>
  `;
}

function bookHtml(book) {
  const expanded = expandedBooks.has(book.key);
  const directives = book.directives.map((d, i) => ({
    key: `${book.key}-${String(i + 1).padStart(2, '0')}`, text: d.text, detail: d.detail, kind: d.kind || 'principle'
  }));
  const adoptedCount = directives.filter((d) => (cachedProgress.get(d.key) || {}).status === 'adopted').length;

  return `
    <div class="pb-book">
      <button type="button" class="pb-book-head" data-pb-toggle="${book.key}">
        <span class="pb-book-chevron">${expanded ? '▾' : '▸'}</span>
        <span class="pb-book-title">${escapeHtml(book.title)}</span>
        <span class="pb-book-meta">${escapeHtml(book.author)} · ${escapeHtml(book.year)}</span>
        <span class="pb-book-count">${adoptedCount}/${directives.length} adopted</span>
      </button>
      ${expanded ? `
        <p class="pb-book-blurb">${escapeHtml(book.blurb)}</p>
        <ul class="pb-directive-list">${directives.map((d) => directiveHtml(book, d, cachedProgress.get(d.key))).join('')}</ul>
      ` : ''}
    </div>
  `;
}

function directiveHtml(book, d, row) {
  const status = row ? row.status : 'not_started';
  const note = row ? row.note : '';
  const linkedGoalId = row ? row.linked_goal_id : null;
  const noteOpen = openNotes.has(d.key) || !!note;
  const isHabit = d.kind === 'habit';

  return `
    <li class="pb-directive">
      <p class="pb-directive-text">
        <strong>${escapeHtml(d.text)}</strong> ${escapeHtml(d.detail)}
        ${isHabit ? `<span class="pb-kind-tag">Recurring</span>` : ''}
      </p>
      <div class="pb-directive-controls">
        <select class="pb-status-select status-${status}" data-pb-status="${d.key}">
          ${STATUSES.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${playbookStatusLabel(s)}</option>`).join('')}
        </select>
        ${linkedGoalId
          ? `<a class="pill-quiet" href="#/goal/${linkedGoalId}">→ Tracking as goal</a>`
          : isHabit
            ? `<button type="button" class="btn btn-quiet btn-sm" data-pb-goal="${d.key}" data-book="${book.key}">→ Turn into goal</button>`
            : `<span class="pb-principle-note">A mindset to hold, not a scheduled goal</span>`}
        <button type="button" class="btn btn-quiet btn-sm" data-pb-note-toggle="${d.key}">${note ? 'Edit note' : '+ Note'}</button>
      </div>
      <div class="pb-note-box" ${noteOpen ? '' : 'hidden'}>
        <textarea data-pb-note="${d.key}" rows="2" placeholder="How does this affect you?">${escapeHtml(note || '')}</textarea>
      </div>
    </li>
  `;
}

function bindPage(root) {
  root.querySelectorAll('[data-pb-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.pbToggle;
      if (expandedBooks.has(key)) expandedBooks.delete(key); else expandedBooks.add(key);
      paint(root);
    });
  });

  root.querySelectorAll('[data-pb-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const key = sel.dataset.pbStatus;
      const updated = await db.setPlaybookStatus(key, sel.value);
      cachedProgress.set(key, updated);
      paint(root);
    });
  });

  root.querySelectorAll('[data-pb-note-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.pbNoteToggle;
      if (openNotes.has(key)) openNotes.delete(key); else openNotes.add(key);
      const box = btn.closest('.pb-directive').querySelector('.pb-note-box');
      box.hidden = !box.hidden;
      if (!box.hidden) box.querySelector('textarea').focus();
    });
  });

  root.querySelectorAll('[data-pb-note]').forEach((ta) => {
    ta.addEventListener('blur', async () => {
      const key = ta.dataset.pbNote;
      const updated = await db.setPlaybookNote(key, ta.value.trim());
      cachedProgress.set(key, updated);
      paint(root);
    });
  });

  root.querySelectorAll('[data-pb-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const directiveKey = btn.dataset.pbGoal;
      const bookKey = btn.dataset.book;
      const book = findBook(bookKey);
      const directive = book.directives.find((_, i) => `${book.key}-${String(i + 1).padStart(2, '0')}` === directiveKey);
      setGoalFormPrefill({
        title: directive.text.replace(/\.$/, ''),
        why: `From "${book.title}" (${book.author}): ${directive.detail}`,
        horizon: 'weekly',
        measure_type: 'pass_fail',
        target_value: '',
        unit: '',
        __playbookDirectiveKey: directiveKey
      });
      navigate('/goal/new');
    });
  });
}

function findBook(bookKey) {
  for (const pillar of PILLARS) {
    const book = pillar.books.find((b) => b.key === bookKey);
    if (book) return book;
  }
  return null;
}
