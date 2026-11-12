// Nutrition plan (Edale 50km, v4) and the weight-based scaling of it.
//
// The plan stores base meals exactly as written (fitness.nutrition_day_types).
// This module turns a date into that day's meals, scaled to your weight:
//
//   target kcal/day (average) = maintenance(weight) - deficit(date)
//   scale k = that target / the plan's planned average (2520 kcal)
//
// maintenance(weight) uses the plan's own method: Mifflin-St Jeor BMR (190.5 cm,
// age 33, +5) times an activity factor derived from the plan's own figures
// (maintenance 2930 kcal at the 99 kg reference weight). At 99 kg in a deficit
// phase k = 1 exactly, i.e. the plan as written. Deficit comes from the phase of
// the date (410 kcal in weeks 1-24 and 27, 0 in the USA weeks and the specific
// block) and is 0 on race days, per the plan's phase rules; with no deficit k is
// about 1.16, which is the plan's "add about 400 kcal a day".
//
// Only the carbohydrate staples (white rice, sweet potato, porridge oats) are
// scaled, in 5 g steps: protein foods are never reduced, so protein stays at or
// above the plan's 155 g floor. Saturday also scales with that week's long run:
// the plan is built for 9 mi and adds/removes 125 kcal per mile either side.
import { db } from './db.js';
import { state } from './state.js';
import { addDays, todayStr, isoDow, round1 } from './utils.js';

const ADJUST_KEY = 'fit-adjust-weight';
const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ADJUSTABLE = /white rice|sweet potato|porridge oats/i;
const LONG_RUN_REF_MILES = 9;
const KCAL_PER_MILE = 125;
const STEP_G = 5;
const MIN_FACTOR = 0.4;
const MAX_FACTOR = 1.9;

// "Adjust to my weight" is on unless switched off; per device.
export function adjustEnabled(){
  try { return localStorage.getItem(ADJUST_KEY) !== 'off'; } catch (_) { return true; }
}
export function setAdjustEnabled(on){
  try { localStorage.setItem(ADJUST_KEY, on ? 'on' : 'off'); } catch (_) { /* choice just won't persist */ }
}

// Loaded once per page: { plan, dayTypes: {key: row}, dayTypeList, phases } or null if none.
export async function loadNutrition(){
  if (state.nutrition !== undefined) return state.nutrition;
  try {
    const plan = await db.nutrition.getPlan('v4');
    if (!plan) { state.nutrition = null; return null; }
    const [dayTypeList, phases] = await Promise.all([db.nutrition.listDayTypes('v4'), db.nutrition.listPhases('v4')]);
    state.nutrition = { plan, dayTypes: Object.fromEntries(dayTypeList.map((d) => [d.key, d])), dayTypeList, phases };
  } catch (_) {
    state.nutrition = null;
  }
  return state.nutrition;
}

export function inNutritionPlan(nut, date){
  return !!nut && date >= nut.plan.start_date && date <= nut.plan.end_date;
}

export function dayTypeKey(nut, date){
  return nut.plan.week_map[DOW_NAMES[isoDow(date) - 1]];
}

// "170 g cooked" -> { qty: 170, unit: 'g', note: 'cooked' }; "4" -> { qty: 4, unit: 'whole' }.
export function parseAmount(amount){
  const m = String(amount).trim().match(/^([\d.]+)\s*(.*)$/);
  if (!m) return { qty: null, unit: 'whole', note: String(amount) };
  const qty = Number(m[1]);
  const um = m[2].match(/^(g|tsp|cup|serving|gels?)\b\s*(.*)$/i);
  return um ? { qty, unit: um[1].toLowerCase(), note: um[2] } : { qty, unit: 'whole', note: m[2] };
}

