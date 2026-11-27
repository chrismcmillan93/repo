import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readinessLine } from '../../supabase/functions/life-push/readinessline.js';
import { readiness } from '../../supabase/functions/life-push/readiness.js';
import { steady } from './helpers.mjs';

const END = '2026-12-20';
const patch = (rows, d, p) => rows.map((r) => (r.day === d ? { ...r, ...p } : r));

test('the notification function uses an exact copy of the app\'s readiness logic', () => {
  // supabase/functions/life-push/readiness.js is a copy of life/js/readiness.js (a function bundle cannot import from
  // the app folder). If this fails, copy the app file over the function's copy and redeploy.
  const app = fs.readFileSync(new URL('../js/readiness.js', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../../supabase/functions/life-push/readiness.js', import.meta.url), 'utf8');
  assert.equal(fn, app);
});

test('Easy names the weakest number and what to do about today\'s session', () => {
  const { sleep, days } = steady(END, 40);
  const r = readiness(END, patch(sleep, END, { sleep_s: 5 * 3600, hrv_last_night: 40 }), patch(days, END, { resting_hr: 60 }));
  const withSession = readinessLine(r, true), without = readinessLine(r, false);
  assert.match(withSession, /^Readiness \d+, Easy\. Weakest: .+\. Go easy on today's session, or swap it\.$/);
  assert.match(without, /Keep today light\.$/);
  assert.doesNotMatch(without, /session/);
});

test('Push and Normal are short', () => {
  const { sleep, days } = steady(END, 40);
  const push = readiness(END, patch(sleep, END, { sleep_s: 9 * 3600, hrv_last_night: 75 }), patch(days, END, { resting_hr: 49 }));
  assert.match(readinessLine(push, true), /^Readiness \d+, Push\. Good day to hit it\.$/);
  assert.match(readinessLine(readiness(END, sleep, days), true), /^Readiness \d+, Normal\.$/);
});

test('no result means no line', () => {
  assert.equal(readinessLine(null, true), null);
  const { sleep, days } = steady(END, 4); // not enough history
  assert.equal(readinessLine(readiness(END, sleep, days), true), null);
});
