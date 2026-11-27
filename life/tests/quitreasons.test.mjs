import test from 'node:test';
import assert from 'node:assert/strict';
import { readingList, pickToday, seedOf, format, cleanReason, MAX_LEN, MAX_SOURCE } from '../js/quitReasons.js';

const r = (id, body, extra = {}) => ({ id, kind: 'reason', body, source: '', created_at: `2026-12-0${id}T10:00:00Z`, ...extra });

test('the original why is the first reason, then added ones in the order added', () => {
  const list = readingList('Be there for the 50k', [r(3, 'third'), r(1, 'first'), r(2, 'second', { kind: 'quote', source: 'Someone' })]);
  assert.deepEqual(list.map((x) => x.body), ['Be there for the 50k', 'first', 'second', 'third']);
  assert.equal(list[0].id, null); // the original why is edited in Edit, not deleted here
  assert.equal(list[2].kind, 'quote');
});

test('no why and no reasons gives an empty list and nothing to show', () => {
  assert.deepEqual(readingList('', []), []);
  assert.deepEqual(readingList('   ', null), []);
  assert.equal(pickToday([], '2026-12-10', 0), null);
});

test('one a day: steady within a day, moves on the next, and cycles through them all', () => {
  const list = readingList('', [r(1, 'a'), r(2, 'b'), r(3, 'c')]);
  assert.equal(pickToday(list, '2026-12-10', 0).body, pickToday(list, '2026-12-10', 0).body);
  const seen = new Set(['2026-12-10', '2026-12-11', '2026-12-12'].map((d) => pickToday(list, d, 0).body));
  assert.equal(seen.size, 3);
  assert.notEqual(pickToday(list, '2026-12-10', 0).body, pickToday(list, '2026-12-11', 0).body);
});

test('different things you are giving up are not in lockstep', () => {
  assert.notEqual(seedOf('11111111-aaaa'), seedOf('22222222-bbbb'));
  assert.equal(seedOf('same'), seedOf('same'));
  assert.equal(seedOf(null), 0);
});

test('formatting: a quote shows its author, a reason does not', () => {
  assert.equal(format({ body: 'It always seems impossible until it is done', source: 'Nelson Mandela' }), '“It always seems impossible until it is done” — Nelson Mandela');
  assert.equal(format({ body: 'For the 50k', source: '' }), '“For the 50k”');
});

test('cleanReason trims, caps and ignores the author on a plain reason', () => {
  assert.equal(cleanReason({ kind: 'reason', body: '   ', source: '' }), null);
  assert.equal(cleanReason({ kind: 'quote', body: null }), null);
  assert.deepEqual(cleanReason({ kind: 'reason', body: ' stay hard ', source: 'ignored' }), { kind: 'reason', body: 'stay hard', source: '' });
  assert.deepEqual(cleanReason({ kind: 'quote', body: 'x', source: ' Me ' }), { kind: 'quote', body: 'x', source: 'Me' });
  assert.equal(cleanReason({ kind: 'reason', body: 'y'.repeat(500) }).body.length, MAX_LEN);
  assert.equal(cleanReason({ kind: 'quote', body: 'x', source: 'z'.repeat(200) }).source.length, MAX_SOURCE);
  assert.equal(cleanReason({ kind: 'weird', body: 'x' }).kind, 'reason');
});
