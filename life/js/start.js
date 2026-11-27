// Life is a fresh plan that begins on Monday 30 November 2026 (the same day the Edale plan starts). Nothing before that
// date is shown, counted or prompted for: history reads are floored to this day, nothing earlier can be stepped back to,
// and no reminders go out before it (the same date is in supabase/functions/life-push). Before the date the app is open
// for setup and behaves as if today were this day (`todayStr()` in fit/utils.js is clamped to it), with a banner saying so.
// Pure, so it can be tested alone.
export const LIFE_START = '2026-11-30';
export const beforeStart = (today) => today < LIFE_START;
export const floorDate = (d) => (d && d < LIFE_START ? LIFE_START : d);
export const floorIso = (iso) => (iso && iso < `${LIFE_START}T00:00:00.000Z` ? `${LIFE_START}T00:00:00.000Z` : iso);
// The Monday of the week containing the start: the earliest week a week screen may open on.
const monday = (d) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
export const FIRST_WEEK = monday(LIFE_START);
export const floorWeek = (ws) => (ws && ws < FIRST_WEEK ? FIRST_WEEK : ws);
