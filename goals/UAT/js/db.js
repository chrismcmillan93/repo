// Data access layer for the `goals` schema. Every function here matches the
// live schema exactly (columns/enums/constraints verified against the
// project directly — see build-log notes, not just the spec doc).
//
// Every insert stamps user_id explicitly: RLS's with_check clauses require
// user_id = auth.uid(), and PostgREST does not fill that in for you.

import { supabase as realSupabase } from './supabaseClient.js';
import { getUserId } from './state.js';
import { todayISO, formatDateDMY } from './utils.js';
import { DEMO_MODE } from './config.js';
import { createDemoClient } from './demoClient.js';
import { buildDemoData } from './blankData.js';

// This is the LIVE app: no sample data. In DEMO_MODE every call below runs
// against an empty in-memory dataset (real empty states, not error
// banners) instead of the network — see config.js to switch back to the
// real Supabase project once it's ready.
const supabase = DEMO_MODE ? createDemoClient(buildDemoData()) : realSupabase;

function requireUser() {
  const id = getUserId();
  if (!id) throw new Error('Not signed in.');
  return id;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------------- life_areas ----------------

export async function listAreas({ includeArchived = false } = {}) {
  let q = supabase.from('life_areas').select('*').order('sort_order', { ascending: true });
  if (!includeArchived) q = q.is('archived_at', null);
  return unwrap(await q);
}

export async function createArea({ name, colour, sort_order }) {
  const row = { user_id: requireUser(), name, colour: colour || '#6b7280', sort_order: sort_order ?? 0 };
  return unwrap(await supabase.from('life_areas').insert(row).select().single());
}

export async function updateArea(id, patch) {
  return unwrap(await supabase.from('life_areas').update(patch).eq('id', id).select().single());
}

export async function archiveArea(id) {
  return updateArea(id, { archived_at: new Date().toISOString() });
}

export async function unarchiveArea(id) {
  return updateArea(id, { archived_at: null });
}

export async function reorderAreas(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => updateArea(id, { sort_order: i })));
}

// ---------------- goals ----------------

export async function listGoals({ includeArchived = false, status = null, areaId = null } = {}) {
  let q = supabase.from('goals').select('*').order('priority', { ascending: true }).order('created_at', { ascending: false });
  if (!includeArchived) q = q.is('archived_at', null);
  if (status) q = q.eq('status', status);
  if (areaId) q = q.eq('area_id', areaId);
  return unwrap(await q);
}

export async function getGoal(id) {
  return unwrap(await supabase.from('goals').select('*').eq('id', id).single());
}

export async function createGoal(payload) {
  const row = { ...payload, user_id: requireUser() };
  return unwrap(await supabase.from('goals').insert(row).select().single());
}

export async function updateGoal(id, patch) {
  return unwrap(await supabase.from('goals').update(patch).eq('id', id).select().single());
}

export async function archiveGoal(id) {
  return updateGoal(id, { archived_at: new Date().toISOString() });
}

export async function unarchiveGoal(id) {
  return updateGoal(id, { archived_at: null });
}

export async function setGoalStatus(id, status) {
  return updateGoal(id, { status });
}

/**
 * Changes a goal's target date and — per the build spec's "target dates
 * don't roll over silently" rule — writes a goal_updates row recording the
 * change, so the timeline shows how long the goal actually took.
 */
export async function changeTargetDate(goal, newDate, extraNote) {
  const oldLabel = goal.target_date ? formatDateDMY(goal.target_date) : 'no date';
  const newLabel = formatDateDMY(newDate);
  let note = `Target date changed: ${oldLabel} → ${newLabel}`;
  if (extraNote && extraNote.trim()) note += `\n\n${extraNote.trim()}`;
  const updated = await updateGoal(goal.id, { target_date: newDate });
  await createGoalUpdate({ goal_id: goal.id, occurred_on: todayISO(), note });
  return updated;
}

// ---------------- milestones ----------------

export async function listMilestones(goalId) {
  return unwrap(await supabase.from('milestones').select('*').eq('goal_id', goalId).order('sort_order', { ascending: true }));
}

