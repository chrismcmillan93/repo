// Garmin in the Life app. Reads the mirror tables in the `fitness` schema
// (garmin_activities, garmin_days, garmin_sleep, garmin_autoticks,
// garmin_sync_state), which only the `garmin-sync` Edge Function writes: it
// pulls from Garmin's Personal API every half hour and on "Sync now". Nothing
// here writes to Garmin or to those tables.
//
// Used by Today (the recovery panel), Health > Day (what was actually done
// against the plan), Health > Progress (trends), the weekly commitments feed
// and Settings.
import { supabase } from './supabaseClient.js';
import { userId } from '../store.js';
import { escapeHtml as esc, round1, addDays, todayStr, startOfWeek } from './utils.js';

const ACT = 'activity_id, name, type_key, local_date, start_local, distance_m, duration_s, moving_s, elevation_gain_m, avg_speed_mps, avg_hr, max_hr, calories, aerobic_te, te_label, training_load';
const DAY = 'day, steps, step_goal, resting_hr, avg_stress, bb_high, bb_low, bb_charged, bb_drained, moderate_min, vigorous_min, total_kcal';
const SLEEP = 'day, sleep_s, deep_s, light_s, rem_s, awake_s, score, score_label, avg_hr, need_min, hrv_last_night, hrv_weekly_avg, hrv_status, hrv_low, hrv_high';

