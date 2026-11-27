// Giving up: the reasons and quotes you read on a hard day. Pure functions (no network), so they can be tested
// on their own. The original single "why" on a quit counts as the first reason; added ones follow in the order they
// were added. The card shows one a day (a different one each day, steady within the day, and a different order for
// each thing you are giving up); the craving timer shows them all.
//
// reasons: [{ id, kind ('reason' | 'quote'), body, source, created_at }]
export const MAX_LEN = 280, MAX_SOURCE = 80;

export function readingList(why, reasons){
  const list = [];
  if ((why || '').trim()) list.push({ id: null, kind: 'reason', body: why.trim(), source: '' });
  (reasons || []).slice().sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .forEach((r) => list.push({ id: r.id, kind: r.kind === 'quote' ? 'quote' : 'reason', body: r.body, source: r.source || '' }));
  return list;
}

// A small number from an id, so two things you are giving up do not show their reasons in lockstep.
export const seedOf = (id) => Array.from(String(id || '')).reduce((n, c) => (n + c.charCodeAt(0)) % 9973, 0);

export function pickToday(list, today, seed = 0){
  if (!list.length) return null;
  const day = Math.floor(Date.parse(`${today}T12:00:00Z`) / 864e5);
  return list[(day + seed) % list.length];
}

// How one item reads: a quote with its author, or a reason in quotation marks.
export const format = (item) => (item.source ? `“${item.body}” — ${item.source}` : `“${item.body}”`);

// What the form may save: trimmed, capped, and nothing at all when the text is empty.
export function cleanReason({ kind, body, source }){
  const text = String(body || '').trim().slice(0, MAX_LEN);
  if (!text) return null;
  const k = kind === 'quote' ? 'quote' : 'reason';
  return { kind: k, body: text, source: k === 'quote' ? String(source || '').trim().slice(0, MAX_SOURCE) : '' };
}
