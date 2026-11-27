import test from 'node:test';
import assert from 'node:assert/strict';
import { readiness, readinessAdvice, isHardSession, readinessHistory } from '../js/readiness.js';
import { day, steady } from './helpers.mjs';

const END = '2026-12-20';
const patch = (rows, d, p) => rows.map((r) => (r.day === d ? { ...r, ...p } : r));

test('a rough night and a high resting HR reads as Easy', () => {
  const { sleep, days } = steady(END, 40);
  const r = readiness(END, patch(sleep, END, { sleep_s: 5 * 3600, hrv_last_night: 40 }), patch(days, END, { resting_hr: 60 }));
  assert.equal(r.verdict, 'easy');
  assert.ok(r.score < 25);
  assert.equal(r.factors.length, 4);
  assert.ok(r.worst);
});

test('a great night reads as Push', () => {
  const { sleep, days } = steady(END, 40);
  const r = readiness(END, patch(sleep, END, { sleep_s: 9 * 3600, hrv_last_night: 75 }), patch(days, END, { resting_hr: 49 }));
  assert.equal(r.verdict, 'push');
  assert.ok(r.score > 75);
});

test('a normal day reads as Normal', () => {
  const { sleep, days } = steady(END, 40);
  assert.equal(readiness(END, sleep, days).verdict, 'normal');
});

test('says nothing without enough history or enough metrics', () => {
  const { sleep, days } = steady(END, 5); // under 7 baseline days: no metric qualifies
  assert.equal(readiness(END, sleep, days), null);
  const one = steady(END, 40);
  assert.equal(readiness(END, one.sleep.map((r) => ({ day: r.day, sleep_s: r.sleep_s })), []), null); // only one metric available
});

test('stress and resting HR count the other way (higher is worse)', () => {
  const { sleep, days } = steady(END, 40);
  const worse = readiness(END, sleep, patch(days, END, { resting_hr: 62 }));
  const better = readiness(END, sleep, patch(days, END, { resting_hr: 46 }));
  assert.ok(worse.score < better.score);
});

test('only the 28 days before the date form the baseline', () => {
  const { sleep, days } = steady(END, 40);
  // Wildly different sleep 40 days back must not move today's result.
  const old = sleep.map((r) => (r.day < day(END, -30) ? { ...r, sleep_s: 3 * 3600 } : r));
  assert.deepEqual(readiness(END, old, days).score, readiness(END, sleep, days).score);
});

test('hard-session advice: Easy + hard session points at the swap; rest day does not', () => {
  const easy = { verdict: 'easy' }, push = { verdict: 'push' };
  assert.match(readinessAdvice(easy, [{ session_type: 'run', plan_day: {} }]), /Swap with another day/);
  assert.doesNotMatch(readinessAdvice(easy, [{ session_type: 'rest' }]), /Swap/);
  assert.match(readinessAdvice(push, [{ session_type: 'rest' }]), /rest day/i);
  assert.equal(readinessAdvice(null, []), '');
  assert.equal(isHardSession({ session_type: 'lift', plan_day: { optional: true } }), false);
  assert.equal(isHardSession({ session_type: 'race' }), true);
  assert.equal(isHardSession({ session_type: 'walk' }), false);
});

test('history counts verdicts and how often you trained on each', () => {
  const { sleep, days } = steady(END, 60);
  const bad = day(END, -3);
  const s2 = patch(sleep, bad, { sleep_s: 4 * 3600, hrv_last_night: 35 });
  const d2 = patch(days, bad, { resting_hr: 64 });
  const dates = Array.from({ length: 20 }, (_, i) => day(END, i - 19));
  const h = readinessHistory(dates, s2, d2, [{ local_date: bad }, { local_date: day(END, -10) }]);
  assert.equal(h.scores.length, 20);
  assert.equal(h.counts.easy, 1);
  assert.equal(h.trainedOn.easy, 1);
  assert.equal(h.counts.push + h.counts.normal + h.counts.easy, h.scored);
});
