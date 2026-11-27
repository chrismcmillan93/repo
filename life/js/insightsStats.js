// The pure calculations behind Health > Progress's "Habits and sleep" and "Mood and sleep" panels
// (insights.js loads the rows and draws them). No Supabase, no DOM, so they can be tested on their own.
// Both describe a pattern and never claim a cause, and both stay quiet until there is enough data.
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const hours = (secs) => Math.round(10 * secs / 3600) / 10;

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
  return { medianH: hours(med), habits: out.sort((a, b) => b.diff - a.diff) };
}

// moods: [{ mood_date, energy, mood }] (1 to 5, either may be null); sleep: [{ day, sleep_s }] (the night that
// ended on `day`, so it sits before that day's tap). Needs 14+ tapped days that have sleep data and 6+ in each
// half (at or above the median night vs below) before it says anything.
export function moodLinks(moods, sleep){
  const sl = Object.fromEntries((sleep || []).filter((r) => r.sleep_s).map((r) => [r.day, Number(r.sleep_s)]));
  const rows = (moods || []).filter((m) => sl[m.mood_date] != null && (m.energy != null || m.mood != null));
  const all = (moods || []).filter((m) => m.energy != null || m.mood != null);
  const avg = (list, k) => { const v = list.filter((m) => m[k] != null).map((m) => Number(m[k])); return v.length ? Math.round(10 * mean(v)) / 10 : null; };
  const base = { taps: all.length, avgEnergy: avg(all, 'energy'), avgMood: avg(all, 'mood'), linked: null };
  if (rows.length < 14) return base;
  const med = median(rows.map((m) => sl[m.mood_date]));
  const good = rows.filter((m) => sl[m.mood_date] >= med), poor = rows.filter((m) => sl[m.mood_date] < med);
  if (good.length < 6 || poor.length < 6) return base;
  const pick = (k) => { const a = avg(good, k), b = avg(poor, k); return a != null && b != null ? { good: a, poor: b, diff: Math.round(10 * (a - b)) / 10 } : null; };
  return { ...base, linked: { medianH: hours(med), n: rows.length, energy: pick('energy'), mood: pick('mood') } };
}
