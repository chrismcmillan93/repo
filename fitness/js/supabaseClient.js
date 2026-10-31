import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from './config.js';

if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  throw new Error('Supabase JS library not loaded — check the CDN <script> tag in index.html.');
}

// Redirect back to wherever the sign-in link was requested from, matching
// the pattern used by usa/goals elsewhere in this repo -- but normalized to
// always end in a trailing slash (and never "index.html"). Supabase checks
// this URL against the Auth "Redirect URLs" allow-list as an exact string;
// this app is only ever whitelisted as ".../fitness/" (trailing slash), so
// a visitor who lands on "/fitness" (no slash) or "/fitness/index.html"
// would otherwise generate a redirect URL that doesn't match the allow-list
// entry, silently falling back to the project's Site URL instead -- which
// drops the auth token and looks exactly like "the link didn't work, it
// just took me back to the sign-in page".
function normalizedRedirectPath(pathname){
  let path = pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/')) path += '/';
  return path;
}

export const REDIRECT_URL = window.location.origin + normalizedRedirectPath(window.location.pathname);

// One sign-in for Goals and Fitness: both apps read/write the session under
// this shared key (goals/js/supabaseClient.js has the same block — keep
// them in sync). Same project and same account, so one session serves both.
// Each app's old per-app key is adopted once and then deleted — if it were
// left behind, signing out would just re-adopt it on the next load.
const SHARED_AUTH_KEY = 'cm-apps-auth';
const LEGACY_AUTH_KEYS = ['fitness-auth', 'goals-tracker-auth'];
try {
  if (!localStorage.getItem(SHARED_AUTH_KEY)) {
    const legacy = LEGACY_AUTH_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (legacy) localStorage.setItem(SHARED_AUTH_KEY, legacy);
  }
  LEGACY_AUTH_KEYS.forEach((k) => localStorage.removeItem(k));
} catch (_) { /* storage blocked (private mode etc.) — just sign in normally */ }

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: SUPABASE_SCHEMA
  },
  auth: {
    storageKey: SHARED_AUTH_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
