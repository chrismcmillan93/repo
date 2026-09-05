// Goal detail: header, overdue banner, update timeline with inline add,
// milestones, value/confidence trends, and every review that referenced it.
// This is the core loop — the screen used most often.

import * as db from '../db.js';
import {
  escapeHtml, formatDateDMY, formatNumber, todayISO,
  horizonLabel, statusLabel, measureLabel, decisionLabel, renderNote
} from '../utils.js';
import { periodLabel } from '../periods.js';
import { renderPaceBar } from '../charts/paceBar.js';
import { renderSparkline } from '../charts/sparkline.js';
import { renderConfidenceTrend } from '../charts/confidenceTrend.js';
import {
  loadingHtml, errorHtml, emptyStateHtml, overdueBannerHtml, bindOverdueActions,
  pickerHtml, bindPicker, areaDotHtml
} from './shared.js';

export async function renderGoalDetail(root, params) {
  root.innerHTML = loadingHtml('Loading goal…');
  try {
    await load(root, params.id);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

async function load(root, goalId) {
  const [goal, progress, updates, milestones, reviewRefs, areas] = await Promise.all([
    db.getGoal(goalId),
    db.getGoalProgressFor(goalId),
    db.listGoalUpdates(goalId),
    db.listMilestones(goalId),
    db.listReviewGoalsForGoal(goalId),
    db.listAreas({ includeArchived: true })
  ]);
  const goalArea = areas.find((a) => a.id === goal.area_id) || { name: 'Unknown area', colour: '#6b7280' };

  root.innerHTML = renderPage(goal, progress, goalArea, updates, milestones, reviewRefs);
  bindPage(root, goal, updates);
}

function renderPage(goal, p, area, updates, milestones, reviewRefs) {
  const ascUpdates = [...updates].reverse();
  return `
    <a class="back-link" href="#/">← Dashboard</a>

    <section class="card goal-header">
      <p class="card-eyebrow">${areaDotHtml(area.colour)}${escapeHtml(area.name)}</p>
      <h1 class="goal-title">${escapeHtml(goal.title)}</h1>
      ${goal.why ? `<p class="goal-why">"${escapeHtml(goal.why)}"</p>` : ''}
      <div class="goal-pills">
        <span class="status-pill status-${goal.status}">${statusLabel(goal.status)}</span>
        <span class="pill-quiet">${horizonLabel(goal.horizon)}</span>
        <span class="pill-quiet">${measureLabel(goal.measure_type)}</span>
        <span class="pill-quiet">Priority ${goal.priority}</span>
      </div>
      <p class="goal-dates">
        ${formatDateDMY(goal.start_date)} → ${goal.target_date ? formatDateDMY(goal.target_date) : 'no target date'}
      </p>
      ${overdueBannerHtml(goal)}
      ${goal.description ? `<div class="goal-description">${renderNote(goal.description)}</div>` : ''}
      <div class="form-row">
        <a class="btn btn-quiet btn-sm" href="#/goal/${goal.id}/edit">Edit</a>
        <button type="button" class="btn btn-quiet btn-sm" data-action="archive-goal">${goal.archived_at ? 'Unarchive' : 'Archive'}</button>
      </div>
    </section>

    <section class="card">
      <p class="card-eyebrow">Progress</p>
      ${renderPaceBar(p ? p.percent_complete : null, p ? p.percent_elapsed : null, area.colour)}
      ${renderMeasureDetail(goal, p)}
    </section>

    ${goal.measure_type === 'numeric' ? `
      <section class="card">
        <p class="card-eyebrow">Value over time</p>
        ${renderSparkline(ascUpdates.filter((u) => u.value !== null), area.colour)}
      </section>` : ''}

    <section class="card">
      <p class="card-eyebrow">Confidence over time</p>
      ${renderConfidenceTrend(ascUpdates.filter((u) => u.confidence !== null))}
    </section>

    ${goal.measure_type === 'milestone' ? renderMilestonesSection(milestones) : ''}

    <section class="card">
      <p class="card-eyebrow">Add an update</p>
      <form id="add-update-form" class="stacked-form">
        <label>Date
          <input type="date" name="occurred_on" value="${todayISO()}" max="${todayISO()}" required>
        </label>
        <label>Note
          <textarea name="note" rows="2" placeholder="What happened, what you noticed…"></textarea>
        </label>
        ${goal.measure_type === 'numeric' ? `<label>Value${goal.unit ? ' (' + escapeHtml(goal.unit) + ')' : ''}
          <input type="number" step="any" name="value">
        </label>` : ''}
        <label class="picker-label">Confidence it'll land</label>
        ${pickerHtml('detail-update', '', ['Very low', 'Low', 'Medium', 'High', 'Very high'])}
        <button type="submit" class="btn btn-primary">Save update</button>
      </form>
    </section>

    <section class="card">
      <p class="card-eyebrow">Timeline</p>
      ${renderTimeline(updates)}
    </section>

    <section class="card">
      <p class="card-eyebrow">Reviews mentioning this goal</p>
      ${renderReviewRefs(reviewRefs)}
    </section>
  `;
}

function renderMeasureDetail(goal, p) {
  if (goal.measure_type === 'numeric') {
    const current = p ? formatNumber(p.current_value, goal.unit) : '—';
    const target = formatNumber(goal.target_value, goal.unit);
    return `<p class="measure-detail">${current} of ${target}</p>`;
  }
  if (goal.measure_type === 'milestone' && p) {
    return `<p class="measure-detail">${Number(p.milestones_done)} of ${Number(p.milestone_count)} milestones done</p>`;
  }
  return `<p class="measure-detail">Narrative goal — tracked through notes, not a number.</p>`;
}

function renderMilestonesSection(milestones) {
  const items = milestones.map((m) => `
    <li class="milestone-row ${m.completed_on ? 'is-done' : ''}">
      <label class="milestone-check">
        <input type="checkbox" data-milestone-id="${m.id}" ${m.completed_on ? 'checked' : ''}>
        <span>${escapeHtml(m.title)}</span>
      </label>
      ${m.due_date ? `<span class="milestone-due">Due ${formatDateDMY(m.due_date)}</span>` : ''}
    </li>
  `).join('');
  return `
    <section class="card">
      <p class="card-eyebrow">Milestones</p>
      ${milestones.length ? `<ul class="milestone-list">${items}</ul>` : emptyStateHtml('No milestones yet', 'Add the first one below.')}
      <form id="add-milestone-form" class="form-row">
        <input type="text" name="title" placeholder="New milestone" required>
        <input type="date" name="due_date">
        <button type="submit" class="btn btn-quiet btn-sm">Add</button>
      </form>
    </section>
  `;
}

function renderTimeline(updates) {
  if (!updates.length) return emptyStateHtml('No updates yet', 'Add your first one above.');
  return `<ul class="timeline-list">${updates.map((u) => `
    <li class="timeline-item">
      <div class="timeline-item-head">
        <span class="timeline-date">${formatDateDMY(u.occurred_on)}</span>
        ${u.value !== null && u.value !== undefined ? `<span class="timeline-value">${formatNumber(u.value)}</span>` : ''}
        ${u.confidence ? `<span class="timeline-confidence" title="Confidence">Confidence ${u.confidence}/5</span>` : ''}
      </div>
      ${u.note ? `<div class="timeline-note">${renderNote(u.note)}</div>` : ''}
    </li>
  `).join('')}</ul>`;
}

function renderReviewRefs(refs) {
  if (!refs.length) return emptyStateHtml('Not reviewed yet', 'This goal will show up here once a review covers it.');
  return `<ul class="review-ref-list">${refs.map((r) => {
    const label = r.review ? periodLabel(r.review.period_type, r.review.period_start) : 'Review';
    return `
      <li class="review-ref-item">
        <a href="#/reviews/${r.review_id}" class="review-ref-period">${escapeHtml(label)}</a>
        ${r.rating ? `<span class="review-ref-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>` : ''}
        ${r.decision ? `<span class="pill-quiet">${decisionLabel(r.decision)}</span>` : ''}
        ${r.commentary ? `<div class="timeline-note">${renderNote(r.commentary)}</div>` : ''}
      </li>
    `;
  }).join('')}</ul>`;
}

function bindPage(root, goal, updates) {
  bindOverdueActions(root, goal, () => renderGoalDetail(root, { id: goal.id }));

  root.querySelector('[data-action="archive-goal"]').addEventListener('click', async () => {
    if (goal.archived_at) await db.unarchiveGoal(goal.id);
    else {
      if (!confirm(`Archive "${goal.title}"? You can unarchive it later from Areas & Goals.`)) return;
      await db.archiveGoal(goal.id);
    }
    renderGoalDetail(root, { id: goal.id });
  });

  let confidence = null;
  bindPicker(root, 'detail-update', (v) => { confidence = v; });
  const addForm = root.querySelector('#add-update-form');
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(addForm);
    await db.createGoalUpdate({
      goal_id: goal.id,
      occurred_on: fd.get('occurred_on'),
      note: fd.get('note'),
      value: goal.measure_type === 'numeric' ? fd.get('value') : null,
      confidence
    });
    renderGoalDetail(root, { id: goal.id });
  });

  const milestoneForm = root.querySelector('#add-milestone-form');
  if (milestoneForm) {
    milestoneForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(milestoneForm);
      await db.createMilestone({ goal_id: goal.id, title: fd.get('title'), due_date: fd.get('due_date') || null });
      renderGoalDetail(root, { id: goal.id });
    });
  }
  root.querySelectorAll('[data-milestone-id]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      await db.toggleMilestone(cb.dataset.milestoneId, cb.checked);
      renderGoalDetail(root, { id: goal.id });
    });
  });
}
