// Lifting: what was actually lifted, from Hevy. Fitness's other screens
// answer "did the session happen"; this one answers "is it getting
// stronger". Read-only — Hevy stays where lifts are logged.
import { qs, qsa, escapeHtml, toast, friendlyError } from '../utils.js';
import { db } from '../db.js';
import { state } from '../state.js';
import {
  buildExercises, findPrs, exerciseSummaries, weeklyMuscleSets, maxedDumbbellLifts,
  monthSummary, weightLabel, round1, DUMBBELL_MAX_TOTAL_KG
} from '../lifting/analysis.js';
import { ensureFonts, prStory, monthStory, carouselSlides, shareOrDownload } from '../lifting/posters.js';

const AUTO_SYNC_AFTER_MS = 6 * 3600e3;
const HISTORY_DAYS = 400;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Ephemeral UI state, not worth persisting (same treatment as Plan's tabs).
let openExercise = null;
let postKind = 'pr';
let postPrIndex = 0;
let postMonth = null; // 'YYYY-M'
let nextGoal = '';
let syncing = false;

function sparkSvg(values, { width = 120, height = 32, cls = 'lift-spark' } = {}){
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) return '';
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const range = max - min || 1, n = values.length - 1 || 1, pad = 3;
  const xy = pts.map((p) => `${pad + (p.i / n) * (width - pad * 2)},${height - pad - ((p.v - min) / range) * (height - pad * 2)}`);
  const last = xy[xy.length - 1].split(',');
  return `<svg viewBox="0 0 ${width} ${height}" class="${cls}" aria-hidden="true"><polyline points="${xy.join(' ')}"></polyline><circle cx="${last[0]}" cy="${last[1]}" r="2.5"></circle></svg>`;
}

