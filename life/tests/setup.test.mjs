import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFE_START } from '../js/start.js';
import { todayStr, realTodayStr, setupMode } from '../js/fit/utils.js';

// todayStr() is the real date, but never earlier than the start: that is what makes the app open for setup
// and show the first week as current before 30 November. The real clock decides, so test both sides of it.
test('todayStr is never before the fresh start, and setup mode matches', () => {
  assert.ok(todayStr() >= LIFE_START);
  assert.equal(setupMode(), realTodayStr() < LIFE_START);
  assert.equal(todayStr(), realTodayStr() < LIFE_START ? LIFE_START : realTodayStr());
});
