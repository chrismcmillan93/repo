// Supabase client for the Goals & Progress app.
//
// This shares a Supabase project (and therefore an origin, and therefore
// localStorage) with the anonymous Naples/Thailand dashboards elsewhere in
// this repo. Those dashboards never call any auth method, so today there is
// no live collision — but we still pin an explicit, distinct storageKey so
// this app's session token can never be written to, or read from, the same
// localStorage slot as anything else on this origin, now or if that changes.
//
// db.schema scopes every query through this client at `goals.*` — the
// anon/publishable key below is the same one used by the dashboards; access
// is controlled by RLS + the exposed-schemas setting, not by which key is used.

export const SUPABASE_URL = 'https://bcrmbuiuekklpocpllpw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcm1idWl1ZWtrbHBvY3BsbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NzcsImV4cCI6MjEwMDc0NTU3N30.T4HIbLeAEtPVhV4JKz5HaxEJWqT_5FqdDqT7PJU2YTM';

// Redirect back to wherever the sign-in link was requested from, not always
// the home page — matches the pattern used by the Wainwrights tracker.
export const REDIRECT_URL = window.location.origin + window.location.pathname;

if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  throw new Error('Supabase JS library not loaded — check the CDN <script> tag in index.html.');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'goals'
  },
  auth: {
    storageKey: 'goals-tracker-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
