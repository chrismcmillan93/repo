// Pure matching helpers for the trip panel (no browser or network, so they can be tested alone).
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Timed entries first by time, then the untimed ones in their own order.
export function orderEntries(rows){
  const timed = rows.filter((r) => /^\d{1,2}:\d{2}/.test(r.time || '')).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : (a.order || 0) - (b.order || 0)));
  return [...timed, ...rows.filter((r) => !timed.includes(r)).sort((a, b) => (a.order || 0) - (b.order || 0))];
}

