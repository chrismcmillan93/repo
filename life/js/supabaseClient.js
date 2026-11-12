import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from './config.js';

if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  throw new Error('Supabase JS library not loaded. Check the CDN <script> tag in index.html.');
}

// Always ".../life/" (trailing slash, never index.html): Supabase matches the
// redirect against the Auth allow-list as an exact string.
function normalizedRedirectPath(pathname){
  let path = pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/')) path += '/';
  return path;
}
export const REDIRECT_URL = window.location.origin + normalizedRedirectPath(window.location.pathname);

// One sign-in shared with Goals and Fitness: same project, same account, same
// storage key (see fitness/js/supabaseClient.js). Signing out of one signs out of all.
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: SUPABASE_SCHEMA },
  auth: { storageKey: 'cm-apps-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
