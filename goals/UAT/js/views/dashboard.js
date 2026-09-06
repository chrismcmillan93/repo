// Dashboard (home): the life balance wheel, active goals grouped by area
// with pace bars, a review-ready prompt, quick add-update, and the
// momentum grid.

import * as db from '../db.js';
import { escapeHtml, relativeDays, formatPercent, todayISO } from '../utils.js';
import { periodLabel, periodBoundsContaining, horizonToPeriodType } from '../periods.js';
import { renderRadar } from '../charts/radar.js';
import { renderPaceBar } from '../charts/paceBar.js';
import { renderMomentumGrid } from '../charts/momentumGrid.js';
import {
  loadingHtml, errorHtml, emptyStateHtml, overdueBannerHtml, bindOverdueActions, needsAttentionPillHtml,
  pickerHtml, bindPicker, areaDotHtml
} from './shared.js';

export async function renderDashboard(root) {
  root.innerHTML = loadingHtml('Loading your goals…');
  try {
    const [areas, goalsActive, pending] = await Promise.all([
      db.listAreas(),
      db.listGoals({ status: 'active' }),
      db.listPendingReviews().catch(() => [])
    ]);

    if (!areas.length) {
      root.innerHTML = emptyStateHtml(
        'No life areas yet',
        'Sign-in should have seeded 7 starter areas automatically. Visit Areas & Goals to add your own.'
      );
      return;
    }

    const progressRows = await db.listGoalProgressFor(goalsActive.map((g) => g.id));
    const progressById = new Map(progressRows.map((p) => [p.id, p]));
    const areaById = new Map(areas.map((a) => [a.id, a]));
    const goals = goalsActive.map((g) => ({
      ...g,
      progress: progressById.get(g.id) || null,
      areaColour: (areaById.get(g.area_id) || {}).colour || '#6b7280'
    }));

    root.innerHTML = [
      `<section class="card hero-card">${renderRadar(radarData(areas, goals))}</section>`,
      renderPendingReviewCards(pending, goals.length),
      renderGoalsSection(areas, goals),
      await renderMomentumSection(goals)
    ].join('');

    bindDashboardEvents(root, goals);
  } catch (err) {
    root.innerHTML = errorHtml(err) + hintIfSchemaMissing(err);
  }
}

function hintIfSchemaMissing(err) {
  const msg = (err && err.message) || '';
  if (/schema|not found|does not exist|404/i.test(msg)) {
    return `<p class="hint-text">If this mentions the schema not being found, add <code>goals</code> under Settings → API → Exposed schemas in Supabase.</p>`;
  }
  return '';
}

function radarData(areas, goals) {
  return areas.map((a) => {
    const areaGoals = goals.filter((g) => g.area_id === a.id && g.progress && g.progress.percent_complete !== null);
    const value = areaGoals.length
      ? areaGoals.reduce((sum, g) => sum + Number(g.progress.percent_complete), 0) / areaGoals.length
      : null;
    return { name: a.name, colour: a.colour, value };
  });
}

function renderPendingReviewCards(pending, activeGoalCount) {
  if (!pending || !pending.length) return '';
  return pending.map((p) => {
    const label = periodLabel(p.period_type, p.period_start);
    return `
      <section class="card review-prompt-card">
        <p class="card-eyebrow">Review ready</p>
        <p class="review-prompt-title">${escapeHtml(label)} review is ready — ${activeGoalCount} goal${activeGoalCount === 1 ? '' : 's'}, ${p.updates_logged} update${Number(p.updates_logged) === 1 ? '' : 's'}</p>
        <a class="btn btn-primary btn-sm" href="#/review/new?type=${p.period_type}&start=${p.period_start}&end=${p.period_end}">Start review</a>
      </section>
    `;
  }).join('');
}

function renderGoalsSection(areas, goals) {
  if (!goals.length) {
    return `<section class="card">${emptyStateHtml('No active goals yet', 'Head to Areas & Goals to set your first one.')}</section>`;
  }
  const byArea = new Map(areas.map((a) => [a.id, { area: a, goals: [] }]));
  goals.forEach((g) => { const bucket = byArea.get(g.area_id); if (bucket) bucket.goals.push(g); });

  const groups = [...byArea.values()].filter((b) => b.goals.length).map((b) => `
    <div class="area-group">
      <h2 class="area-group-title">${areaDotHtml(b.area.colour)}${escapeHtml(b.area.name)}</h2>
      ${b.goals.map((g) => goalCardHtml(g)).join('')}
    </div>
  `).join('');

  return `<section class="dashboard-goals">${groups}</section>`;
}

function goalCardHtml(g) {
  const p = g.progress || {};
  const lastUpdateLabel = p.last_update_on ? `Updated ${relativeDays(p.last_update_on)}` : 'No updates yet';
  return `
    <div class="card goal-card" data-goal-card="${g.id}">
      <div class="goal-card-head">
        <a class="goal-card-title" href="#/goal/${g.id}">${escapeHtml(g.title)}</a>
        <span class="goal-card-meta">${lastUpdateLabel}</span>
      </div>
      ${overdueBannerHtml(g)}
      ${needsAttentionPillHtml(g, p)}
      ${renderPaceBar(p.percent_complete ?? null, p.percent_elapsed ?? null, g.areaColour, passFailLabel(g, p))}
      ${g.measure_type === 'pass_fail' ? currentPeriodCheckInHtml(g, p) : quickUpdateFormHtml(g)}
    </div>
  `;
}

