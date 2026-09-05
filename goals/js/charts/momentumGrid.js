// Momentum grid: rows = goals, columns = months, cell intensity = number of
// updates logged that month. A calendar heatmap at monthly resolution —
// shows which goals have gone quiet, without being a daily habit streak.

import { escapeHtml } from '../utils.js';

/**
 * @param {{id:string, title:string, colour:string}[]} goals
 * @param {{key:string, label:string}[]} months ascending, oldest first, key = 'YYYY-MM'
 * @param {Map<string, number>} counts keyed by `${goalId}:${monthKey}`
 */
export function renderMomentumGrid(goals, months, counts) {
  if (!goals.length) return `<div class="momentum-empty">No active goals yet.</div>`;

  const header = months.map((m) => `<div class="mg-col-label">${escapeHtml(m.label)}</div>`).join('');

  const rows = goals.map((g) => {
    const cells = months.map((m) => {
      const n = counts.get(`${g.id}:${m.key}`) || 0;
      const level = n === 0 ? 0 : (n === 1 ? 1 : (n <= 3 ? 2 : 3));
      return `<div class="mg-cell mg-level-${level}" style="${level > 0 ? `--mg-colour:${escapeHtml(g.colour || '#6b7280')}` : ''}" title="${escapeHtml(m.label)}: ${n} update${n === 1 ? '' : 's'}"></div>`;
    }).join('');
    return `
      <div class="mg-row">
        <div class="mg-row-label" title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</div>
        <div class="mg-row-cells">${cells}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="momentum-grid">
      <div class="mg-header"><div class="mg-row-label"></div><div class="mg-row-cells">${header}</div></div>
      ${rows}
    </div>
  `;
}
