// Pure number-crunching for the Lifting tab — no DOM, no network, so it
// can be tested on its own with fixture sets.
//
// Conventions (see fitness/CLAUDE.md, "Lifting tab"):
// - Weights are exactly what Hevy stores. Dumbbell lifts are logged as the
//   TOTAL of both dumbbells, so 100 kg = the gym's 2 x 50 kg maximum.
// - Warm-up sets never count. Neither do sets with no weight or no reps.
// - Estimated 1RM uses Epley, and only from sets of 1-12 reps — beyond
//   that the estimate is too loose to call a PR on.

export const DUMBBELL_MAX_TOTAL_KG = 100;
const E1RM_MAX_REPS = 12;

export function isWorkingSet(s){
  return s.set_type !== 'warmup' && Number(s.weight_kg) > 0 && Number(s.reps) > 0;
}

export function e1rm(weight, reps){
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r > 0) || r > E1RM_MAX_REPS) return null;
  return r === 1 ? w : w * (1 + r / 30);
}

export function round1(n){ return Math.round(n * 10) / 10; }

// Monday of the ISO week containing `iso` (a timestamp), as YYYY-MM-DD in
// local time — same Monday-start week the rest of this app uses.
export function weekStart(iso){
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return localDate(d);
}

export function localDate(d){
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDumbbell(exercise){
  const eq = (exercise.equipment || '').toLowerCase();
  return eq === 'dumbbell' || /\(dumbbell\)/i.test(exercise.title || '');
}

// Group sets into exercises, and each exercise into sessions (one per
// workout). Returns exercises keyed by template id.
export function buildExercises(sets, templatesById = {}){
  const byEx = new Map();
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    let ex = byEx.get(s.exercise_template_id);
    if (!ex) {
      const tpl = templatesById[s.exercise_template_id] || {};
      ex = {
        id: s.exercise_template_id,
        title: s.exercise_title || tpl.title || 'Exercise',
        muscle: tpl.primary_muscle_group || null,
        secondary: tpl.secondary_muscle_groups || [],
        equipment: tpl.equipment || null,
        sessions: new Map()
      };
      ex.dumbbell = isDumbbell(ex);
      byEx.set(ex.id, ex);
    }
    let sess = ex.sessions.get(s.hevy_workout_id);
    if (!sess) {
      sess = { workoutId: s.hevy_workout_id, at: s.performed_at, sets: [], bestE1rm: null, top: null, volume: 0 };
      ex.sessions.set(s.hevy_workout_id, sess);
    }
    const w = Number(s.weight_kg), r = Number(s.reps);
    sess.sets.push({ weight: w, reps: r });
    sess.volume += w * r;
    const est = e1rm(w, r);
    if (est !== null && (sess.bestE1rm === null || est > sess.bestE1rm)) sess.bestE1rm = est;
    if (!sess.top || w > sess.top.weight || (w === sess.top.weight && r > sess.top.reps)) sess.top = { weight: w, reps: r };
  }
  for (const ex of byEx.values()) {
    ex.sessions = Array.from(ex.sessions.values()).sort((a, b) => a.at.localeCompare(b.at));
  }
  return byEx;
}

// Walk each exercise's sessions in order; a session whose best e1RM beats
// every earlier session is a PR. The very first session of an exercise is
// a baseline, not a PR.
export function findPrs(exercises){
  const prs = [];
  for (const ex of exercises.values()) {
    let best = null;
    for (const sess of ex.sessions) {
      if (sess.bestE1rm === null) continue;
      if (best !== null && sess.bestE1rm > best + 0.05) {
        // The set that produced it.
        const set = sess.sets.reduce((acc, st) => {
          const v = e1rm(st.weight, st.reps);
          return v !== null && (!acc || v > acc.v) ? { ...st, v } : acc;
        }, null);
        prs.push({
          exerciseId: ex.id, title: ex.title, dumbbell: ex.dumbbell,
          at: sess.at, weight: set.weight, reps: set.reps,
          e1rm: sess.bestE1rm, previous: best
        });
      }
      if (best === null || sess.bestE1rm > best) best = sess.bestE1rm;
    }
  }
  return prs.sort((a, b) => b.at.localeCompare(a.at));
}

// Summary row per exercise for the "Your lifts" list.
export function exerciseSummaries(exercises, nowIso = new Date().toISOString()){
  const now = new Date(nowIso).getTime();
  const twelveWeeks = now - 84 * 864e5;
  const fourWeeks = now - 28 * 864e5;
  const rows = [];
  for (const ex of exercises.values()) {
    const recent = ex.sessions.filter((s) => new Date(s.at).getTime() >= twelveWeeks);
    if (!recent.length) continue;
    const allBest = Math.max(...ex.sessions.map((s) => s.bestE1rm ?? -1));
    const last = ex.sessions[ex.sessions.length - 1];
    const before = ex.sessions.filter((s) => new Date(s.at).getTime() < fourWeeks && s.bestE1rm !== null);
    const lastFour = ex.sessions.filter((s) => new Date(s.at).getTime() >= fourWeeks && s.bestE1rm !== null);
    const prevBest = before.length ? Math.max(...before.map((s) => s.bestE1rm)) : null;
    const nowBest = lastFour.length ? Math.max(...lastFour.map((s) => s.bestE1rm)) : null;
    rows.push({
      id: ex.id, title: ex.title, muscle: ex.muscle, dumbbell: ex.dumbbell,
      sessions12w: recent.length,
      lastAt: last.at, lastTop: last.top,
      bestE1rm: allBest > 0 ? allBest : null,
      change4w: prevBest !== null && nowBest !== null ? nowBest - prevBest : null,
      trend: ex.sessions.slice(-12).map((s) => s.bestE1rm)
    });
  }
  return rows.sort((a, b) => b.sessions12w - a.sessions12w || b.lastAt.localeCompare(a.lastAt));
}

