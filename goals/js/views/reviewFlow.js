// Guided review flow: pick/resume a period, step through active goals
// (overdue first), then the period-level reflection. Draft-saveable at any
// point; completed reviews become read-only with an explicit reopen.

import * as db from '../db.js';
import { escapeHtml, isOverdue, formatDateDMY } from '../utils.js';
import { periodLabel, recentPeriods } from '../periods.js';
import { navigate } from '../router.js';
import { loadingHtml, errorHtml, emptyStateHtml, pickerHtml, bindPicker, areaDotHtml } from './shared.js';
import { loadReviewGoalDetails, renderReadOnlyReview } from './reviewShared.js';

const DECISIONS = ['continue', 'adjust', 'pause', 'complete', 'drop'];

// ---------------- entry point: pick or auto-start a period ----------------

export async function renderReviewNew(root, params) {
  const q = params.query || {};
  if (q.type && q.start && q.end) {
    root.innerHTML = loadingHtml('Opening review…');
    try {
      const review = await db.startOrResumeReview({ period_type: q.type, period_start: q.start, period_end: q.end });
      navigate(`/review/${review.id}`);
    } catch (err) {
      root.innerHTML = errorHtml(err);
    }
    return;
  }

  root.innerHTML = loadingHtml('Loading…');
  try {
    const pending = await db.listPendingReviews().catch(() => []);
    root.innerHTML = pickerHtmlPage(pending);
    bindPickerPage(root);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function pickerHtmlPage(pending) {
  const pendingHtml = pending.length ? `
    <div class="period-pick-group">
      <p class="field-hint">Ready now</p>
      ${pending.map((p) => periodButtonHtml(p.period_type, p.period_start, p.period_end)).join('')}
    </div>
  ` : '';

  const tabs = ['month', 'quarter', 'year'].map((t) => `
    <div class="period-pick-group">
      <p class="field-hint">${t[0].toUpperCase() + t.slice(1)}</p>
      ${recentPeriods(t, 4).map((b) => periodButtonHtml(t, b.start, b.end)).join('')}
    </div>
  `).join('');

  return `
    <section class="card">
      <p class="card-eyebrow">Start a review</p>
      ${pendingHtml}
      ${tabs}
    </section>
  `;
}

function periodButtonHtml(type, start, end) {
  return `<button type="button" class="btn btn-quiet btn-sm period-pick-btn" data-type="${type}" data-start="${start}" data-end="${end}">${escapeHtml(periodLabel(type, start))}</button>`;
}

function bindPickerPage(root) {
  root.querySelectorAll('.period-pick-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const review = await db.startOrResumeReview({
        period_type: btn.dataset.type, period_start: btn.dataset.start, period_end: btn.dataset.end
      });
      navigate(`/review/${review.id}`);
    });
  });
}

// ---------------- the flow itself ----------------

