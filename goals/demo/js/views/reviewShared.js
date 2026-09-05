// Shared between reviewFlow.js (a completed review viewed there) and
// reviewsArchive.js (the archive's read-only detail page) — one renderer
// for "here's a finished review", so the two don't drift apart.

import * as db from '../db.js';
import { escapeHtml, decisionLabel, renderNote } from '../utils.js';
import { periodLabel } from '../periods.js';
import { emptyStateHtml } from './shared.js';

export async function loadReviewGoalDetails(review) {
  const reviewGoals = await db.listReviewGoals(review.id);
  const goals = await db.listGoalsByIds(reviewGoals.map((rg) => rg.goal_id));
  const goalsById = new Map(goals.map((g) => [g.id, g]));
  return reviewGoals.map((rg) => ({ ...rg, goal: goalsById.get(rg.goal_id) || null }));
}

function starString(n) {
  return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—';
}

export function renderReadOnlyReview(review, reviewGoals) {
  const label = periodLabel(review.period_type, review.period_start);
  const rows = reviewGoals.map((rg) => `
    <li class="review-goal-ro">
      <p class="review-goal-ro-title">${rg.goal ? `<a href="#/goal/${rg.goal.id}">${escapeHtml(rg.goal.title)}</a>` : 'Deleted goal'}</p>
      <p class="review-goal-ro-meta">${starString(rg.rating)} ${rg.decision ? '· ' + escapeHtml(decisionLabel(rg.decision)) : ''}</p>
      ${rg.commentary ? `<div class="timeline-note">${renderNote(rg.commentary)}</div>` : ''}
    </li>
  `).join('');

  return `
    <section class="card">
      <p class="card-eyebrow">${escapeHtml(label)} · ${review.status === 'complete' ? 'Complete' : 'Draft'}</p>
      <p class="review-ro-rating">Overall: ${starString(review.overall_rating)}</p>
      ${reflectionBlock('What went well', review.went_well)}
      ${reflectionBlock("What didn't", review.didnt_go_well)}
      ${reflectionBlock('What I learned', review.learned)}
      ${reflectionBlock('Focus next', review.focus_next)}
    </section>
    <section class="card">
      <p class="card-eyebrow">Goals in this review</p>
      ${reviewGoals.length ? `<ul class="review-goal-ro-list">${rows}</ul>` : emptyStateHtml('No goals recorded', '')}
    </section>
  `;
}

function reflectionBlock(label, text) {
  if (!text) return '';
  return `<div class="reflection-block"><p class="reflection-label">${escapeHtml(label)}</p>${renderNote(text)}</div>`;
}
