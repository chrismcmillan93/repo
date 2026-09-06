// UAT starts close to live (no real backend), but carries a couple of
// example goals so a requested change can actually be seen working rather
// than only tested via a blank form. Currently demonstrating: weekly/
// monthly horizons, the pass_fail measure type and its per-period check-in
// list, the "needs attention" flag, the suggested-pace line, and search
// (which needs at least one goal/update/review/review-goal note to find).

function iso(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
function daysFromNow(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); }

/** 1st of the month N months before the current month — i.e. a real period-start date, matching what setPeriodCheckIn() writes. */
function monthStart(monthsBack) {
  const now = new Date();
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - monthsBack;
  const y = Math.floor(total / 12), m = (total % 12 + 12) % 12;
  return iso(new Date(Date.UTC(y, m, 1)));
}

/** Last day of that same month. */
function monthEnd(monthsBack) {
  const now = new Date();
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - monthsBack;
  const y = Math.floor(total / 12), m = (total % 12 + 12) % 12;
  return iso(new Date(Date.UTC(y, m + 1, 0)));
}

const U = 'demo-user';

export function buildDemoData() {
  const life_areas = [
    { id: 'area-finance', user_id: U, name: 'Finance', colour: '#c08a3e', sort_order: 1, archived_at: null, created_at: daysAgo(200) },
    { id: 'area-health', user_id: U, name: 'Health & Fitness', colour: '#3f8f5e', sort_order: 2, archived_at: null, created_at: daysAgo(200) },
    { id: 'area-travel', user_id: U, name: 'Travel', colour: '#c2617a', sort_order: 3, archived_at: null, created_at: daysAgo(200) }
  ];

  // Wishlist — a backlog, not goals: idea/planned/booked/done + a rough
  // cost. Generic placeholder trips, not anyone's real plans.
  const wishlist_items = [
    { id: 'wl-1', user_id: U, area_id: 'area-travel', title: 'Long weekend in Prague', estimated_cost: 600, unit: '£', target_period: '2026', notes: '', status: 'idea', sort_order: 1, archived_at: null, created_at: daysAgo(60), updated_at: daysAgo(60) },
    { id: 'wl-2', user_id: U, area_id: 'area-travel', title: 'Two weeks in Portugal', estimated_cost: 2200, unit: '£', target_period: 'Summer 2027', notes: 'Coastal, not city — look at the Algarve.', status: 'planned', sort_order: 2, archived_at: null, created_at: daysAgo(45), updated_at: daysAgo(10) },
    { id: 'wl-3', user_id: U, area_id: 'area-travel', title: 'Christmas markets trip', estimated_cost: 450, unit: '£', target_period: 'Dec 2026', notes: '', status: 'booked', sort_order: 3, archived_at: null, created_at: daysAgo(30), updated_at: daysAgo(5) },
    { id: 'wl-4', user_id: U, area_id: 'area-travel', title: 'Weekend hiking trip', estimated_cost: 200, unit: '£', target_period: null, notes: '', status: 'done', sort_order: 4, archived_at: null, created_at: daysAgo(90), updated_at: daysAgo(20) }
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
    },
    {
      id: 'goal-house-deposit', user_id: U, area_id: 'area-finance',
      title: 'Save £3,000 towards a house deposit', description: 'Separate pot from the everyday emergency fund.',
      why: "Renting forever isn't the plan.",
      horizon: 'monthly', status: 'active', start_date: daysAgo(200), target_date: daysFromNow(150),
      measure_type: 'numeric', target_value: 3000, start_value: 0, unit: '£', direction: 'increase',
      priority: 1, created_at: daysAgo(200), updated_at: daysAgo(40), archived_at: null
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
    { id: 'gu-run-1', user_id: U, goal_id: 'goal-run-weekly', occurred_on: daysAgo(1), note: 'Two runs in so far this week.', value: 9, confidence: 4, created_at: daysAgo(1) },
    // House deposit — one update, well behind pace and quiet for a while,
    // so both "needs attention" and the suggested-pace line have something
    // real to demonstrate.
    { id: 'gu-house-1', user_id: U, goal_id: 'goal-house-deposit', occurred_on: daysAgo(40), note: 'Opened the separate savings pot and moved the first chunk in.', value: 400, confidence: 3, created_at: daysAgo(40) }
  ];

  const reviews = [
    {
      id: 'review-last-month', user_id: U, period_type: 'month',
      period_start: monthStart(1), period_end: monthEnd(1),
      status: 'complete',
      went_well: 'Got the savings habit back on track after the car insurance renewal knocked it off course.',
      didnt_go_well: 'Barely touched the house deposit pot — kept meaning to move money across and didn\'t.',
      learned: 'The months I move money the day I\'m paid are the months it actually happens.',
      focus_next: 'Set up a standing order for the deposit pot instead of relying on remembering.',
      overall_rating: 3, created_at: monthStart(0), completed_at: monthStart(0)
    }
  ];

  const review_goals = [
    { id: 'rg-sav-1', user_id: U, review_id: 'review-last-month', goal_id: 'goal-savings-monthly', rating: 4, commentary: 'Back on track after a wobble.', value_at_review: 1, percent_at_review: 0.75, decision: 'continue', created_at: monthStart(0) },
    { id: 'rg-house-1', user_id: U, review_id: 'review-last-month', goal_id: 'goal-house-deposit', rating: 2, commentary: 'Needs a standing order, not good intentions — keeps slipping.', value_at_review: 400, percent_at_review: 0.13, decision: 'adjust', created_at: monthStart(0) }
  ];

  // One example notebook page — generic placeholder content, illustrating
  // headings/bullets/nesting/bold and the "keep appending a dated update"
  // pattern, not real figures.
  const note_pages = [
    {
      id: 'note-finance-actions', user_id: U, area_id: 'area-finance',
      title: 'Money — general plan',
      content:
`# Pots
- Emergency fund — 4-6 months of bills
- Everyday spending pot
- Fun / holidays pot
  - Split further if a specific trip is booked
- Long-term investing pot

*Rule of thumb:* move money into pots the day I get paid, not whatever's left over at the end of the month.

## ${monthLabel(1)} update
- Increased the long-term pot contribution slightly
- Emergency fund is now fully topped up — redirecting that contribution elsewhere next month
- Need to actually open a separate account for the next big trip instead of leaving it mixed in with everyday spending`,
      created_at: monthStart(3), updated_at: monthStart(1), archived_at: null
    }
  ];

  return {
    life_areas, goals, milestones, goal_updates,
    // goal_progress is computed live by demoClient.js on every read (it's a
    // real Postgres VIEW there — this stand-in mirrors that), so no static
    // snapshot is seeded here.
    reviews, review_goals, note_pages, wishlist_items,
    __pending: []
  };
}

function monthLabel(monthsBack) {
  const d = new Date(monthStart(monthsBack) + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
