import test from 'node:test';
import assert from 'node:assert/strict';
import { goalActionLines } from '../../supabase/functions/life-push/goalbrief.js';

const T = '2026-12-10', TOM = '2026-12-11';
const goals = [{ id: 'g1', title: 'Hike 1x per month' }, { id: 'g2', title: 'Read Born to Run' }];
const task = (title, due_date, goal_id = 'g1', status = 'open') => ({ title, due_date, goal_id, status });

test('names overdue, due-today and due-tomorrow actions with their goal', () => {
  const lines = goalActionLines([task('Book the hike', T), task('Buy boots', TOM, 'g2'), task('Pack the rucksack', '2026-12-08')], goals, T, TOM);
  assert.deepEqual(lines, [
    'Overdue: Pack the rucksack (Hike 1x per month)',
    'Goal actions today: Book the hike (Hike 1x per month)',
    'Tomorrow: Buy boots (Read Born to Run)'
  ]);
});

test('nothing to say gives no lines', () => {
  assert.deepEqual(goalActionLines([], goals, T, TOM), []);
  assert.deepEqual(goalActionLines([task('Later', '2026-12-30')], goals, T, TOM), []); // not yet due
  assert.deepEqual(goalActionLines([task('No date', null)], goals, T, TOM), []);
});

test('done actions and actions with no active goal are never announced', () => {
  const lines = goalActionLines([task('Done', T, 'g1', 'done'), task('Orphan', T, 'gone'), task('Unlinked', T, null), task('Real', T)], goals, T, TOM);
  assert.deepEqual(lines, ['Goal actions today: Real (Hike 1x per month)']);
});

test('long lists are capped with "+N more" and long names are clipped', () => {
  const many = ['a', 'b', 'c', 'd', 'e'].map((x) => task(x, T));
  assert.equal(goalActionLines(many, goals, T, TOM)[0], 'Goal actions today: a (Hike 1x per month), b (Hike 1x per month), c (Hike 1x per month), +2 more');
  const long = goalActionLines([task('x'.repeat(60), T)], [{ id: 'g1', title: 'y'.repeat(40) }], T, TOM)[0];
  assert.match(long, /x{39}… \(y{23}…\)$/);
});

test('within a group the earliest date comes first', () => {
  const lines = goalActionLines([task('newer', '2026-12-09'), task('older', '2026-12-02')], goals, T, TOM);
  assert.match(lines[0], /^Overdue: older .*, newer /);
});

import { goalActionsOpenTonight } from '../../supabase/functions/life-push/goalbrief.js';

test('evening: names open actions that are overdue or due today, overdue first', () => {
  const lines = goalActionsOpenTonight([task('Book the hike', T), task('Pack', '2026-12-08'), task('Tomorrow job', TOM)], goals, T);
  assert.deepEqual(lines, ['Goal actions still open: Pack (Hike 1x per month), Book the hike (Hike 1x per month)']);
});

test('evening: nothing open means no line; done, undated, unlinked and inactive-goal actions are ignored', () => {
  assert.deepEqual(goalActionsOpenTonight([], goals, T), []);
  assert.deepEqual(goalActionsOpenTonight([task('Done', T, 'g1', 'done'), task('No date', null), task('Orphan', T, 'gone'), task('Unlinked', T, null), task('Future', TOM)], goals, T), []);
});

test('evening: capped at three names then "+N more"', () => {
  const many = ['a', 'b', 'c', 'd'].map((x) => task(x, T));
  assert.equal(goalActionsOpenTonight(many, goals, T)[0], 'Goal actions still open: a (Hike 1x per month), b (Hike 1x per month), c (Hike 1x per month), +1 more');
});
