// Habits against sleep: for each habit, how often it gets done on days that follow a good night
// against days that follow a poor one. "Good" is at or above your own median over the period.
// Describes only (a pattern, not a cause), and stays quiet until there is enough to say anything:
// 14+ days of sleep data, and 6+ days in each half for a habit. `habitSleep` is pure.
import * as store from './store.js';
import { garmin } from './fit/garmin.js';
import { esc, empty } from './ui.js';
import { todayStr, addDays } from './fit/utils.js';

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// habits: [{ id, title, created_at }]; checks: [{ habit_id, check_date }]; sleep: [{ day, sleep_s }]
export function habitSleep(habits, checks, sleep, today){
  const rows = (sleep || []).filter((r) => r.sleep_s && r.day <= today);
  if (rows.length < 14) return null;
  const med = median(rows.map((r) => r.sleep_s));
  const done = new Set((checks || []).map((c) => `${c.habit_id}|${c.check_date}`));
  const out = [];
  (habits || []).forEach((h) => {
    const since = h.created_at ? h.created_at.slice(0, 10) : '0000-00-00';
    const mine = rows.filter((r) => r.day >= since);
    const good = mine.filter((r) => r.sleep_s >= med), poor = mine.filter((r) => r.sleep_s < med);
    if (good.length < 6 || poor.length < 6) return;
    const rate = (list) => Math.round(100 * list.filter((r) => done.has(`${h.id}|${r.day}`)).length / list.length);
    out.push({ title: h.title, afterGood: rate(good), afterPoor: rate(poor), n: mine.length, diff: rate(good) - rate(poor) });
  });
  return { medianH: Math.round(10 * med / 3600) / 10, habits: out.sort((a, b) => b.diff - a.diff) };
}

export async function habitSleepHtml(){
  const today = todayStr(), from = addDays(today, -180);
  const [habits, checks, sleep] = await Promise.all([store.habits.list((q) => q.eq('archived', false)), store.habitChecks.listSince(from), garmin.sleep(from, today)]);
  const r = habitSleep(habits, checks, sleep, today);
  if (!r) return '';
  const list = r.habits.length ? r.habits.map((h) => `<div class="row"><span class="rt"><span class="rtitle">${esc(h.title)}</span>
      <span class="rmeta">${h.afterGood}% done after a good night, ${h.afterPoor}% after a poor one${Math.abs(h.diff) >= 15 ? (h.diff > 0 ? ' · sleep matters here' : ' · better after poor sleep, oddly') : ''}</span></span></div>`).join('')
    : empty('Not enough days yet. Each habit needs about two weeks alongside Garmin sleep.');
  return `<section class="panel"><h2>Habits and sleep <small>Good night means at least ${r.medianH}h, your median</small></h2>${list}
    <p class="hint">A pattern, not a cause. If a habit collapses after poor sleep, protect the sleep.</p></section>`;
}
