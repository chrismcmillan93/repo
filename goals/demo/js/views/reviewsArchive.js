// Reviews archive: year-at-a-glance plus a list of every past review,
// each opening read-only (drafts resume the guided flow instead).

import * as db from '../db.js';
import { escapeHtml } from '../utils.js';

function reviewStatusLabel(status) {
  return status === 'complete' ? 'Complete' : 'Draft';
}
import { periodLabel, quarterBounds } from '../periods.js';
import { renderYearGlance } from '../charts/yearGlance.js';
import { loadingHtml, errorHtml, emptyStateHtml } from './shared.js';
import { loadReviewGoalDetails, renderReadOnlyReview } from './reviewShared.js';

export async function renderReviewsArchive(root, params) {
  root.innerHTML = loadingHtml('Loading reviews…');
  try {
    const year = Number((params.query || {}).year) || new Date().getUTCFullYear();
    const [reviews, goals] = await Promise.all([
      db.listReviews(),
      db.listGoals({ includeArchived: true })
    ]);
    root.innerHTML = `
      <section class="card">
        <div class="year-nav">
          <button type="button" class="btn btn-quiet btn-sm" data-year="${year - 1}">← ${year - 1}</button>
          <span class="year-nav-current">${year}</span>
          <button type="button" class="btn btn-quiet btn-sm" data-year="${year + 1}">${year + 1} →</button>
        </div>
        ${renderYearGlance(year, quarterStats(year, goals, reviews))}
      </section>
      <section class="card">
        <p class="card-eyebrow">Past reviews</p>
        ${reviewListHtml(reviews)}
      </section>
    `;
    root.querySelectorAll('[data-year]').forEach((btn) => {
      btn.addEventListener('click', () => renderReviewsArchive(root, { query: { year: btn.dataset.year } }));
    });
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function quarterStats(year, goals, reviews) {
  return [1, 2, 3, 4].map((q) => {
    const { start, end } = quarterBounds(year, q);
    const started = goals.filter((g) => g.start_date >= start && g.start_date <= end).length;
    const completed = goals.filter((g) => g.status === 'achieved' && inRange(g.updated_at, start, end)).length;
    const dropped = goals.filter((g) => g.status === 'dropped' && inRange(g.updated_at, start, end)).length;
    const review = reviews.find((r) => r.period_type === 'quarter' && r.period_start === start);
    return { label: `Q${q}`, started, completed, dropped, rating: review ? review.overall_rating : null };
  });
}

function inRange(timestamp, start, end) {
  if (!timestamp) return false;
  const d = String(timestamp).slice(0, 10);
  return d >= start && d <= end;
}

function reviewListHtml(reviews) {
  if (!reviews.length) return emptyStateHtml('No reviews yet', 'Start one from the dashboard once a period closes.');
  return `<ul class="review-archive-list">${reviews.map((r) => {
    const href = r.status === 'complete' ? `#/reviews/${r.id}` : `#/review/${r.id}`;
    return `
      <li class="review-archive-row">
        <a href="${href}">${escapeHtml(periodLabel(r.period_type, r.period_start))}</a>
        <span class="pill-quiet">${reviewStatusLabel(r.status)}</span>
        ${r.overall_rating ? `<span class="review-ref-rating">${'★'.repeat(r.overall_rating)}${'☆'.repeat(5 - r.overall_rating)}</span>` : ''}
      </li>
    `;
  }).join('')}</ul>`;
}

export async function renderReviewDetail(root, params) {
  root.innerHTML = loadingHtml('Loading review…');
  try {
    const review = await db.getReview(params.id);
    const reviewGoals = await loadReviewGoalDetails(review);
    root.innerHTML = `<a class="back-link" href="#/reviews">← Reviews</a>` + renderReadOnlyReview(review, reviewGoals) +
      (review.status === 'complete' ? `<section class="card"><button type="button" class="btn btn-quiet" data-action="reopen">Reopen this review</button></section>` : '');
    const reopenBtn = root.querySelector('[data-action="reopen"]');
    if (reopenBtn) {
      reopenBtn.addEventListener('click', async () => {
        await db.reopenReview(review.id);
        window.location.hash = `/review/${review.id}`;
      });
    }
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}
