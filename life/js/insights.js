// Progress-screen insight panels. The calculations are in insightsStats.js / readiness.js (pure, tested);
// this file loads the rows and draws them. Habits against sleep: for each habit, how often it gets done on days that follow a good night
// against days that follow a poor one. "Good" is at or above your own median over the period.
// Describes only (a pattern, not a cause), and stays quiet until there is enough to say anything:
// 14+ days of sleep data, and 6+ days in each half for a habit. `habitSleep` is pure.
import * as store from './store.js';
import { garmin } from './fit/garmin.js';
import { esc, empty } from './ui.js';
import { todayStr, addDays } from './fit/utils.js';
import { floorDate } from './start.js';
import { habitSleep, moodLinks } from './insightsStats.js';
import { readinessHistory } from './readiness.js';
import { trendChart } from './fit/garmin.js';

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

// Mood and energy against sleep, from the one-tap check-in on Today.
export async function moodSleepHtml(){
  const today = todayStr(), from = addDays(today, -180);
  const [moods, sleep] = await Promise.all([store.moods.list((q) => q.gte('mood_date', floorDate(from)).order('mood_date')), garmin.sleep(from, today)]);
  const r = moodLinks(moods, sleep);
  if (!r.taps) return '';
  const line = (label, x) => (x ? `<div class="row"><span class="rt"><span class="rtitle">${label}</span><span class="rmeta">${x.good} after a good night, ${x.poor} after a poor one${Math.abs(x.diff) >= 0.5 ? (x.diff > 0 ? ' · sleep shows' : ' · better after poor sleep, oddly') : ''}</span></span></div>` : '');
  const body = r.linked ? line('Energy (1 to 5)', r.linked.energy) + line('Mood (1 to 5)', r.linked.mood)
    : empty(`${r.taps} check-in${r.taps === 1 ? '' : 's'} so far${r.avgEnergy != null ? `, energy averaging ${r.avgEnergy}` : ''}${r.avgMood != null ? `, mood ${r.avgMood}` : ''}. The sleep comparison needs about two weeks of taps.`);
  return `<section class="panel"><h2>Mood and sleep <small>${r.linked ? `Good night means at least ${r.linked.medianH}h, your median` : 'Your daily check-in'}</small></h2>${body}
    <p class="hint">A pattern, not a cause. Tap how you feel on Today, once a day.</p></section>`;
}

// Readiness over time: the score each day (computed from Garmin, nothing stored), and how often you
// trained on the days it said Easy. Garmin is never floored, so it covers the whole span as soon as there is a 28-day baseline.
export async function readinessHistoryHtml(span = 84){
  const end = todayStr(), start = addDays(end, -(span - 1));
  const [sleep, days, acts] = await Promise.all([garmin.sleep(addDays(start, -28), end), garmin.days(addDays(start, -28), end), garmin.activities(start, end)]);
  const dates = []; for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  const h = readinessHistory(dates, sleep, days, acts);
  if (h.scored < 7) return '';
  const c = h.counts, t = h.trainedOn;
  const sentence = c.easy ? `Of ${c.easy} Easy day${c.easy === 1 ? '' : 's'}, you trained on ${t.easy}. Of ${c.push} Push day${c.push === 1 ? '' : 's'}, you trained on ${t.push}.` : `No Easy days in this period. You trained on ${t.push} of ${c.push} Push days.`;
  return `<section class="panel"><h2>Readiness history <small>Dots are each day, the line is the 7-day average</small></h2>
    ${trendChart(h.dates, h.scores, { label: 'Readiness', left: 40 })}
    <div class="stats"><div><b class="big">${c.push}</b><span>Push days</span></div><div><b class="big">${c.normal}</b><span>Normal</span></div><div><b class="big">${c.easy}</b><span>Easy days</span></div></div>
    <p>${sentence}</p>
    <p class="hint">Our own score (see Today), each day against the 28 days before it. If you keep training hard on Easy days and then feel flat, that is the pattern to break.</p></section>`;
}
