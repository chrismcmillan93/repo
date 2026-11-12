// Swapping planned sessions between two days of the same week.
//
// Storage model (fitness.day_swaps): a row means "on log_date, do the planned
// session that belongs to source_date". Swapping Tue and Wed stores
// Tue <- Wed and Wed <- Tue. Swaps are applied to what each day currently
// shows (so swapping an already-swapped day just permutes the week again), and
// a day that ends up showing its own session has no row. The plan is never
// edited. Ticks, picks, weight and notes stay on the calendar date, not the
// session: ticking Tuesday as done after swapping means "I did what Tuesday
// now says".
import { escapeHtml, formatDateShort, formatDayLabel } from './utils.js';
import { db } from './db.js';

// date -> the date whose planned session it shows.
export function sourcesFor(dates, swaps){
  const bySwap = Object.fromEntries((swaps || []).map((s) => [s.log_date, s.source_date]));
  return Object.fromEntries(dates.map((d) => [d, bySwap[d] && dates.includes(bySwap[d]) ? bySwap[d] : d]));
}

// The planned session a date effectively shows after swaps (or null).
export function effectiveDay(date, sources, planByDate){
  return planByDate[sources[date] || date] || null;
}

export function sessionLabel(day){
  return day ? day.session : 'Nothing planned';
}

// Swap what dates a and b show, persist, and return the new swap rows for the week.
export async function swapDays(userId, dates, swaps, a, b){
  if (a === b || !dates.includes(a) || !dates.includes(b)) throw new Error('Pick two different days in the same week.');
  const src = sourcesFor(dates, swaps);
  [src[a], src[b]] = [src[b], src[a]];
  const upserts = [];
  const removals = [];
  [a, b].forEach((d) => (src[d] === d ? removals.push(d) : upserts.push({ log_date: d, source_date: src[d] })));
  await db.daySwaps.upsertMany(userId, upserts);
  await db.daySwaps.removeMany(userId, removals);
  return dates.filter((d) => src[d] !== d).map((d) => ({ log_date: d, source_date: src[d] }));
}

export async function resetWeek(userId, dates){
  await db.daySwaps.removeMany(userId, dates);
}

// <option>s for choosing a day in the week, each labelled with its current session.
export function dayOptionsHtml(dates, sources, planByDate, { exclude = null, selected = null } = {}){
  return dates.filter((d) => d !== exclude).map((d) => {
    const label = `${formatDayLabel(d).slice(0, 3)} ${formatDateShort(d).replace(/^\w+ /, '')} — ${sessionLabel(effectiveDay(d, sources, planByDate))}`;
    return `<option value="${escapeHtml(d)}" ${d === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}
