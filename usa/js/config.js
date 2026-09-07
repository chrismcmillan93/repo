// Supabase connection for the USA trip planner.
//
// This shares a Supabase project (and therefore an origin, and therefore
// localStorage) with the other apps in this repo -- goals already uses real
// auth here too. auth.users is project-wide, not per-app: signing in with
// the same email on goals and here resolves to the same account, which is
// expected (same person). A distinct storageKey (see supabaseClient.js)
// keeps this app's session token in its own localStorage slot regardless.
//
// db.schema scopes every query through the client at `usa.*` — the anon key
// below is the same one used everywhere else in this repo; access is
// controlled by RLS + the exposed-schemas setting, not by which key is used.
// NOTE: the `usa` schema must be added to Project Settings -> Data API ->
// "Exposed schemas" in the Supabase dashboard before this app can reach it —
// see CLAUDE.md.

export const SUPABASE_URL = 'https://bcrmbuiuekklpocpllpw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcm1idWl1ZWtrbHBvY3BsbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NzcsImV4cCI6MjEwMDc0NTU3N30.T4HIbLeAEtPVhV4JKz5HaxEJWqT_5FqdDqT7PJU2YTM';
export const SUPABASE_SCHEMA = 'usa';