export async function renderReviewFlow(root, params) {
  root.innerHTML = loadingHtml('Loading review…');
  try {
    const review = await db.getReview(params.id);
    if (review.status === 'complete') {
      const reviewGoals = await loadReviewGoalDetails(review);
      root.innerHTML = renderReadOnlyReview(review, reviewGoals) + reopenButtonHtml();
      root.querySelector('[data-action="reopen"]').addEventListener('click', async () => {
        await db.reopenReview(review.id);
        renderReviewFlow(root, params);
      });
      return;
    }
    await runFlow(root, review);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function reopenButtonHtml() {
  return `<section class="card"><button type="button" class="btn btn-quiet" data-action="reopen">Reopen this review</button></section>`;
}

async function runFlow(root, review) {
  const activeGoals = await db.listGoals({ status: 'active' });
  const existingReviewGoals = await db.listReviewGoals(review.id);
  const existingById = new Map(existingReviewGoals.map((rg) => [rg.goal_id, rg]));

  // Union: currently-active goals, plus any goal already rated in this
  // review even if it's no longer active (edge case, e.g. rated then dropped).
  const extraIds = existingReviewGoals.map((rg) => rg.goal_id).filter((id) => !activeGoals.some((g) => g.id === id));
  const extraGoals = extraIds.length ? await db.listGoalsByIds(extraIds) : [];
  const allGoals = [...activeGoals, ...extraGoals];
  const overdue = allGoals.filter(isOverdue);
  const rest = allGoals.filter((g) => !isOverdue(g));
  const orderedGoals = [...overdue, ...rest];

  const progressRows = await db.listGoalProgressFor(orderedGoals.map((g) => g.id));
  const progressById = new Map(progressRows.map((p) => [p.id, p]));
  const areas = await db.listAreas({ includeArchived: true });
  const areaColourById = new Map(areas.map((a) => [a.id, a.colour]));

  let stepIndex = 0;
  let stage = orderedGoals.length ? 'goals' : 'reflection';

  async function paint() {
    if (stage === 'goals') {
      root.innerHTML = await goalStepHtml(review, orderedGoals, stepIndex, existingById, progressById, areaColourById);
      bindGoalStep(root, review, orderedGoals, stepIndex, existingById, {
        onNext: async () => { if (stepIndex < orderedGoals.length - 1) { stepIndex++; await paint(); } else { stage = 'reflection'; await paint(); } },
        onPrev: async () => { if (stepIndex > 0) { stepIndex--; await paint(); } },
        onJump: async (i) => { stepIndex = i; await paint(); },
        onReflection: async () => { stage = 'reflection'; await paint(); }
      });
    } else {
      root.innerHTML = reflectionHtml(review, orderedGoals.length);
      bindReflection(root, review, {
        onBackToGoals: async () => { stage = 'goals'; await paint(); }
      });
    }
  }
  await paint();
}

async function goalStepHtml(review, goals, index, existingById, progressById, areaColourById) {
  const total = goals.length;
  const g = goals[index];
  const p = progressById.get(g.id) || {};
  const existing = existingById.get(g.id) || {};
  const areaColour = areaColourById.get(g.area_id) || '#6b7280';
  const updates = await db.listGoalUpdatesInRange(g.id, review.period_start, review.period_end);

  const jumpDots = goals.map((gg, i) => `
    <button type="button" class="step-dot ${i === index ? 'is-current' : ''} ${existingById.has(gg.id) ? 'is-done' : ''}" data-jump="${i}" title="${escapeHtml(gg.title)}"></button>
  `).join('');

  const updatesHtml = updates.length ? `
    <ul class="timeline-list">${updates.map((u) => `
      <li class="timeline-item">
        <div class="timeline-item-head">
          <span class="timeline-date">${formatDateDMY(u.occurred_on)}</span>
          ${u.value !== null ? `<span class="timeline-value">${u.value}</span>` : ''}
        </div>
        ${u.note ? `<div class="timeline-note">${escapeHtml(u.note)}</div>` : ''}
      </li>
    `).join('')}</ul>
  ` : emptyStateHtml('No updates this period', 'This goal went quiet — worth a decision below.');

  return `
    <section class="card">
      <p class="card-eyebrow">Reviewing goal ${index + 1} of ${total}</p>
      <div class="step-dots">${jumpDots}</div>
      <h2 class="goal-title">${areaDotHtml(areaColour)}${escapeHtml(g.title)}</h2>
      ${isOverdue(g) ? `<p class="overdue-pill" style="display:inline-block;">⚠ Overdue</p>` : ''}
      <p class="measure-detail">Snapshot: ${p.percent_complete !== undefined && p.percent_complete !== null ? Math.round(p.percent_complete * 100) + '%' : '—'} complete${p.current_value !== undefined ? `, current value ${p.current_value}` : ''}</p>
      <p class="card-eyebrow">Updates this period</p>
      ${updatesHtml}

      <form id="review-goal-form" class="stacked-form">
        <label class="picker-label">Rating</label>
        ${pickerHtml('rg-rating', existing.rating || '', ['Stalled', 'Slipping', 'Steady', 'Ahead', 'Excellent'])}
        <label>Decision
          <select name="decision">
            <option value="">—</option>
            ${DECISIONS.map((d) => `<option value="${d}" ${existing.decision === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}
          </select>
        </label>
        <label>Commentary
          <textarea name="commentary" rows="2">${escapeHtml(existing.commentary || '')}</textarea>
        </label>
        <div class="form-row">
          <button type="button" class="btn btn-quiet btn-sm" data-action="prev" ${index === 0 ? 'disabled' : ''}>← Previous</button>
          <button type="submit" class="btn btn-primary btn-sm">Save &amp; continue</button>
          <button type="button" class="btn btn-quiet btn-sm" data-action="reflection">Skip to reflection</button>
        </div>
      </form>
    </section>
  `;
}

function bindGoalStep(root, review, goals, index, existingById, handlers) {
  const g = goals[index];
  const existing = existingById.get(g.id) || {};
  let rating = existing.rating || null;
  bindPicker(root, 'rg-rating', (v) => { rating = v; });

  root.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onJump(Number(btn.dataset.jump)));
  });
  root.querySelector('[data-action="prev"]').addEventListener('click', handlers.onPrev);
  root.querySelector('[data-action="reflection"]').addEventListener('click', handlers.onReflection);

  root.querySelector('#review-goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const progress = await db.getGoalProgressFor(g.id);
    await db.upsertReviewGoal({
      review_id: review.id,
      goal_id: g.id,
      rating,
      decision: fd.get('decision') || null,
      commentary: fd.get('commentary') || null,
      value_at_review: progress ? progress.current_value : null,
      percent_at_review: progress ? progress.percent_complete : null
    });
    existingById.set(g.id, { rating, decision: fd.get('decision'), commentary: fd.get('commentary') });
    handlers.onNext();
  });
}

function reflectionHtml(review, goalCount) {
  return `
    <section class="card">
      <p class="card-eyebrow">${escapeHtml(periodLabel(review.period_type, review.period_start))} reflection</p>
      <p class="field-hint">${goalCount} goal${goalCount === 1 ? '' : 's'} covered.</p>
      <form id="reflection-form" class="stacked-form">
        <label>What went well?
          <textarea name="went_well" rows="2">${escapeHtml(review.went_well || '')}</textarea>
        </label>
        <label>What didn't go well?
          <textarea name="didnt_go_well" rows="2">${escapeHtml(review.didnt_go_well || '')}</textarea>
        </label>
        <label>What did you learn?
          <textarea name="learned" rows="2">${escapeHtml(review.learned || '')}</textarea>
        </label>
        <label>Focus for next period
          <textarea name="focus_next" rows="2">${escapeHtml(review.focus_next || '')}</textarea>
        </label>
        <label class="picker-label">Overall rating</label>
        ${pickerHtml('reflection-rating', review.overall_rating || '', ['Rough', 'Below par', 'OK', 'Good', 'Great'])}
        <div class="form-row">
          <button type="button" class="btn btn-quiet btn-sm" data-action="back-to-goals">← Back to goals</button>
          <button type="submit" class="btn btn-quiet" data-action="save-draft">Save draft</button>
          <button type="submit" class="btn btn-primary" data-action="mark-complete">Mark complete</button>
        </div>
      </form>
    </section>
  `;
}

function bindReflection(root, review, handlers) {
  let overallRating = review.overall_rating || null;
  bindPicker(root, 'reflection-rating', (v) => { overallRating = v; });
  root.querySelector('[data-action="back-to-goals"]').addEventListener('click', handlers.onBackToGoals);

  const form = root.querySelector('#reflection-form');
  let submitIntent = 'save-draft';
  form.querySelectorAll('button[type="submit"]').forEach((btn) => {
    btn.addEventListener('click', () => { submitIntent = btn.dataset.action; });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const patch = {
      went_well: fd.get('went_well') || null,
      didnt_go_well: fd.get('didnt_go_well') || null,
      learned: fd.get('learned') || null,
      focus_next: fd.get('focus_next') || null,
      overall_rating: overallRating
    };
    await db.updateReview(review.id, patch);
    if (submitIntent === 'mark-complete') {
      await db.completeReview(review.id);
      navigate(`/reviews/${review.id}`);
    } else {
      navigate('/reviews');
    }
  });
}
