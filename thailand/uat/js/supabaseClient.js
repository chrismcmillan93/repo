import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from './config.js';

if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  throw new Error('Supabase JS library not loaded — check the CDN <script> tag in index.html.');
}

// No auth.* config here (unlike usa/js/supabaseClient.js) — this app has no
// sign-in flow, just the anon key against the thailand_uat schema. See config.js.
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: SUPABASE_SCHEMA }
});
