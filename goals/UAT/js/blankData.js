// UAT starts close to live (no real backend), but carries a couple of
// example goals so a requested change can actually be seen working rather
// than only tested via a blank form. Currently demonstrating: weekly/
// monthly horizons, and the pass_fail measure type ("save £400/month" —
// a plain yes/no per period instead of a running numeric total).

function iso(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }

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
      horizon: 'monthly', status: 'active', start_date: daysAgo(150), target_date: null,
      measure_type: 'pass_fail', target_value: 400, start_value: 0, unit: '£', direction: 'increase',
      priority: 1, created_at: daysAgo(150), updated_at: daysAgo(3), archived_at: null
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
    // Savings — a run of monthly yes/no entries: hit, hit, missed, hit.
    { id: 'gu-sav-1', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: daysAgo(120), note: 'Moved it the day I got paid — much easier.', value: 1, confidence: 4, created_at: daysAgo(120) },
    { id: 'gu-sav-2', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: daysAgo(90), note: '', value: 1, confidence: 4, created_at: daysAgo(90) },
    { id: 'gu-sav-3', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: daysAgo(60), note: 'Car insurance renewal ate this month\'s saving.', value: 0, confidence: 3, created_at: daysAgo(60) },
    { id: 'gu-sav-4', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: daysAgo(30), note: '', value: 1, confidence: 4, created_at: daysAgo(30) },
    { id: 'gu-sav-5', user_id: U, goal_id: 'goal-savings-monthly', occurred_on: daysAgo(3), note: 'Back on track.', value: 1, confidence: 5, created_at: daysAgo(3) },
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
