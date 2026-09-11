// Supabase connection for the Thailand trip tracker (UAT rebuild).
//
// Shares the same `dashboards-new` Supabase project as usa/ and goals/ — this
// app's own dedicated schema is `thailand_uat`, isolated from `public` (where the
// live thailand/index.html still reads/writes item_data/checkbox_states), `usa`
// and `goals`. See CLAUDE.md.
//
// NOTE: the `thailand_uat` schema must be added to Project Settings -> Data API ->
// "Exposed schemas" in the Supabase dashboard before this app can reach it —
// same one-time manual step the `usa` schema needed.

export const SUPABASE_URL = 'https://bcrmbuiuekklpocpllpw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcm1idWl1ZWtrbHBvY3BsbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NzcsImV4cCI6MjEwMDc0NTU3N30.T4HIbLeAEtPVhV4JKz5HaxEJWqT_5FqdDqT7PJU2YTM';
export const SUPABASE_SCHEMA = 'thailand_uat';

// This app has no per-account auth (see CLAUDE.md "Thailand tracker (UAT rebuild)")
// — it's one shared trip used by the whole group via the anon key, same trust
// model the live thailand/index.html already uses today. The PIN gate that used
// to sit in front of this (js/main.js) is removed for now, same as the live app
// ("Passcode lock removed for now — app starts directly") — the RLS policies
// grant the anon key full access regardless of any client-side gate.
