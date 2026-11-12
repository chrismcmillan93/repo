// garmin-sync: mirrors Chris's own Garmin Connect data into the `fitness` schema
// through Garmin's Personal API (read-only, pull-only, one self-generated key).
//
//   POST {}  signed-in owner            -> sync now (the Life app's "Sync now" button)
//   POST {}  pg_cron (x-cron-key header) -> the half-hourly sync
//
// Auth is done here (deployed with verify_jwt off): a user call must carry the
// Supabase session of fitness.garmin_config.owner_user_id; the cron call must carry
// garmin_config.cron_key, which only the database and this function can read.
//
// Secret (Dashboard -> Edge Functions -> Secrets):
//   GARMIN_API_KEY   created in Garmin Connect web -> Settings -> Personal API Key
// The key is swapped for a 24-hour access token, kept in garmin_config between runs.
//
// Each run:
//   1. Re-reads the last few days (Garmin revises recent days after a late watch
//      sync), removing activities deleted in Garmin.
//   2. Ticks the day's run session when a run was recorded (never before
//      garmin_sync_state.autotick_from, and only once per day, so an untick sticks).
//   3. Copies a Garmin weigh-in into fitness.daily_logs for days with none typed.
//   4. Walks backwards through history 28 days at a time until the time budget is
//      spent, saving its place after every chunk, until nothing older is left.
import { createClient } from "jsr:@supabase/supabase-js@2";

const GARMIN = "https://personal.connectapi.garmin.com";
const TZ = "Europe/London";
const CHUNK_DAYS = 28;          // the smallest per-call maximum among the endpoints used
const BUDGET_MS = 50_000;
const MAX_CHUNKS = 12;          // history chunks per run: Garmin starts refusing (429) at roughly 100 requests in a burst
const HARD_FLOOR = "2005-01-01";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "fitness" },
  auth: { persistSession: false },
});

// deno-lint-ignore no-explicit-any
type Any = any;
class RateLimited extends Error {}
class KeyRejected extends Error {}
class TokenFailed extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dates = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

