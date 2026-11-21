// The weekly verdict: blunt, specific, and about the next decision. Pure functions (no
// network) so the grading can be tested on its own. Only weekly and daily commitments
// count (monthly ones stay open all month, see lib.js keptPct).
export const GRADES = [[90, 'A'], [75, 'B'], [60, 'C'], [40, 'D'], [0, 'F']];
export const gradeFor = (pct) => (GRADES.find(([min]) => pct >= min) || [0, 'F'])[1];

const LINE = {
  A: 'Clean week. Do not coast.',
  B: 'Solid, not good enough. Find the one gap and close it.',
  C: 'Average. You know exactly what you skipped.',
  D: 'Weak week. You can do better than this and you know it.',
  F: 'You did not do what you said you would. Fix next week\'s plan now, not on Monday.'
};
const FIX = {
  daily: 'Make it the first thing you do each day, before anything else.',
  weekly: 'Put it on specific days before the week starts.'
};

// commits: the week's commitments; goals: [{ title, pct, exp, quiet, state }] (state from
// lib.goalState); prevPct: last week's kept %, or null when there was none.
export function weekVerdict({ commits, tasksDone = 0, closedDays = 0, misses = 0, goals = [], prevPct = null, away = false }){
  const weekly = commits.filter((c) => c.cadence !== 'monthly' && c.target_count > 0);
  if (away) return { kind: 'away', headline: 'Away. Not graded.', line: 'Nothing counts against you this week.', tasksDone, closedDays, misses };
  if (!weekly.length) return { kind: 'none', headline: 'Ungraded', line: 'You committed to nothing, so there is nothing to grade. That is the problem. Set commitments before the week starts.', tasksDone, closedDays, misses };
  const target = weekly.reduce((n, c) => n + c.target_count, 0);
  const done = weekly.reduce((n, c) => n + Math.min(c.done_count, c.target_count), 0);
  const pct = Math.round(100 * done / target);
  const grade = gradeFor(pct);
  // The commitment furthest from done: lowest share kept, then the biggest gap.
  const open = weekly.filter((c) => c.done_count < c.target_count)
    .map((c) => ({ c, share: c.done_count / c.target_count, gap: c.target_count - c.done_count }))
    .sort((a, b) => a.share - b.share || b.gap - a.gap);
  const weakest = open.length ? { title: open[0].c.title, done: open[0].c.done_count, target: open[0].c.target_count, cadence: open[0].c.cadence } : null;
  const fix = weakest ? `${weakest.title}: ${weakest.done} of ${weakest.target}. ${FIX[weakest.cadence] || FIX.weekly}` : 'Nothing left undone. Raise the bar next week.';
  // The goal losing the most ground: stalled first (longest quiet), then furthest behind pace.
  const stalled = goals.filter((g) => g.state === 'stalled').sort((a, b) => b.quiet - a.quiet)[0];
  const behind = goals.filter((g) => g.state === 'behind' && g.exp != null).sort((a, b) => (b.exp - b.pct) - (a.exp - a.pct))[0];
  const g = stalled || behind || null;
  const losing = g ? (g.state === 'stalled' ? `${g.title}: no progress in ${g.quiet} days.` : `${g.title}: ${g.pct}% done, ${g.exp}% expected by now.`) : null;
  const delta = prevPct == null ? null : pct - prevPct;
  const trend = delta == null ? 'No last week to compare with.' : delta >= 5 ? `Up ${delta} points on last week.` : delta <= -5 ? `Down ${-delta} points on last week.` : 'Level with last week.';
  return { kind: 'graded', pct, grade, headline: `${grade}: ${pct}% of what you committed to`, line: LINE[grade], fix, losing, trend, delta, weakest, tasksDone, closedDays, misses, done, target };
}
