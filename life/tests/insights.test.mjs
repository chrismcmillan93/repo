import test from 'node:test';
import assert from 'node:assert/strict';
import { habitSleep, moodLinks } from '../js/insightsStats.js';
import { day } from './helpers.mjs';

const BASE = '2026-12-01';
// Alternating 8h / 6h nights over n days from BASE.
const nights = (n) => Array.from({ length: n }, (_, i) => ({ day: day(BASE, i), sleep_s: (i % 2 === 0 ? 8 : 6) * 3600 }));

test('habitSleep reports the median in hours (regression: it once came out as 70h)', () => {
  const r = habitSleep([{ id: 'h', title: 'Read', created_at: `${BASE}T00:00:00Z` }], [], nights(40), day(BASE, 39));
  assert.equal(r.medianH, 7);
});

test('a habit done only after good nights shows a big gap', () => {
  const checks = nights(40).filter((n) => n.sleep_s === 8 * 3600).map((n) => ({ habit_id: 'h', check_date: n.day }));
  const r = habitSleep([{ id: 'h', title: 'Read', created_at: `${BASE}T00:00:00Z` }], checks, nights(40), day(BASE, 39));
  assert.equal(r.habits[0].afterGood, 100);
  assert.equal(r.habits[0].afterPoor, 0);
  assert.equal(r.habits[0].diff, 100);
});

test('habitSleep stays quiet on thin data', () => {
  assert.equal(habitSleep([{ id: 'h', title: 'x' }], [], nights(10), day(BASE, 9)), null);
  const r = habitSleep([{ id: 'h', title: 'x', created_at: `${day(BASE, 35)}T00:00:00Z` }], [], nights(40), day(BASE, 39));
  assert.equal(r.habits.length, 0); // only 5 days since the habit began: not enough in each half
});

test('moodLinks compares energy after good and poor nights', () => {
  const moods = nights(30).map((n) => ({ mood_date: n.day, energy: n.sleep_s === 8 * 3600 ? 4 : 2, mood: 3 }));
  const r = moodLinks(moods, nights(30));
  assert.equal(r.linked.energy.good, 4);
  assert.equal(r.linked.energy.poor, 2);
  assert.equal(r.linked.energy.diff, 2);
  assert.equal(r.linked.mood.diff, 0);
  assert.equal(r.linked.medianH, 7);
});

test('moodLinks with too few taps only reports averages', () => {
  const moods = nights(5).map((n) => ({ mood_date: n.day, energy: 3, mood: null }));
  const r = moodLinks(moods, nights(5));
  assert.equal(r.linked, null);
  assert.equal(r.taps, 5);
  assert.equal(r.avgEnergy, 3);
  assert.equal(r.avgMood, null);
  assert.equal(moodLinks([], []).taps, 0);
});
