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

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: SUPABASE_SCHEMA
  },
  auth: {
    storageKey: 'fitness-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
