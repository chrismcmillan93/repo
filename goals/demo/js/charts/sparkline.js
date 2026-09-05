// Small value-over-time line for numeric goals, plotted from goal_updates.value.

import { escapeHtml } from '../utils.js';

/**
 * @param {{occurred_on:string, value:number}[]} points ascending by date, values non-null
 * @param {string} colour
 */
export function renderSparkline(points, colour, width = 320, height = 72) {
  const valid = points.filter((p) => p.value !== null && p.value !== undefined);
  if (valid.length < 2) {
    return `<div class="sparkline-empty">Not enough numeric updates yet for a trend.</div>`;
  }
  const values = valid.map((p) => Number(p.value));
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || 1;
  const padX = 6, padY = 8;
  const innerW = width - padX * 2, innerH = height - padY * 2;

  const coords = valid.map((p, i) => {
    const x = padX + (innerW * i) / (valid.length - 1);
    const y = padY + innerH - ((Number(p.value) - min) / span) * innerH;
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)},${height - padY} L ${coords[0].x.toFixed(1)},${height - padY} Z`;
  const last = coords[coords.length - 1];
  const c = escapeHtml(colour || '#6b7280');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline-svg" preserveAspectRatio="none" role="img" aria-label="Value over time">
      <path d="${areaPath}" fill="${c}" opacity="0.12"/>
      <path d="${linePath}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" fill="${c}"/>
    </svg>
  `;
}
