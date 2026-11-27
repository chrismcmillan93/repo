// Progress pictures: only the *log* of when a set was taken (a date and a short note); the pictures
// themselves never touch the app. Pure functions (no network), so they can be tested on their own.
//
// pics: [{ taken_on: 'YYYY-MM-DD', note }]. A set is due again after DUE_DAYS. With none taken yet,
// the first reminder comes at the end of the first week from the start (a starting set is worth having,
// but not on day one).
const DAY = 864e5;
const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);

export const DUE_DAYS = 14;
export const FIRST_DUE_DAYS = 6;

export function picsStatus(pics, today, start){
  const last = (pics || []).map((p) => p.taken_on).filter((d) => d <= today).sort().pop() || null;
  const since = last ? diff(last, today) : null;
  const overdue = last ? since >= DUE_DAYS : diff(start, today) >= FIRST_DUE_DAYS;
  let nudge = '';
  if (overdue) nudge = last ? `Progress pictures: last taken ${since} day${since === 1 ? '' : 's'} ago. Time for a new set.` : 'Progress pictures: none taken yet. Take a starting set this week so you have something to compare with.';
  const line = last ? (since === 0 ? 'Last taken today.' : `Last taken ${since} day${since === 1 ? '' : 's'} ago.`) : 'None logged yet.';
  return { last, since, overdue, nudge, line };
}

// Was a set taken in the week from `from` to `to` (inclusive)?
export const takenInWeek = (pics, from, to) => (pics || []).some((p) => p.taken_on >= from && p.taken_on <= to);
