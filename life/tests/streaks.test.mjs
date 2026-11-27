import test from 'node:test';
import assert from 'node:assert/strict';
import { streakInfo, slipPatterns, topTrigger, pushLine, milestoneLabel } from '../js/streaks.js';
import { day } from './helpers.mjs';

const T = '2026-12-31';

test('days since counts from the quit date; day zero is zero', () => {
  assert.equal(streakInfo({ started_on: T }, [], T).current, 0);
  assert.equal(streakInfo({ started_on: day(T, -10) }, [], T).current, 10);
});

test('a slip restarts the current run but keeps the best one', () => {
  const q = { started_on: day(T, -30) };
  const i = streakInfo(q, [{ slip_date: day(T, -5) }], T);
  assert.equal(i.current, 5);
  assert.equal(i.longest, 25);
  assert.equal(i.slips, 1);
  assert.equal(i.runBefore(day(T, -5)), 25);
});

test('slips before the quit date or in the future are ignored; two on one day count once for the run', () => {
  const q = { started_on: day(T, -10) };
  const i = streakInfo(q, [{ slip_date: day(T, -20) }, { slip_date: day(T, 5) }, { slip_date: day(T, -4) }, { slip_date: day(T, -4) }], T);
  assert.equal(i.slips, 2);
  assert.equal(i.slipDays, 1);
  assert.equal(i.current, 4);
});

test('a future start date waits, then counts', () => {
  const i = streakInfo({ started_on: day(T, 3) }, [], T);
  assert.equal(i.upcoming, 3);
  assert.equal(i.current, 0);
});

test('milestones read sensibly and the push line is deterministic', () => {
  assert.equal(milestoneLabel(7), '1 week');
  assert.equal(milestoneLabel(365), '1 year');
  assert.equal(pushLine(5, T), pushLine(5, T));
  assert.match(pushLine(0, T), /./);
});

test('topTrigger needs at least two of the same', () => {
  assert.equal(topTrigger([{ trigger: 'Stress' }, { trigger: 'Boredom' }]), null);
  assert.deepEqual(topTrigger([{ trigger: 'Stress' }, { trigger: 'Stress' }, { trigger: 'Boredom' }]), { name: 'Stress', n: 2 });
});

// ---- slip patterns ----
const START = '2026-10-01';
const rows = (n, f) => Array.from({ length: n }, (_, i) => ({ day: day(START, i), ...f(i) }));

test('weekday and time-of-day standouts need 3+ slips and a single winner', () => {
  // 2026-10-05 is a Monday; slips on four Mondays, all evening.
  const slips = [4, 11, 18, 25].map((n) => ({ slip_date: day(START, n), slip_part: 'Evening' }));
  const p = slipPatterns(slips, [], START, day(START, 40));
  assert.equal(p.topDow.name, 'Monday');
  assert.equal(p.topPart.name, 'Evening');
  assert.equal(p.sleep, null);
  assert.equal(slipPatterns(slips.slice(0, 2), [], START, day(START, 40)).topDow, null);
});

test('sleep and body comparisons: stress the day before a slip, resting HR on it', () => {
  const slipDays = [8, 15, 22, 29];
  const slips = slipDays.map((n) => ({ slip_date: day(START, n), slip_part: '' }));
  const sleep = rows(40, (i) => ({ sleep_s: (slipDays.includes(i) ? 5.5 : 7.5) * 3600, hrv_last_night: slipDays.includes(i) ? 45 : 60 }));
  const days = rows(40, (i) => ({ avg_stress: slipDays.includes(i + 1) ? 50 : 30, resting_hr: slipDays.includes(i) ? 58 : 52 }));
  const p = slipPatterns(slips, sleep, START, day(START, 39), days);
  assert.equal(p.sleep.slipH, 5.5);
  assert.equal(p.sleep.otherH, 7.5);
  assert.equal(p.body.slipStress, 50);
  assert.equal(p.body.otherStress, 30);
  assert.equal(p.body.slipRhr, 58);
  assert.equal(p.body.otherRhr, 52);
  assert.equal(p.body.small, true); // 4 slip days is under 6
});

test('body comparison stays quiet with too few slip days', () => {
  const slips = [{ slip_date: day(START, 8) }, { slip_date: day(START, 15) }, { slip_date: day(START, 22) }];
  const p = slipPatterns(slips, [], START, day(START, 39), rows(40, () => ({ avg_stress: 30, resting_hr: 52 })));
  assert.ok(p.body); // 3 slip days and plenty of others is enough
  assert.equal(slipPatterns(slips.slice(0, 2), [], START, day(START, 39), rows(40, () => ({ avg_stress: 30, resting_hr: 52 }))).body, null);
});
