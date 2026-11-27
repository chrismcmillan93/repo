// Races: adding your own, planned vs booked, and free-text results. Pure functions (no network), so they can be tested
// on their own. The data lives in the `fitness` schema (`races`, `race_booked`, `race_results`); see views/events.js.
//
// A result time is free text, kept exactly as you typed it ("52:14", "1h 52m", "4:12:30 chip"), so any keyboard works.
// Seconds are worked out when the text is clearly a time, and kept for compatibility with older results (the old column
// held whole seconds); nothing in the app depends on them.
export const MAX_NAME = 100, MAX_DISTANCE = 60, MAX_NOTE = 120, MAX_TIME = 40, MAX_RESULT_NOTE = 300;

// "52:14" -> 3134, "1:52:14" -> 6734, "1h 52m 14s" -> 6734, "52m" -> 3120, "4h12" -> 15120. Anything else -> null.
// Two colon parts are minutes:seconds (so write 1:52:00 for an hour and 52 minutes).
export function parseTime(text){
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (/^\d{1,3}(:\d{1,2}){1,2}(\.\d+)?$/.test(t)) {
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p > 59) || parts.some((p) => Number.isNaN(p))) return null;
    return Math.round(parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]);
  }
  const m = t.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?$/);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  const hm = t.match(/^(\d+)\s*h\s*(\d{1,2})$/);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;
  return null;
}

// 3041 -> "50:41", 6734 -> "1:52:14" (under an hour reads as minutes:seconds).
const hms = (s) => (s < 3600 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`);

// What to show for a result row: the text as typed, else the old whole-seconds value as h:mm:ss, else nothing.
export function resultText(r){
  if (!r) return '';
  const text = String(r.finish_time_text || '').trim();
  if (text) return text;
  return r.finish_time_seconds != null ? hms(Number(r.finish_time_seconds)) : '';
}

// What the result form may save, or null when there is no time.
export function cleanResult({ time, notes }){
  const text = String(time || '').trim().slice(0, MAX_TIME);
  if (!text) return null;
  return { finish_time_text: text, finish_time_seconds: parseTime(text), notes: String(notes || '').trim().slice(0, MAX_RESULT_NOTE) || null };
}

// What the add-a-race form may save (the booked flag is stored separately, per user), or null if name or date is missing.
export function cleanRace({ name, date, distance, note, start_time }){
  const n = String(name || '').trim().slice(0, MAX_NAME);
  if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const time = String(start_time || '').trim();
  return {
    plan_version: 'v2', name: n, race_date: date, distance_label: String(distance || '').trim().slice(0, MAX_DISTANCE) || null,
    role: String(note || '').trim().slice(0, MAX_NOTE) || null, start_time: /^\d{1,2}:\d{2}$/.test(time) ? time : null, status: 'planned', sort_order: 0
  };
}

// A race's state for display. Booked = your own flag if you set one, otherwise the plan's `entered` status (so the Edale
// 50km starts as booked). Past or today with no result means it is waiting for a result.
export function raceState(race, bookedBy, resultBy, today){
  const flag = bookedBy ? bookedBy[race.id] : undefined;
  const booked = flag != null ? !!flag : race.status === 'entered';
  const hasResult = !!(resultBy && resultBy[race.id]);
  return { booked, hasResult, past: race.race_date <= today, needsResult: race.race_date <= today && !hasResult };
}
