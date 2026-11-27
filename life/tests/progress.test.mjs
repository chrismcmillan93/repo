import test from 'node:test';
import assert from 'node:assert/strict';
import { picsStatus, takenInWeek, DUE_DAYS } from '../js/progressPics.js';
import { checkinText, garminWeek } from '../js/checkinText.js';
import { day } from './helpers.mjs';

const START = '2026-11-30';
const pic = (n, note = '') => ({ taken_on: day(START, n), note });

test('pictures: nothing logged is first due at the end of the first week, not on day one', () => {
  assert.equal(picsStatus([], START, START).overdue, false);
  assert.equal(picsStatus([], day(START, 5), START).overdue, false);
  const s = picsStatus([], day(START, 6), START);
  assert.equal(s.overdue, true);
  assert.match(s.nudge, /none taken yet/);
  assert.equal(s.line, 'None logged yet.');
});

test('pictures: due again after 14 days, counted from the latest set', () => {
  const pics = [pic(0), pic(7)];
  assert.equal(picsStatus(pics, day(START, 7 + DUE_DAYS - 1), START).overdue, false);
  const s = picsStatus(pics, day(START, 7 + DUE_DAYS), START);
  assert.equal(s.overdue, true);
  assert.equal(s.since, DUE_DAYS);
  assert.match(s.nudge, /last taken 14 days ago/);
  assert.equal(picsStatus([pic(3)], day(START, 3), START).line, 'Last taken today.');
});

test('pictures: a set dated in the future is ignored, and the week check is inclusive', () => {
  assert.equal(picsStatus([pic(20)], day(START, 3), START).last, null);
  assert.equal(takenInWeek([pic(6)], START, day(START, 6)), true);
  assert.equal(takenInWeek([pic(7)], START, day(START, 6)), false);
  assert.equal(takenInWeek([], START, day(START, 6)), false);
});

// ---- Copy for Claude ----
const week = { number: 3, phase: 'Base', start: '2026-12-14', end: '2026-12-20', targetKg: 79 };

test('copy text: a full week reads clearly and tells Claude what to do', () => {
  const t = checkinText({ week, form: { weight: '80.4', leaks: '2', win: 'Long run done', challenge: 'Sleep' },
    history: [{ week_number: 1, weight_kg: 81.2 }, { week_number: 2, weight_kg: 80.9 }, { week_number: 3, weight_kg: 80.4 }],
    logs: [{ nutrition_status: 'yes', training_status: 'yes' }, { nutrition_status: 'partial', training_status: 'no' }],
    garmin: { runs: 3, runKm: 31.5, activities: 5, sleepH: 7.25, hrv: 61, rhr: 52, steps: 9100 },
    moods: [{ energy: 4, mood: 3 }, { energy: 2, mood: 3 }], pics: [pic(14, 'front, side, back'), pic(0)], today: '2026-12-20' });
  assert.match(t, /^Weekly check-in: week 3 \(Base\), 14 Dec to 20 Dec/);
  assert.match(t, /Weight \(Monday\): 80.4 kg, plan target 79.0 kg \(1.4 kg over\)/);
  assert.match(t, /Earlier weeks: wk 1 81.2 kg, wk 2 80.9 kg/); // this week's own entry is not repeated
  assert.doesNotMatch(t, /wk 3 80.4/);
  assert.match(t, /Leaks this week: 2/);
  assert.match(t, /Food days: 1 yes, 1 partly, 0 no, 5 not logged/);
  assert.match(t, /3 runs \(31.5 km\), 5 activities in all, sleep 7h 15m a night, overnight HRV 61 ms, resting HR 52 bpm, 9,100 steps a day/);
  assert.match(t, /energy 3, mood 3/);
  assert.match(t, /Progress pictures logged: 14 Dec \(front, side, back\), 30 Nov/);
  assert.match(t, /compare them with my earlier ones/);
});

test('copy text: missing things are said to be missing, never zero', () => {
  const t = checkinText({ week: { ...week, targetKg: null }, form: {}, today: '2026-12-20' });
  assert.match(t, /Weight \(Monday\): not recorded/);
  assert.match(t, /Leaks this week: not recorded/);
  assert.match(t, /One win: not recorded/);
  assert.match(t, /Food and training days: nothing logged/);
  assert.match(t, /Garmin: no data for this week/);
  assert.match(t, /Progress pictures logged: none yet/);
  assert.doesNotMatch(t, /How I felt/);
});

test('copy text: on target and under target wording', () => {
  assert.match(checkinText({ week, form: { weight: '79' }, today: 'x' }), /on target/);
  assert.match(checkinText({ week, form: { weight: '78.5' }, today: 'x' }), /0.5 kg under/);
});

test('garminWeek summarises runs, sleep and steps, and is null with nothing', () => {
  assert.equal(garminWeek([], [], []), null);
  const g = garminWeek([{ type_key: 'running', distance_m: 10000 }, { type_key: 'trail_running', distance_m: 5500 }, { type_key: 'strength_training' }],
    [{ sleep_s: 8 * 3600, hrv_last_night: 60 }, { sleep_s: 6 * 3600, hrv_last_night: 50 }, { sleep_s: 1000 }], [{ resting_hr: 50, steps: 8000 }, { resting_hr: 54, steps: 0 }]);
  assert.equal(g.runs, 2);
  assert.equal(g.runKm, 15.5);
  assert.equal(g.activities, 3);
  assert.equal(g.sleepH, 7); // the 1000-second "night" is ignored
  assert.equal(g.hrv, 55);
  assert.equal(g.rhr, 52);
  assert.equal(g.steps, 8000); // zero-step days are ignored
});
