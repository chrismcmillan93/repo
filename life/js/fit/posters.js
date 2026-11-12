// Instagram graphics for @cmfitnesslog, drawn on <canvas> — no library,
// no upload, nothing leaves the phone until Chris posts it himself.
//
// Story: 1080 x 1920 (9:16). Carousel slide: 1080 x 1350 (4:5, the tallest
// feed ratio). Same palette and type as the app: predawn navy, one dawn
// accent, Big Shoulders Display for numbers, Work Sans for words.

import { round1, weightLabel } from './analysis.js';

const C = {
  ink: '#11151c', panel: '#1a212c', line: '#2a3341',
  paper: '#eef0f4', slate: '#8b95a5', dawn: '#f2a154', sage: '#6fb98f'
};
const HANDLE = '@cmfitnesslog';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const SIZES = { story: [1080, 1920], slide: [1080, 1350] };

export async function ensureFonts(){
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('800 120px "Big Shoulders Display"'),
      document.fonts.load('700 60px "Big Shoulders Display"'),
      document.fonts.load('500 40px "Work Sans"'),
      document.fonts.load('600 40px "Work Sans"')
    ]);
  } catch (_) { /* fall back to system fonts */ }
}

function canvas([w, h]){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Background: flat ink with a faint dawn glow at the top, the app's "sunrise" motif.
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, -h * 0.1, 0, w * 0.5, -h * 0.1, h * 0.75);
  g.addColorStop(0, 'rgba(242,161,84,0.22)'); g.addColorStop(1, 'rgba(242,161,84,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  return { c, ctx, w, h };
}

