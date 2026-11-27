import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, resultText, cleanResult, cleanRace, raceState, MAX_NAME, MAX_TIME } from '../js/races.js';

test('parseTime: colon times', () => {
  assert.equal(parseTime('52:14'), 52 * 60 + 14);
  assert.equal(parseTime('1:52:14'), 6734);
  assert.equal(parseTime(' 0:45:00 '), 2700);
  assert.equal(parseTime('52:14.5'), 3135); // tenths round
});

test('parseTime: written-out times', () => {
  assert.equal(parseTime('1h 52m 14s'), 6734);
  assert.equal(parseTime('52m'), 3120);
  assert.equal(parseTime('52 min'), 3120);
  assert.equal(parseTime('2 hours 5 minutes'), 7500);
  assert.equal(parseTime('4h12'), 15120);
  assert.equal(parseTime('90s'), 90);
});

test('parseTime: anything that is not clearly a time gives null, never a wrong number', () => {
  for (const bad of ['', '   ', null, 'DNF', 'about an hour', '12:75', '1:2:3:4', '4:12 chip', 'abc 52:14', '5k']) assert.equal(parseTime(bad), null, String(bad));
});

test('resultText shows what was typed, else the old seconds as h:mm:ss', () => {
  assert.equal(resultText({ finish_time_text: ' 1h 52m (chip) ', finish_time_seconds: 6720 }), '1h 52m (chip)');
  assert.equal(resultText({ finish_time_text: null, finish_time_seconds: 3041 }), '50:41'); // the Windmill 10k, stored the old way
  assert.equal(resultText({ finish_time_text: null, finish_time_seconds: 6734 }), '1:52:14');
  assert.equal(resultText({ finish_time_text: '', finish_time_seconds: null }), '');
  assert.equal(resultText(null), '');
});

test('cleanResult keeps free text exactly, derives seconds when it can, and needs a time', () => {
  assert.deepEqual(cleanResult({ time: '  52:14  ', notes: ' windy ' }), { finish_time_text: '52:14', finish_time_seconds: 3134, notes: 'windy' });
  assert.deepEqual(cleanResult({ time: 'DNF at 8k', notes: '' }), { finish_time_text: 'DNF at 8k', finish_time_seconds: null, notes: null });
  assert.equal(cleanResult({ time: '   ', notes: 'x' }), null);
  assert.equal(cleanResult({ time: 'x'.repeat(200) }).finish_time_text.length, MAX_TIME);
});

test('cleanRace needs a name and a real date, caps lengths and drops a bad start time', () => {
  assert.equal(cleanRace({ name: '', date: '2027-05-01' }), null);
  assert.equal(cleanRace({ name: 'Santa Dash', date: '' }), null);
  assert.equal(cleanRace({ name: 'Santa Dash', date: '6 Dec' }), null);
  const r = cleanRace({ name: ' Manchester 10k ', date: '2027-05-16', distance: ' 10K ', note: '', start_time: '9:30' });
  assert.deepEqual(r, { plan_version: 'v2', name: 'Manchester 10k', race_date: '2027-05-16', distance_label: '10K', role: null, start_time: '9:30', status: 'planned', sort_order: 0 });
  assert.equal(cleanRace({ name: 'y'.repeat(300), date: '2027-05-16', start_time: 'half nine' }).name.length, MAX_NAME);
  assert.equal(cleanRace({ name: 'a', date: '2027-05-16', start_time: 'half nine' }).start_time, null);
});

test('raceState: your booked flag wins, else the plan status; past or today without a result needs one', () => {
  const race = (id, date, status = 'planned') => ({ id, race_date: date, status });
  const today = '2026-12-10';
  assert.equal(raceState(race('a', '2027-01-01'), { a: true }, {}, today).booked, true);
  assert.equal(raceState(race('a', '2027-01-01', 'entered'), { a: false }, {}, today).booked, false); // an explicit "not booked" beats the plan
  assert.equal(raceState(race('a', '2027-01-01', 'entered'), {}, {}, today).booked, true);
  assert.equal(raceState(race('a', '2027-01-01'), {}, {}, today).booked, false);
  assert.equal(raceState(race('a', '2026-12-06'), {}, {}, today).needsResult, true);
  assert.equal(raceState(race('a', '2026-12-10'), {}, {}, today).needsResult, true); // today counts
  assert.equal(raceState(race('a', '2026-12-11'), {}, {}, today).needsResult, false);
  assert.equal(raceState(race('a', '2026-12-06'), {}, { a: { id: 'r' } }, today).needsResult, false);
  assert.equal(raceState(race('a', '2026-12-06'), null, null, today).hasResult, false);
});
