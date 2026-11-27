import test from 'node:test';
import assert from 'node:assert/strict';
import { goalActions, dueLabel, DONE_SHOWN } from '../js/goalactions.js';

const T = '2026-12-10';
let n = 0;
const t = (title, extra = {}) => ({ id: `t${++n}`, goal_id: 'g1', title, status: 'open', due_date: null, done_on: null, created_at: `2026-12-0${(n % 9) + 1}T10:00:00Z`, ...extra });

test('open actions: overdue first, then today, then later by date, then undated', () => {
  const tasks = [t('undated'), t('later', { due_date: '2026-12-20' }), t('today', { due_date: T }), t('overdue', { due_date: '2026-12-01' }), t('soon', { due_date: '2026-12-12' })];
  const r = goalActions(tasks, 'g1', T);
  assert.deepEqual(r.open.map((x) => x.title), ['overdue', 'today', 'soon', 'later', 'undated']);
  assert.equal(r.overdue, 1);
});

test('only this goal\'s actions are returned', () => {
  const r = goalActions([t('mine'), t('theirs', { goal_id: 'g2' })], 'g1', T);
  assert.deepEqual(r.open.map((x) => x.title), ['mine']);
});

test('done actions come newest first and are capped', () => {
  const done = Array.from({ length: DONE_SHOWN + 3 }, (_, i) => t(`d${i}`, { status: 'done', done_on: `2026-12-${String(i + 1).padStart(2, '0')}` }));
  const r = goalActions(done, 'g1', T);
  assert.equal(r.done.length, DONE_SHOWN);
  assert.equal(r.done[0].title, `d${DONE_SHOWN + 2}`);
  assert.equal(r.open.length, 0);
});

test('undated actions keep the order they were added in', () => {
  const a = t('first', { created_at: '2026-12-01T09:00:00Z' }), b = t('second', { created_at: '2026-12-02T09:00:00Z' });
  assert.deepEqual(goalActions([b, a], 'g1', T).open.map((x) => x.title), ['first', 'second']);
});

test('due labels', () => {
  const f = (d) => `D${d}`;
  assert.equal(dueLabel(t('x'), T, f), '');
  assert.equal(dueLabel(t('x', { due_date: '2026-12-01' }), T, f), 'overdue');
  assert.equal(dueLabel(t('x', { due_date: T }), T, f), 'due today');
  assert.equal(dueLabel(t('x', { due_date: '2026-12-25' }), T, f), 'due D2026-12-25');
  assert.equal(dueLabel(t('x', { due_date: '2026-12-01', status: 'done' }), T, f), ''); // finished: never "overdue"
  assert.equal(goalActions([], 'g1', T).overdue, 0);
});
