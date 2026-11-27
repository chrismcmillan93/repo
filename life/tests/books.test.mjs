import test from 'node:test';
import assert from 'node:assert/strict';
import { stageLabel, cleanBook, advance, groupBooks, counts, playbookSuggestions, finishedLine, MAX_TITLE } from '../js/books.js';

test('the stage wording follows the format', () => {
  assert.deepEqual(['to_read', 'reading', 'read'].map((s) => stageLabel(s, 'book')), ['To read', 'Reading', 'Read']);
  assert.deepEqual(['to_read', 'reading', 'read'].map((s) => stageLabel(s, 'audio')), ['To listen', 'Listening', 'Listened']);
  assert.equal(stageLabel('reading', undefined), 'Reading'); // unknown format reads as a book
  assert.equal(stageLabel('nonsense', 'book'), '');
});

test('cleanBook needs a title, defaults to a book, and only allows the two starting stages', () => {
  assert.equal(cleanBook({ title: '   ' }), null);
  assert.deepEqual(cleanBook({ title: ' Born to Run ', author: ' Christopher McDougall ', format: 'weird', status: 'read', goal: '' }),
    { title: 'Born to Run', author: 'Christopher McDougall', format: 'book', status: 'to_read', goal_id: null, playbook_key: null, started_on: null, sort_order: 0 });
  const a = cleanBook({ title: 'Atomic Habits', format: 'audio', status: 'reading', goal: 'g1', playbook_key: 'k' });
  assert.equal(a.format, 'audio'); assert.equal(a.status, 'reading'); assert.equal(a.goal_id, 'g1'); assert.equal(a.playbook_key, 'k');
  assert.equal(cleanBook({ title: 'x'.repeat(500) }).title.length, MAX_TITLE);
});

test('advance: start, finish with a rating, and go back', () => {
  assert.deepEqual(advance({ status: 'to_read' }, '2026-12-01'), { status: 'reading', started_on: '2026-12-01' });
  assert.deepEqual(advance({ status: 'reading', started_on: '2026-12-01' }, '2026-12-20', 4), { status: 'read', finished_on: '2026-12-20', started_on: '2026-12-01', rating: 4 });
  assert.equal(advance({ status: 'reading' }, '2026-12-20').rating, null); // skipped the rating
  assert.equal(advance({ status: 'reading' }, '2026-12-20', 9).rating, null); // out of range is ignored
  assert.equal(advance({ status: 'reading' }, '2026-12-20').started_on, '2026-12-20'); // never started explicitly
  assert.deepEqual(advance({ status: 'read' }, 'x'), { status: 'to_read', started_on: null, finished_on: null, rating: null });
});

const b = (id, status, format, extra = {}) => ({ id, title: id, status, format, sort_order: 0, created_at: `2026-12-0${id.length}T10:00:00Z`, ...extra });

test('groups keep reading and listening apart, finished newest first', () => {
  const books = [b('a', 'reading', 'book'), b('bb', 'reading', 'audio'), b('ccc', 'to_read', 'audio'), b('dddd', 'read', 'book', { finished_on: '2026-11-01' }), b('eeeee', 'read', 'audio', { finished_on: '2026-11-20' })];
  const g = groupBooks(books);
  assert.deepEqual(g.reading.map((x) => x.id), ['a']);
  assert.deepEqual(g.listening.map((x) => x.id), ['bb']);
  assert.deepEqual(g.upNext.map((x) => x.id), ['ccc']);
  assert.deepEqual(g.finished.map((x) => x.id), ['eeeee', 'dddd']);
  assert.deepEqual(counts(books), { now: 2, upNext: 1, finished: 2, all: 5 });
  assert.deepEqual(counts(null), { now: 0, upNext: 0, finished: 0, all: 0 });
});

test('playbook suggestions skip books you already have, by key or by title', () => {
  const pillars = [{ title: 'Mindset', books: [{ key: 'meditations', title: 'Meditations', author: 'Marcus Aurelius' }, { key: 'outlive', title: 'Outlive', author: 'Peter Attia' }, { key: 'cant-hurt-me', title: "Can't Hurt Me", author: 'David Goggins' }] }];
  const have = [{ title: 'meditations', playbook_key: null }, { title: 'something else', playbook_key: 'outlive' }];
  assert.deepEqual(playbookSuggestions(pillars, have).map((x) => x.key), ['cant-hurt-me']);
  assert.equal(playbookSuggestions(pillars, []).length, 3);
  assert.equal(playbookSuggestions(pillars, [{ title: "CAN'T  HURT, ME!" }]).length, 2); // punctuation and case do not matter
});

test('finished line shows stars and the right verb', () => {
  const f = (d) => `D${d}`;
  assert.equal(finishedLine({ rating: 4, format: 'audio', finished_on: '12' }, f), '★★★★☆ · listened, finished D12');
  assert.equal(finishedLine({ rating: null, format: 'book', finished_on: '12' }, f), 'read, finished D12');
  assert.equal(finishedLine({ rating: 5, format: 'book', finished_on: null }, f), '★★★★★ · read');
});
