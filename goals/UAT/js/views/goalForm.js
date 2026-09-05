// Create/edit a goal. Same view for both — params.id present means editing.

import * as db from '../db.js';
import { escapeHtml, todayISO, horizonLabel, measureLabel, statusLabel } from '../utils.js';
import { navigate } from '../router.js';
import { loadingHtml, errorHtml } from './shared.js';

const HORIZONS = ['weekly', 'monthly', 'quarterly', 'annual', 'long_term'];
const MEASURES = ['numeric', 'milestone', 'pass_fail', 'narrative'];
const STATUSES = ['active', 'paused', 'achieved', 'dropped'];
const DIRECTIONS = ['increase', 'decrease'];

// Open-ended horizons — no fixed end date, so target_date is optional
// (matches the goals_target_date_required check constraint).
const OPEN_ENDED_HORIZONS = ['long_term', 'weekly', 'monthly'];

export async function renderGoalForm(root, params) {
  root.innerHTML = loadingHtml('Loading…');
  const isEdit = !!params.id;
  let goal = null;
  try {
    const areas = await db.listAreas({ includeArchived: true });
    if (isEdit) goal = await db.getGoal(params.id);

    if (!areas.length) {
      root.innerHTML = `<div class="card"><p>You need a life area before you can add a goal. <a href="#/areas">Add one here</a>.</p></div>`;
      return;
    }

    root.innerHTML = formHtml(areas, goal);
    bindForm(root, areas, goal, isEdit);
  } catch (err) {
    root.innerHTML = errorHtml(err);
  }
}