// PostgREST caps a response at 1,000 rows, so page until a short page.
async function range(table, cols, col, from, to){
  const out = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await supabase.from(table).select(cols).eq('user_id', userId()).gte(col, from).lte(col, to).order(col).range(at, at + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

export const garmin = {
  activities: (from, to) => range('garmin_activities', ACT, 'local_date', from, to),
  days: (from, to) => range('garmin_days', DAY, 'day', from, to),
  sleep: (from, to) => range('garmin_sleep', SLEEP, 'day', from, to),
  autoticks: (from, to) => range('garmin_autoticks', 'log_date, activity_id', 'log_date', from, to),
  async state(){
    const { data, error } = await supabase.from('garmin_sync_state').select('*').eq('user_id', userId()).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async runSync(){
    const { data, error } = await supabase.functions.invoke('garmin-sync', { method: 'POST', body: {} });
    if (error) {
      let detail = null;
      try { detail = await error.context.json(); } catch (_) { /* not JSON */ }
      const err = new Error((detail && detail.message) || error.message || 'Sync failed');
      err.code = detail && detail.error;
      throw err;
    }
    return data;
  }
};

// One toast-ready sentence for the result of runSync(), or for its error.
export function syncSummary(res){
  const r = (res && res.recent) || {};
  const bits = [`${r.activities || 0} activit${r.activities === 1 ? 'y' : 'ies'} and ${r.nights || 0} night${r.nights === 1 ? '' : 's'} refreshed`];
  if (res.ticked) bits.push(`${res.ticked} run${res.ticked === 1 ? '' : 's'} ticked`);
  if (res.filled) bits.push(`${res.filled} weigh-in${res.filled === 1 ? '' : 's'} filled in`);
  return `Garmin: ${bits.join(', ')}`;
}
export function syncError(err){
  if (err.code === 'not_configured') return 'Garmin is not connected yet: the API key has to be added in Supabase first.';
  if (err.code === 'key_rejected') return 'Garmin rejected the API key. It has probably expired: make a new one in Garmin Connect.';
  if (err.code === 'rate_limited') return 'Garmin asked for a pause. Try again in a few minutes.';
  if (err.code === 'not_allowed') return 'Garmin is connected to a different account.';
  return `Garmin sync: ${err.message}`;
}

// ---- formatting ----
const TYPES = {
  running: 'Run', treadmill_running: 'Treadmill run', trail_running: 'Trail run', track_running: 'Track run', virtual_run: 'Virtual run',
  walking: 'Walk', hiking: 'Hike', strength_training: 'Strength', stair_climbing: 'Stairs', indoor_rowing: 'Row', indoor_cardio: 'Cardio',
  indoor_cycling: 'Indoor ride', cycling: 'Ride', elliptical: 'Elliptical', lap_swimming: 'Swim', open_water_swimming: 'Open water swim'
};
export const typeLabel = (key) => TYPES[key] || String(key || 'Activity').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const EFFECT = { RECOVERY: 'Recovery', AEROBIC_BASE: 'Base', TEMPO: 'Tempo', LACTATE_THRESHOLD: 'Threshold', VO2MAX: 'VO2 max', ANAEROBIC_CAPACITY: 'Anaerobic', SPEED: 'Sprint' };
export const isRun = (a) => /run/.test(a.type_key || '');
const MILE = 1609.344;

// 3725 -> "1:02:05", 605 -> "10:05"
export function clock(seconds){
  const s = Math.round(Number(seconds) || 0), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
// 22860 -> "6h 21m"
export function hoursMins(seconds){
  const m = Math.round((Number(seconds) || 0) / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
// Miles first with km in brackets, the same way the plan writes distances.
export function distance(metres){
  const m = Number(metres) || 0;
  return `${round1(m / MILE)} mi (${(m / 1000).toFixed(1)} km)`;
}
export function pace(a){
  const secs = Number(a.moving_s || a.duration_s) || 0, m = Number(a.distance_m) || 0;
  if (!secs || m < 200) return '';
  return `${clock(secs / (m / MILE))} /mi (${clock(secs / (m / 1000))} /km)`;
}

// One activity as a row: what it was, how far, how fast, how hard.
export function activityHtml(a, { ticked = false } = {}){
  const far = Number(a.distance_m) >= 200;
  const facts = [
    far ? distance(a.distance_m) : '', clock(a.duration_s), far && /run|walk|hik/.test(a.type_key) ? pace(a) : '',
    a.avg_hr ? `${a.avg_hr} bpm avg${a.max_hr ? `, ${a.max_hr} max` : ''}` : '',
    Number(a.elevation_gain_m) >= 20 ? `${Math.round(a.elevation_gain_m)} m climbed` : ''
  ].filter(Boolean);
  const chips = [
    EFFECT[a.te_label] ? `<span class="pill">${EFFECT[a.te_label]}</span>` : '',
    a.training_load ? `<span class="pill">Load ${Math.round(a.training_load)}</span>` : '',
    ticked ? '<span class="pill good">Ticked the session</span>' : ''
  ].join('');
  return `<div class="row gact"><span class="rt"><span class="rtitle">${esc(a.name || typeLabel(a.type_key))} <span class="hint">${esc(typeLabel(a.type_key))} · ${esc(String(a.start_local).slice(11, 16))}</span></span>
    <span class="rmeta">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</span>${chips ? `<span class="rmeta">${chips}</span>` : ''}</span></div>`;
}

// The Garmin block for one day: every activity recorded, and for a planned run
// how the distance compares with what the plan asked for.
export function dayHtml(acts, { plannedKm = null, plannedMiles = null, ticked = null, compact = false } = {}){
  if (!acts.length) return '';
  const runM = acts.filter(isRun).reduce((s, a) => s + (Number(a.distance_m) || 0), 0);
  const versus = plannedKm && runM ? `<p class="hint">Plan: ${plannedMiles != null ? `${Number(plannedMiles)} mi (${Number(plannedKm).toFixed(1)} km)` : `${Number(plannedKm).toFixed(1)} km`}. Ran: ${distance(runM)}${runM / 1000 >= Number(plannedKm) * 0.95 ? '' : `, ${round1(Number(plannedKm) - runM / 1000)} km short`}.</p>` : '';
  const list = compact ? acts.filter((a) => isRun(a) || Number(a.duration_s) >= 900) : acts;
  return `<p class="sub">From Garmin</p>${versus}${list.map((a) => activityHtml(a, { ticked: ticked != null && a.activity_id === ticked })).join('')}`;
}

// ---- Today: last night and this morning ----
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function loadRecovery(date = todayStr()){
  const from = addDays(date, -7);
  const [sleep, days, state] = await Promise.all([garmin.sleep(from, date), garmin.days(from, date), garmin.state()]);
  if (!state) return null;
  const night = sleep.find((s) => s.day === date) || null;
  const day = days.find((d) => d.day === date) || null;
  const before = (rows, key) => mean(rows.filter((r) => r.day < date && r[key] != null).map((r) => Number(r[key])));
  return { date, night, day, state, avgSleep: before(sleep, 'sleep_s'), avgRhr: before(days, 'resting_hr') };
}

const HRV = { BALANCED: ['Balanced', 'good'], UNBALANCED: ['Unbalanced', 'warn'], LOW: ['Low', 'bad'], POOR: ['Poor', 'bad'] };

export function recoveryHtml(r){
  if (!r) return '';
  const n = r.night, d = r.day;
  if (!n && !(d && d.resting_hr != null)) {
    return `<h2>Recovery <small>From Garmin</small></h2><p class="hint">Nothing from last night yet. It arrives once your watch has synced with the Garmin app.</p>
      <div class="btns"><button class="btn sm" data-act="garminsync">Check now</button></div>`;
  }
  const stat = (big, label, sub) => `<div><b class="big">${big}</b><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const flags = [];
  const cells = [];
  if (n) {
    const short = n.need_min && n.sleep_s < n.need_min * 60 - 3600;
    cells.push(stat(hoursMins(n.sleep_s), `sleep${n.score != null ? ` · score ${n.score}` : ''}`, n.need_min ? `needed ${hoursMins(n.need_min * 60)}` : r.avgSleep ? `7-day average ${hoursMins(r.avgSleep)}` : ''));
    if (short) flags.push(`<span class="pill warn">${hoursMins(n.need_min * 60 - n.sleep_s)} short on sleep</span>`);
    if (n.hrv_last_night != null) {
      cells.push(stat(n.hrv_last_night, 'HRV overnight (ms)', n.hrv_low != null ? `your range ${n.hrv_low} to ${n.hrv_high}` : n.hrv_weekly_avg != null ? `7-day average ${n.hrv_weekly_avg}` : ''));
      const st = HRV[n.hrv_status];
      if (st) flags.push(`<span class="pill ${st[1]}">HRV status: ${st[0]}</span>`);
      if (n.hrv_low != null && n.hrv_last_night < n.hrv_low) flags.push('<span class="pill warn">Last night below your range</span>');
    }
  }
  if (d && d.resting_hr != null) {
    const diff = r.avgRhr != null ? Math.round(d.resting_hr - r.avgRhr) : null;
    cells.push(stat(d.resting_hr, 'resting heart rate', r.avgRhr != null ? `7-day average ${Math.round(r.avgRhr)}` : ''));
    if (diff != null && diff >= 4) flags.push(`<span class="pill warn">Resting heart rate ${diff} above normal</span>`);
  }
  if (d && d.bb_high != null) cells.push(stat(d.bb_high, 'Body Battery', "today's high"));
  return `<h2>Recovery <small>${n ? 'Last night, from Garmin' : 'From Garmin'}</small></h2><div class="stats">${cells.join('')}</div>
    ${flags.length ? `<p class="rmeta">${flags.join('')}</p>` : ''}
    ${r.state.last_status === 'error' ? `<p class="hint">The last Garmin sync failed: ${esc(r.state.last_message || 'unknown error')}</p>` : ''}
    <div class="btns"><a class="btn sm" href="#/health/progress">Trends</a></div>`;
}

// ---- Health > Progress: trends ----
const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Daily dots with a 7-day average line; `band` shades a normal range.
export function trendChart(dates, values, { unit = '', digits = 0, label = '', band = null, fmt = null, left = 38 } = {}){
  const avg = values.map((_, i) => mean(values.slice(Math.max(0, i - 6), i + 1).filter((v) => v != null)));
  const all = values.concat(avg, band || []).filter((v) => v != null);
  if (all.length < 2) return '<p class="hint">Not enough data yet.</p>';
  const W = 640, H = 170, L = left, R = 10, T = 14, B = 22;
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const x = (i) => L + i * (W - L - R) / Math.max(1, dates.length - 1), y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const show = fmt || ((v) => (digits ? v.toFixed(digits) : String(Math.round(v))));
  const ticks = [0, 1, 2, 3].map((k) => lo + (hi - lo) * (k + 0.5) / 4);
  const line = avg.map((v, i) => (v == null ? null : `${round1(x(i))},${round1(y(v))}`)).filter(Boolean).join(' ');
  const last = avg.map((v, i) => (v == null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} over ${dates.length} days with a 7-day average">
    ${band ? `<rect x="${L}" y="${round1(y(band[1]))}" width="${W - L - R}" height="${round1(y(band[0]) - y(band[1]))}" fill="var(--good-soft)"/>` : ''}
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${round1(y(v))}" y2="${round1(y(v))}" stroke="var(--line)"/><text x="${L - 6}" y="${round1(y(v) + 4)}" text-anchor="end">${show(v)}</text>`).join('')}
    ${values.map((v, i) => (v == null ? '' : `<circle cx="${round1(x(i))}" cy="${round1(y(v))}" r="${dates.length > 200 ? 1.2 : 2}" fill="var(--muted)"/>`)).join('')}
    <polyline fill="none" stroke="var(--accent)" stroke-width="2.4" points="${line}"/>
    ${last >= 0 ? `<circle cx="${round1(x(last))}" cy="${round1(y(avg[last]))}" r="4" fill="var(--accent)"/><text x="${round1(Math.min(x(last), W - R - 4))}" y="${round1(Math.max(12, y(avg[last]) - 9))}" text-anchor="end" class="strong">${show(avg[last])}${unit}</text>` : ''}
    <text x="${L}" y="${H - 5}">${shortDate(dates[0])}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">${shortDate(dates[dates.length - 1])}</text></svg>`;
}

// One bar per week; `targets` draws a tick where the plan wanted that week to be.
export function weekBars(weeks, values, { unit = '', label = '', targets = null, digits = 0 } = {}){
  if (!values.some((v) => v > 0)) return '<p class="hint">Nothing recorded in this period.</p>';
  const W = 640, H = 170, L = 38, R = 10, T = 14, B = 22;
  const hi = Math.max(...values, ...(targets || []).filter((v) => v != null), 1) * 1.1;
  const slot = (W - L - R) / weeks.length, bw = Math.max(2, Math.min(26, slot * 0.7));
  const y = (v) => T + (hi - v) / hi * (H - T - B);
  const show = (v) => (digits ? v.toFixed(digits) : String(Math.round(v)));
  const ticks = [0.25, 0.5, 0.75].map((k) => hi * k);
  const i = values.length - 1;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} by week">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${round1(y(v))}" y2="${round1(y(v))}" stroke="var(--line)"/><text x="${L - 6}" y="${round1(y(v) + 4)}" text-anchor="end">${show(v)}</text>`).join('')}
    ${values.map((v, k) => `<rect x="${round1(L + k * slot + (slot - bw) / 2)}" y="${round1(y(v))}" width="${round1(bw)}" height="${round1(Math.max(0, H - B - y(v)))}" rx="2" fill="${k === i ? 'var(--accent)' : 'var(--muted)'}"><title>Week of ${shortDate(weeks[k])}: ${show(v)}${unit}</title></rect>`).join('')}
    ${(targets || []).map((v, k) => (v == null ? '' : `<line x1="${round1(L + k * slot + (slot - bw) / 2 - 2)}" x2="${round1(L + k * slot + (slot + bw) / 2 + 2)}" y1="${round1(y(v))}" y2="${round1(y(v))}" stroke="var(--warn)" stroke-width="2"/>`)).join('')}
    <text x="${round1(Math.min(L + i * slot + slot / 2, W - R - 24))}" y="${round1(Math.max(12, y(values[i]) - 6))}" text-anchor="middle" class="strong">${show(values[i])}${unit}</text>
    <text x="${L}" y="${H - 5}">${shortDate(weeks[0])}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">This week</text></svg>`;
}

// Everything the Progress tab's Garmin section needs for the last `span` days.
export async function loadTrends(span, planWeeks = []){
  const end = todayStr(), start = addDays(end, -(span - 1));
  const firstWeek = startOfWeek(start);
  const [sleep, days, acts, state] = await Promise.all([garmin.sleep(start, end), garmin.days(start, end), garmin.activities(firstWeek, end), garmin.state()]);
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.day, r]));
  const s = by(sleep), dd = by(days);
  const pick = (map, key, f = Number) => dates.map((d) => (map[d] && map[d][key] != null ? f(map[d][key]) : null));
  const weeks = [];
  for (let w = firstWeek; w <= end; w = addDays(w, 7)) weeks.push(w);
  const inWeek = (a) => startOfWeek(a.local_date);
  const sum = (rows, key) => weeks.map((w) => rows.filter((a) => inWeek(a) === w).reduce((t, a) => t + (Number(a[key]) || 0), 0));
  const latest = sleep.filter((n) => n.hrv_low != null).pop();
  return {
    state, dates, weeks, start, end,
    sleepH: pick(s, 'sleep_s', (v) => v / 3600), hrv: pick(s, 'hrv_last_night'), rhr: pick(dd, 'resting_hr'), steps: pick(dd, 'steps'),
    hrvBand: latest ? [latest.hrv_low, latest.hrv_high] : null,
    runMiles: sum(acts.filter(isRun), 'distance_m').map((m) => m / MILE),
    planMiles: weeks.map((w) => { const p = planWeeks.find((x) => x.start_date === w); return p && p.run_miles != null ? Number(p.run_miles) : null; }),
    load: sum(acts, 'training_load'),
    has: sleep.length + days.length + acts.length > 0
  };
}