export async function createMilestone({ goal_id, title, due_date, sort_order }) {
  const row = { user_id: requireUser(), goal_id, title, due_date: due_date || null, sort_order: sort_order ?? 0 };
  return unwrap(await supabase.from('milestones').insert(row).select().single());
}

export async function updateMilestone(id, patch) {
  return unwrap(await supabase.from('milestones').update(patch).eq('id', id).select().single());
}

export async function toggleMilestone(id, done) {
  return updateMilestone(id, { completed_on: done ? todayISO() : null });
}

export async function deleteMilestone(id) {
  const { error } = await supabase.from('milestones').delete().eq('id', id);
  if (error) throw error;
}

// ---------------- goal_updates ----------------

export async function listGoalUpdates(goalId) {
  return unwrap(await supabase.from('goal_updates').select('*').eq('goal_id', goalId)
    .order('occurred_on', { ascending: false }).order('created_at', { ascending: false }));
}

export async function listGoalUpdatesInRange(goalId, start, end) {
  return unwrap(await supabase.from('goal_updates').select('*').eq('goal_id', goalId)
    .gte('occurred_on', start).lte('occurred_on', end)
    .order('occurred_on', { ascending: true }));
}

/** Updates for many goals at once (bucketed later client-side) — used by the momentum grid. */
export async function listUpdatesForGoalsSince(goalIds, sinceISO) {
  if (!goalIds.length) return [];
  return unwrap(await supabase.from('goal_updates').select('goal_id, occurred_on')
    .in('goal_id', goalIds).gte('occurred_on', sinceISO));
}

export async function createGoalUpdate({ goal_id, occurred_on, note, value, confidence }) {
  const row = {
    user_id: requireUser(),
    goal_id,
    occurred_on: occurred_on || todayISO(),
    note: note || null,
    value: (value === '' || value === undefined) ? null : value,
    confidence: (confidence === '' || confidence === undefined) ? null : confidence
  };
  return unwrap(await supabase.from('goal_updates').insert(row).select().single());
}

/**
 * Period check-ins for pass_fail goals: exactly one goal_updates row per
 * period, keyed by occurred_on === that period's start date. Lets the UI
 * show one row per week/month/quarter and know unambiguously whether it's
 * been logged yet, rather than an open-ended list of arbitrarily-dated
 * entries.
 */
export async function getGoalUpdateForOccurredOn(goalId, occurredOn) {
  const rows = unwrap(await supabase.from('goal_updates').select('*')
    .eq('goal_id', goalId).eq('occurred_on', occurredOn));
  return rows[0] || null;
}

/** Selects/switches a period's outcome. Pass null to deselect (delete the entry). */
export async function setPeriodCheckIn(goalId, periodStart, achieved) {
  const existing = await getGoalUpdateForOccurredOn(goalId, periodStart);
  if (achieved === null) {
    if (existing) await deleteGoalUpdate(existing.id);
    return null;
  }
  if (existing) {
    return unwrap(await supabase.from('goal_updates').update({ value: achieved ? 1 : 0 })
      .eq('id', existing.id).select().single());
  }
  return createGoalUpdate({ goal_id: goalId, occurred_on: periodStart, value: achieved ? 1 : 0 });
}

export async function deleteGoalUpdate(id) {
  const { error } = await supabase.from('goal_updates').delete().eq('id', id);
  if (error) throw error;
}

/** Every update across every goal — used by search. Fine to fetch in full at personal-app scale. */
export async function listAllGoalUpdates() {
  return unwrap(await supabase.from('goal_updates').select('*').order('occurred_on', { ascending: false }));
}

// ---------------- views ----------------

export async function listGoalProgress() {
  return unwrap(await supabase.from('goal_progress').select('*'));
}

export async function getGoalProgressFor(id) {
  const rows = unwrap(await supabase.from('goal_progress').select('*').eq('id', id));
  return rows && rows[0] ? rows[0] : null;
}

export async function listGoalProgressFor(ids) {
  if (!ids.length) return [];
  return unwrap(await supabase.from('goal_progress').select('*').in('id', ids));
}

export async function listGoalsByIds(ids) {
  if (!ids.length) return [];
  return unwrap(await supabase.from('goals').select('*').in('id', ids));
}

export async function listAreaSummary() {
  return unwrap(await supabase.from('area_summary').select('*').order('sort_order', { ascending: true }));
}

