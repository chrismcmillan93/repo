// Confidence-over-time strip: a small stepped line over a fixed 1-5 domain,
// to spot goals quietly stopped believing in — separate from the value trend.

export function renderConfidenceTrend(points, width = 320, height = 44) {
  const valid = points.filter((p) => p.confidence !== null && p.confidence !== undefined);
  if (valid.length < 2) {
    return `<div class="conf-trend-empty">Not enough confidence ratings yet.</div>`;
  }
  const padX = 6, padY = 6;
  const innerW = width - padX * 2, innerH = height - padY * 2;
  const yFor = (v) => padY + innerH - ((v - 1) / 4) * innerH;

  const coords = valid.map((p, i) => ({
    x: padX + (innerW * i) / (valid.length - 1),
    y: yFor(Number(p.confidence))
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const lastVal = Number(valid[valid.length - 1].confidence);
  const dotColour = lastVal >= 4 ? '#3f8f5e' : (lastVal <= 2 ? '#a6483a' : '#c08a3e');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="conf-trend-svg" preserveAspectRatio="none" role="img" aria-label="Confidence over time">
      <line x1="${padX}" y1="${yFor(3).toFixed(1)}" x2="${width - padX}" y2="${yFor(3).toFixed(1)}" class="conf-midline"/>
      <path d="${linePath}" fill="none" stroke="var(--ink-soft)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.2" fill="${dotColour}"/>
    </svg>
  `;
}
