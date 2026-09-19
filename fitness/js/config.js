// Supabase connection for the fitness tracker.
//
// Shares the `dashboards-new` project (and therefore an origin, and
// therefore localStorage) with usa/goals/thailand_uat in this repo -- each
// app gets its own schema and its own auth storageKey (see
// supabaseClient.js) so signing in here never collides with those apps.
//
// NOTE: the `fitness` schema must be added to Project Settings -> Data API
// -> "Exposed schemas" in the Supabase dashboard before this app can reach
// it -- see fitness/CLAUDE.md.

export const SUPABASE_URL = 'https://bcrmbuiuekklpocpllpw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcm1idWl1ZWtrbHBvY3BsbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NzcsImV4cCI6MjEwMDc0NTU3N30.T4HIbLeAEtPVhV4JKz5HaxEJWqT_5FqdDqT7PJU2YTM';
export const SUPABASE_SCHEMA = 'fitness';
