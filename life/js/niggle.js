// Niggles: aches and tweaks while training for the Edale 50km, with blunt advice on when
// to stop pretending. Pure functions (no network). Not medical advice: it only says when
// a niggle has lasted or worsened enough that it's time to get it looked at.
export const AREAS = ['Knee', 'Ankle', 'Achilles', 'Calf', 'Shin', 'Hamstring', 'Quad', 'Hip', 'Glute', 'Lower back', 'Foot', 'Shoulder', 'Other'];
export const SEVERITY = [[1, 'Barely there'], [2, 'A niggle'], [3, 'Noticeable'], [4, 'Limiting'], [5, "Can't run"]];

const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

// level: 'stop' (do not train through it), 'book' (get it looked at now), 'watch', or null.
export function niggleAdvice(n, today){
  const days = diff(n.started_on, today), sev = Number(n.severity);
  if (sev >= 4) return { days, level: 'stop', text: `${n.area}: limiting (${sev} of 5). Do not train through it. See a physio.` };
  if (sev === 3 && days >= 3) return { days, level: 'book', text: `${n.area}: noticeable for ${days} days. Book a physio now, not after the race.` };
  if (sev >= 2 && days >= 7) return { days, level: 'book', text: `${n.area}: still there after ${days} days. Get it looked at before it costs you a month.` };
  if (sev === 1 && days >= 14) return { days, level: 'watch', text: `${n.area}: still there after ${days} days. Keep an eye on it.` };
  return { days, level: null, text: '' };
}

// The ones worth interrupting Today for: not resolved, and at 'stop' or 'book'.
export function niggleNudges(list, today){
  return list.filter((n) => !n.resolved_on).map((n) => niggleAdvice(n, today)).filter((a) => a.level === 'stop' || a.level === 'book').map((a) => a.text);
}
