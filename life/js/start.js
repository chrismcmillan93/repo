// Life is a fresh plan that begins on 30 November 2026. Nothing before that date is shown,
// counted or prompted for: history reads are floored to this day, nothing earlier can be
// stepped back to, and until then the app shows a holding screen (see main.js) and sends no
// reminders (the same date is in supabase/functions/life-push). Pure, so it can be tested alone.
export const LIFE_START = '2026-11-30';
export const beforeStart = (today) => today < LIFE_START;
export const floorDate = (d) => (d && d < LIFE_START ? LIFE_START : d);
export const floorIso = (iso) => (iso && iso < `${LIFE_START}T00:00:00.000Z` ? `${LIFE_START}T00:00:00.000Z` : iso);
