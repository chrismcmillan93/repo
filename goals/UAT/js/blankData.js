// UAT starts close to live (no real backend), but carries a couple of
// example goals so a requested change can actually be seen working rather
// than only tested via a blank form. Currently demonstrating: weekly/
// monthly horizons, the pass_fail measure type ("save £400/month" — a
// plain yes/no per period instead of a running numeric total), and its
// per-period check-in list.

function iso(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }

/** 1st of the month N months before the current month — i.e. a real period-start date, matching what setPeriodCheckIn() writes. */
function monthStart(monthsBack) {
  const now = new Date();
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - monthsBack;
  const y = Math.floor(total / 12), m = (total % 12 + 12) % 12;
  return iso(new Date(Date.UTC(y, m, 1)));
}

const U = 'demo-user';

export function buildDemoData() {
  const life_areas = [
    { id: 'area-finance', user_id: U, name: 'Finance', colour: '#c08a3e', sort_order: 1, archived_at: null, created_at: daysAgo(200) },
    { id: 'area-health', user_id: U, name: 'Health & Fitness', colour: '#3f8f5e', sort_order: 2, archived_at: null, created_at: daysAgo(200) }
  ];

  const goals = [
    {
      id: 'goal-savings-monthly', user_id: U, area_id: 'area-finance',
      title: 'Save £400 per month', description: '', why: 'Build the saving habit into something automatic, not a New Year resolution.',
      horizon: 'monthly', status: 'active', start_date: monthStart(5), target_date: null,
      measure_type: 'pass_fail', target_value: 400, start_value: 0, unit: '£', direction: 'increase',
      priority: 1, created_at: monthStart(5), updated_at: monthStart(1), archived_at: null
    },
    {
      id: 'goal-run-weekly', user_id: U, area_id: 'area-health',
      title: 'Run 15km this week', description: '', why: 'Little and often beats one big push before a race.',
      horizon: 'weekly', status: 'active', start_date: daysAgo(28), target_date: null,
      measure_type: 'numeric', target_value: 15, start_value: 0, unit: 'km', direction: 'increase',
      priority: 2, created_at: daysAgo(28), updated_at: daysAgo(1), archived_at: null
    }
  ];

  const milestones = [];

  const goal_updates = [
    // Savings check-ins, dated at each month's period-start (as
    // setPeriodCheckIn() itself would write) — this month is deliberately
    // left unlogged so the check-in list's "not checked in yet" state has
    // something real to show too.
    { id: 'gu-sav-1', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: monthStart(4), note: 'Moved it the day I got paid — much easier.', value: 1, confidence: 4, created_at: monthStart(4) },
    { id: 'gu-sav-2', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: monthStart(3), note: '', value: 1, confidence: 4, created_at: monthStart(3) },
    { id: 'gu-sav-3', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: monthStart(2), note: 'Car insurance renewal ate this month\'s saving.', value: 0, confidence: 3, created_at: monthStart(2) },
    { id: 'gu-sav-4', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: monthStart(1), note: 'Back on track.', value: 1, confidence: 5, created_at: monthStart(1) },
    // Weekly running goal — reset each week, so only this week's total matters.
    { id: 'gu-run-1', user_id: U, goal_id: 'goal-run-weekly', occurred_on: daysAgo(1), note: 'Two runs in so far this week.', value: 9, confidence: 4, created_at: daysAgo(1) }
  ];

  return {
    life_areas, goals, milestones, goal_updates,
    // goal_progress is computed live by demoClient.js on every read (it's a
    // real Postgres VIEW there — this stand-in mirrors that), so no static
    // snapshot is seeded here.
    reviews: [],
    review_goals: [],
    __pending: []
  };
}
