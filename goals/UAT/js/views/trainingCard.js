// "Today's training" on the dashboard: the Fitness app's sessions for today,
// tickable here. Tick ids are fitness's own `session:<session_type>`, so
// this card and the Fitness app's Today screen always agree.

import * as db from '../db.js';
import { escapeHtml } from '../utils.js';

// Same display order as fitness/js/utils.js resolveSessionsForDay().
const SESSION_TYPE_ORDER = { upper: 0, lower: 0, run: 1, rest: 2, muay_thai: 3 };

/** Local calendar date, matching the Fitness app — not UTC, which is a day behind just after midnight in BST. */
export function localTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fetches today's bundle; resolves to null on any failure so the dashboard still renders. */
export function loadTrainingDay() {
  const date = localTodayISO();
  return db.getFitnessDay(date).then((bundle) => (bundle ? { ...bundle, date } : null)).catch((err) => {
    console.warn('Today\'s training card unavailable:', err && err.message);
    return null;
  });
}

const round1 = (n) => Math.round(n * 10) / 10;
function formatDistance(km) {
  return `${round1(km * 0.621371)}mi (${round1(km)}km)`;
}

function sessionDetail(s) {
  if (s.session_type === 'run' && s.run) {
    const dist = formatDistance(Number(s.run.distance_km));
    return s.run.detail ? `${dist} — ${s.run.detail}` : `${dist}, ${s.run.effort}`;
  }
  return s.summary || '';
}

export function trainingCardHtml(day) {
  const sessions = day && day.block ? (day.sessions || []) : [];
  if (!sessions.length) return '';
  const checks = day.checks || {};
  const rows = [...sessions]
    .sort((a, b) => (SESSION_TYPE_ORDER[a.session_type] ?? 9) - (SESSION_TYPE_ORDER[b.session_type] ?? 9))
    .map((s) => {
      const itemId = `session:${s.session_type}`;
      const done = !!checks[itemId];
      const detail = sessionDetail(s);
      return `
        <li class="training-row ${done ? 'is-done' : ''}">
          <label class="training-check">
            <input type="checkbox" data-fitness-item="${escapeHtml(itemId)}" ${done ? 'checked' : ''}>
            <span class="training-text">
              <span class="training-title">${escapeHtml(s.title)}</span>
              ${detail ? `<span class="training-detail">${escapeHtml(detail)}</span>` : ''}
            </span>
          </label>
        </li>`;
    }).join('');
  return `
    <section class="card training-card" data-training-date="${escapeHtml(day.date)}">
      <div class="training-head">
        <p class="card-eyebrow">Today's training</p>
        <a class="training-open" href="/fitness/">Open Fitness ›</a>
      </div>
      <ul class="training-list">${rows}</ul>
      <p class="training-error" hidden></p>
    </section>`;
}

export function bindTrainingCard(root) {
  const card = root.querySelector('.training-card');
  if (!card) return;
  const date = card.dataset.trainingDate;
  const errorEl = card.querySelector('.training-error');
  card.querySelectorAll('[data-fitness-item]').forEach((box) => {
    box.addEventListener('change', async () => {
      const checked = box.checked;
      const row = box.closest('.training-row');
      row.classList.toggle('is-done', checked);
      errorEl.hidden = true;
      box.disabled = true;
      try {
        await db.setFitnessCheck(date, box.dataset.fitnessItem, checked);
      } catch (err) {
        box.checked = !checked;
        row.classList.toggle('is-done', !checked);
        errorEl.textContent = `Couldn't save that tick — ${(err && err.message) || 'try again'}.`;
        errorEl.hidden = false;
      } finally {
        box.disabled = false;
      }
    });
  });
}
