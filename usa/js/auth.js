// Magic-link / email-OTP authentication, ported from the goals app's proven
// pattern in this repo.
//
// Two ways to complete sign-in:
//   1. Click the magic link in the email (handled automatically by
//      detectSessionInUrl on the client).
//   2. Type the 6-digit code from the same email — this works even if a
//      link-scanning service (corporate email security, etc.) has already
//      consumed the single-use magic link before the person clicks it.

import { supabase, REDIRECT_URL } from './supabaseClient.js';

/** Send a magic-link + OTP-code email to the given address. */
export async function requestSignIn(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: REDIRECT_URL }
  });
  if (error) throw error;
}

/** Verify the 6-digit code typed in from the sign-in email. */
export async function verifyCode(email, token) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  // On success this fires onAuthStateChange — no need to handle the session here.
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data ? data.session : null;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// Supabase reports sign-in failures (expired/used link, etc.) as params in
// the URL — in the hash fragment for the implicit flow, in the query string
// for PKCE. Surface them instead of silently dropping back to a blank form.
// NOTE: this app also uses the URL hash for routing (#/overview etc.) — an
// auth error redirect lands with its own params in the hash, so this must
// run and be handled *before* the router reads location.hash.
export function readAuthErrorFromUrl() {
  const out = {};
  ['hash', 'search'].forEach((part) => {
    const raw = window.location[part];
    if (!raw || raw.length < 2) return;
    const params = new URLSearchParams(raw.substring(1));
    ['error', 'error_code', 'error_description'].forEach((k) => {
      if (params.get(k) && !out[k]) out[k] = params.get(k);
    });
  });
  return (out.error || out.error_code) ? out : null;
}