// ---------------- reviews ----------------

export async function listPendingReviews() {
  return unwrap(await supabase.rpc('pending_reviews'));
}

export async function listReviews() {
  return unwrap(await supabase.from('reviews').select('*').order('period_start', { ascending: false }));
}

export async function getReview(id) {
  return unwrap(await supabase.from('reviews').select('*').eq('id', id).single());
}

export async function getReviewByPeriod(periodType, periodStart) {
  const rows = unwrap(await supabase.from('reviews').select('*')
    .eq('period_type', periodType).eq('period_start', periodStart));
  return rows && rows[0] ? rows[0] : null;
}

export async function startOrResumeReview({ period_type, period_start, period_end }) {
  const existing = await getReviewByPeriod(period_type, period_start);
  if (existing) return existing;
  const row = { user_id: requireUser(), period_type, period_start, period_end, status: 'draft' };
  try {
    return unwrap(await supabase.from('reviews').insert(row).select().single());
  } catch (err) {
    // Unique-constraint race (opened the same period twice in quick succession) — just resume it.
    if (err && err.code === '23505') {
      const again = await getReviewByPeriod(period_type, period_start);
      if (again) return again;
    }
    throw err;
  }
}

export async function updateReview(id, patch) {
  return unwrap(await supabase.from('reviews').update(patch).eq('id', id).select().single());
}

export async function completeReview(id) {
  return updateReview(id, { status: 'complete', completed_at: new Date().toISOString() });
}

export async function reopenReview(id) {
  return updateReview(id, { status: 'draft', completed_at: null });
}

// ---------------- review_goals ----------------

export async function listReviewGoals(reviewId) {
  return unwrap(await supabase.from('review_goals').select('*').eq('review_id', reviewId));
}

/**
 * All review_goals entries across all reviews for one goal — powers the
 * "every review that referenced this goal" list on Goal detail. Joined
 * client-side (two queries) rather than via PostgREST embedding, since this
 * schema deliberately uses composite (user_id, review_id) foreign keys —
 * see §0 — which embedding-by-column-name can't reliably infer.
 */
export async function listReviewGoalsForGoal(goalId) {
  const rgs = unwrap(await supabase.from('review_goals').select('*')
    .eq('goal_id', goalId).order('created_at', { ascending: false }));
  if (!rgs.length) return [];
  const reviewIds = [...new Set(rgs.map((r) => r.review_id))];
  const reviews = unwrap(await supabase.from('reviews').select('id, period_type, period_start, period_end, status')
    .in('id', reviewIds));
  const byId = new Map(reviews.map((r) => [r.id, r]));
  return rgs.map((rg) => ({ ...rg, review: byId.get(rg.review_id) || null }));
}

/** Every review_goals entry for the user, across every review — used by search. */
export async function listAllReviewGoals() {
  return unwrap(await supabase.from('review_goals').select('*'));
}

export async function upsertReviewGoal(payload) {
  const row = { ...payload, user_id: requireUser() };
  return unwrap(await supabase.from('review_goals')
    .upsert(row, { onConflict: 'review_id,goal_id' })
    .select().single());
}

// ---------------- note_pages ----------------
// A running notebook page per life area — freeform text you keep appending
// to over time, not a series of discrete dated entries like goal_updates.

export async function listNotePages({ includeArchived = false } = {}) {
  let q = supabase.from('note_pages').select('*').order('updated_at', { ascending: false });
  if (!includeArchived) q = q.is('archived_at', null);
  return unwrap(await q);
}

export async function getNotePage(id) {
  return unwrap(await supabase.from('note_pages').select('*').eq('id', id).single());
}

export async function createNotePage({ area_id, title, content }) {
  const row = { user_id: requireUser(), area_id, title, content: content || '' };
  return unwrap(await supabase.from('note_pages').insert(row).select().single());
}

export async function updateNotePage(id, patch) {
  return unwrap(await supabase.from('note_pages').update(patch).eq('id', id).select().single());
}

export async function archiveNotePage(id) {
  return updateNotePage(id, { archived_at: new Date().toISOString() });
}

export async function unarchiveNotePage(id) {
  return updateNotePage(id, { archived_at: null });
}
