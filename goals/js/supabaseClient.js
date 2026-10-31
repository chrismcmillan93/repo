// Supabase client for the Goals & Progress app.
//
// This shares a Supabase project (and therefore an origin, and therefore
// localStorage) with the other apps in this repo. The session lives under an
// explicit storageKey shared only with the Fitness app (see below), never
// the default slot anything else on this origin might use.
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

// One sign-in for Goals and Fitness: both apps read/write the session under
// this shared key (fitness/js/supabaseClient.js has the same block — keep
// them in sync). Same project and same account, so one session serves both.
// Each app's old per-app key is adopted once and then deleted — if it were
// left behind, signing out would just re-adopt it on the next load.
const SHARED_AUTH_KEY = 'cm-apps-auth';
const LEGACY_AUTH_KEYS = ['goals-tracker-auth', 'fitness-auth'];
try {
  if (!localStorage.getItem(SHARED_AUTH_KEY)) {
    const legacy = LEGACY_AUTH_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (legacy) localStorage.setItem(SHARED_AUTH_KEY, legacy);
  }
  LEGACY_AUTH_KEYS.forEach((k) => localStorage.removeItem(k));
} catch (_) { /* storage blocked (private mode etc.) — just sign in normally */ }

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'goals'
  },
  auth: {
    storageKey: SHARED_AUTH_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
