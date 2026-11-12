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
// Offline the app is read-only: the service worker serves the last copy of reads,
// and every save is refused here with a clear message rather than failing vaguely
// (or, worse, looking as if it worked). The day bundle RPC is a read, so it is let through.
function guardedFetch(input, init = {}){
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD' || /\/rpc\/get_day_bundle/.test(url);
  if (!navigator.onLine && !isRead && !/\/auth\/v1\//.test(url)) {
    return Promise.reject(new Error("You're offline, so that wasn't saved. Try again when you have signal."));
  }
  return fetch(input, init);
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: guardedFetch },
  db: { schema: SUPABASE_SCHEMA },
  auth: { storageKey: 'cm-apps-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