/** Dashboard shortcut for a pass_fail goal: two buttons for *this* period only — full history lives on the goal's own page. */
function currentPeriodCheckInHtml(g, p) {
  const periodType = horizonToPeriodType(g.horizon);
  const period = periodBoundsContaining(periodType, todayISO());
  // The progress row's last_update_on/current_value mirror whatever the latest
  // goal_updates row is; if that row's date is this period's start, it's this
  // period's check-in (setPeriodCheckIn always dates the row at the period start).
  const isChecked = p.last_update_on === period.start;
  const achieved = isChecked ? Number(p.current_value) : null;
  return `
    <div class="checkin-row" data-checkin-current data-period-start="${period.start}" data-period-type="${periodType}">
      <span class="checkin-label">This ${periodType}${achieved === null ? '<span class="checkin-pending">Not checked in yet</span>' : ''}</span>
      <div class="passfail-toggle">
        <button type="button" class="btn btn-quiet btn-sm ${achieved === 1 ? 'is-selected' : ''}" data-pf-value="1">✓ Achieved</button>
        <button type="button" class="btn btn-quiet btn-sm ${achieved === 0 ? 'is-selected' : ''}" data-pf-value="0">✗ Not achieved</button>
      </div>
    </div>
  `;
}

function quickUpdateFormHtml(g) {
  return `
    <button type="button" class="quick-update-toggle" data-action="toggle-quick-update">+ Add update</button>
    <form class="quick-update-form" hidden data-quick-update-for="${g.id}">
      <textarea name="note" placeholder="What happened?" rows="2"></textarea>
      ${g.measure_type === 'numeric' ? `<input type="number" step="any" name="value" placeholder="Value${g.unit ? ' (' + escapeHtml(g.unit) + ')' : ''}">` : ''}
      <label class="picker-label">Confidence</label>
      ${pickerHtml(`qu-${g.id}`, '', ['Very low', 'Low', 'Medium', 'High', 'Very high'])}
      <button type="submit" class="btn btn-primary btn-sm">Save update</button>
    </form>
  `;
}

/** Pace-bar caption override for pass_fail goals — "72% complete" doesn't read as a hit-rate. */
function passFailLabel(g, p) {
  if (g.measure_type !== 'pass_fail' || !p) return undefined;
  const total = Number(p.pass_fail_total || 0);
  if (!total) return 'No periods logged yet';
  const hits = Number(p.pass_fail_hits || 0);
  return `${hits} of ${total} periods achieved (${formatPercent(p.percent_complete)})`;
}

async function renderMomentumSection(goals) {
  if (!goals.length) return '';
  const months = lastNMonths(6);
  const sinceISO = months[0].key + '-01';
  const updates = await db.listUpdatesForGoalsSince(goals.map((g) => g.id), sinceISO);
  const counts = new Map();
  updates.forEach((u) => {
    const key = `${u.goal_id}:${u.occurred_on.slice(0, 7)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const gridGoals = goals.map((g) => ({ id: g.id, title: g.title, colour: g.areaColour }));
  return `
    <section class="card momentum-section">
      <p class="card-eyebrow">Momentum — last 6 months</p>
      <div class="momentum-scroll">${renderMomentumGrid(gridGoals, months, counts)}</div>
    </section>
  `;
}

function lastNMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    out.push({ key, label });
  }
  return out;
}

function bindDashboardEvents(root, goals) {
  goals.forEach((g) => bindOverdueActions(root, g, () => renderDashboard(root)));

  root.querySelectorAll('[data-action="toggle-quick-update"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.nextElementSibling;
      form.hidden = !form.hidden;
    });
  });

  root.querySelectorAll('.quick-update-form').forEach((form) => {
    const goalId = form.dataset.quickUpdateFor;
    let confidence = null;
    bindPicker(root, `qu-${goalId}`, (v) => { confidence = v; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const goal = goals.find((g) => g.id === goalId);
      await db.createGoalUpdate({
        goal_id: goalId,
        note: fd.get('note'),
        value: goal && goal.measure_type === 'numeric' ? fd.get('value') : null,
        confidence
      });
      renderDashboard(root);
    });
  });

  root.querySelectorAll('[data-checkin-current]').forEach((row) => {
    const goalId = row.closest('[data-goal-card]').dataset.goalCard;
    const periodStart = row.dataset.periodStart;
    row.querySelectorAll('[data-pf-value]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const value = Number(btn.dataset.pfValue);
        const alreadySelected = btn.classList.contains('is-selected');
        await db.setPeriodCheckIn(goalId, periodStart, alreadySelected ? null : !!value);
        renderDashboard(root);
      });
    });
  });
}
