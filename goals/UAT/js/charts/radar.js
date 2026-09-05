// Life balance wheel — the signature visual. One spoke per life area,
// plotted on average active-goal progress. Deliberately not a stock
// chart-library radar: soft layered rings, a filled blend shape with a
// gentle curve, and a coloured dot + label at each spoke tip.

import { escapeHtml, formatPercent } from '../utils.js';

/**
 * @param {{name:string, colour:string, value:number|null}[]} areas value is 0..1 or null (no active goals)
 * @param {number} size square viewBox size in px
 */
export function renderRadar(areas, size = 280) {
  const n = areas.length;
  if (!n) {
    return `<div class="radar-empty">Add a life area to see your balance wheel.</div>`;
  }
  const cx = size / 2, cy = size / 2;
  const rMax = size * 0.36;
  const labelR = rMax + 26;

  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;

  // Concentric guide rings at 25/50/75/100%.
  const rings = [0.25, 0.5, 0.75, 1].map((f) => (
    `<circle cx="${cx}" cy="${cy}" r="${(rMax * f).toFixed(1)}" class="radar-ring"/>`
  )).join('');

  // Spokes.
  const spokes = areas.map((_, i) => {
    const a = angleFor(i);
    const x = cx + rMax * Math.cos(a), y = cy + rMax * Math.sin(a);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke"/>`;
  }).join('');

  // Data polygon (smoothed with a closed Catmull-Rom -> Bezier curve so it
  // reads as a considered shape rather than a jagged default polygon).
  const pts = areas.map((a, i) => {
    const angle = angleFor(i);
    const v = a.value === null || a.value === undefined ? 0 : Math.max(0.04, Math.min(1, a.value));
    return { x: cx + rMax * v * Math.cos(angle), y: cy + rMax * v * Math.sin(angle) };
  });
  const path = smoothClosedPath(pts);

  const dotsAndLabels = areas.map((a, i) => {
    const angle = angleFor(i);
    const v = a.value === null || a.value === undefined ? 0 : Math.max(0.04, Math.min(1, a.value));
    const dx = cx + rMax * v * Math.cos(angle), dy = cy + rMax * v * Math.sin(angle);
    const lx = cx + labelR * Math.cos(angle), ly = cy + labelR * Math.sin(angle);
    const anchor = Math.cos(angle) > 0.25 ? 'start' : (Math.cos(angle) < -0.25 ? 'end' : 'middle');
    const valueLabel = a.value === null ? '—' : formatPercent(a.value);
    return `
      <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4.5" fill="${escapeHtml(a.colour)}" class="radar-dot"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" class="radar-label">${escapeHtml(a.name)}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" text-anchor="${anchor}" class="radar-label-value" fill="${escapeHtml(a.colour)}">${valueLabel}</text>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${size} ${size}" class="radar-svg" role="img" aria-label="Life balance wheel">
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.08"/>
        </radialGradient>
      </defs>
      ${rings}
      ${spokes}
      <path d="${path}" fill="url(#radarFill)" stroke="var(--accent)" stroke-width="1.6" class="radar-shape"/>
      ${dotsAndLabels}
    </svg>
  `;
}

/** Closed Catmull-Rom spline through pts, rendered as cubic beziers. */
function smoothClosedPath(pts) {
  const n = pts.length;
  if (n < 3) {
    return `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`;
  }
  const get = (i) => pts[(i + n) % n];
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
  return d + 'Z';
}
