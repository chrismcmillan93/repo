// Supabase connection for the Thailand trip tracker.
//
// Shares the same `dashboards-new` Supabase project as usa/ and goals/ — this
// app's own dedicated schema is `thailand`, isolated from `public` (where the
// retired thailand/legacy/index.html used to read/write item_data/checkbox_states),
// `usa` and `goals`. See CLAUDE.md.
//
// NOTE: the `thailand` schema must be in Project Settings -> Data API -> "Exposed
// schemas" in the Supabase dashboard before this app can reach it. This schema was
// renamed from `thailand_uat` (2026-09-25, promoting the UAT rebuild to production)
// — if the exposed-schemas list still says `thailand_uat`, update it to `thailand`
// or every PostgREST call here 404s. Not doable via any tool available to Claude.

export const SUPABASE_URL = 'https://bcrmbuiuekklpocpllpw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcm1idWl1ZWtrbHBvY3BsbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NzcsImV4cCI6MjEwMDc0NTU3N30.T4HIbLeAEtPVhV4JKz5HaxEJWqT_5FqdDqT7PJU2YTM';
export const SUPABASE_SCHEMA = 'thailand';

// This app has no per-account auth — it's one shared trip used by the whole
// group via the anon key. There's no PIN gate either (removed 2026-09-11, same
// as the old production app's own history: "Passcode lock removed for now —
// app starts directly") — the RLS policies grant the anon key full access
// regardless, so a client-side gate was never real access control anyway.
