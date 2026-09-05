// Pace bar: progress fill + a marker for where the goal "should" be based on
// elapsed time. Ahead/behind is what matters, not the raw percentage.

import { formatPercent, escapeHtml } from '../utils.js';

/**
 * @param {number|null} percentComplete 0..1 or null
 * @param {number|null} percentElapsed 0..1 or null (null when no target_date, e.g. long_term/narrative)
 * @param {string} colour area colour, hex
 * @param {string} [customLabel] overrides the computed caption — used for
 *   pass_fail goals, where "72% complete" doesn't read as "6 of 8 hit"
 */
export function renderPaceBar(percentComplete, percentElapsed, colour, customLabel) {
  const complete = percentComplete === null || percentComplete === undefined ? null : Number(percentComplete);
  const elapsed = percentElapsed === null || percentElapsed === undefined ? null : Number(percentElapsed);
  const fillPct = complete === null ? 0 : Math.round(Math.max(0, Math.min(1, complete)) * 100);
  const c = escapeHtml(colour || '#6b7280');

  let markerHtml = '';
  let paceClass = '';
  if (elapsed !== null && complete !== null) {
    const markerPct = Math.round(Math.max(0, Math.min(1, elapsed)) * 100);
    paceClass = complete + 0.001 >= elapsed ? 'is-ahead' : 'is-behind';
    markerHtml = `<div class="pace-marker" style="left:${markerPct}%" title="Expected by now: ${formatPercent(elapsed)}"></div>`;
  }

  const label = customLabel || (complete === null
    ? (elapsed !== null ? `On track marker at ${formatPercent(elapsed)} — no measure logged yet` : 'No numeric measure')
    : `${formatPercent(complete)} complete`);

  return `
    <div class="pace-bar ${paceClass}">
      <div class="pace-track">
        <div class="pace-fill" style="width:${fillPct}%; background:${c}"></div>
        ${markerHtml}
      </div>
      <div class="pace-caption">${escapeHtml(label)}</div>
    </div>
  `;
}