export function trendsHtml(t, span){
  const spans = [[84, '12 weeks'], [182, '6 months'], [365, '1 year']];
  const seg = `<div class="seg sm">${spans.map(([n, l]) => `<a class="${span === n ? 'on' : ''}" href="#/health/progress/${n}">${l}</a>`).join('')}</div>`;
  const st = t.state;
  const head = `<section class="panel"><h2>Garmin <small>${st && st.last_ok_at ? `Last synced ${new Date(st.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'}</small></h2>
    ${seg}${st && !st.backfill_done && st.backfill_cursor ? `<p class="hint">Still loading your history: back to ${shortDate(st.backfill_cursor)} ${st.backfill_cursor.slice(0, 4)} so far.</p>` : ''}
    <div class="btns"><button class="btn sm" data-act="garminsync">Sync now</button></div></section>`;
  if (!t.has) return `${head}<section class="panel"><p class="hint">No Garmin data in this period yet.</p></section>`;
  const hm = (v) => hoursMins(v * 3600);
  const panel = (title, sub, body) => `<section class="panel"><h2>${title} <small>${sub}</small></h2>${body}</section>`;
  const daily = 'Dots are each day, the line is the 7-day average';
  return `${head}<div class="cols g"><div class="stack">
      ${panel('Sleep', daily, trendChart(t.dates, t.sleepH, { label: 'Sleep', fmt: hm, left: 58 }))}
      ${panel('Resting heart rate', daily, trendChart(t.dates, t.rhr, { label: 'Resting heart rate', unit: ' bpm' }))}
      ${panel('Steps', daily, trendChart(t.dates, t.steps, { label: 'Steps', fmt: (v) => Math.round(v).toLocaleString('en-GB'), left: 52 }))}
    </div><div class="stack">
      ${panel('Overnight HRV', t.hrvBand ? 'The shaded band is your balanced range' : daily, trendChart(t.dates, t.hrv, { label: 'Overnight HRV', unit: ' ms', band: t.hrvBand }))}
      ${panel('Running each week', t.planMiles.some((v) => v != null) ? 'Miles. The amber mark is what the plan asked for' : 'Miles', weekBars(t.weeks, t.runMiles, { label: 'Running distance', unit: ' mi', digits: 1, targets: t.planMiles }))}
      ${panel('Training load each week', 'All activities, as Garmin scores them', weekBars(t.weeks, t.load, { label: 'Training load' }))}
    </div></div>`;
}

// ---- Weekly commitments fed from Garmin (settings.data.garmin) ----
export const GARMIN_DEFAULTS = { sleep_on: false, sleep_hours: 7, sleep_nights: 7, steps_on: false, steps: 8500, steps_days: 7, km_on: false, km: 20 };
export const garminPrefs = (cfg) => ({ ...GARMIN_DEFAULTS, ...((cfg && cfg.garmin) || {}) });

// [source, title, target, done] for each commitment that is switched on.
export async function garminCommitments(prefs, weekStart, planKm = null){
  if (!prefs.sleep_on && !prefs.steps_on && !prefs.km_on) return [];
  const weekEnd = addDays(weekStart, 6);
  const [sleep, days, acts] = await Promise.all([
    prefs.sleep_on ? garmin.sleep(weekStart, weekEnd) : [], prefs.steps_on ? garmin.days(weekStart, weekEnd) : [], prefs.km_on ? garmin.activities(weekStart, weekEnd) : []
  ]);
  const rows = [];
  const whole = (n, max) => Math.max(1, Math.min(max, Math.round(Number(n) || 0)));
  if (prefs.sleep_on) rows.push(['garmin_sleep', `Nights of ${Number(prefs.sleep_hours)}+ hours sleep`, whole(prefs.sleep_nights, 7), sleep.filter((n) => Number(n.sleep_s) >= Number(prefs.sleep_hours) * 3600).length]);
  if (prefs.steps_on) rows.push(['garmin_steps', `Days of ${Number(prefs.steps).toLocaleString('en-GB')}+ steps`, whole(prefs.steps_days, 7), days.filter((d) => Number(d.steps) >= Number(prefs.steps)).length]);
  if (prefs.km_on) {
    const target = whole(planKm != null ? planKm : prefs.km, 1000);
    rows.push(['garmin_km', `Kilometres run${planKm != null ? ' (plan)' : ''}`, target, Math.round(acts.filter(isRun).reduce((t, a) => t + (Number(a.distance_m) || 0), 0) / 1000)]);
  }
  return rows;
}
