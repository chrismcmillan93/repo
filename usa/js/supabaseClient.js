import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from './config.js';

if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  throw new Error('Supabase JS library not loaded — check the CDN <script> tag in index.html.');
}

// Redirect back to wherever the sign-in link was requested from, matching
// the pattern used by goals/wainwrights elsewhere in this repo.
export const REDIRECT_URL = window.location.origin + window.location.pathname;

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: SUPABASE_SCHEMA
  },
  auth: {
    storageKey: 'usa-trip-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
