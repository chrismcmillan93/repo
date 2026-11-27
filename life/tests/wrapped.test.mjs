import test from 'node:test';
import assert from 'node:assert/strict';
import { wrappedStats, quitCard, longestStreak } from '../js/wrappedStats.js';
import { day } from './helpers.mjs';

const Y = '2026-01-01';
const year = () => {
  const acts = [], days = [], sleep = [], sets = [], workouts = [];
  for (let i = 0; i < 330; i++) {
    const d = day(Y, i);
    if (i % 2 === 0) acts.push({ type_key: i % 6 === 0 ? 'trail_running' : 'running', name: `Run ${i}`, local_date: d, distance_m: 6000 + (i % 9) * 1500, duration_s: 2400, elevation_gain_m: 80, avg_speed_mps: 2.8 });
    days.push({ day: d, steps: 8000, resting_hr: 56 - Math.floor(i / 60) });
    sleep.push({ day: d, sleep_s: (6.5 + (i % 4) * 0.4) * 3600, hrv_last_night: 58 });
    if (i % 3 === 0) {
      workouts.push({ hevy_id: `w${i}`, start_time: `${d}T08:00:00Z` });
      for (let s = 0; s < 8; s++) sets.push({ hevy_workout_id: `w${i}`, exercise_title: s < 4 ? 'Back Squat' : 'Bench Press', set_type: s === 0 ? 'warmup' : 'normal', weight_kg: 60 + s * 5, reps: 5, performed_at: `${d}T08:30:00Z` });
    }
  }
  return { acts, days, sleep, sets, workouts };
};

test('a full year produces every card', () => {
  const w = wrappedStats({ ...year(), year: 2026 });
  const ids = w.cards.map((c) => c.id);
  for (const id of ['move', 'climb', 'rhythm', 'runs', 'long', 'lift', 'tonnes', 'sleep', 'bestnight', 'steps', 'rhr']) assert.ok(ids.includes(id), id);
  assert.equal(w.running.runs, w.movement.count);
});

test('rows from another year are ignored', () => {
  const d = year();
  d.acts.push({ type_key: 'running', name: 'Last year', local_date: '2025-12-30', distance_m: 99999000, duration_s: 1 });
  const w = wrappedStats({ ...d, year: 2026 });
  assert.ok(w.running.longestKm < 100);
  assert.equal(wrappedStats({ acts: [d.acts[d.acts.length - 1]], year: 2026 }).cards.length, 0);
});

test('warm-up sets do not count towards volume or the heaviest lift', () => {
  const w = wrappedStats({ workouts: [{ hevy_id: 'a', start_time: '2026-03-01T08:00:00Z' }], sets: [
    { hevy_workout_id: 'a', exercise_title: 'Squat', set_type: 'warmup', weight_kg: 500, reps: 10, performed_at: '2026-03-01T08:10:00Z' },
    { hevy_workout_id: 'a', exercise_title: 'Squat', set_type: 'normal', weight_kg: 100, reps: 10, performed_at: '2026-03-01T08:20:00Z' }], year: 2026 });
  assert.equal(w.strength.heaviestKg, 100);
  assert.equal(w.strength.tonnes, 1);
});

test('empty input gives no cards, and thin sleep data gives no sleep card', () => {
  assert.equal(wrappedStats({ year: 2026 }).cards.length, 0);
  const w = wrappedStats({ sleep: Array.from({ length: 5 }, (_, i) => ({ day: day(Y, i), sleep_s: 8 * 3600 })), year: 2026 });
  assert.equal(w.cards.some((c) => c.id === 'sleep'), false);
});

test('longestStreak counts consecutive dates only', () => {
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak(['2026-01-01', '2026-01-02', '2026-01-04']), 2);
  assert.equal(longestStreak(['2026-01-01', '2026-01-02', '2026-01-03']), 3);
});

test('the Giving up card is anonymous and uses the longest current run', () => {
  const c = quitCard([0, 12, 5]);
  assert.equal(c.big, '12');
  assert.doesNotMatch(JSON.stringify(c), /alcohol|porn|drug|gambl/i);
  assert.equal(quitCard([0]), null);
  assert.equal(quitCard([]), null);
});
