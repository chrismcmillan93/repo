// Edale 50km extras: the countdown, and run miles this week against the plan (from Garmin).
import { floorDate } from './start.js';
import { db } from './fit/db.js';
import { planWeeks } from './fit/week.js';
import { supabase as fitSb } from './fit/supabaseClient.js';
import { userId } from './store.js';
import { addDays } from './fit/utils.js';

const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

// { name, date, days, weeks, extra, planWeek, total, startsIn } or null once the race has passed / no plan.
export async function raceCountdown(today){
  try {
    const [plan, weeks] = await Promise.all([db.trainingPlans.get('v2'), planWeeks()]);
    if (!plan || !weeks.length) return null;
    const days = diff(today, plan.end_date);
    if (days < 0) return null;
    const wk = weeks.find((w) => today >= w.start_date && today <= w.end_date);
    return { name: plan.name || 'The race', date: plan.end_date, days, weeks: Math.floor(days / 7), extra: days % 7, planWeek: wk ? wk.week_number : null, total: weeks.length, startsIn: today < weeks[0].start_date ? diff(today, weeks[0].start_date) : 0 };
  } catch (_) { return null; }
}

export function countdownText(c){
  const w = `${c.weeks} week${c.weeks === 1 ? '' : 's'}`, d = c.extra ? `, ${c.extra} day${c.extra === 1 ? '' : 's'}` : '';
  if (c.days === 0) return `${c.name} is today. Run it.`;
  return `${c.name}: ${w}${d} to go. ${c.startsIn ? `The plan starts in ${c.startsIn} day${c.startsIn === 1 ? '' : 's'}. Be ready.` : c.planWeek ? `Plan week ${c.planWeek} of ${c.total}. Every session counts.` : 'Every session counts.'}`;
}

// Miles run in the week starting `ws`, from Garmin; null if Garmin isn't there.
export async function weekRunMiles(ws){
  try {
    const { data, error } = await fitSb.from('garmin_activities').select('type_key,local_date,distance_m').eq('user_id', userId()).gte('local_date', floorDate(ws)).lte('local_date', addDays(ws, 6));
    if (error) return null;
    const runs = (data || []).filter((a) => /run/i.test(a.type_key || ''));
    return { miles: Math.round(10 * runs.reduce((s, a) => s + Number(a.distance_m || 0), 0) / 1609.344) / 10, n: runs.length };
  } catch (_) { return null; }
}
