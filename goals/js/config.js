// This is the LIVE app. Temporary preview switch: while true, sign-in is
// skipped entirely and the app runs against an empty in-memory dataset
// (blankData.js) instead of the live Supabase project — so the real,
// data-free UI can be seen before the schema is exposed and auth is
// configured (§8). No sample content lives here — see /goals/demo/ for that.
//
// TO GO LIVE FOR REAL: set this back to false once §8's Supabase settings
// are done. Nothing else needs to change — db.js and main.js both read
// this one flag.
export const DEMO_MODE = true;