// The weight to scale to: the average of this week's weigh-ins (7 days up to the
// date, or up to today for a future date), else the most recent one in the last
// 14 days, else none (the plan's reference weight is used).
export async function effectiveWeight(userId, date){
  const end = date > todayStr() ? todayStr() : date;
  let logs = [];
  try { logs = await db.dailyLogs.listRange(userId, addDays(end, -13), end); } catch (_) { /* fall back to the reference */ }
  const w = logs.filter((l) => l.weight_kg != null && Number(l.weight_kg) >= 50 && Number(l.weight_kg) <= 200)
    .sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  if (!w.length) return { weight: null, source: 'plan reference weight' };
  const recent = w.filter((l) => l.log_date >= addDays(end, -6));
  if (recent.length) {
    const avg = recent.reduce((s, l) => s + Number(l.weight_kg), 0) / recent.length;
    return { weight: round1(avg), source: recent.length === 1 ? 'your latest weigh-in' : `average of ${recent.length} weigh-ins this week` };
  }
  return { weight: Number(w[0].weight_kg), source: `your last weigh-in (${w[0].log_date})` };
}

function bmr(plan, weight){
  return 10 * weight + 6.25 * Number(plan.height_cm) - 5 * Number(plan.age) + 5;
}

export function maintenanceKcal(plan, weight){
  const activity = Number(plan.maintenance_kcal) / bmr(plan, Number(plan.reference_weight_kg));
  return activity * bmr(plan, weight);
}

export function deficitFor(nut, date, isRaceDay){
  if (isRaceDay) return 0;
  const phase = nut.phases.find((p) => date >= p.from_date && date <= p.to_date);
  return phase ? Number(phase.deficit_kcal) : Number(nut.plan.planned_deficit_kcal);
}

const roundTo = (n, step) => Math.round(n / step) * step;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function scaledItem(it, ratio){
  return { ...it, kcal: Math.round(it.kcal * ratio), protein_g: round1(it.protein_g * ratio), fat_g: round1(it.fat_g * ratio), carbs_g: round1(it.carbs_g * ratio) };
}

function sumMeal(items){
  return {
    kcal: items.reduce((s, i) => s + i.kcal, 0),
    protein_g: round1(items.reduce((s, i) => s + i.protein_g, 0)),
    fat_g: round1(items.reduce((s, i) => s + i.fat_g, 0)),
    carbs_g: round1(items.reduce((s, i) => s + i.carbs_g, 0))
  };
}

