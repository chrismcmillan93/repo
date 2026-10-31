// drive-times — driving miles and minutes from a user's saved (snapped)
// home point to each walk start, for the fell planner.
//
// PROJECT: walking-up-hills (jyxtduvkmztexwurrjsf).
// Secret: ORS_API_KEY (openrouteservice.org, free tier). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deployed with verify_jwt=false: the function authenticates the caller
// itself via auth.getUser(token) below (works with the project's new API keys).
//
// The browser sends the walk start points it wants times for; the origin is
// always read server-side from planner_user_location, never trusted from the
// request. Results are cached per user in planner_drive_times and reused
// until the saved point changes, so the free ORS quota is barely touched.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Start = { key: string; lat: number; lng: number };
const MAX_STARTS = 80;
const inArea = (s: Start) => s.lat > 53.8 && s.lat < 55.2 && s.lng > -3.8 && s.lng < -2.2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);
  const userId = userData.user.id;

  const orsKey = Deno.env.get("ORS_API_KEY");
  if (!orsKey) return json({ error: "not_configured", message: "ORS_API_KEY secret is not set yet." }, 503);

  let body: { starts?: Start[] };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const starts = (body.starts ?? [])
    .filter((s) => s && typeof s.key === "string" && s.key.length <= 60 && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .filter(inArea)
    .slice(0, MAX_STARTS);
  if (!starts.length) return json({ error: "bad_request", message: "No valid start points." }, 400);

  const { data: loc } = await admin.from("planner_user_location")
    .select("lat, lng").eq("user_id", userId).maybeSingle();
  if (!loc) return json({ error: "no_location" }, 400);
  const oLat = Number(loc.lat), oLng = Number(loc.lng);

  const { data: cached } = await admin.from("planner_drive_times")
    .select("start_key, miles, minutes, origin_lat, origin_lng")
    .eq("user_id", userId)
    .in("start_key", starts.map((s) => s.key));
  const fresh = new Map<string, { miles: number | null; minutes: number | null }>();
  for (const c of cached ?? []) {
    if (Number(c.origin_lat) === oLat && Number(c.origin_lng) === oLng) {
      fresh.set(c.start_key, { miles: c.miles === null ? null : Number(c.miles), minutes: c.minutes });
    }
  }
  const todo = starts.filter((s) => !fresh.has(s.key));

  if (todo.length) {
    const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST",
      headers: { Authorization: orsKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        locations: [[oLng, oLat], ...todo.map((s) => [s.lng, s.lat])],
        sources: [0],
        destinations: todo.map((_, i) => i + 1),
        metrics: ["distance", "duration"],
        units: "mi",
      }),
    });
    if (!res.ok) {
      const status = res.status === 429 ? "rate_limited" : "routing_failed";
      return json({ error: status, message: `Routing service returned HTTP ${res.status}`, times: Object.fromEntries(fresh) }, 502);
    }
    const m = await res.json();
    const durations: (number | null)[] = m?.durations?.[0] ?? [];
    const distances: (number | null)[] = m?.distances?.[0] ?? [];
    const rows = todo.map((s, i) => {
      const miles = distances[i] == null ? null : Math.round(distances[i]! * 10) / 10;
      const minutes = durations[i] == null ? null : Math.round(durations[i]! / 60);
      fresh.set(s.key, { miles, minutes });
      return { user_id: userId, start_key: s.key, origin_lat: oLat, origin_lng: oLng, miles, minutes, computed_at: new Date().toISOString() };
    });
    const { error } = await admin.from("planner_drive_times").upsert(rows, { onConflict: "user_id,start_key" });
    if (error) console.error("cache write failed", error.message);
  }

  return json({ times: Object.fromEntries(fresh) });
});
