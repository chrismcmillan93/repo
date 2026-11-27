// Wrapped: the year in numbers, from Garmin and Hevy only. Pure (no Supabase, no DOM) so it can be
// tested on its own. views/wrapped.js loads the rows and draws the cards.
//
// Input rows are the same shapes fit/garmin.js and fit/db.js read:
//   acts:  garmin_activities  { type_key, name, local_date, distance_m, duration_s, elevation_gain_m, avg_speed_mps }
//   days:  garmin_days        { day, steps, resting_hr }
//   sleep: garmin_sleep       { day, sleep_s, hrv_last_night }
//   sets:  hevy_sets          { exercise_title, set_type, weight_kg, reps }
//   workouts: hevy_workouts   { hevy_id, start_time }
// Every function drops rows outside `year`, and a card is only produced when there is something to
// say, so a thin year gives a short Wrapped rather than a page of zeros.

const MILE = 1609.344;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOWS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isRun = (a) => /run/.test(a.type_key || '');
const num = (v) => (v == null ? 0 : Number(v) || 0);
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const day = (iso) => new Date(iso + 'T12:00:00Z');
const nextDay = (iso) => { const d = day(iso); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const short = (iso) => day(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hm = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const top = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;

// Longest run of consecutive dates in a sorted unique list.
export function longestStreak(dates){
  let best = 0, cur = 0, prev = null;
  dates.forEach((d) => { cur = prev && nextDay(prev) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; });
  return best;
}

export function wrappedStats({ acts = [], days = [], sleep = [], sets = [], workouts = [], year }){
  const y = String(year);
  const A = acts.filter((a) => (a.local_date || '').startsWith(y));
  const D = days.filter((d) => (d.day || '').startsWith(y));
  const S = sleep.filter((s) => (s.day || '').startsWith(y) && num(s.sleep_s) > 3 * 3600);
  const W = workouts.filter((w) => (w.start_time || '').startsWith(y));
  const workIds = new Set(W.map((w) => w.hevy_id));

  const out = { year, cards: [] };
  const card = (c) => out.cards.push(c);

  // ---- Movement ----
  if (A.length) {
    const activeDates = [...new Set(A.map((a) => a.local_date))].sort();
    const hours = A.reduce((t, a) => t + num(a.duration_s), 0) / 3600;
    const km = A.reduce((t, a) => t + num(a.distance_m), 0) / 1000;
    const elev = A.reduce((t, a) => t + num(a.elevation_gain_m), 0);
    const byMonth = Array(12).fill(0), byDow = Array(7).fill(0), byType = {};
    A.forEach((a) => { byMonth[Number(a.local_date.slice(5, 7)) - 1] += 1; byDow[day(a.local_date).getUTCDay()] += 1; byType[a.type_key || 'other'] = (byType[a.type_key || 'other'] || 0) + 1; });
    const bm = byMonth.indexOf(Math.max(...byMonth)), bd = byDow.indexOf(Math.max(...byDow));
    out.movement = { count: A.length, hours: r1(hours), km: r1(km), elevation: Math.round(elev), activeDays: activeDates.length, streak: longestStreak(activeDates), busiestMonth: MONTHS[bm], busiestDow: DOWS[bd], monthCounts: byMonth };
    card({ id: 'move', kicker: 'You moved', big: fmt(A.length), unit: A.length === 1 ? 'activity' : 'activities', line: `${fmt(hours)} hours on the move across ${fmt(activeDates.length)} different days.` });
    if (elev >= 100) card({ id: 'climb', kicker: 'You climbed', big: fmt(elev), unit: 'metres', line: `That is about ${r1(elev / 8849)} times up Everest, give or take a rest day.` });
    card({ id: 'rhythm', kicker: 'Your rhythm', big: MONTHS[bm], unit: 'was your busiest month', line: `${byMonth[bm]} activities. ${DOWS[bd]}s were your day, and your longest unbroken streak was ${out.movement.streak} day${out.movement.streak === 1 ? '' : 's'}.` });
  }

  // ---- Running ----
  const R = A.filter(isRun);
  if (R.length) {
    const m = R.reduce((t, a) => t + num(a.distance_m), 0);
    const longest = R.slice().sort((a, b) => num(b.distance_m) - num(a.distance_m))[0];
    const fast = R.filter((a) => num(a.distance_m) >= 5000 && num(a.avg_speed_mps) > 0).sort((a, b) => num(b.avg_speed_mps) - num(a.avg_speed_mps))[0];
    out.running = { runs: R.length, miles: r1(m / MILE), km: r1(m / 1000), longestKm: r1(num(longest.distance_m) / 1000), longestOn: longest.local_date };
    card({ id: 'runs', kicker: 'You ran', big: r1(m / MILE).toLocaleString('en-GB'), unit: 'miles', line: `${r1(m / 1000)} km over ${R.length} run${R.length === 1 ? '' : 's'}.` });
    card({ id: 'long', kicker: 'Your longest run', big: r1(num(longest.distance_m) / MILE).toLocaleString('en-GB'), unit: 'miles', line: `${r1(num(longest.distance_m) / 1000)} km on ${short(longest.local_date)}${longest.name ? `: ${longest.name}` : ''}.${fast ? ` Your quickest run of 5 km or more was on ${short(fast.local_date)}.` : ''}` });
  }

  // ---- Strength (Hevy) ----
  const lifts = sets.filter((s) => s.set_type !== 'warmup' && num(s.weight_kg) > 0 && num(s.reps) > 0 && (!workIds.size || workIds.has(s.hevy_workout_id)) && (!s.performed_at || s.performed_at.startsWith(y)));
  if (W.length || lifts.length) {
    const vol = lifts.reduce((t, s) => t + num(s.weight_kg) * num(s.reps), 0);
    const heaviest = lifts.slice().sort((a, b) => num(b.weight_kg) - num(a.weight_kg))[0];
    const perEx = {};
    lifts.forEach((s) => { perEx[s.exercise_title] = (perEx[s.exercise_title] || 0) + 1; });
    const fav = top(perEx);
    out.strength = { workouts: W.length, sets: lifts.length, tonnes: r1(vol / 1000), heaviestKg: heaviest ? num(heaviest.weight_kg) : null, heaviestOn: heaviest ? heaviest.exercise_title : null, favourite: fav ? fav[0] : null };
    if (W.length) card({ id: 'lift', kicker: 'You lifted', big: fmt(W.length), unit: W.length === 1 ? 'session' : 'sessions', line: `${fmt(lifts.length)} working sets${fav ? `, and ${fav[0]} was the one you could not leave alone (${fav[1]} sets).` : '.'}` });
    if (vol >= 1000) card({ id: 'tonnes', kicker: 'You shifted', big: r1(vol / 1000).toLocaleString('en-GB'), unit: 'tonnes of weight', line: `${heaviest ? `Heaviest set: ${num(heaviest.weight_kg)} kg on ${heaviest.exercise_title}. ` : ''}Every rep adds up.` });
  }

  // ---- Sleep ----
  if (S.length >= 14) {
    const avg = S.reduce((t, s) => t + num(s.sleep_s), 0) / S.length;
    const best = S.slice().sort((a, b) => num(b.sleep_s) - num(a.sleep_s))[0];
    const good = S.filter((s) => num(s.sleep_s) >= 7 * 3600).map((s) => s.day).sort();
    const hrv = S.filter((s) => s.hrv_last_night != null);
    out.sleep = { nights: S.length, avgS: Math.round(avg), bestS: num(best.sleep_s), bestOn: best.day, goodStreak: longestStreak(good), goodNights: good.length, hrv: hrv.length ? Math.round(hrv.reduce((t, s) => t + num(s.hrv_last_night), 0) / hrv.length) : null };
    card({ id: 'sleep', kicker: 'You slept', big: hm(avg), unit: 'a night, on average', line: `Across ${fmt(S.length)} nights. ${good.length ? `${fmt(good.length)} of them were 7 hours or more` : 'None hit 7 hours'}, with ${out.sleep.goodStreak} in a row at best.` });
    card({ id: 'bestnight', kicker: 'Your best night', big: hm(num(best.sleep_s)), unit: `on ${short(best.day)}`, line: out.sleep.hrv != null ? `Your overnight HRV averaged ${out.sleep.hrv} ms across the year.` : 'Make more of those.' });
  }

  // ---- Steps and resting heart rate ----
  const withSteps = D.filter((d) => num(d.steps) > 0);
  if (withSteps.length >= 14) {
    const total = withSteps.reduce((t, d) => t + num(d.steps), 0);
    const best = withSteps.slice().sort((a, b) => num(b.steps) - num(a.steps))[0];
    out.steps = { total, avg: Math.round(total / withSteps.length), best: num(best.steps), bestOn: best.day };
    card({ id: 'steps', kicker: 'You walked', big: fmt(total), unit: 'steps', line: `About ${fmt(total * 0.75 / 1000)} km at a normal stride. Your biggest day was ${fmt(num(best.steps))} on ${short(best.day)}.` });
  }
  const rhr = D.filter((d) => d.resting_hr != null).sort((a, b) => (a.day < b.day ? -1 : 1));
  if (rhr.length >= 60) {
    const mean = (rows) => rows.reduce((t, d) => t + num(d.resting_hr), 0) / rows.length;
    const first = mean(rhr.slice(0, 30)), last = mean(rhr.slice(-30));
    out.rhr = { first: Math.round(first), last: Math.round(last) };
    const drop = Math.round(first - last);
    card({ id: 'rhr', kicker: 'Your resting heart rate', big: `${Math.round(last)}`, unit: 'bpm lately', line: drop >= 2 ? `Down from ${Math.round(first)} at the start of the year. That is fitness.` : drop <= -2 ? `Up from ${Math.round(first)} at the start of the year. Worth watching.` : `Steady against ${Math.round(first)} at the start of the year.` });
  }

  return out;
}

// One anonymous line for the opt-in Giving up card: the longest current run across live quits.
// Never names what it is. `currentDays` are the day counts from streaks.js streakInfo().
export function quitCard(currentDays){
  const ds = (currentDays || []).filter((n) => n > 0);
  if (!ds.length) return null;
  const n = Math.max(...ds);
  return { id: 'quit', kicker: 'Something you gave up', big: fmt(n), unit: n === 1 ? 'day and counting' : 'days and counting', line: 'No name, just the count. You know what it is.' };
}
