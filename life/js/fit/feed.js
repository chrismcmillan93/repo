// Feeds the Fitness app's own records into the Life app's weekly commitments and
// goals, so nothing has to be ticked twice:
//   - "Training sessions done"       planned (or picked) days vs days with a session ticked
//   - "Days with every meal eaten"   days where every meal of that day's type is ticked
//   - "Morning weigh-ins"            days with a weight logged
// Each is stored as one life.commitments row per week (source = fit_*), refreshed
// whenever Today or Week loads, so past weeks keep their final score.
import { db } from './db.js';
import { loadNutrition, inNutritionPlan } from './nutrition.js';
import { todayStr, addDays } from './utils.js';
import * as store from '../store.js';

export async function syncFit(weekStart, goalRows = []){
  const today = todayStr();
  if (weekStart > today) return;
  try {
    const uid = store.userId();
    const weekEnd = addDays(weekStart, 6);
    const [planDays, checks, logs, nut, existing] = await Promise.all([
      db.planDays.listRange('v2', weekStart, weekEnd),
      db.dailyChecks.listRange(uid, weekStart, weekEnd),
      db.dailyLogs.listRange(uid, weekStart, weekEnd),
      loadNutrition(),
      store.commitments.list((q) => q.eq('week_start', weekStart).not('source', 'is', null))
    ]);
    const on = checks.filter((c) => c.is_checked);
    const trained = new Set(on.filter((c) => /^session:(?!rest)/.test(c.item_id)).map((c) => c.log_date));
    const picked = new Set(on.filter((c) => c.item_id.startsWith('pick:')).map((c) => c.log_date));
    const planned = new Set(planDays.filter((d) => ['lift', 'run', 'race', 'hike_or_run'].includes(d.type) && !d.optional).map((d) => d.date));
    const trainTarget = new Set([...planned, ...picked, ...trained]).size;

    let mealDays = 0;
    const inPlan = inNutritionPlan(nut, weekStart) || inNutritionPlan(nut, weekEnd);
    if (inPlan) {
      const byDate = {};
      on.filter((c) => c.item_id.startsWith('meal:')).forEach((c) => {
        const key = c.item_id.split(':')[1];
        byDate[c.log_date] = byDate[c.log_date] || {};
        byDate[c.log_date][key] = (byDate[c.log_date][key] || 0) + 1;
      });
      mealDays = Object.values(byDate).filter((keys) => Object.entries(keys).some(([k, n]) => nut.dayTypes[k] && n >= nut.dayTypes[k].meals.length)).length;
    }
    const weighed = logs.filter((l) => l.weight_kg != null).length;

    const goalFor = (src) => (goalRows.find((g) => g.auto_source === src && g.status === 'active') || {}).id || null;
    const rows = [
      ['fit_training', 'Training sessions done', trainTarget, trained.size, goalFor('fitness_training')],
      ['fit_meals', 'Days with every meal eaten', inPlan ? 7 : 0, mealDays, goalFor('fitness_weight')],
      ['fit_weigh', 'Morning weigh-ins', 7, weighed, goalFor('fitness_weight')]
    ].filter((r) => r[2] > 0);
    await Promise.all(rows.map(([source, title, target, done, goalId]) => {
      const cur = existing.find((e) => e.source === source);
      if (!cur) return store.commitments.add({ week_start: weekStart, source, title, target_count: target, done_count: done, goal_id: goalId });
      if (cur.target_count !== target || cur.done_count !== done || cur.goal_id !== goalId) return store.commitments.set(cur.id, { target_count: target, done_count: done, goal_id: goalId });
      return null;
    }));

    // Weight goals follow the latest weigh-in.
    const latest = logs.filter((l) => l.weight_kg != null).sort((a, b) => (a.log_date < b.log_date ? 1 : -1))[0];
    if (latest) {
      await Promise.all(goalRows.filter((g) => g.auto_source === 'fitness_weight' && Number(g.current_value) !== Number(latest.weight_kg)).map((g) => {
        g.current_value = Number(latest.weight_kg);
        g.last_progress_on = today;
        return store.goals.set(g.id, { current_value: g.current_value, last_progress_on: today });
      }));
    }
    // Training goals count as moving whenever a session was done this week.
    if (trained.size) {
      await Promise.all(goalRows.filter((g) => g.auto_source === 'fitness_training' && g.last_progress_on !== today && trained.has(today)).map((g) => {
        g.last_progress_on = today;
        return store.goals.set(g.id, { last_progress_on: today });
      }));
    }
  } catch (err) {
    console.warn('Fitness feed unavailable:', err && err.message);
  }
}