// opts: { date, weight (kg or null), enabled, miles (long-run miles that day or null), isRaceDay, key (optional day-type override) }
export function buildDay(nut, opts){
  const { date, weight, enabled = true, miles = null, isRaceDay = false } = opts;
  const key = opts.key || dayTypeKey(nut, date);
  const dt = nut.dayTypes[key];
  const plan = nut.plan;
  const deficit = deficitFor(nut, date, isRaceDay);

  // Parse the base meals into items with numeric quantities.
  const base = dt.meals.map((m) => ({
    meal: m.meal, time: m.time,
    items: m.items.map((it) => {
      const a = parseAmount(it.amount);
      return { food: it.food, qty: a.qty, unit: a.unit, note: a.note, kcal: it.kcal, protein_g: it.protein_g, fat_g: it.fat_g, carbs_g: it.carbs_g, adjustable: ADJUSTABLE.test(it.food) };
    })
  }));
  const baseKcal = base.reduce((s, m) => s + m.items.reduce((t, i) => t + i.kcal, 0), 0);
  const stapleKcal = base.reduce((s, m) => s + m.items.filter((i) => i.adjustable).reduce((t, i) => t + i.kcal, 0), 0);

  let k = 1;
  let longRunDelta = 0;
  const usedWeight = weight == null ? Number(plan.reference_weight_kg) : weight;
  if (enabled) {
    const target = maintenanceKcal(plan, usedWeight) - deficit;
    k = target / Number(plan.planned_avg_kcal);
    if (key === 'long_run_day' && miles != null) longRunDelta = (miles - LONG_RUN_REF_MILES) * KCAL_PER_MILE;
  }
  const wantKcal = baseKcal * k + longRunDelta;
  const factor = enabled && stapleKcal > 0 ? clamp(1 + (wantKcal - baseKcal) / stapleKcal, MIN_FACTOR, MAX_FACTOR) : 1;

  const meals = base.map((m, mi) => {
    const items = m.items.map((it) => {
      if (!it.adjustable || factor === 1) return it;
      const qty = Math.max(STEP_G, roundTo(it.qty * factor, STEP_G));
      return { ...scaledItem(it, qty / it.qty), qty };
    });
    const foods = items.map((it) => ({
      name: it.note && !it.food.toLowerCase().includes(it.note.toLowerCase()) ? `${it.food} (${it.note})` : it.food,
      quantity: it.qty, unit: it.unit, is_swap_option: false,
      kcal: it.kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g
    }));
    // Dinner: chicken is the plan's swap for the mince (about 110 g chicken per 125 g mince).
    if (/^dinner/i.test(m.meal)) {
      const mince = items.find((i) => /beef mince/i.test(i.food));
      const chicken = base.flatMap((b) => b.items).find((i) => /chicken breast/i.test(i.food));
      if (mince && chicken) {
        const qty = Math.round(mince.qty * (110 / 125) / STEP_G) * STEP_G;
        const r = qty / chicken.qty;
        foods.push({ name: 'Chicken breast (skinless, boneless fillet), swap for the mince', quantity: qty, unit: 'g', is_swap_option: true,
          kcal: Math.round(chicken.kcal * r), protein_g: round1(chicken.protein_g * r), carbs_g: round1(chicken.carbs_g * r), fat_g: round1(chicken.fat_g * r) });
      }
    }
    const t = sumMeal(items);
    return { slot_order: mi + 1, time_label: m.time, name: m.meal, kcal: t.kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, foods };
  });
  const totals = {
    kcal: meals.reduce((s, m) => s + m.kcal, 0),
    protein_g: round1(meals.reduce((s, m) => s + m.protein_g, 0)),
    carbs_g: round1(meals.reduce((s, m) => s + m.carbs_g, 0)),
    fat_g: round1(meals.reduce((s, m) => s + m.fat_g, 0))
  };
  return { key, label: dt.label, appliesTo: dt.applies_to, meals, totals, baseKcal, k, factor, deficit, weight, usedWeight, miles, longRunDelta, enabled };
}

// The meal day type a training pick maps to: weights or both -> lift day,
// cardio -> run day (long run day when the session is named "Long run").
// null when nothing is picked (the plan's own day type applies).
export function pickDayKey(picks, names){
  if (!picks) return null;
  if (picks.weights) return 'lift_day';
  if (picks.cardio) return names && /^long run$/i.test(names.cardio || '') ? 'long_run_day' : 'run_day';
  return null;
}

export function dayTotalsLine(totals){
  return `${totals.kcal} kcal · ${round1(totals.protein_g)}g protein · ${round1(totals.carbs_g)}g carbs · ${round1(totals.fat_g)}g fat`;
}

// For a day-bundle: the long-run miles and race flag of the day's effective planned session.
export function sessionFacts(bundle){
  const pd = (bundle.sessions || []).map((s) => s.plan_day).find(Boolean);
  if (!pd) return { miles: null, isRaceDay: false };
  return { miles: pd.kind === 'long' && pd.distance_miles != null ? Number(pd.distance_miles) : null, isRaceDay: pd.type === 'race' };
}

// One-line explanation of what the day was scaled to.
export function describeScaling(day, weightInfo){
  if (!day.enabled) return 'Showing the plan exactly as written (weight adjustment is off).';
  const w = day.weight == null ? `the plan's ${day.usedWeight} kg reference weight (no weigh-in logged yet)` : `${day.weight} kg (${weightInfo.source})`;
  const pct = Math.round((day.k - 1) * 1000) / 10;
  const bits = [`Scaled to ${w}: ${pct > 0 ? '+' : ''}${pct}% on the plan`];
  if (day.deficit === 0) bits.push('no deficit today');
  if (day.longRunDelta) bits.push(`${day.miles} mi long run ${day.longRunDelta > 0 ? '+' : ''}${day.longRunDelta} kcal`);
  return `${bits.join(', ')}. Rice, sweet potato and oats move; protein stays put.`;
}
