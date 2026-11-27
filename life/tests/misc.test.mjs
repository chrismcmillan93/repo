import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeFor, weekVerdict } from '../js/verdict.js';
import { niggleAdvice, niggleNudges } from '../js/niggle.js';
import { LIFE_START, floorDate, beforeStart, floorWeek, FIRST_WEEK } from '../js/start.js';

test('grades fall on the documented boundaries', () => {
  assert.deepEqual([100, 90, 89, 75, 74, 60, 59, 40, 39, 0].map(gradeFor), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
});

const c = (title, done, target, cadence = 'weekly') => ({ title, done_count: done, target_count: target, cadence });

test('weekly verdict grades kept share, names the weakest, ignores monthly', () => {
  const v = weekVerdict({ commits: [c('Run', 3, 4), c('Read', 1, 7, 'daily'), c('Big thing', 0, 1, 'monthly')] });
  assert.equal(v.kind, 'graded');
  assert.equal(v.pct, Math.round(100 * 4 / 11));
  assert.equal(v.weakest.title, 'Read');
  assert.match(v.fix, /Read: 1 of 7/);
});

test('a perfect week, an empty week and an away week', () => {
  assert.equal(weekVerdict({ commits: [c('Run', 4, 4)] }).grade, 'A');
  assert.equal(weekVerdict({ commits: [] }).kind, 'none');
  assert.equal(weekVerdict({ commits: [c('Run', 0, 4)], away: true }).kind, 'away');
});

test('over-achieving one commitment cannot hide a miss on another', () => {
  const v = weekVerdict({ commits: [c('Run', 10, 4), c('Read', 0, 4)] });
  assert.equal(v.pct, 50);
});

test('goal losing ground: stalled beats behind', () => {
  const v = weekVerdict({ commits: [c('Run', 4, 4)], goals: [{ title: 'A', state: 'behind', pct: 10, exp: 60, quiet: 0 }, { title: 'B', state: 'stalled', pct: 5, exp: 30, quiet: 20 }] });
  assert.match(v.losing, /^B: no progress in 20 days/);
});

test('niggle advice escalates with severity and age', () => {
  const n = (severity, started_on, extra = {}) => ({ area: 'Knee', severity, started_on, ...extra });
  assert.equal(niggleAdvice(n(4, '2026-12-30'), '2026-12-31').level, 'stop');
  assert.equal(niggleAdvice(n(3, '2026-12-27'), '2026-12-31').level, 'book');
  assert.equal(niggleAdvice(n(3, '2026-12-30'), '2026-12-31').level, null);
  assert.equal(niggleAdvice(n(2, '2026-12-20'), '2026-12-31').level, 'book');
  assert.equal(niggleAdvice(n(1, '2026-12-10'), '2026-12-31').level, 'watch');
  assert.equal(niggleNudges([n(4, '2026-12-30', { resolved_on: '2026-12-31' })], '2026-12-31').length, 0); // resolved
  assert.equal(niggleNudges([n(1, '2026-12-10')], '2026-12-31').length, 0); // 'watch' does not interrupt Today
});

test('the fresh-start floor', () => {
  assert.equal(LIFE_START, '2026-11-30');
  assert.equal(floorDate('2026-01-01'), LIFE_START);
  assert.equal(floorDate('2026-12-01'), '2026-12-01');
  assert.equal(floorDate(null), null);
  assert.equal(beforeStart('2026-11-29'), true);
  assert.equal(beforeStart('2026-11-30'), false);
  assert.equal(FIRST_WEEK, '2026-11-30'); // the start is a Monday, so the first week starts that day
  assert.equal(floorWeek('2026-10-05'), FIRST_WEEK);
});
