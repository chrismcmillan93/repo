// "Copy for Claude": the week's check-in as plain text to paste into a chat next to the progress pictures.
// Pure (rows in, string out) so it can be tested on its own; views/health.js gathers the rows.
// Anything missing is said to be missing rather than left out, so the reader knows it is not a zero.
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n) => Math.round(n * 10) / 10;
const short = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const isRun = (a) => /run/i.test(a.type_key || '');
const hm = (h) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

// One week of Garmin rows -> the few numbers worth quoting, or null when there is nothing.
export function garminWeek(acts = [], sleep = [], days = []){
  if (!acts.length && !sleep.length && !days.length) return null;
  const runs = acts.filter(isRun);
  const val = (rows, k, f = Number) => rows.filter((r) => r[k] != null).map((r) => f(r[k]));
  const sleepH = mean(val(sleep.filter((s) => Number(s.sleep_s) > 3 * 3600), 'sleep_s', (v) => Number(v) / 3600));
  const hrv = mean(val(sleep, 'hrv_last_night')), rhr = mean(val(days, 'resting_hr')), steps = mean(val(days.filter((d) => Number(d.steps) > 0), 'steps'));
  return {
    runs: runs.length, runKm: r1(runs.reduce((t, a) => t + (Number(a.distance_m) || 0), 0) / 1000), activities: acts.length,
    sleepH: sleepH == null ? null : r1(sleepH), hrv: hrv == null ? null : Math.round(hrv), rhr: rhr == null ? null : Math.round(rhr), steps: steps == null ? null : Math.round(steps)
  };
}

const tally = (logs, key) => {
  const c = { yes: 0, partial: 0, no: 0 };
  logs.forEach((l) => { if (c[l[key]] != null) c[l[key]] += 1; });
  return c;
};

// week: { number, phase, start, end, targetKg }; form: { weight, leaks, win, challenge } (what is in the form now);
// history: [{ week_number, weight_kg }]; logs: [{ nutrition_status, training_status }] for the week; garmin: garminWeek() or null;
// moods: [{ energy, mood }] for the week; pics: [{ taken_on, note }] (all, any order).
export function checkinText({ week, form = {}, history = [], logs = [], garmin = null, moods = [], pics = [], today }){
  const L = [];
  L.push(`Weekly check-in: week ${week.number}${week.phase ? ` (${week.phase})` : ''}, ${short(week.start)} to ${short(week.end)}`);
  L.push('');
  const w = form.weight === '' || form.weight == null ? null : Number(form.weight);
  if (w != null && !Number.isNaN(w)) {
    const gap = week.targetKg != null ? r1(w - Number(week.targetKg)) : null;
    L.push(`Weight (Monday): ${w} kg${week.targetKg != null ? `, plan target ${Number(week.targetKg).toFixed(1)} kg (${gap > 0 ? `${gap} kg over` : gap < 0 ? `${-gap} kg under` : 'on target'})` : ''}`);
  } else L.push('Weight (Monday): not recorded');
  const past = history.filter((h) => h.weight_kg != null && h.week_number !== week.number).sort((a, b) => a.week_number - b.week_number).slice(-4);
  if (past.length) L.push(`Earlier weeks: ${past.map((h) => `wk ${h.week_number} ${h.weight_kg} kg`).join(', ')}`);
  L.push(`Leaks this week: ${form.leaks === '' || form.leaks == null ? 'not recorded' : form.leaks}`);
  L.push(`One win: ${(form.win || '').trim() || 'not recorded'}`);
  L.push(`One thing that was hard: ${(form.challenge || '').trim() || 'not recorded'}`);
  L.push('');
  if (logs.length) {
    const f = tally(logs, 'nutrition_status'), t = tally(logs, 'training_status');
    const part = (c) => `${c.yes} yes, ${c.partial} partly, ${c.no} no, ${Math.max(0, 7 - c.yes - c.partial - c.no)} not logged`;
    L.push(`Food days: ${part(f)}`);
    L.push(`Training days: ${part(t)}`);
  } else L.push('Food and training days: nothing logged');
  if (garmin) {
    const bits = [];
    bits.push(`${garmin.runs} run${garmin.runs === 1 ? '' : 's'}${garmin.runs ? ` (${garmin.runKm} km)` : ''}`, `${garmin.activities} activit${garmin.activities === 1 ? 'y' : 'ies'} in all`);
    if (garmin.sleepH != null) bits.push(`sleep ${hm(garmin.sleepH)} a night`);
    if (garmin.hrv != null) bits.push(`overnight HRV ${garmin.hrv} ms`);
    if (garmin.rhr != null) bits.push(`resting HR ${garmin.rhr} bpm`);
    if (garmin.steps != null) bits.push(`${garmin.steps.toLocaleString('en-GB')} steps a day`);
    L.push(`Garmin: ${bits.join(', ')}`);
  } else L.push('Garmin: no data for this week');
  const e = mean(moods.filter((m) => m.energy != null).map((m) => Number(m.energy))), m = mean(moods.filter((x) => x.mood != null).map((x) => Number(x.mood)));
  if (e != null || m != null) L.push(`How I felt (1 to 5): ${[e != null ? `energy ${r1(e)}` : '', m != null ? `mood ${r1(m)}` : ''].filter(Boolean).join(', ')}`);
  L.push('');
  const taken = (pics || []).slice().sort((a, b) => (a.taken_on < b.taken_on ? 1 : -1)).slice(0, 3);
  L.push(taken.length ? `Progress pictures logged: ${taken.map((p) => `${short(p.taken_on)}${p.note ? ` (${p.note})` : ''}`).join(', ')}` : 'Progress pictures logged: none yet');
  L.push('');
  L.push("I'm attaching this week's progress pictures below. Please compare them with my earlier ones if you have them, give me honest, specific feedback on what has changed, and tell me the one or two things to adjust next week.");
  return L.join('\n');
}