function opt(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function formHtml(areas, goal) {
  const g = goal || {
    area_id: areas[0].id, title: '', description: '', why: '',
    horizon: 'monthly', status: 'active', start_date: todayISO(), target_date: '',
    measure_type: 'numeric', target_value: '', start_value: 0, unit: '', direction: 'increase',
    priority: 3
  };
  const isEdit = !!goal;
  const numericVisible = g.measure_type === 'numeric';
  const passFailVisible = g.measure_type === 'pass_fail';

  return `
    <section class="card">
      <p class="card-eyebrow">${isEdit ? 'Edit goal' : 'New goal'}</p>
      <form id="goal-form" class="stacked-form">
        <label>Life area
          <select name="area_id">${areas.map((a) => opt(a.id, a.name + (a.archived_at ? ' (archived)' : ''), g.area_id)).join('')}</select>
        </label>

        <label>Title
          <input type="text" name="title" maxlength="160" required value="${escapeHtml(g.title)}">
        </label>

        <label>Why does this matter?
          <textarea name="why" rows="2" placeholder="The motivation behind it — surfaced in reviews">${escapeHtml(g.why || '')}</textarea>
        </label>

        <label>Description
          <textarea name="description" rows="3">${escapeHtml(g.description || '')}</textarea>
        </label>

        <div class="form-row">
          <label>Horizon
            <select name="horizon">${HORIZONS.map((h) => opt(h, horizonLabel(h), g.horizon)).join('')}</select>
          </label>
          ${isEdit ? `<label>Status
            <select name="status">${STATUSES.map((s) => opt(s, statusLabel(s), g.status)).join('')}</select>
          </label>` : ''}
        </div>

        <div class="form-row">
          <label>Start date
            <input type="date" name="start_date" value="${escapeHtml(g.start_date)}" required>
          </label>
          <label>Target date <span id="target-date-hint" class="field-hint"></span>
            <input type="date" name="target_date" value="${escapeHtml(g.target_date || '')}">
          </label>
        </div>

        <label>How will you measure it?
          <select name="measure_type">${MEASURES.map((m) => opt(m, measureLabel(m), g.measure_type)).join('')}</select>
        </label>

        <div id="numeric-fields" ${numericVisible ? '' : 'hidden'}>
          <div class="form-row">
            <label>Start value
              <input type="number" step="any" name="start_value" value="${g.start_value ?? 0}">
            </label>
            <label>Target value
              <input type="number" step="any" name="target_value" value="${g.target_value ?? ''}">
            </label>
          </div>
          <div class="form-row">
            <label>Unit
              <input type="text" name="unit" placeholder="kg, £, reps…" value="${escapeHtml(g.unit || '')}">
            </label>
            <label>Direction
              <select name="direction">${DIRECTIONS.map((d) => opt(d, d === 'increase' ? 'Increasing' : 'Decreasing', g.direction)).join('')}</select>
            </label>
          </div>
        </div>

        <div id="passfail-fields" ${passFailVisible ? '' : 'hidden'}>
          <p class="field-hint">Each update records a simple yes/no for that period (e.g. "did I save £400 this month?"). Progress shows as a hit-rate across every period logged.</p>
          <div class="form-row">
            <label>Target, for reference <span class="field-hint">(optional)</span>
              <input type="number" step="any" name="pf_target_value" placeholder="400" value="${g.target_value ?? ''}">
            </label>
            <label>Unit <span class="field-hint">(optional)</span>
              <input type="text" name="pf_unit" placeholder="£" value="${escapeHtml(g.unit || '')}">
            </label>
          </div>
        </div>

        ${g.measure_type === 'milestone' ? `<p class="field-hint">Add milestones from the goal's detail page once it's created.</p>` : ''}

        <label>Priority (1 = highest)
          <select name="priority">${[1, 2, 3, 4, 5].map((n) => opt(n, String(n), g.priority)).join('')}</select>
        </label>

        <p id="form-error" class="form-error" style="display:none;"></p>
        <div class="form-row">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save changes' : 'Create goal'}</button>
          <a class="btn btn-quiet" href="${isEdit ? '#/goal/' + goal.id : '#/areas'}">Cancel</a>
        </div>
      </form>
    </section>
  `;
}

function bindForm(root, areas, goal, isEdit) {
  const form = root.querySelector('#goal-form');
  const measureSelect = form.querySelector('[name="measure_type"]');
  const numericFields = root.querySelector('#numeric-fields');
  const passFailFields = root.querySelector('#passfail-fields');
  const horizonSelect = form.querySelector('[name="horizon"]');
  const targetHint = root.querySelector('#target-date-hint');
  const errorEl = root.querySelector('#form-error');

  function syncMeasureVisibility() {
    numericFields.hidden = measureSelect.value !== 'numeric';
    passFailFields.hidden = measureSelect.value !== 'pass_fail';
  }
  function syncTargetHint() {
    targetHint.textContent = OPEN_ENDED_HORIZONS.includes(horizonSelect.value) ? '(optional)' : '(required)';
  }
  measureSelect.addEventListener('change', syncMeasureVisibility);
  horizonSelect.addEventListener('change', syncTargetHint);
  syncTargetHint();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const horizon = fd.get('horizon');
    const targetDate = fd.get('target_date') || null;
    const measureType = fd.get('measure_type');

    if (title.length < 1 || title.length > 160) {
      return showError(errorEl, 'Title must be 1–160 characters.');
    }
    if (!OPEN_ENDED_HORIZONS.includes(horizon) && !targetDate) {
      return showError(errorEl, 'Target date is required for annual and quarterly goals.');
    }
    if (targetDate && fd.get('start_date') && targetDate < fd.get('start_date')) {
      return showError(errorEl, 'Target date can\'t be before the start date.');
    }
    if (measureType === 'numeric' && (fd.get('target_value') === '' || fd.get('target_value') === null)) {
      return showError(errorEl, 'Numeric goals need a target value.');
    }

    const payload = {
      area_id: fd.get('area_id'),
      title,
      description: fd.get('description') || null,
      why: fd.get('why') || null,
      horizon,
      start_date: fd.get('start_date'),
      target_date: targetDate,
      measure_type: measureType,
      priority: Number(fd.get('priority'))
    };
    if (measureType === 'numeric') {
      payload.start_value = Number(fd.get('start_value') || 0);
      payload.target_value = Number(fd.get('target_value'));
      payload.unit = fd.get('unit') || null;
      payload.direction = fd.get('direction');
    } else if (measureType === 'pass_fail') {
      const pfTarget = fd.get('pf_target_value');
      payload.target_value = pfTarget ? Number(pfTarget) : null;
      payload.unit = fd.get('pf_unit') || null;
    } else {
      payload.target_value = null;
      payload.unit = null;
    }
    if (isEdit) payload.status = fd.get('status');

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      if (isEdit) {
        if (payload.target_date !== goal.target_date) {
          const newDate = payload.target_date;
          delete payload.target_date;
          await db.changeTargetDate(goal, newDate);
        }
        const updated = await db.updateGoal(goal.id, payload);
        navigate(`/goal/${updated.id}`);
      } else {
        const created = await db.createGoal(payload);
        navigate(`/goal/${created.id}`);
      }
    } catch (err) {
      showError(errorEl, err.message || String(err));
      submitBtn.disabled = false;
    }
  });
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = '';
}
