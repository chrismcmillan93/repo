// Life is a fresh plan that begins on 28 November 2026 (the Edale plan itself starts 30 Nov). Nothing before that date is shown,
// counted or prompted for: history reads are floored to this day, nothing earlier can be
// stepped back to, and until then the app shows a holding screen (see main.js) and sends no
// reminders (the same date is in supabase/functions/life-push). Pure, so it can be tested alone.
export const LIFE_START = '2026-11-28';
export const beforeStart = (today) => today < LIFE_START;
export const floorDate = (d) => (d && d < LIFE_START ? LIFE_START : d);
export const floorIso = (iso) => (iso && iso < `${LIFE_START}T00:00:00.000Z` ? `${LIFE_START}T00:00:00.000Z` : iso);
// The Monday of the week containing the start: the earliest week a week screen may open on.
const monday = (d) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
export const FIRST_WEEK = monday(LIFE_START);
export const floorWeek = (ws) => (ws && ws < FIRST_WEEK ? FIRST_WEEK : ws);
