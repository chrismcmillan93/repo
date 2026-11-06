// os-token — hands a signed-in user a short-lived Ordnance Survey (OS Data Hub)
// OAuth2 access token, so the browser can fetch OS map tiles and OS Names
// results directly without the project API key or secret ever reaching it.
//
// PROJECT: walking-up-hills (jyxtduvkmztexwurrjsf).
// Secrets: OS_API_KEY and OS_API_SECRET (the OS Data Hub project key/secret).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deployed with verify_jwt=false: the function authenticates the caller itself
// via auth.getUser(token) below, same as drive-times.
//
// OS's own guidance: only hand tokens to logged-in users. A token lasts about
// five minutes, so the page asks again shortly before it expires. The token is
// cached in memory here and reused across callers until it is nearly expired,
// which keeps this to roughly one OS call every few minutes however many
// people are using the map.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TOKEN_URL = "https://api.os.uk/oauth2/token/v1";
const MIN_REMAINING_MS = 60_000; // never hand out a token with under a minute left

let cached: { token: string; expiresAt: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
  if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);

  const key = Deno.env.get("OS_API_KEY");
  const secret = Deno.env.get("OS_API_SECRET");
  if (!key || !secret) {
    return json({ error: "not_configured", message: "OS_API_KEY / OS_API_SECRET secrets are not set yet." }, 503);
  }

  const now = Date.now();
  if (!cached || cached.expiresAt - now < MIN_REMAINING_MS) {
    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${key}:${secret}`),
        },
        body: "grant_type=client_credentials",
      });
    } catch {
      return json({ error: "os_unreachable" }, 502);
    }
    if (!res.ok) return json({ error: "os_rejected", status: res.status }, 502);
    const body = await res.json().catch(() => null);
    const token = body?.access_token;
    const ttl = Number(body?.expires_in);
    if (typeof token !== "string" || !Number.isFinite(ttl)) return json({ error: "os_bad_response" }, 502);
    cached = { token, expiresAt: now + ttl * 1000 };
  }

  return json({ access_token: cached.token, expires_in: Math.floor((cached.expiresAt - now) / 1000) });
});