function shortDate(iso){
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function ago(iso){
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  return shortDate(iso);
}

function syncBarHtml(sync){
  const status = syncing
    ? 'Syncing with Hevy…'
    : sync && sync.last_status === 'error'
      ? `Last sync failed: ${escapeHtml(sync.last_message || 'unknown error')}`
      : `Synced with Hevy ${ago(sync && sync.last_run_at)}`;
  return `
    <div class="lift-sync ${sync && sync.last_status === 'error' ? 'is-error' : ''}">
      <span class="lift-sync-status">${status}</span>
      <button type="button" class="btn btn-quiet lift-sync-btn" id="liftSyncBtn" ${syncing ? 'disabled' : ''}>Sync now</button>
    </div>`;
}

function notConnectedHtml(){
  return `
    <div class="empty-state">
      <strong>Hevy isn't connected yet.</strong>
      <p>Add your Hevy API key (Hevy app → Settings → Developer, needs Hevy Pro) as the <code>HEVY_API_KEY</code> secret, and your email as <code>HEVY_OWNER_EMAIL</code>, in Supabase → Edge Functions → Secrets. Then tap Sync now.</p>
    </div>`;
}

function prsHtml(prs){
  // Latest PR per exercise only (prs is newest-first), last 30 days.
  const seen = new Set();
  const recent = prs.filter((p) => Date.now() - new Date(p.at).getTime() <= 30 * 864e5)
    .filter((p) => (seen.has(p.exerciseId) ? false : seen.add(p.exerciseId)));
  if (!recent.length) return `<p class="section-note">No new PRs in the last 30 days.</p>`;
  return `<ul class="lift-pr-list">${recent.slice(0, 8).map((p) => `
    <li class="lift-pr">
      <div class="lift-pr-main"><span class="lift-pr-title">${escapeHtml(p.title)}</span>
        <span class="lift-pr-set">${weightLabel(p.weight, p.reps, p.dumbbell)} · ${shortDate(p.at)}</span></div>
      <div class="lift-pr-num"><span class="lift-big">${round1(p.e1rm)}</span><span class="lift-unit">kg e1RM</span>
        <span class="lift-gain">+${round1(p.e1rm - p.previous)}</span></div>
    </li>`).join('')}</ul>`;
}

function maxedHtml(maxed){
  if (!maxed.length) return '';
  return `
    <section class="panel">
      <h2 class="panel-title">At the rack's limit</h2>
      <p class="panel-summary">Dumbbell lifts at ${DUMBBELL_MAX_TOTAL_KG} kg total (2 × 50 kg, the gym's heaviest pair) in the last 6 weeks.</p>
      <ul class="lift-maxed-list">${maxed.map((m) => `
        <li class="lift-maxed">
          <div class="lift-maxed-head"><span class="lift-pr-title">${escapeHtml(m.title)}</span>
            <span class="lift-pr-set">Reps at max: ${m.repsHistory.join(' → ')}</span></div>
          <p class="lift-maxed-advice">${escapeHtml(m.advice)}</p>
        </li>`).join('')}</ul>
    </section>`;
}

function exerciseDetailHtml(ex){
  const sessions = ex.sessions.slice(-16);
  const values = sessions.map((s) => s.bestE1rm);
  const rows = ex.sessions.slice(-6).reverse().map((s) => `
    <tr><td>${shortDate(s.at)}</td><td>${s.top ? weightLabel(s.top.weight, s.top.reps, ex.dumbbell) : '—'}</td>
    <td>${s.sets.length}</td><td>${s.bestE1rm !== null ? round1(s.bestE1rm) : '—'}</td></tr>`).join('');
  return `
    <div class="lift-detail">
      ${sparkSvg(values, { width: 600, height: 140, cls: 'lift-detail-chart' }) || '<p class="section-note">Not enough sessions for a trend yet.</p>'}
      <p class="chart-legend">Best estimated 1RM per session, last ${sessions.length}</p>
      <table class="lift-table"><thead><tr><th>Date</th><th>Top set</th><th>Sets</th><th>e1RM</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

function liftsHtml(summaries, exercises){
  if (!summaries.length) return '<p class="section-note">No lifts in the last 12 weeks.</p>';
  return `<ul class="lift-list">${summaries.map((s) => {
    const change = s.change4w;
    const changeHtml = change === null ? '' : `<span class="lift-change ${change > 0.05 ? 'is-up' : change < -0.05 ? 'is-down' : ''}">${change > 0 ? '+' : ''}${round1(change)} kg / 4 wks</span>`;
    const open = openExercise === s.id;
    return `
      <li class="lift-row ${open ? 'is-open' : ''}">
        <button type="button" class="lift-row-btn" data-ex="${escapeHtml(s.id)}" aria-expanded="${open}">
          <span class="lift-row-main">
            <span class="lift-pr-title">${escapeHtml(s.title)}</span>
            <span class="lift-pr-set">${s.lastTop ? weightLabel(s.lastTop.weight, s.lastTop.reps, s.dumbbell) : ''} · ${shortDate(s.lastAt)} · ${s.sessions12w}× in 12 wks</span>
          </span>
          <span class="lift-row-side">
            ${sparkSvg(s.trend)}
            <span class="lift-row-num">${s.bestE1rm ? `${round1(s.bestE1rm)} kg` : ''}</span>
            ${changeHtml}
          </span>
        </button>
        ${open ? exerciseDetailHtml(exercises.get(s.id)) : ''}
      </li>`;
  }).join('')}</ul>`;
}

function muscleHtml(weekly){
  if (!weekly.rows.length) return '<p class="section-note">No sets logged in the last 8 weeks.</p>';
  const max = Math.max(1, ...weekly.rows.flatMap((r) => r.values));
  return `
    <div class="muscle-grid">${weekly.rows.map((r) => `
      <div class="muscle-row">
        <span class="muscle-name">${escapeHtml(r.muscle)}</span>
        <span class="muscle-bars" aria-label="${escapeHtml(r.muscle)}: ${r.values.map((v) => round1(v)).join(', ')} sets per week">
          ${r.values.map((v, i) => `<span class="muscle-bar ${i === r.values.length - 1 ? 'is-current' : ''}" style="height:${Math.max(4, (v / max) * 100)}%" title="${round1(v)} sets"></span>`).join('')}
        </span>
        <span class="muscle-num">${round1(r.current)}<small> / ${round1(r.avg4)} avg</small></span>
      </div>`).join('')}
    </div>
    <p class="chart-legend">Working sets per week, oldest to this week. Secondary muscles count as half a set.</p>`;
}

function monthOptions(workouts){
  const seen = new Map();
  for (const w of workouts) {
    const d = new Date(w.start_time);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) seen.set(key, `${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
  }
  return Array.from(seen.entries()).reverse();
}

function postPanelHtml(prs, months){
  if (!postMonth && months.length) postMonth = months[0][0];
  const kinds = [['pr', 'PR story'], ['month', 'Month story'], ['carousel', 'Month carousel']];
  const controls = postKind === 'pr'
    ? (prs.length
      ? `<div class="field"><label for="postPr">Personal best</label><select id="postPr">${prs.slice(0, 30).map((p, i) => `<option value="${i}" ${i === postPrIndex ? 'selected' : ''}>${escapeHtml(p.title)} — ${weightLabel(p.weight, p.reps, p.dumbbell)}, ${shortDate(p.at)}</option>`).join('')}</select></div>`
      : '<p class="section-note">No PRs yet to post.</p>')
    : `<div class="field"><label for="postMonth">Month</label><select id="postMonth">${months.map(([k, label]) => `<option value="${k}" ${k === postMonth ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
       ${postKind === 'carousel' ? `<div class="field"><label for="postGoal">Next month's focus (last slide)</label><input type="text" id="postGoal" maxlength="90" placeholder="e.g. 140 kg Romanian deadlift for 5" value="${escapeHtml(nextGoal)}"></div>` : ''}`;
  return `
    <section class="panel">
      <h2 class="panel-title">Make a post</h2>
      <p class="panel-summary">For @cmfitnesslog. Stories are 9:16, carousel slides 4:5. Nothing is uploaded — it opens your share sheet or downloads.</p>
      <div class="segmented" role="tablist">${kinds.map(([k, label]) => `<button type="button" class="segmented-btn ${k === postKind ? 'is-active' : ''}" data-kind="${k}" role="tab" aria-selected="${k === postKind}">${label}</button>`).join('')}</div>
      <div class="post-controls">${controls}</div>
      <div class="post-preview" id="postPreview"></div>
      <button type="button" class="btn btn-primary btn-block" id="postShare">Share or download</button>
    </section>`;
}

export async function render(main){
  const userId = state.session.user.id;
  const since = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString();

  const [sync, sets, workouts] = await Promise.all([
    db.hevy.syncState(userId).catch(() => null),
    db.hevy.listSets(userId, since),
    db.hevy.listWorkouts(userId, since)
  ]);
  const templates = await db.hevy.listTemplates(Array.from(new Set(sets.map((s) => s.exercise_template_id)))).catch(() => []);
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]));

  const exercises = buildExercises(sets, tplById);
  const prs = findPrs(exercises);
  const summaries = exerciseSummaries(exercises);
  const weekly = weeklyMuscleSets(exercises);
  const maxed = maxedDumbbellLifts(exercises);
  const months = monthOptions(workouts);

  const hasData = sets.length > 0;
  const neverSynced = !sync || !sync.last_run_at;

  main.innerHTML = `
    ${syncBarHtml(sync)}
    ${!hasData
      ? (neverSynced ? notConnectedHtml() : '<div class="empty-state"><strong>No lifts in Hevy yet.</strong><p>Log a workout in Hevy, then sync.</p></div>')
      : `
      <section class="panel">
        <h2 class="panel-title">Recent PRs</h2>
        ${prsHtml(prs)}
      </section>
      ${maxedHtml(maxed)}
      <section class="panel">
        <h2 class="panel-title">Your lifts</h2>
        <p class="panel-summary">Most-trained first. Tap one for its trend. Dumbbell weights are both dumbbells combined, as logged.</p>
        ${liftsHtml(summaries, exercises)}
      </section>
      <section class="panel">
        <h2 class="panel-title">Weekly sets by muscle</h2>
        ${muscleHtml(weekly)}
      </section>
      ${postPanelHtml(prs, months)}`}
  `;

  wire(main, { exercises, prs, workouts, summaries });

  // Auto-sync when stale; re-render once if anything changed.
  const stale = !sync || !sync.last_run_at || Date.now() - new Date(sync.last_run_at).getTime() > AUTO_SYNC_AFTER_MS;
  if (stale && !syncing && !(sync && sync.last_status === 'error' && Date.now() - new Date(sync.last_run_at).getTime() < 15 * 60e3)) {
    runSync(main, { quiet: true });
  }
}

async function runSync(main, { quiet = false } = {}){
  if (syncing) return;
  syncing = true;
  const bar = qs('.lift-sync-status', main);
  const btn = qs('#liftSyncBtn', main);
  if (bar) bar.textContent = 'Syncing with Hevy…';
  if (btn) btn.disabled = true;
  try {
    const res = await db.hevy.runSync();
    syncing = false;
    if (!quiet || (res && (res.upserted || res.deleted))) toast(res && res.upserted ? `Synced ${res.upserted} workout${res.upserted === 1 ? '' : 's'} from Hevy.` : 'Up to date with Hevy.');
  } catch (err) {
    syncing = false;
    if (err.code === 'not_configured') { if (!quiet) toast('Hevy isn\'t connected yet — add the API key first.'); }
    else toast(`Hevy sync: ${friendlyError(err)}`);
  }
  if (window.location.hash === '#/lifting') {
    const { renderRoute } = await import('../router.js');
    renderRoute();
  }
}

function wire(main, data){
  const btn = qs('#liftSyncBtn', main);
  if (btn) btn.addEventListener('click', () => runSync(main));

  qsa('.lift-row-btn', main).forEach((b) => {
    b.addEventListener('click', () => {
      openExercise = openExercise === b.dataset.ex ? null : b.dataset.ex;
      const li = b.closest('.lift-row');
      const open = openExercise === b.dataset.ex;
      qsa('.lift-row', main).forEach((row) => {
        row.classList.remove('is-open');
        const d = qs('.lift-detail', row); if (d) d.remove();
        const bb = qs('.lift-row-btn', row); if (bb) bb.setAttribute('aria-expanded', 'false');
      });
      if (open) {
        li.classList.add('is-open');
        b.setAttribute('aria-expanded', 'true');
        li.insertAdjacentHTML('beforeend', exerciseDetailHtml(data.exercises.get(b.dataset.ex)));
      }
    });
  });

  // Post maker
  qsa('.segmented-btn[data-kind]', main).forEach((b) => b.addEventListener('click', () => {
    postKind = b.dataset.kind;
    rerenderPostPanel(main, data);
  }));
  wirePostControls(main, data);
  drawPreview(main, data);
}

function rerenderPostPanel(main, data){
  const panel = qs('#postPreview', main)?.closest('.panel');
  if (!panel) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = postPanelHtml(data.prs, monthOptions(data.workouts));
  panel.replaceWith(tmp.firstElementChild);
  qsa('.segmented-btn[data-kind]', main).forEach((b) => b.addEventListener('click', () => {
    postKind = b.dataset.kind; rerenderPostPanel(main, data);
  }));
  wirePostControls(main, data);
  drawPreview(main, data);
}

function wirePostControls(main, data){
  const pr = qs('#postPr', main);
  if (pr) pr.addEventListener('change', () => { postPrIndex = Number(pr.value); drawPreview(main, data); });
  const mo = qs('#postMonth', main);
  if (mo) mo.addEventListener('change', () => { postMonth = mo.value; drawPreview(main, data); });
  const goal = qs('#postGoal', main);
  if (goal) {
    let t = null;
    goal.addEventListener('input', () => { nextGoal = goal.value; clearTimeout(t); t = setTimeout(() => drawPreview(main, data), 300); });
  }
  const share = qs('#postShare', main);
  if (share) share.addEventListener('click', async () => {
    const canvases = await buildPost(data);
    if (!canvases.length) { toast('Nothing to post yet.'); return; }
    share.disabled = true;
    try {
      const name = postKind === 'pr' ? 'cmfitnesslog-pr' : postKind === 'month' ? 'cmfitnesslog-month' : 'cmfitnesslog-carousel';
      const result = await shareOrDownload(canvases, name);
      if (result === 'downloaded') toast(canvases.length > 1 ? `${canvases.length} images downloaded.` : 'Image downloaded.');
    } catch (err) {
      toast(friendlyError(err));
    } finally { share.disabled = false; }
  });
}

async function buildPost(data){
  await ensureFonts();
  if (postKind === 'pr') {
    const pr = data.prs[postPrIndex];
    if (!pr) return [];
    const ex = data.exercises.get(pr.exerciseId);
    const upTo = ex ? ex.sessions.filter((s) => s.at <= pr.at).slice(-10).map((s) => s.bestE1rm) : [];
    return [prStory(pr, upTo)];
  }
  if (!postMonth) return [];
  const [y, m] = postMonth.split('-').map(Number);
  const summary = monthSummary(data.exercises, data.workouts, data.prs, y, m);
  if (postKind === 'month') return [monthStory(summary)];
  const trends = {};
  for (const ex of data.exercises.values()) {
    const end = new Date(y, m + 1, 1).toISOString();
    trends[ex.title] = ex.sessions.filter((s) => s.at < end).slice(-10).map((s) => s.bestE1rm);
  }
  return carouselSlides(summary, { trends, nextGoal });
}

let previewToken = 0;
async function drawPreview(main, data){
  const host = qs('#postPreview', main);
  if (!host) return;
  const token = ++previewToken;
  const canvases = await buildPost(data);
  if (token !== previewToken) return;
  host.innerHTML = '';
  host.classList.toggle('is-strip', canvases.length > 1);
  canvases.forEach((c) => { c.className = 'post-canvas'; host.appendChild(c); });
  if (!canvases.length) host.innerHTML = '<p class="section-note">Nothing to preview yet.</p>';
}