// Garmin uses negative numbers for "no reading"; anything outside the column's range is dropped.
function num(v: unknown, max = 1e7): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
const int = (v: unknown, max = 1e7) => { const n = num(v, max); return n == null ? null : Math.round(n); };
function stamp(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? String(v) : String(v).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---- Garmin ----
let token: string | null = null;

async function fetchToken(apiKey: string): Promise<string> {
  const res = await fetch(`${GARMIN}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: "POST", headers: { Authorization: `ApiKey ${apiKey}` },
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new KeyRejected("Garmin rejected the API key. It has probably expired or been deleted: create a new one in Garmin Connect and update the GARMIN_API_KEY secret.");
  if (res.status === 429) throw new RateLimited("Garmin is rate limiting token requests");
  if (!res.ok) throw new TokenFailed(`Garmin token request failed (HTTP ${res.status}${text ? ": " + text.slice(0, 160) : ""})`);
  let body: Any = null;
  try { body = JSON.parse(text); } catch { /* a bare token */ }
  const t = body && typeof body === "object" ? (body.access_token ?? body.accessToken ?? body.token) : text.trim().replace(/^"|"$/g, "");
  if (!t || typeof t !== "string") throw new TokenFailed(`Garmin token response had no access token (fields: ${body && typeof body === "object" ? Object.keys(body).join(", ") : "none"})`);
  let expires = Date.now() + 23 * 36e5;
  const secs = body && typeof body === "object" ? Number(body.expires_in ?? body.expiresIn) : NaN;
  if (Number.isFinite(secs) && secs > 0) expires = Date.now() + secs * 1000;
  else {
    try {
      const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp) expires = payload.exp * 1000;
    } catch { /* not a JWT: keep the default */ }
  }
  await admin.from("garmin_config").update({ access_token: t, token_expires_at: new Date(expires).toISOString() }).eq("id", 1);
  return t;
}

async function garminGet(path: string, apiKey: string): Promise<Any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!token) token = await fetchToken(apiKey);
    const res = await fetch(`${GARMIN}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 204) return null;
    if (res.status === 401 && attempt === 0) { token = null; continue; }   // token expired early
    if (res.status === 429) throw new RateLimited("Garmin asked for fewer requests");
    if (res.status >= 500) { await sleep(800 * (attempt + 1)); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}${text ? ": " + text.slice(0, 160) : ""}`);
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new Error("not JSON"); }
  }
  throw new Error("Garmin kept failing");
}

// ---- Row mapping ----
const activityRow = (uid: string, a: Any) => ({
  user_id: uid,
  activity_id: a.activityId,
  name: a.activityName ?? "",
  type_key: a.activityType?.typeKey ?? "",
  parent_type_id: int(a.activityType?.parentTypeId),
  local_date: String(a.startTimeLocal).slice(0, 10),
  start_local: String(a.startTimeLocal).replace(" ", "T"),
  start_gmt: stamp(a.startTimeGMT),
  distance_m: num(a.distance, 9e8),
  duration_s: num(a.duration, 9e8),
  moving_s: num(a.movingDuration, 9e8),
  elapsed_s: num(a.elapsedDuration, 9e8),
  elevation_gain_m: num(a.elevationGain, 9e6),
  elevation_loss_m: num(a.elevationLoss, 9e6),
  avg_speed_mps: num(a.averageSpeed, 9999),
  avg_hr: int(a.averageHR, 400),
  max_hr: int(a.maxHR, 400),
  avg_cadence: num(a.averageRunningCadenceInStepsPerMinute ?? a.averageBikingCadenceInRevPerMinute, 9999),
  calories: int(a.calories),
  aerobic_te: num(a.aerobicTrainingEffect, 99),
  anaerobic_te: num(a.anaerobicTrainingEffect, 99),
  te_label: a.trainingEffectLabel ?? null,
  training_load: num(a.activityTrainingLoad, 9e6),
  vo2max: num(a.vO2MaxValue, 999),
  hr_zone_s: [1, 2, 3, 4, 5].some((i) => a[`hrTimeInZone_${i}`] != null) ? [1, 2, 3, 4, 5].map((i) => num(a[`hrTimeInZone_${i}`], 9e8)) : null,
  location_name: a.locationName ?? null,
  raw: a,
  synced_at: new Date().toISOString(),
});

const dayRow = (uid: string, d: Any) => ({
  user_id: uid,
  day: d.calendarDate,
  steps: int(d.movement?.steps?.value),
  step_goal: int(d.movement?.steps?.goal),
  distance_m: num(d.movement?.steps?.distanceInMeters, 9e8),
  floors: int(d.movement?.floorsAscended?.value),
  resting_hr: int(d.heartRate?.restingValue, 400),
  min_hr: int(d.heartRate?.minValue, 400),
  max_hr: int(d.heartRate?.maxValue, 400),
  avg_stress: int(d.stress?.avgLevel, 100),
  max_stress: int(d.stress?.maxLevel, 100),
  bb_high: int(d.bodyBattery?.maxValue, 100),
  bb_low: int(d.bodyBattery?.minValue, 100),
  bb_charged: int(d.bodyBattery?.chargedValue, 1000),
  bb_drained: int(d.bodyBattery?.drainedValue, 1000),
  moderate_min: int(d.intensityMinutes?.moderate),
  vigorous_min: int(d.intensityMinutes?.vigorous),
  active_kcal: int(d.calories?.burnedActive),
  total_kcal: int(d.calories?.burnedTotal),
  avg_spo2: int(d.pulseOx?.avgValue, 100),
  raw: d,
  synced_at: new Date().toISOString(),
});

const sleepRow = (uid: string, s: Any) => ({
  user_id: uid,
  day: s.calendarDate,
  sleep_s: int(s.sleepTimeSeconds),
  deep_s: int(s.deepSleepSeconds),
  light_s: int(s.lightSleepSeconds),
  rem_s: int(s.remSleepSeconds),
  awake_s: int(s.awakeSleepSeconds),
  nap_s: int(s.napTimeSeconds),
  score: int(s.sleepScores?.overall?.value, 100),
  score_label: s.sleepScores?.overall?.qualifierKey ?? null,
  start_gmt: stamp(s.sleepStartTimestampGMT),
  end_gmt: stamp(s.sleepEndTimestampGMT),
  avg_hr: num(s.avgHeartRate, 400),
  avg_stress: num(s.avgSleepStress, 100),
  avg_respiration: num(s.averageRespirationValue, 200),
  need_min: int(s.sleepNeed?.actual, 3000),
  bb_change: int(s.bodyBatteryChange, 100),
  raw: s,
  synced_at: new Date().toISOString(),
});

const hrvRow = (uid: string, h: Any) => ({
  user_id: uid,
  day: h.calendarDate,
  hrv_last_night: int(h.lastNightAvg, 1000),
  hrv_weekly_avg: int(h.weeklyAvg, 1000),
  hrv_status: h.status ?? null,
  hrv_low: int(h.baseline?.balancedLow, 1000),
  hrv_high: int(h.baseline?.balancedUpper, 1000),
  hrv_raw: h,
});

// Garmin documents kilograms, but its own site has always used grams: accept both.
const kg = (v: unknown) => { const n = num(v, 1e6); return n == null ? null : n > 1000 ? Math.round(n / 10) / 100 : n; };
function weightRow(uid: string, w: Any) {
  const at = stamp(w.timestampGMT) ?? stamp(w.date);
  const weight = kg(w.weight);
  const day = w.calendarDate ?? (at ? at.slice(0, 10) : null);
  if (!at || !weight || !day) return null;
  return {
    user_id: uid, measured_at: at, day, weight_kg: weight,
    bmi: num(w.bmi, 999), body_fat_pct: num(w.bodyFat, 100), body_water_pct: num(w.bodyWater, 100),
    muscle_mass_kg: kg(w.muscleMass), bone_mass_kg: kg(w.boneMass),
    raw: w, synced_at: new Date().toISOString(),
  };
}

async function upsert(table: string, rows: Any[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 200), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

type Counts = { activities: number; days: number; nights: number; weights: number; warnings: string[] };

// One window of at most CHUNK_DAYS. Each endpoint fails on its own: a problem with
// one (say, sleep) shouldn't stop activities arriving. Rate limiting stops everything.
async function syncRange(uid: string, apiKey: string, from: string, to: string, prune: boolean): Promise<Counts> {
  const c: Counts = { activities: 0, days: 0, nights: 0, weights: 0, warnings: [] };
  const part = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) {
      if (err instanceof RateLimited || err instanceof KeyRejected || err instanceof TokenFailed) throw err;
      c.warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await part("activities", async () => {
    const seen: number[] = [];
    for (let start = 0; ; start += 99) {
      const list = await garminGet(`/activitylist-service/activities/search/activities?startDate=${from}&endDate=${to}&start=${start}&limit=99`, apiKey);
      const rows = (Array.isArray(list) ? list : []).filter((a: Any) => a && a.activityId != null && a.startTimeLocal).map((a: Any) => activityRow(uid, a));
      await upsert("garmin_activities", rows, "user_id,activity_id");
      rows.forEach((r: Any) => seen.push(r.activity_id));
      if (!Array.isArray(list) || list.length < 99) break;
    }
    c.activities = seen.length;
    if (prune) {
      let q = admin.from("garmin_activities").delete().eq("user_id", uid).gte("local_date", from).lte("local_date", to);
      if (seen.length) q = q.not("activity_id", "in", `(${seen.join(",")})`);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
  });

  await part("daily summaries", async () => {
    const body = await garminGet(`/usersummary-service/v2/dailysummaries?startDate=${from}&endDate=${to}`, apiKey);
    const list = Array.isArray(body) ? body : (body?.data ?? []);
    const rows = list.filter((d: Any) => d && d.calendarDate).map((d: Any) => dayRow(uid, d))
      .filter((r: Any) => r.steps != null || r.resting_hr != null || r.bb_high != null || r.total_kcal != null);
    await upsert("garmin_days", rows, "user_id,day");
    c.days = rows.length;
  });

  await part("sleep", async () => {
    const list = await garminGet(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${from}&endDate=${to}`, apiKey);
    const rows = (Array.isArray(list) ? list : []).filter((s: Any) => s && s.calendarDate && s.sleepTimeSeconds != null).map((s: Any) => sleepRow(uid, s));
    await upsert("garmin_sleep", rows, "user_id,day");
    c.nights = rows.length;
  });

  await part("HRV", async () => {
    const body = await garminGet(`/hrv-service/hrv/daily/${from}/${to}`, apiKey);
    const rows = (body?.hrvSummaries ?? []).filter((h: Any) => h && h.calendarDate && h.lastNightAvg != null).map((h: Any) => hrvRow(uid, h));
    await upsert("garmin_sleep", rows, "user_id,day");
  });

  await part("weight", async () => {
    const list = await garminGet(`/weight-service/weight/all/${from}/${to}`, apiKey);
    const rows = (Array.isArray(list) ? list : []).map((w: Any) => weightRow(uid, w)).filter(Boolean);
    await upsert("garmin_weights", rows, "user_id,measured_at");
    c.weights = rows.length;
  });
  return c;
}

