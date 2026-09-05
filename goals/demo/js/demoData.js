// Realistic sample dataset for DEMO_MODE (see config.js). Covers every
// measure_type, an overdue goal, a quiet goal, a completed goal, several
// months of updates for the momentum grid/sparklines, and one completed
// review plus one pending period — so every screen has something to show.

const DEMO_USER_ID = 'demo-user';

function iso(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
function daysFromNow(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function monthsAgo(n) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); d.setUTCDate(15); return iso(d); }

function shiftMonth(y, m, delta) {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12 + 12) % 12 + 1 };
}
function monthBounds(y, m) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}
function quarterBounds(y, q) {
  const startMonth = (q - 1) * 3 + 1, endMonth = startMonth + 2;
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return { start: `${y}-${String(startMonth).padStart(2, '0')}-01`, end: `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

const now = new Date();
const Y = now.getUTCFullYear(), M = now.getUTCMonth() + 1;
const lastMonth = shiftMonth(Y, M, -1);
const twoMonthsAgo = shiftMonth(Y, M, -2);
const lastMonthBounds = monthBounds(lastMonth.y, lastMonth.m);
const twoMonthsAgoBounds = monthBounds(twoMonthsAgo.y, twoMonthsAgo.m);
const thisQuarter = Math.floor((M - 1) / 3) + 1;
const lastQuarter = thisQuarter === 1 ? { y: Y - 1, q: 4 } : { y: Y, q: thisQuarter - 1 };
const lastQuarterBounds = quarterBounds(lastQuarter.y, lastQuarter.q);

export function buildDemoData() {
  const u = DEMO_USER_ID;

  const life_areas = [
    { id: 'area-health', user_id: u, name: 'Health & Fitness', colour: '#3f8f5e', sort_order: 1, archived_at: null, created_at: daysAgo(300) },
    { id: 'area-career', user_id: u, name: 'Career', colour: '#8a6fbf', sort_order: 2, archived_at: null, created_at: daysAgo(300) },
    { id: 'area-finance', user_id: u, name: 'Finance', colour: '#c08a3e', sort_order: 3, archived_at: null, created_at: daysAgo(300) },
    { id: 'area-relationships', user_id: u, name: 'Relationships', colour: '#c2617a', sort_order: 4, archived_at: null, created_at: daysAgo(300) },
    { id: 'area-creative', user_id: u, name: 'Creative & Side Projects', colour: '#4f9aa8', sort_order: 5, archived_at: null, created_at: daysAgo(300) }
  ];

  const goals = [
    { id: 'goal-10k', user_id: u, area_id: 'area-health', title: 'Run a sub-45 10k', description: 'Tuesday intervals, Sunday long run.', why: 'Feel strong and fit again, not just "not unfit".', horizon: 'annual', status: 'active', start_date: daysAgo(140), target_date: daysFromNow(45), measure_type: 'numeric', target_value: 45, start_value: 58, unit: 'min', direction: 'decrease', priority: 1, created_at: daysAgo(140), updated_at: daysAgo(2), archived_at: null },
    { id: 'goal-migration', user_id: u, area_id: 'area-career', title: 'Ship the Q3 platform migration', description: 'Move the legacy service off the old cluster.', why: "It's blocking three other teams.", horizon: 'quarterly', status: 'active', start_date: daysAgo(95), target_date: daysAgo(6), measure_type: 'milestone', target_value: null, start_value: 0, unit: null, direction: 'increase', priority: 1, created_at: daysAgo(95), updated_at: daysAgo(25), archived_at: null },
    { id: 'goal-senior', user_id: u, area_id: 'area-career', title: 'Grow into a senior-level role', description: '', why: 'Long game — not a this-quarter thing.', horizon: 'long_term', status: 'active', start_date: daysAgo(200), target_date: null, measure_type: 'narrative', target_value: null, start_value: 0, unit: null, direction: 'increase', priority: 3, created_at: daysAgo(200), updated_at: daysAgo(15), archived_at: null },
    { id: 'goal-emergency-fund', user_id: u, area_id: 'area-finance', title: 'Build a £5,000 emergency fund', description: '', why: 'Stop money stress being the loudest voice in the room.', horizon: 'annual', status: 'active', start_date: daysAgo(150), target_date: daysFromNow(60), measure_type: 'numeric', target_value: 5000, start_value: 800, unit: '£', direction: 'increase', priority: 2, created_at: daysAgo(150), updated_at: daysAgo(8), archived_at: null },
    { id: 'goal-weekend-away', user_id: u, area_id: 'area-relationships', title: 'Plan a proper long weekend away', description: '', why: "We keep saying we will and don't.", horizon: 'quarterly', status: 'active', start_date: daysAgo(50), target_date: daysFromNow(20), measure_type: 'milestone', target_value: null, start_value: 0, unit: null, direction: 'increase', priority: 2, created_at: daysAgo(50), updated_at: daysAgo(5), archived_at: null },
    { id: 'goal-podcast', user_id: u, area_id: 'area-creative', title: 'Launch the side-project podcast', description: '', why: 'Finish something just for the making of it.', horizon: 'quarterly', status: 'achieved', start_date: daysAgo(180), target_date: daysAgo(30), measure_type: 'milestone', target_value: null, start_value: 0, unit: null, direction: 'increase', priority: 4, created_at: daysAgo(180), updated_at: daysAgo(30), archived_at: null }
  ];

  const milestones = [
    { id: 'ms-mig-1', user_id: u, goal_id: 'goal-migration', title: 'Design doc signed off', due_date: null, completed_on: daysAgo(80), sort_order: 1, created_at: daysAgo(95) },
    { id: 'ms-mig-2', user_id: u, goal_id: 'goal-migration', title: 'Data migrated to staging', due_date: null, completed_on: daysAgo(40), sort_order: 2, created_at: daysAgo(95) },
    { id: 'ms-mig-3', user_id: u, goal_id: 'goal-migration', title: 'Production cutover', due_date: daysFromNow(10), completed_on: null, sort_order: 3, created_at: daysAgo(95) },
    { id: 'ms-mig-4', user_id: u, goal_id: 'goal-migration', title: 'Decommission old cluster', due_date: null, completed_on: null, sort_order: 4, created_at: daysAgo(95) },
    { id: 'ms-wknd-1', user_id: u, goal_id: 'goal-weekend-away', title: 'Agree a date with everyone', due_date: null, completed_on: daysAgo(10), sort_order: 1, created_at: daysAgo(50) },
    { id: 'ms-wknd-2', user_id: u, goal_id: 'goal-weekend-away', title: 'Book somewhere', due_date: daysFromNow(15), completed_on: null, sort_order: 2, created_at: daysAgo(50) },
    { id: 'ms-pod-1', user_id: u, goal_id: 'goal-podcast', title: 'Record episode 1', due_date: null, completed_on: daysAgo(60), sort_order: 1, created_at: daysAgo(180) },
    { id: 'ms-pod-2', user_id: u, goal_id: 'goal-podcast', title: 'Publish to feed', due_date: null, completed_on: daysAgo(30), sort_order: 2, created_at: daysAgo(180) }
  ];

  const goal_updates = [
    // 10k — steady updates most months, trending down toward target, confidence climbing
    { id: 'gu1', user_id: u, goal_id: 'goal-10k', occurred_on: monthsAgo(4), note: 'Back into a routine after a slow start.', value: 57, confidence: 3, created_at: monthsAgo(4) },
    { id: 'gu2', user_id: u, goal_id: 'goal-10k', occurred_on: monthsAgo(3), note: 'First tempo run without stopping.', value: 54, confidence: 3, created_at: monthsAgo(3) },
    { id: 'gu3', user_id: u, goal_id: 'goal-10k', occurred_on: monthsAgo(2), note: 'Parkrun PB.', value: 51, confidence: 4, created_at: monthsAgo(2) },
    { id: 'gu4', user_id: u, goal_id: 'goal-10k', occurred_on: daysAgo(20), note: 'Felt strong on the long run.', value: 49, confidence: 4, created_at: daysAgo(20) },
    { id: 'gu5', user_id: u, goal_id: 'goal-10k', occurred_on: daysAgo(2), note: 'Sub-49. Getting close.', value: 47, confidence: 5, created_at: daysAgo(2) },
    // migration — busy early, then went quiet (shows in momentum grid + confidence dip)
    { id: 'gu6', user_id: u, goal_id: 'goal-migration', occurred_on: monthsAgo(3), note: 'Design doc approved after two rounds of review.', value: null, confidence: 4, created_at: monthsAgo(3) },
    { id: 'gu7', user_id: u, goal_id: 'goal-migration', occurred_on: monthsAgo(2), note: 'Staging migration done, found data quality issues.', value: null, confidence: 3, created_at: monthsAgo(2) },
    { id: 'gu8', user_id: u, goal_id: 'goal-migration', occurred_on: daysAgo(25), note: 'Cutover slipped — waiting on the infra team.', value: null, confidence: 2, created_at: daysAgo(25) },
    // senior role — occasional narrative notes, no numbers
    { id: 'gu9', user_id: u, goal_id: 'goal-senior', occurred_on: monthsAgo(2), note: 'Led the incident review well — good feedback from my manager.', value: null, confidence: 4, created_at: monthsAgo(2) },
    { id: 'gu10', user_id: u, goal_id: 'goal-senior', occurred_on: daysAgo(15), note: 'Started mentoring the new starter.', value: null, confidence: 4, created_at: daysAgo(15) },
    // emergency fund — behind pace
    { id: 'gu11', user_id: u, goal_id: 'goal-emergency-fund', occurred_on: monthsAgo(3), note: '', value: 1400, confidence: 3, created_at: monthsAgo(3) },
    { id: 'gu12', user_id: u, goal_id: 'goal-emergency-fund', occurred_on: monthsAgo(1), note: 'Car repair ate into this month\'s saving.', value: 1900, confidence: 2, created_at: monthsAgo(1) },
    { id: 'gu13', user_id: u, goal_id: 'goal-emergency-fund', occurred_on: daysAgo(8), note: '', value: 2200, confidence: 3, created_at: daysAgo(8) },
    // weekend away — on pace
    { id: 'gu14', user_id: u, goal_id: 'goal-weekend-away', occurred_on: daysAgo(10), note: 'Everyone agreed the last weekend of the month.', value: null, confidence: 4, created_at: daysAgo(10) }
  ];

  const goal_progress = [
    progressRow(goals[0], milestones, goal_updates),
    progressRow(goals[1], milestones, goal_updates),
    progressRow(goals[2], milestones, goal_updates),
    progressRow(goals[3], milestones, goal_updates),
    progressRow(goals[4], milestones, goal_updates),
    progressRow(goals[5], milestones, goal_updates)
  ];

  const reviews = [
    {
      id: 'review-two-months-ago', user_id: u, period_type: 'month',
      period_start: twoMonthsAgoBounds.start, period_end: twoMonthsAgoBounds.end, status: 'complete',
      went_well: 'The 10k training finally clicked — three good weeks in a row.',
      didnt_go_well: 'Migration cutover slipped again; I kept saying yes to other work instead of protecting time for it.',
      learned: 'I do better with a hard weekly deadline than an open-ended "sometime this quarter".',
      focus_next: 'Block a half-day a week for the migration until cutover is done.',
      overall_rating: 4, created_at: twoMonthsAgoBounds.end, completed_at: twoMonthsAgoBounds.end
    },
    {
      id: 'review-last-quarter', user_id: u, period_type: 'quarter',
      period_start: lastQuarterBounds.start, period_end: lastQuarterBounds.end, status: 'complete',
      went_well: 'Good quarter for health, mixed for career.',
      didnt_go_well: 'The migration ran long.',
      learned: 'Quarterly goals need a mid-quarter checkpoint, not just a review at the end.',
      focus_next: 'Fewer things in flight at once.',
      overall_rating: 3, created_at: lastQuarterBounds.end, completed_at: lastQuarterBounds.end
    }
  ];

  const review_goals = [
    { id: 'rg1', user_id: u, review_id: 'review-two-months-ago', goal_id: 'goal-10k', rating: 4, commentary: 'Genuinely ahead of where I expected.', value_at_review: 51, percent_at_review: 0.54, decision: 'continue', created_at: twoMonthsAgoBounds.end },
    { id: 'rg2', user_id: u, review_id: 'review-two-months-ago', goal_id: 'goal-migration', rating: 2, commentary: 'Slipping — needs protected time, not just good intentions.', value_at_review: 0, percent_at_review: 0.5, decision: 'adjust', created_at: twoMonthsAgoBounds.end },
    { id: 'rg3', user_id: u, review_id: 'review-last-quarter', goal_id: 'goal-podcast', rating: 5, commentary: 'Finished! First thing I\'ve actually shipped in a while.', value_at_review: 0, percent_at_review: 1, decision: 'complete', created_at: lastQuarterBounds.end }
  ];

  return {
    life_areas, goals, milestones, goal_updates, goal_progress, reviews, review_goals,
    __pending: [
      { period_type: 'month', period_start: lastMonthBounds.start, period_end: lastMonthBounds.end, updates_logged: goal_updates.filter((u2) => u2.occurred_on >= lastMonthBounds.start && u2.occurred_on <= lastMonthBounds.end).length }
    ]
  };
}

function progressRow(goal, milestones, goal_updates) {
  const ms = milestones.filter((m) => m.goal_id === goal.id);
  const ups = goal_updates.filter((u) => u.goal_id === goal.id).sort((a, b) => a.occurred_on < b.occurred_on ? -1 : 1);
  const latest = ups[ups.length - 1];
  const currentValue = goal.measure_type === 'numeric' ? (latest && latest.value !== null ? latest.value : goal.start_value) : (goal.start_value || 0);

  let percentComplete = null;
  if (goal.measure_type === 'numeric' && goal.target_value !== null && goal.target_value !== goal.start_value) {
    percentComplete = clamp01((currentValue - goal.start_value) / (goal.target_value - goal.start_value));
  } else if (goal.measure_type === 'milestone' && ms.length) {
    percentComplete = ms.filter((m) => m.completed_on).length / ms.length;
  }

  let percentElapsed = null;
  if (goal.target_date && goal.target_date !== goal.start_date) {
    const today = new Date();
    const start = new Date(goal.start_date), end = new Date(goal.target_date);
    percentElapsed = clamp01((today - start) / (end - start));
  }

  return {
    id: goal.id, user_id: goal.user_id, area_id: goal.area_id, title: goal.title, status: goal.status,
    horizon: goal.horizon, priority: goal.priority, measure_type: goal.measure_type,
    start_date: goal.start_date, target_date: goal.target_date, unit: goal.unit,
    start_value: goal.start_value, target_value: goal.target_value, direction: goal.direction,
    current_value: currentValue,
    last_update_on: latest ? latest.occurred_on : null,
    latest_confidence: latest ? latest.confidence : null,
    update_count: ups.length,
    milestone_count: ms.length,
    milestones_done: ms.filter((m) => m.completed_on).length,
    percent_complete: percentComplete,
    percent_elapsed: percentElapsed,
    days_remaining: goal.target_date ? daysBetween(todayISO(), goal.target_date) : null,
    days_since_update: latest ? daysBetween(latest.occurred_on, todayISO()) : null
  };
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function todayISO() { return iso(new Date()); }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
