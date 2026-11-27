import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSpike } from '../js/loadspike.js';
import { day } from './helpers.mjs';

const TODAY = '2026-12-31';
// `km` run on each of the listed offsets from TODAY (negative = days ago), one run per day.
const runs = (spec) => Object.entries(spec).map(([off, km]) => ({ type_key: 'running', local_date: day(TODAY, Number(off)), distance_m: km * 1000 }));
// A steady 20 km a week for four weeks before this one: 10 km on two days of each earlier block.
const base = () => { const o = {}; for (let k = 1; k <= 4; k++) { o[-7 * k] = 10; o[-7 * k - 3] = 10; } return o; };

test('a big jump over the usual weeks is flagged', () => {
  const s = loadSpike(runs({ ...base(), 0: 15, [-3]: 15 }), TODAY); // 30 km vs 20 km usual = +50%
  assert.equal(s.level, 'high');
  assert.equal(s.pct, 50);
  assert.match(s.text, /30 km/);
});

test('a moderate jump warns, a normal week does not', () => {
  assert.equal(loadSpike(runs({ ...base(), 0: 13, [-3]: 13 }), TODAY).level, 'warn'); // 26 vs 20 = +30%
  const ok = loadSpike(runs({ ...base(), 0: 11, [-3]: 11 }), TODAY); // +10%
  assert.equal(ok.level, null);
  assert.equal(ok.text, '');
});

test('only runs count', () => {
  const rides = Object.entries({ ...base(), 0: 40 }).map(([o, km]) => ({ type_key: 'cycling', local_date: day(TODAY, Number(o)), distance_m: km * 1000 }));
  assert.equal(loadSpike(rides, TODAY), null); // no run baseline at all
});

test('a tiny baseline never triggers (a normal week would look like a spike)', () => {
  const o = {}; for (let k = 1; k <= 4; k++) o[-7 * k] = 2;
  assert.equal(loadSpike(runs({ ...o, 0: 15 }), TODAY), null);
});

test('the fresh-start floor limits the baseline, and two full blocks are required', () => {
  const since = day(TODAY, -14); // only 2 weeks of history exist: blocks 1 and 2 fit exactly? block 2 starts at -20, before since
  assert.equal(loadSpike(runs({ ...base(), 0: 30 }), TODAY, since), null);
  const since2 = day(TODAY, -20);
  assert.ok(loadSpike(runs({ ...base(), 0: 30 }), TODAY, since2)); // two blocks fit
  assert.equal(loadSpike(runs({ ...base(), 0: 30 }), TODAY, since2).blocks, 2);
});