// A day's first Garmin reading becomes its weigh-in, only where none was typed.
async function fillWeighIns(uid: string, from: string, to: string): Promise<number> {
  const [{ data: readings, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
    admin.from("garmin_weights").select("measured_at, day, weight_kg").eq("user_id", uid).gte("day", from).lte("day", to).order("measured_at"),
    admin.from("daily_logs").select("log_date, weight_kg").eq("user_id", uid).gte("log_date", from).lte("log_date", to),
  ]);
  if (e1 || e2) throw new Error((e1 || e2)!.message);
  const typed = new Set((logs ?? []).filter((l) => l.weight_kg != null).map((l) => l.log_date));
  const first = new Map<string, Any>();
  (readings ?? []).forEach((r) => { if (!first.has(r.day)) first.set(r.day, r); });
  let n = 0;
  for (const [day, r] of first) {
    if (typed.has(day)) continue;
    const { error } = await admin.from("daily_logs").upsert({ user_id: uid, log_date: day, weight_kg: r.weight_kg }, { onConflict: "user_id,log_date" });
    if (error) throw new Error(`daily_logs: ${error.message}`);
    await admin.from("garmin_weights").update({ filled_log: true }).eq("user_id", uid).eq("measured_at", r.measured_at);
    n++;
  }
  return n;
}

