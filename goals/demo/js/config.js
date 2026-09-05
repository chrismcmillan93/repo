// Temporary preview switch. While true, the app skips sign-in entirely and
// runs against realistic in-memory sample data instead of the live Supabase
// project — so the UI can be seen before the schema is exposed and auth is
// configured (§8).
//
// TO RE-ENABLE REAL SIGN-IN: set this back to false. Nothing else needs to
// change — db.js and main.js both read this one flag.
export const DEMO_MODE = true;
