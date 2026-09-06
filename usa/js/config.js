// Supabase connection for the USA 2027 trip planner.
//
// This shares a Supabase project (and therefore an origin, and therefore
// localStorage) with the other anonymous dashboards and apps in this repo.
// None of them use auth today, so there's no live collision, but this app
// still doesn't touch localStorage for anything auth-shaped.
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