// Which Garmin activity types count for the session due that day. Mirrors
// get_day_bundle(): a Weights/Cardio pick replaces the plan, and every planned
// type except lift and rest is ticked as `session:run`.
function wantedTypes(planType: string | null, planKind: string | null, pickCardio: boolean, pickName: string | null): RegExp | null {
  if (pickCardio) return pickName === "Walk / hike" ? /run|hik|walk/ : pickName === "Hills / climbing" ? /run|hik|stair/ : pickName === "Other cardio" ? /^(?!.*strength)/ : /run/;
  if (planType === "run" && (planKind === "climb" || planKind === "hills")) return /run|hik|stair/;
  if (planType === "run" || planType === "race") return /run/;
  if (planType === "hike_or_run" || planType === "walk") return /run|hik|walk/;
  return null;
}

async function autoTick(uid: string, days: string[]): Promise<number> {
  if (!days.length) return 0;
  const from = days[0], to = days[days.length - 1];
  const q = (table: string, cols: string, col: string) => admin.from(table).select(cols).eq("user_id", uid).gte(col, from).lte(col, to);
  const [acts, ticks, checks, picks, swaps] = await Promise.all([
    q("garmin_activities", "activity_id, local_date, type_key, duration_s", "local_date"),
    q("garmin_autoticks", "log_date", "log_date"),
    q("daily_checks", "log_date, item_id, is_checked", "log_date"),
    q("pick_sessions", "log_date, kind, session", "log_date"),
    q("day_swaps", "log_date, source_date", "log_date"),
  ]);
  for (const r of [acts, ticks, checks, picks, swaps]) if (r.error) throw new Error(r.error.message);
  const source = new Map((swaps.data ?? []).map((s: Any) => [s.log_date, s.source_date]));
  const planDates = days.map((d) => source.get(d) ?? d);
  const { data: plan, error } = await admin.from("plan_days").select("date, type, kind, session").eq("plan_version", "v2").in("date", planDates).order("session");
  if (error) throw new Error(error.message);
  const done = new Set((ticks.data ?? []).map((t: Any) => t.log_date));
  let n = 0;
  for (const day of days) {
    if (done.has(day)) continue;
    const on = (id: string) => (checks.data ?? []).some((c: Any) => c.log_date === day && c.item_id === id && c.is_checked);
    const pickW = on("pick:weights"), pickC = on("pick:cardio");
    if (pickW && !pickC) continue;
    const pickName = (picks.data ?? []).find((p: Any) => p.log_date === day && p.kind === "cardio")?.session ?? null;
    const planned = (plan ?? []).find((p: Any) => p.date === (source.get(day) ?? day));
    const want = wantedTypes(planned?.type ?? null, planned?.kind ?? null, pickC, pickName);
    if (!want) continue;
    const act = (acts.data ?? []).find((a: Any) => a.local_date === day && want.test(a.type_key) && Number(a.duration_s ?? 0) >= 300);
    if (!act) continue;
    if (!on("session:run")) {
      const { error: e1 } = await admin.from("daily_checks").upsert(
        { user_id: uid, log_date: day, item_id: "session:run", is_checked: true, updated_at: new Date().toISOString() },
        { onConflict: "user_id,log_date,item_id" });
      if (e1) throw new Error(`daily_checks: ${e1.message}`);
      n++;
    }
    const { error: e2 } = await admin.from("garmin_autoticks").upsert(
      { user_id: uid, log_date: day, item_id: "session:run", activity_id: act.activity_id }, { onConflict: "user_id,log_date", ignoreDuplicates: true });
    if (e2) throw new Error(`garmin_autoticks: ${e2.message}`);
  }
  return n;
}

