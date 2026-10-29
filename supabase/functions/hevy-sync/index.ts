// hevy-sync — mirrors Chris's Hevy workouts into the `fitness` schema.
//
// Called from the Fitness app's Lifting tab (button, or automatically when
// the tab opens and the last sync is older than a few hours). Requires a
// signed-in caller whose email matches HEVY_OWNER_EMAIL, so nobody else
// with an account on this project can pull Chris's data into theirs.
//
// Secrets (Dashboard -> Edge Functions -> Secrets):
//   HEVY_API_KEY      Hevy Pro API key (Hevy app -> Settings -> Developer)
//   HEVY_OWNER_EMAIL  the one account allowed to sync
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
//
// First run: full history via /v1/workouts. Later runs: incremental via
// /v1/workouts/events since the stored high-water mark (handles edits and
// deletes). Exercise templates refresh weekly.

import { createClient } from "jsr:@supabase/supabase-js@2";

const HEVY = "https://api.hevyapp.com/v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hevyGet(path: string, apiKey: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${HEVY}${path}`, { headers: { "api-key": apiKey, accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 1500 * (attempt + 1);
      await sleep(wait);
      continue;
    }
    if (res.status === 404) return null; // Hevy returns 404 for an empty page
    if (!res.ok) throw new Error(`Hevy ${path} -> HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error(`Hevy ${path} kept failing (rate limit or server error)`);
}

// deno-lint-ignore no-explicit-any
function rowsFor(userId: string, w: any) {
  const workout = {
    user_id: userId,
    hevy_id: w.id,
    title: w.title ?? "",
    routine_id: w.routine_id ?? null,
    start_time: w.start_time,
    end_time: w.end_time ?? null,
    hevy_updated_at: w.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
  // deno-lint-ignore no-explicit-any
  const sets = (w.exercises ?? []).flatMap((ex: any) =>
    // deno-lint-ignore no-explicit-any
    (ex.sets ?? []).map((s: any) => ({
      user_id: userId,
      hevy_workout_id: w.id,
      exercise_index: ex.index,
      set_index: s.index,
      exercise_template_id: ex.exercise_template_id,
      exercise_title: ex.title ?? "",
      set_type: s.type ?? "normal",
      weight_kg: s.weight_kg ?? null,
      reps: s.reps ?? null,
      distance_m: s.distance_meters ?? null,
      duration_s: s.duration_seconds ?? null,
      rpe: s.rpe ?? null,
      performed_at: w.start_time,
    }))
  );
  return { workout, sets };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("HEVY_API_KEY");
  const ownerEmail = (Deno.env.get("HEVY_OWNER_EMAIL") ?? "").trim().toLowerCase();
  if (!apiKey || !ownerEmail) {
    return json({ error: "not_configured", message: "HEVY_API_KEY and HEVY_OWNER_EMAIL secrets are not set yet." }, 503);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "fitness" },
    auth: { persistSession: false },
  });

  // Who's calling?
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);
  const user = userData.user;
  if ((user.email ?? "").toLowerCase() !== ownerEmail) return json({ error: "not_allowed" }, 403);

  const runStartedAt = new Date().toISOString();
  let upserted = 0, deleted = 0, templates = 0;

  const saveWorkout = async (w: any) => {
    const { workout, sets } = rowsFor(user.id, w);
    const { error: e1 } = await admin.from("hevy_workouts").upsert(workout, { onConflict: "user_id,hevy_id" });
    if (e1) throw e1;
    // Replace the workout's sets wholesale, so sets removed in Hevy go too.
    const { error: e2 } = await admin.from("hevy_sets").delete().eq("user_id", user.id).eq("hevy_workout_id", w.id);
    if (e2) throw e2;
    if (sets.length) {
      const { error: e3 } = await admin.from("hevy_sets").insert(sets);
      if (e3) throw e3;
    }
    upserted++;
  };

  try {
    // 1. Exercise templates, at most weekly.
    const { data: newestTpl } = await admin.from("hevy_exercise_templates")
      .select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle();
    const weekAgo = Date.now() - 7 * 864e5;
    if (!newestTpl || new Date(newestTpl.synced_at).getTime() < weekAgo) {
      for (let page = 1; ; page++) {
        const body = await hevyGet(`/exercise_templates?page=${page}&pageSize=100`, apiKey);
        const list = body?.exercise_templates ?? [];
        if (!list.length) break;
        // deno-lint-ignore no-explicit-any
        const rows = list.map((t: any) => ({
          id: t.id,
          title: t.title ?? "",
          type: t.type ?? null,
          primary_muscle_group: t.primary_muscle_group ?? null,
          secondary_muscle_groups: t.secondary_muscle_groups ?? [],
          equipment: t.equipment ?? null,
          is_custom: !!t.is_custom,
          synced_at: runStartedAt,
        }));
        const { error } = await admin.from("hevy_exercise_templates").upsert(rows, { onConflict: "id" });
        if (error) throw error;
        templates += rows.length;
        if (page >= (body.page_count ?? page)) break;
      }
    }

    // 2. Workouts: full on first run, incremental after.
    const { data: syncState } = await admin.from("hevy_sync_state")
      .select("last_event_at").eq("user_id", user.id).maybeSingle();

    if (!syncState?.last_event_at) {
      for (let page = 1; ; page++) {
        const body = await hevyGet(`/workouts?page=${page}&pageSize=10`, apiKey);
        const list = body?.workouts ?? [];
        if (!list.length) break;
        for (const w of list) await saveWorkout(w);
        if (page >= (body.page_count ?? page)) break;
      }
    } else {
      const since = encodeURIComponent(syncState.last_event_at);
      for (let page = 1; ; page++) {
        const body = await hevyGet(`/workouts/events?since=${since}&page=${page}&pageSize=10`, apiKey);
        const events = body?.events ?? [];
        if (!events.length) break;
        for (const ev of events) {
          if (ev.type === "deleted" && ev.id) {
            const { error } = await admin.from("hevy_workouts").delete().eq("user_id", user.id).eq("hevy_id", ev.id);
            if (error) throw error;
            deleted++;
          } else if (ev.workout) {
            await saveWorkout(ev.workout);
          }
        }
        if (page >= (body.page_count ?? page)) break;
      }
    }

    await admin.from("hevy_sync_state").upsert({
      user_id: user.id,
      last_event_at: runStartedAt,
      last_run_at: new Date().toISOString(),
      last_status: "ok",
      last_message: `${upserted} workouts updated, ${deleted} removed${templates ? `, ${templates} exercises refreshed` : ""}`,
    }, { onConflict: "user_id" });

    return json({ ok: true, upserted, deleted, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("hevy_sync_state").upsert({
      user_id: user.id, last_run_at: new Date().toISOString(), last_status: "error", last_message: message,
    }, { onConflict: "user_id" });
    return json({ error: "sync_failed", message }, 502);
  }
});
