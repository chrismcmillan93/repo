// Pure matching helpers for the trip panel (no browser or network, so they can be tested alone).
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-11-22' -> '22 Nov' (the Thailand app's day label).
export function dayLabel(iso){ const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}`; }

// 'Wed 18 Nov · 15:00' -> { date: '2026-11-18', time: '15:00' } (year given), or null.
export function parseLabel(label, year){
  const m = String(label || '').match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
  if (!m) return null;
  const t = String(label).match(/(\d{1,2}:\d{2})/);
  return { date: `${year}-${String(MON.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`, time: t ? t[1] : '' };
}

// Where you're sleeping: check-in day, check-out day, or tonight. stays: [{ name, in, out }] (labels).
export function stayToday(stays, today, year){
  for (const s of stays) {
    const a = parseLabel(s.in, year), b = parseLabel(s.out, year);
    if (!a || !b) continue;
    if (today === a.date) return { name: s.name, address: s.address || '', note: `Check in${a.time ? ` from ${a.time}` : ''}` };
    if (today === b.date) return { name: s.name, address: s.address || '', note: `Check out${b.time ? ` by ${b.time}` : ''}` };
    if (today > a.date && today < b.date) return { name: s.name, address: s.address || '', note: 'Staying tonight' };
  }
  return null;
}

// Timed entries first by time, then the untimed ones in their own order.
export function orderEntries(rows){
  const timed = rows.filter((r) => /^\d{1,2}:\d{2}/.test(r.time || '')).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : (a.order || 0) - (b.order || 0)));
  return [...timed, ...rows.filter((r) => !timed.includes(r)).sort((a, b) => (a.order || 0) - (b.order || 0))];
}