const total = (c: Counts) => c.activities + c.days + c.nights + c.weights;
const nice = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);

  const { data: cfg, error: cfgErr } = await admin.from("garmin_config").select("*").eq("id", 1).single();
  if (cfgErr || !cfg) return json({ error: "not_configured", message: "The Garmin tables are not set up." }, 503);

  // Who's calling?
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    if (cronKey !== cfg.cron_key) return json({ error: "not_allowed" }, 403);
  } else {
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
    if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);
    if (!cfg.owner_user_id || userData.user.id !== cfg.owner_user_id) return json({ error: "not_allowed" }, 403);
  }
  const uid: string | null = cfg.owner_user_id;
  if (!uid) return json({ error: "not_configured", message: "No owner account is set for Garmin." }, 503);
  const apiKey = Deno.env.get("GARMIN_API_KEY");
  if (!apiKey) return json({ error: "not_configured", message: "The GARMIN_API_KEY secret is not set yet." }, 503);

  if (cfg.access_token && cfg.token_expires_at && new Date(cfg.token_expires_at).getTime() - Date.now() > 10 * 60e3) token = cfg.access_token;
  else token = null;

  const today = londonToday();
  const { data: prior } = await admin.from("garmin_sync_state").select("*").eq("user_id", uid).maybeSingle();
  const state = prior ?? { user_id: uid, backfill_cursor: null, backfill_done: false, earliest_activity: null, autotick_from: today, last_ok_at: null };
  const save = async (patch: Record<string, unknown>) => {
    Object.assign(state, patch);
    const { error } = await admin.from("garmin_sync_state").upsert({ ...state, last_run_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.error("garmin_sync_state:", error.message);
  };

  const warnings: string[] = [];
  let ticked = 0, filled = 0, chunks = 0, limited = false;
  let recent: Counts = { activities: 0, days: 0, nights: 0, weights: 0, warnings: [] };
  try {
    // 1. The recent window: a full chunk the very first time, four days after that.
    const recentFrom = addDays(today, state.last_ok_at ? -3 : -(CHUNK_DAYS - 1));
    recent = await syncRange(uid, apiKey, recentFrom, today, true);
    if (recent.warnings.length >= 5) throw new Error(recent.warnings[0]);   // nothing worked at all
    warnings.push(...recent.warnings);
    let cursor: string = state.backfill_cursor && state.backfill_cursor < recentFrom ? state.backfill_cursor : recentFrom;

    // 2. Ticks and weigh-ins for those days.
    const tickFrom = state.autotick_from && state.autotick_from > recentFrom ? state.autotick_from : recentFrom;
    try { ticked = await autoTick(uid, dates(tickFrom, today)); } catch (err) { warnings.push(`auto-tick: ${err instanceof Error ? err.message : err}`); }
    try { filled = await fillWeighIns(uid, recentFrom, today); } catch (err) { warnings.push(`weigh-ins: ${err instanceof Error ? err.message : err}`); }
    await save({ backfill_cursor: cursor });

    // 3. History, oldest-known activity first so we know where it can stop.
    try {
      if (!state.backfill_done && !state.earliest_activity) {
        const first = await garminGet("/activitylist-service/activities/search/activities?sortOrder=asc&start=0&limit=1", apiKey);
        const d = Array.isArray(first) && first[0]?.startTimeLocal ? String(first[0].startTimeLocal).slice(0, 10) : null;
        if (d) await save({ earliest_activity: d });
      }
      const floor = state.earliest_activity ?? addDays(today, -730);
      while (!state.backfill_done && chunks < MAX_CHUNKS && left() > 12_000) {
        const to = addDays(cursor, -1), from = addDays(to, -(CHUNK_DAYS - 1));
        const c = await syncRange(uid, apiKey, from, to, false);
        warnings.push(...c.warnings);
        try { filled += await fillWeighIns(uid, from, to); } catch (err) { warnings.push(`weigh-ins: ${err instanceof Error ? err.message : err}`); }
        cursor = from;
        chunks++;
        // Finished once we're past the first activity and a whole chunk comes back empty.
        const done = from <= HARD_FLOOR || (from <= floor && total(c) === 0 && !c.warnings.length);
        await save({ backfill_cursor: cursor, backfill_done: done });
      }
    } catch (err) {
      if (!(err instanceof RateLimited)) throw err;
      limited = true;
    }

    const uniq = Array.from(new Set(warnings.map((w) => w.replace(/\d{4}-\d\d-\d\d/g, "…")))).slice(0, 4);
    const message = [
      `${recent.activities} activit${recent.activities === 1 ? "y" : "ies"}, ${recent.days} days and ${recent.nights} nights refreshed`,
      ticked ? `${ticked} run session${ticked === 1 ? "" : "s"} ticked` : "",
      filled ? `${filled} weigh-in${filled === 1 ? "" : "s"} filled in` : "",
      state.backfill_done ? "all history loaded" : `history loaded back to ${nice(cursor)}`,
      limited ? "Garmin asked for a pause, history continues next run" : "",
      uniq.length ? `problems: ${uniq.join("; ")}` : "",
    ].filter(Boolean).join(" · ");
    await save({ last_status: "ok", last_message: message, last_ok_at: new Date().toISOString() });
    return json({ ok: true, recent: { activities: recent.activities, days: recent.days, nights: recent.nights, weights: recent.weights }, ticked, filled, chunks, backfill_cursor: cursor, backfill_done: state.backfill_done, limited, warnings: uniq });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await save({ last_status: "error", last_message: message });
    const code = err instanceof KeyRejected ? "key_rejected" : err instanceof RateLimited ? "rate_limited" : "sync_failed";
    return json({ error: code, message }, err instanceof RateLimited ? 429 : 502);
  }
});
