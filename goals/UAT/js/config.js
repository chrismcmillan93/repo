// This is the UAT app — starts identical to live. Every feature/change the
// user requests lands here first; live stays untouched until something is
// promoted from here. Temporary preview switch: while true, sign-in is
// skipped entirely and the app runs against an empty in-memory dataset
// (blankData.js) instead of a live Supabase project.
//
// TO GO LIVE FOR REAL: set this back to false once a real Supabase project
// for UAT (or promotion to the live project) is ready. Nothing else needs
// to change — db.js and main.js both read this one flag.
export const DEMO_MODE = true;
