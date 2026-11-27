// Readiness: one verdict for today (push / normal / easy) from your own Garmin numbers, compared
// with your own last 28 days. Garmin's Personal API gives no training readiness, so this is ours.
// Pure functions only (no Supabase, no DOM), so it can be tested on its own.
//
// Inputs, all `fitness.garmin_*` rows already read by fit/garmin.js:
//   sleep: [{ day, sleep_s, hrv_last_night }]   (the night that ended on `day`)
//   days:  [{ day, resting_hr, avg_stress }]
// Each metric becomes a z-score against the 28 days before `date` (sign flipped where higher is
// worse), the available ones are averaged, and that average gives the score and the verdict. A
// metric needs 7+ baseline days to count, and the verdict needs 2+ metrics, otherwise it says
// nothing rather than guessing.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs, m) => Math.sqrt(xs.reduce((t, x) => t + (x - m) * (x - m), 0) / xs.length);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Floors on the spread so a very steady baseline doesn't turn a tiny wobble into a big z-score.
const MIN_SD = { sleep: 0.5, hrv: 4, rhr: 2, stress: 4 };

// One metric: today's value against the baseline values. `good` is +1 when higher is better.
function factor(key, label, value, base, good, fmt){
  if (value == null || base.length < 7) return null;
  const m = mean(base), s = Math.max(sd(base, m), MIN_SD[key]);
  const z = Math.max(-2.5, Math.min(2.5, good * (value - m) / s));
  return { key, label, z, value, baseline: m, text: fmt(value, m) };
}

const hm = (h) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

export function readiness(date, sleep, days){
  const from = addDays(date, -28);
  const inBase = (r) => r.day >= from && r.day < date;
  const night = (sleep || []).find((r) => r.day === date);
  const yest = (days || []).find((r) => r.day === addDays(date, -1));
  const today = (days || []).find((r) => r.day === date);
  const sBase = (sleep || []).filter(inBase), dBase = (days || []).filter(inBase);
  const col = (rows, k, f = Number) => rows.filter((r) => r[k] != null).map((r) => f(r[k]));
  const factors = [
    night && night.sleep_s ? factor('sleep', 'Sleep', night.sleep_s / 3600, col(sBase, 'sleep_s', (v) => v / 3600), 1, (v, m) => `${hm(v)} against ${hm(m)} usual`) : null,
    night ? factor('hrv', 'HRV', night.hrv_last_night != null ? Number(night.hrv_last_night) : null, col(sBase, 'hrv_last_night'), 1, (v, m) => `${Math.round(v)} ms against ${Math.round(m)} usual`) : null,
    today ? factor('rhr', 'Resting heart rate', today.resting_hr != null ? Number(today.resting_hr) : null, col(dBase, 'resting_hr'), -1, (v, m) => `${Math.round(v)} bpm against ${Math.round(m)} usual`) : null,
    yest ? factor('stress', "Yesterday's stress", yest.avg_stress != null ? Number(yest.avg_stress) : null, col(dBase.filter((r) => r.day < addDays(date, -1)), 'avg_stress'), -1, (v, m) => `${Math.round(v)} against ${Math.round(m)} usual`) : null
  ].filter(Boolean);
  if (factors.length < 2) return null;
  const z = mean(factors.map((f) => f.z));
  const score = Math.round(Math.max(0, Math.min(100, 50 + 25 * z)));
  const verdict = z >= 0.5 ? 'push' : z <= -0.75 ? 'easy' : 'normal';
  const worst = factors.slice().sort((a, b) => a.z - b.z)[0], best = factors.slice().sort((a, b) => b.z - a.z)[0];
  return { score, verdict, z, factors, worst: worst.z < -0.5 ? worst : null, best: best.z > 0.5 ? best : null };
}

// Sessions that are hard enough to be worth reconsidering on a red day. The bundle's
// `sessions` are { session_type, plan_day: { optional, effort, ... } } (see fit/day.js).
export function isHardSession(s){
  if (!s || (s.plan_day && s.plan_day.optional)) return false;
  return ['lift', 'run', 'race', 'hike_or_run'].includes(s.session_type);
}

// The one sentence under the verdict: what to do about today's planned session.
export function readinessAdvice(r, sessions){
  if (!r) return '';
  const list = sessions || [];
  const hard = list.some(isHardSession);
  const none = !list.length || list.every((s) => s.session_type === 'rest');
  if (r.verdict === 'easy') return hard ? 'Your body is asking for less. Take today\'s session easy, or use "Swap with another day" below and do it when you are fresher.' : 'Your numbers are down. Keep today light and protect tonight\'s sleep.';
  if (r.verdict === 'push') return hard ? 'You are well recovered. Today is a good day to hit the session properly.' : none ? 'You are well recovered. A rest day is fine, or add something easy if you fancy it.' : 'You are well recovered. Make the most of it.';
  return hard ? 'Nothing unusual. Do the session as planned.' : 'Nothing unusual. Carry on as planned.';
}