// Hard sets per muscle group per week, over the last `weeks` weeks.
// Primary muscle = 1 set, each secondary muscle = 0.5.
export function weeklyMuscleSets(exercises, weeks = 8, nowIso = new Date().toISOString()){
  const thisWeek = weekStart(nowIso);
  const weekKeys = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeek + 'T00:00:00');
    d.setDate(d.getDate() - i * 7);
    weekKeys.push(localDate(d));
  }
  const table = new Map(); // muscle -> { weekKey -> sets }
  const add = (muscle, wk, n) => {
    if (!muscle) return;
    const key = muscle.replace(/_/g, ' ');
    if (!table.has(key)) table.set(key, Object.fromEntries(weekKeys.map((k) => [k, 0])));
    const row = table.get(key);
    if (wk in row) row[wk] += n;
  };
  for (const ex of exercises.values()) {
    for (const sess of ex.sessions) {
      const wk = weekStart(sess.at);
      add(ex.muscle, wk, sess.sets.length);
      for (const m of ex.secondary || []) add(m, wk, sess.sets.length * 0.5);
    }
  }
  const rows = Array.from(table.entries()).map(([muscle, byWeek]) => {
    const values = weekKeys.map((k) => byWeek[k]);
    const current = values[values.length - 1];
    const prior = values.slice(-5, -1);
    const avg4 = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
    return { muscle, values, current, avg4 };
  }).filter((r) => r.values.some((v) => v > 0));
  rows.sort((a, b) => b.avg4 + b.current - (a.avg4 + a.current));
  return { weekKeys, rows };
}

// Dumbbell lifts already at the rack's limit. Flags them when any of the
// last 6 weeks' sessions hit 100 kg total, and reports reps at that weight
// so it's clear whether the next step is more reps or a different variation.
export function maxedDumbbellLifts(exercises, nowIso = new Date().toISOString()){
  const cutoff = new Date(nowIso).getTime() - 42 * 864e5;
  const out = [];
  for (const ex of exercises.values()) {
    if (!ex.dumbbell) continue;
    const atMax = ex.sessions
      .filter((s) => new Date(s.at).getTime() >= cutoff)
      .map((s) => ({ at: s.at, reps: Math.max(0, ...s.sets.filter((st) => st.weight >= DUMBBELL_MAX_TOTAL_KG).map((st) => st.reps)) }))
      .filter((s) => s.reps > 0);
    if (!atMax.length) continue;
    const reps = atMax.map((s) => s.reps);
    const latest = reps[reps.length - 1];
    let advice;
    if (latest >= 12) advice = 'Reps are high at the max. Switch to a barbell or machine version to keep adding load, or slow the lowering to 3–4 seconds.';
    else if (latest >= 8) advice = 'Push reps towards 12, then add a pause at the stretch or a 3-second lowering.';
    else advice = 'Build reps at 2 × 50 kg before changing anything.';
    out.push({ id: ex.id, title: ex.title, sessionsAtMax: atMax.length, repsHistory: reps, latestReps: latest, advice });
  }
  return out;
}

// One calendar month's numbers, for the summary post.
export function monthSummary(exercises, workouts, prs, year, monthIndex){
  const inMonth = (iso) => { const d = new Date(iso); return d.getFullYear() === year && d.getMonth() === monthIndex; };
  const monthWorkouts = workouts.filter((w) => inMonth(w.start_time));
  let volume = 0, sets = 0;
  const liftGains = [];
  for (const ex of exercises.values()) {
    const ms = ex.sessions.filter((s) => inMonth(s.at));
    for (const s of ms) { volume += s.volume; sets += s.sets.length; }
    const withE = ms.filter((s) => s.bestE1rm !== null);
    if (withE.length) {
      const best = Math.max(...withE.map((s) => s.bestE1rm));
      const before = ex.sessions.filter((s) => new Date(s.at) < new Date(year, monthIndex, 1) && s.bestE1rm !== null);
      const prev = before.length ? Math.max(...before.map((s) => s.bestE1rm)) : null;
      liftGains.push({ title: ex.title, dumbbell: ex.dumbbell, best, prev, sessions: ms.length });
    }
  }
  liftGains.sort((a, b) => b.sessions - a.sessions || b.best - a.best);
  const monthPrs = prs.filter((p) => inMonth(p.at));
  // Sessions per week of the month.
  const perWeek = new Map();
  for (const w of monthWorkouts) {
    const wk = weekStart(w.start_time);
    perWeek.set(wk, (perWeek.get(wk) || 0) + 1);
  }
  return {
    year, monthIndex,
    sessions: monthWorkouts.length,
    volumeKg: volume,
    sets,
    prs: monthPrs,
    topLifts: liftGains.slice(0, 5),
    perWeek: Array.from(perWeek.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  };
}

export function weightLabel(weight, reps, dumbbell){
  const w = Number.isInteger(weight) ? weight : round1(weight);
  return `${w} kg${dumbbell ? ' total' : ''} × ${reps}`;
}
