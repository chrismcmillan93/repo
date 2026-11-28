// Books (Lists -> Books): read or listen to. Pure functions (no network), so they can be tested on their own.
// A book is a `book` or an `audio` (audiobook). The stage is `to_read` -> `reading` -> `read`, and the words follow the
// format: To read / Reading / Read for a book, To listen / Listening / Listened for an audiobook.
export const MAX_TITLE = 200, MAX_AUTHOR = 120;

const LABELS = {
  book: { to_read: 'To read', reading: 'Reading', read: 'Read' },
  audio: { to_read: 'To listen', reading: 'Listening', read: 'Listened' }
};
export const stageLabel = (status, format) => (LABELS[format === 'audio' ? 'audio' : 'book'][status] || '');
export const NEXT = { to_read: 'reading', reading: 'read', read: 'to_read' };

// What the add form may save, or null without a title. `goal` is a goal id or ''.
export function cleanBook({ title, author, format, status, goal, playbook_key }){
  const t = String(title || '').trim().slice(0, MAX_TITLE);
  if (!t) return null;
  const st = status === 'reading' ? 'reading' : 'to_read';
  return {
    title: t, author: String(author || '').trim().slice(0, MAX_AUTHOR), format: format === 'audio' ? 'audio' : 'book', status: st,
    goal_id: goal || null, playbook_key: playbook_key || null, started_on: null, sort_order: 0
  };
}

// The change a tap on the stage makes. Starting sets the started date, finishing sets the finished date and the rating
// (1-5, or none), and going back from read clears the dates and rating.
export function advance(book, today, rating = null){
  if (book.status === 'to_read') return { status: 'reading', started_on: today };
  if (book.status === 'reading') {
    const r = Number(rating);
    return { status: 'read', finished_on: today, started_on: book.started_on || today, rating: r >= 1 && r <= 5 ? Math.round(r) : null };
  }
  return { status: 'to_read', started_on: null, finished_on: null, rating: null };
}

const byCreated = (a, b) => (a.created_at || '').localeCompare(b.created_at || '');

// The three groups the list shows: now (reading and listening kept apart), up next, and finished (newest first).
export function groupBooks(books){
  const list = books || [];
  const now = list.filter((b) => b.status === 'reading').sort(byCreated);
  return {
    reading: now.filter((b) => b.format !== 'audio'),
    listening: now.filter((b) => b.format === 'audio'),
    upNext: list.filter((b) => b.status === 'to_read').sort((a, b) => (a.sort_order - b.sort_order) || byCreated(a, b)),
    finished: list.filter((b) => b.status === 'read').sort((a, b) => (b.finished_on || '').localeCompare(a.finished_on || '') || byCreated(b, a))
  };
}

export function counts(books){
  const g = groupBooks(books);
  return { now: g.reading.length + g.listening.length, upNext: g.upNext.length, finished: g.finished.length, all: (books || []).length };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Playbook books you have not added yet (matched by Playbook key, else by title). `pillars` is playbookContent's PILLARS.
export function playbookSuggestions(pillars, books){
  const haveKey = new Set((books || []).map((b) => b.playbook_key).filter(Boolean));
  const haveTitle = new Set((books || []).map((b) => norm(b.title)));
  const out = [];
  (pillars || []).forEach((p) => (p.books || []).forEach((b) => {
    if (!haveKey.has(b.key) && !haveTitle.has(norm(b.title))) out.push({ key: b.key, title: b.title, author: b.author || '', pillar: p.title });
  }));
  return out;
}

// A short line for a finished book: stars and the finished date, e.g. "★★★★☆ · listened, finished 12 Nov".
export function finishedLine(book, fmtDate){
  const stars = book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : '';
  const word = book.format === 'audio' ? 'listened' : 'read';
  return [stars, book.finished_on ? `${word}, finished ${fmtDate(book.finished_on)}` : word].filter(Boolean).join(' · ');
}
