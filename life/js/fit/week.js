// One week of the training plan with the food that goes with it: for each date
// the planned sessions (day swaps applied), any Weights / Cardio pick, what was
// ticked, and that day's meals scaled the same way the Day view scales them.
import { db } from './db.js';
import { loadNutrition, inNutritionPlan, buildDay, effectiveWeight, pickDayKey, adjustEnabled } from './nutrition.js';
import { addDays, dateRange } from './utils.js';
import { userId } from '../store.js';

let weeksCache = null;
export function planWeeks(){
  if (!weeksCache) weeksCache = db.planWeeks.list('v2').catch(() => []);
  return weeksCache;
}

export async function loadWeek(weekStart){
  const uid = userId();
  const weekEnd = addDays(weekStart, 6);
  const [planDays, checks, names, swaps, nut, weeks] = await Promise.all([
    db.planDays.listRange('v2', weekStart, weekEnd),
    db.dailyChecks.listRange(uid, weekStart, weekEnd),
    db.pickSessions.listRange(uid, weekStart, weekEnd),
    db.daySwaps.listRange(uid, weekStart, weekEnd).catch(() => []),
    loadNutrition(),
    planWeeks()
  ]);
  const weightInfo = nut ? await effectiveWeight(uid, weekEnd) : null;
  const source = Object.fromEntries(swaps.map((s) => [s.log_date, s.source_date]));
  const days = dateRange(weekStart, weekEnd).map((date) => {
    const on = (id) => checks.some((c) => c.log_date === date && c.item_id === id && c.is_checked);
    const plans = planDays.filter((p) => p.date === (source[date] || date));
    const picks = { weights: on('pick:weights'), cardio: on('pick:cardio') };
    const pickNames = Object.fromEntries(names.filter((n) => n.log_date === date).map((n) => [n.kind, n.session]));
    const key = pickDayKey(picks, pickNames);
    const long = plans.find((p) => p.kind === 'long' && p.distance_miles != null);
    const day = inNutritionPlan(nut, date)
      ? buildDay(nut, { date, weight: weightInfo.weight, enabled: adjustEnabled(), miles: long ? Number(long.distance_miles) : null, isRaceDay: plans.some((p) => p.type === 'race'), key: key || undefined })
      : null;
    const titles = picks.weights || picks.cardio
      ? ['weights', 'cardio'].filter((k) => picks[k]).map((k) => pickNames[k] || (k === 'weights' ? 'Weights session' : 'Cardio session'))
      : plans.map((p) => p.session);
    const mealTicks = checks.filter((c) => c.log_date === date && c.is_checked && c.item_id.startsWith('meal:')).length;
    return {
      date, plans, picks, titles, day,
      trained: checks.some((c) => c.log_date === date && c.is_checked && /^session:(?!rest)/.test(c.item_id)),
      rested: on('session:rest'),
      mealTicks
    };
  });
  return { weekStart, weekEnd, days, planWeek: weeks.find((w) => w.start_date === weekStart) || null, weeks };
}