const display = (size, weight = 800) => `${weight} ${size}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
const body = (size, weight = 500) => `${weight} ${size}px "Work Sans", -apple-system, sans-serif`;

function text(ctx, str, x, y, font, color, align = 'left'){
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

// Shrink a single line's font until it fits `maxWidth`.
function fitText(ctx, str, x, y, maxWidth, startSize, fontFn, color, align = 'left'){
  let size = startSize;
  ctx.font = fontFn(size);
  while (ctx.measureText(str).width > maxWidth && size > 24) { size -= 4; ctx.font = fontFn(size); }
  text(ctx, str, x, y, fontFn(size), color, align);
  return size;
}

function wrap(ctx, str, x, y, maxWidth, lineHeight, font, color){
  ctx.font = font;
  const words = String(str).split(/\s+/);
  let line = '', yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      text(ctx, line, x, yy, font, color); line = word; yy += lineHeight;
    } else line = test;
  }
  if (line) text(ctx, line, x, yy, font, color);
  return yy + lineHeight;
}

function footer(ctx, w, h, extra){
  ctx.fillStyle = C.line; ctx.fillRect(80, h - 150, w - 160, 2);
  text(ctx, HANDLE, 80, h - 90, body(36, 600), C.paper);
  if (extra) text(ctx, extra, w - 80, h - 90, body(32), C.slate, 'right');
}

function kicker(ctx, str, x, y){
  text(ctx, str.toUpperCase(), x, y, body(30, 600), C.dawn);
}

function sparkline(ctx, values, x, y, width, height, color = C.dawn){
  const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) return;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const range = max - min || 1;
  const n = values.length - 1 || 1;
  ctx.beginPath();
  pts.forEach((p, k) => {
    const px = x + (p.i / n) * width;
    const py = y + height - ((p.v - min) / range) * height;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(x + (last.i / n) * width, y + height - ((last.v - min) / range) * height, 10, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

function fmtDate(iso){
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tonnes(kg){ return kg >= 1000 ? `${round1(kg / 1000)}t` : `${Math.round(kg)}kg`; }

// ---------------- Story: new PR ----------------

export function prStory(pr, trend = []){
  const { c, ctx, w, h } = canvas(SIZES.story);
  kicker(ctx, 'New personal best', 80, 300);
  text(ctx, 'PR', 80, 560, display(300), C.paper);
  ctx.fillStyle = C.dawn; ctx.fillRect(80, 610, 180, 10);

  let y = 760;
  y = wrap(ctx, pr.title, 80, y, w - 160, 92, display(88, 700), C.paper);

  y += 60;
  text(ctx, `${Number.isInteger(pr.weight) ? pr.weight : round1(pr.weight)}`, 80, y + 220, display(260), C.dawn);
  ctx.font = display(260);
  const numW = ctx.measureText(`${Number.isInteger(pr.weight) ? pr.weight : round1(pr.weight)}`).width;
  text(ctx, `kg × ${pr.reps}`, 80 + numW + 24, y + 220, display(110, 700), C.paper);
  if (pr.dumbbell) text(ctx, 'both dumbbells combined', 80, y + 290, body(34), C.slate);

  y += 380;
  text(ctx, `Estimated 1RM ${round1(pr.e1rm)} kg`, 80, y, body(44, 600), C.paper);
  if (pr.previous) {
    const gain = pr.e1rm - pr.previous;
    text(ctx, `+${round1(gain)} kg on the previous best (${round1(pr.previous)} kg)`, 80, y + 62, body(36), C.sage);
  }

  const chartTop = y + 220, chartH = Math.min(200, h - 230 - chartTop);
  if (trend.filter((v) => v !== null).length >= 2 && chartH > 60) {
    text(ctx, 'Recent sessions', 80, y + 170, body(30, 600), C.slate);
    sparkline(ctx, trend, 90, chartTop, w - 180, chartH);
  }

  footer(ctx, w, h, fmtDate(pr.at));
  return c;
}

// ---------------- Story: month summary ----------------

export function monthStory(m){
  const { c, ctx, w, h } = canvas(SIZES.story);
  kicker(ctx, 'Training recap', 80, 300);
  fitText(ctx, MONTHS[m.monthIndex].toUpperCase(), 80, 520, w - 160, 230, (s) => display(s), C.paper);
  text(ctx, String(m.year), 80, 600, display(70, 700), C.slate);

  const stats = [
    [String(m.sessions), m.sessions === 1 ? 'session' : 'sessions'],
    [tonnes(m.volumeKg), 'lifted'],
    [String(m.prs.length), m.prs.length === 1 ? 'PR' : 'PRs']
  ];
  const colW = (w - 160) / 3;
  stats.forEach(([num, label], i) => {
    const x = 80 + i * colW;
    fitText(ctx, num, x, 840, colW - 30, 150, (sz) => display(sz), i === 2 && m.prs.length ? C.dawn : C.paper);
    text(ctx, label, x, 900, body(36), C.slate);
  });

  let y = 1060;
  text(ctx, 'Top lifts', 80, y, body(34, 600), C.slate);
  y += 30;
  m.topLifts.slice(0, 4).forEach((l) => {
    y += 140;
    ctx.fillStyle = C.line; ctx.fillRect(80, y - 92, w - 160, 2);
    fitText(ctx, l.title, 80, y, w - 460, 46, (s) => body(s, 600), C.paper);
    text(ctx, `${round1(l.best)} kg`, w - 80, y, display(64, 700), C.paper, 'right');
    if (l.prev && l.best > l.prev) text(ctx, `+${round1(l.best - l.prev)}`, w - 80, y + 46, body(30), C.sage, 'right');
  });
  text(ctx, 'Estimated 1RM, best set of the month', 80, y + 110, body(28), C.slate);

  footer(ctx, w, h);
  return c;
}

// ---------------- Carousel: monthly recap ----------------

export function carouselSlides(m, opts = {}){
  const slides = [];
  const monthName = MONTHS[m.monthIndex];

  // 1. Cover
  {
    const { c, ctx, w, h } = canvas(SIZES.slide);
    kicker(ctx, 'Monthly training recap', 80, 220);
    fitText(ctx, monthName.toUpperCase(), 80, 480, w - 160, 240, (s) => display(s), C.paper);
    text(ctx, String(m.year), 80, 570, display(80, 700), C.slate);
    ctx.fillStyle = C.dawn; ctx.fillRect(80, 640, 180, 10);
    text(ctx, `${m.sessions} sessions · ${tonnes(m.volumeKg)} lifted · ${m.prs.length} PRs`, 80, 760, body(42, 600), C.paper);
    text(ctx, 'Swipe →', 80, 860, body(36), C.slate);
    footer(ctx, w, h, '1/5');
    slides.push(c);
  }

  // 2. PRs
  {
    const { c, ctx, w, h } = canvas(SIZES.slide);
    kicker(ctx, 'Personal bests', 80, 200);
    text(ctx, m.prs.length ? `${m.prs.length} new PR${m.prs.length === 1 ? '' : 's'}` : 'No new PRs', 80, 330, display(130), C.paper);
    let y = 440;
    if (!m.prs.length) {
      wrap(ctx, 'A consolidation month — the work still counts.', 80, y + 40, w - 160, 56, body(40), C.slate);
    }
    // Best PR per exercise only, top 5.
    const seen = new Set();
    m.prs.filter((p) => (seen.has(p.exerciseId) ? false : seen.add(p.exerciseId))).slice(0, 5).forEach((p) => {
      y += 130;
      ctx.fillStyle = C.line; ctx.fillRect(80, y - 92, w - 160, 2);
      fitText(ctx, p.title, 80, y - 30, w - 160, 42, (s) => body(s, 600), C.paper);
      text(ctx, weightLabel(p.weight, p.reps, p.dumbbell), 80, y + 22, body(34), C.slate);
      text(ctx, `${round1(p.e1rm)} kg`, w - 80, y + 18, display(60, 700), C.dawn, 'right');
    });
    footer(ctx, w, h, '2/5');
    slides.push(c);
  }

  // 3. Top lifts with trend lines
  {
    const { c, ctx, w, h } = canvas(SIZES.slide);
    kicker(ctx, 'Main lifts', 80, 200);
    text(ctx, 'Where they stand', 80, 320, display(110), C.paper);
    let y = 400;
    const trends = opts.trends || {};
    m.topLifts.slice(0, 4).forEach((l) => {
      fitText(ctx, l.title, 80, y + 60, 560, 40, (s) => body(s, 600), C.paper);
      text(ctx, `${round1(l.best)} kg e1RM`, 80, y + 112, body(32), C.slate);
      const t = trends[l.title];
      if (t) sparkline(ctx, t, 680, y + 30, 320, 90, l.prev && l.best > l.prev ? C.sage : C.dawn);
      y += 190;
    });
    footer(ctx, w, h, '3/5');
    slides.push(c);
  }

  // 4. Consistency
  {
    const { c, ctx, w, h } = canvas(SIZES.slide);
    kicker(ctx, 'Consistency', 80, 200);
    text(ctx, `${m.sessions} sessions`, 80, 330, display(130), C.paper);
    const weeks = m.perWeek;
    const maxV = Math.max(1, ...weeks.map(([, v]) => v));
    const chartTop = 470, chartH = 460, barGap = 30;
    const barW = weeks.length ? (w - 160 - barGap * (weeks.length - 1)) / weeks.length : 0;
    weeks.forEach(([wk, v], i) => {
      const bh = (v / maxV) * chartH;
      const x = 80 + i * (barW + barGap);
      ctx.fillStyle = C.dawn; ctx.fillRect(x, chartTop + chartH - bh, barW, bh);
      text(ctx, String(v), x + barW / 2, chartTop + chartH - bh - 20, display(56, 700), C.paper, 'center');
      const d = new Date(wk + 'T00:00:00');
      text(ctx, `w/c ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`, x + barW / 2, chartTop + chartH + 56, body(28), C.slate, 'center');
    });
    text(ctx, 'Sessions per week', 80, chartTop + chartH + 130, body(30), C.slate);
    footer(ctx, w, h, '4/5');
    slides.push(c);
  }

  // 5. Next month
  {
    const { c, ctx, w, h } = canvas(SIZES.slide);
    kicker(ctx, 'Next month', 80, 200);
    text(ctx, 'The plan', 80, 330, display(130), C.paper);
    const goal = (opts.nextGoal || '').trim() || 'Keep showing up.';
    wrap(ctx, goal, 80, 480, w - 160, 76, body(56, 600), C.paper);
    footer(ctx, w, h, '5/5');
    slides.push(c);
  }

  return slides;
}

// ---------------- export ----------------

export function toBlob(c){
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

// Share sheet on phones (straight into Instagram), download elsewhere.
export async function shareOrDownload(canvases, baseName){
  const blobs = await Promise.all(canvases.map(toBlob));
  const files = blobs.map((b, i) => new File([b], `${baseName}${canvases.length > 1 ? `-${i + 1}` : ''}.png`, { type: 'image/png' }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return 'shared'; }
    catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
  }
  files.forEach((f) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  return 'downloaded';
}
