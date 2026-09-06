// Search across everything you've written: goal titles/why/description,
// update notes, and review reflections (including per-goal commentary).
// Fetches once, then filters in memory as you type — plenty fast at the
// scale a personal journal actually reaches.

import * as db from '../db.js';
import { escapeHtml, formatDateDMY } from '../utils.js';
import { periodLabel } from '../periods.js';
import { loadingHtml, errorHtml, emptyStateHtml } from './shared.js';

const REFLECTION_FIELDS = [
  { key: 'went_well', label: 'What went well' },
  { key: 'didnt_go_well', label: "What didn't" },
  { key: 'learned', label: 'What I learned' },
  { key: 'focus_next', label: 'Focus next' }
];

export async function renderSearch(root) {
  root.innerHTML = loadingHtml('Loading your notes…');
  try {
    const [goals, updates, reviews, reviewGoals] = await Promise.all([
      db.listGoals({ includeArchived: true }),
      db.listAllGoalUpdates(),
      db.listReviews(),
      db.listAllReviewGoals()
    ]);
    const goalsById = new Map(goals.map((g) => [g.id, g]));
    const reviewsById = new Map(reviews.map((r) => [r.id, r]));
    const index = buildIndex(goals, updates, reviews, reviewGoals, goalsById, reviewsById);

    root.innerHTML = `
      <section class="card">
        <p class="card-eyebrow">Search</p>
        <input type="search" id="search-input" class="search-input" placeholder="Search goals, updates and reviews…" autofocus>
      </section>
      <div id="search-results"></div>
    `;

    const input = root.querySelector('#search-input');
    const resultsEl = root.querySelector('#search-results');
    const paint = (q) => { resultsEl.innerHTML = renderResults(q, index); };
    paint('');
    input.addEventListener('input', () => paint(input.value));
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function buildIndex(goals, updates, reviews, reviewGoals, goalsById, reviewsById) {
  const entries = [];

  goals.forEach((g) => {
    const haystack = [g.title, g.why, g.description].filter(Boolean).join(' \n ');
    if (haystack.trim()) entries.push({ type: 'goal', haystack, goal: g });
  });

  updates.forEach((u) => {
    if (!u.note) return;
    const goal = goalsById.get(u.goal_id);
    entries.push({ type: 'update', haystack: u.note, update: u, goal });
  });

  reviews.forEach((r) => {
    REFLECTION_FIELDS.forEach(({ key, label }) => {
      if (!r[key]) return;
      entries.push({ type: 'review', haystack: r[key], review: r, fieldLabel: label });
    });
  });

  reviewGoals.forEach((rg) => {
    if (!rg.commentary) return;
    const goal = goalsById.get(rg.goal_id);
    const review = reviewsById.get(rg.review_id);
    entries.push({ type: 'review_goal', haystack: rg.commentary, reviewGoal: rg, goal, review });
  });

  return entries;
}

function renderResults(query, index) {
  const q = query.trim().toLowerCase();
  if (!q) return emptyStateHtml('Search your notes, reviews and goals', 'Start typing above — matches appear as you go.');

  const matches = index.filter((e) => e.haystack.toLowerCase().includes(q));
  if (!matches.length) return emptyStateHtml(`No matches for "${query.trim()}"`, 'Try a shorter word, or check the spelling.');

  return `<ul class="search-results-list">${matches.map((m) => resultRowHtml(m, q)).join('')}</ul>`;
}

function resultRowHtml(entry, q) {
  const snippet = highlightSnippet(entry.haystack, q);
  if (entry.type === 'goal') {
    return resultItem('Goal', `#/goal/${entry.goal.id}`, entry.goal.title, snippet);
  }
  if (entry.type === 'update') {
    const title = entry.goal ? entry.goal.title : 'Deleted goal';
    const meta = entry.update.occurred_on ? formatDateDMY(entry.update.occurred_on) : '';
    return resultItem('Update · ' + meta, entry.goal ? `#/goal/${entry.goal.id}` : null, title, snippet);
  }
  if (entry.type === 'review') {
    const label = periodLabel(entry.review.period_type, entry.review.period_start);
    const href = entry.review.status === 'complete' ? `#/reviews/${entry.review.id}` : `#/review/${entry.review.id}`;
    return resultItem('Review · ' + entry.fieldLabel, href, label, snippet);
  }
  // review_goal
  const title = entry.goal ? entry.goal.title : 'Deleted goal';
  const periodBit = entry.review ? periodLabel(entry.review.period_type, entry.review.period_start) : 'Review';
  const href = entry.goal ? `#/goal/${entry.goal.id}` : null;
  return resultItem('Review commentary · ' + periodBit, href, title, snippet);
}

function resultItem(kicker, href, title, snippetHtml) {
  const titleHtml = href ? `<a href="${href}">${escapeHtml(title)}</a>` : escapeHtml(title);
  return `
    <li class="search-result">
      <p class="search-result-kicker">${escapeHtml(kicker)}</p>
      <p class="search-result-title">${titleHtml}</p>
      <p class="search-result-snippet">${snippetHtml}</p>
    </li>
  `;
}

/** Escapes first, then wraps the (already-escaped-safe) match in <mark> — case-insensitive, first hit only, with a little context around it. */
function highlightSnippet(text, q) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return escapeHtml(text.length > 160 ? text.slice(0, 160) + '…' : text);
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + q.length + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = escapeHtml(text.slice(start, idx));
  const match = escapeHtml(text.slice(idx, idx + q.length));
  const after = escapeHtml(text.slice(idx + q.length, end));
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`;
}
