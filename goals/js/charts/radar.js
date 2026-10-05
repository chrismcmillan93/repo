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

  // Labels can't be measured from a string renderer, so their extents are
  // estimated and the viewBox grows to contain them — otherwise long area
  // names anchored at a side spoke run off the SVG edge and get clipped.
  let minX = 0, maxX = size, minY = 0, maxY = size;

  const dotsAndLabels = areas.map((a, i) => {
    const angle = angleFor(i);
    const v = a.value === null || a.value === undefined ? 0 : Math.max(0.04, Math.min(1, a.value));
    const dx = cx + rMax * v * Math.cos(angle), dy = cy + rMax * v * Math.sin(angle);
    const lx = cx + labelR * Math.cos(angle), ly = cy + labelR * Math.sin(angle);
    const anchor = Math.cos(angle) > 0.25 ? 'start' : (Math.cos(angle) < -0.25 ? 'end' : 'middle');
    const valueLabel = a.value === null ? '—' : formatPercent(a.value);

    const lines = wrapLabel(a.name);
    const extra = (lines.length - 1) * LINE_H;
    const sin = Math.sin(angle);
    const firstY = ly - (sin < -0.3 ? extra : sin > 0.3 ? 0 : extra / 2);
    const valueY = firstY + extra + 13;

    const w = Math.max(...lines.map((l) => l.length)) * CHAR_W;
    const left = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, left + w);
    minY = Math.min(minY, firstY - 10);
    maxY = Math.max(maxY, valueY + 3);

    const tspans = lines.map((l, j) => (
      `<tspan x="${lx.toFixed(1)}" ${j ? `dy="${LINE_H}"` : ''}>${escapeHtml(l)}</tspan>`
    )).join('');
    return `
      <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4.5" fill="${escapeHtml(a.colour)}" class="radar-dot"/>
      <text x="${lx.toFixed(1)}" y="${firstY.toFixed(1)}" text-anchor="${anchor}" class="radar-label">${tspans}</text>
      <text x="${lx.toFixed(1)}" y="${valueY.toFixed(1)}" text-anchor="${anchor}" class="radar-label-value" fill="${escapeHtml(a.colour)}">${valueLabel}</text>
    `;
  }).join('');

  const pad = 4;
  const vbX = Math.floor(minX - pad), vbY = Math.floor(minY - pad);
  const vbW = Math.ceil(maxX + pad) - vbX, vbH = Math.ceil(maxY + pad) - vbY;
  // Scale the CSS max-width with the viewBox so the wheel itself stays the
  // same size on wide screens rather than shrinking to make room for labels.
  const maxWidth = Math.round(340 * vbW / size);

  return `
    <svg viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="max-width:${maxWidth}px" class="radar-svg" role="img" aria-label="Life balance wheel">
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

// Matches .radar-label's 9.5px semibold sans; CHAR_W errs wide so the
// estimate over- rather than under-reserves room.
const LINE_H = 11;
const CHAR_W = 6;
const WRAP_AT = 13;

/** Greedy word wrap; a single word longer than WRAP_AT keeps its own line. */
function wrapLabel(name) {
  const lines = [];
  for (const word of String(name).split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= WRAP_AT) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines.length ? lines : [''];
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
