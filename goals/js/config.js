// This is the LIVE app — v1. Real Supabase backend, real magic-link
// sign-in. DEMO_MODE is off: db.js talks to the real project (see
// supabaseClient.js) and every table is scoped by RLS to whoever is
// actually signed in.
//
// If you ever need to preview a change here without touching real data,
// flip this to true temporarily — main.js will skip sign-in and db.js
// will run against an empty in-memory dataset (blankData.js) instead.
// Don't leave it true by accident: nothing entered in that mode is saved.
export const DEMO_MODE = false;
