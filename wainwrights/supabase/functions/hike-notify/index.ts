// hike-notify — emails the unsent hike notifications for one hike via Resend.
//
// PROJECT: walking-up-hills (jyxtduvkmztexwurrjsf).
// Secrets: RESEND_API_KEY, HIKE_FROM_EMAIL (e.g. "Walking Up Hills <hikes@your-domain>"),
// optional SITE_URL (defaults to the beta site). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deployed with verify_jwt=false: the function authenticates the caller itself
// via auth.getUser(token) (this project uses the new API keys).
//
// The SQL functions in the hosted-hikes migration insert rows into
// hike_notifications. The page calls this function straight after any action
// that creates one (request, approve, edit, cancel, tick-for-everyone ...).
// The caller must be the host or an attendee of the hike. Emails never contain
// the meeting point or host contact; they link to the hike page, where
// access is checked again.
//
// Each notification is claimed atomically (email_sent_at set first) so two
// overlapping calls can't send it twice; a failed send is released for up to
// 3 attempts. If the Resend secrets aren't set yet this returns 503 without
// claiming anything, so the in-app notifications still work and the emails go
// out on the next call once the secrets exist (notifications younger than 3 days).

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SUBJECTS: Record<string, string> = {
  request: "Someone asked to join your hike",
  joined: "A team member joined your hike",
  approved: "You're in — hike confirmed",
  declined: "Update on your hike request",
  removed: "Update on your hike place",
  withdrawn: "Someone pulled out of your hike",
  edited: "Your hike has been updated",
  cancelled: "Hike cancelled",
  ticked: "Fells ticked after your hike",
  undo: "A walker removed their hike ticks",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (userErr || !userData?.user) return json({ error: "not_signed_in" }, 401);
  const uid = userData.user.id;

  let hikeId = "";
  try { hikeId = String((await req.json()).hike_id ?? ""); } catch { return json({ error: "bad_request" }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(hikeId)) return json({ error: "bad_request" }, 400);

  const { data: hike } = await admin.from("hikes").select("id, host_id, title, share_token").eq("id", hikeId).maybeSingle();
  if (!hike) return json({ error: "not_found" }, 404);
  if (hike.host_id !== uid) {
    const { data: me } = await admin.from("hike_attendees").select("user_id").eq("hike_id", hikeId).eq("user_id", uid).maybeSingle();
    if (!me) return json({ error: "not_found" }, 404);
  }

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("HIKE_FROM_EMAIL");
  if (!key || !from) {
    return json({ error: "not_configured", message: "RESEND_API_KEY / HIKE_FROM_EMAIL secrets are not set yet." }, 503);
  }
  const site = (Deno.env.get("SITE_URL") ?? "https://app.chris-mcmillan.co.uk/wainwrights/beta").replace(/\/$/, "");
  const link = `${site}/hike.html?t=${encodeURIComponent(hike.share_token)}`;

  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: claimed, error: claimErr } = await admin.from("hike_notifications")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("hike_id", hikeId).is("email_sent_at", null).lt("email_attempts", 3).gte("created_at", since)
    .select("id, user_id, kind, body, email_attempts")
    .limit(50);
  if (claimErr) return json({ error: "claim_failed" }, 500);

  let sent = 0, failed = 0;
  for (const n of claimed ?? []) {
    let ok = false;
    try {
      const { data: u } = await admin.auth.admin.getUserById(n.user_id);
      const to = u?.user?.email;
      if (to) {
        const subject = SUBJECTS[n.kind] ?? "Hike update";
        const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1c1c1c">
<p style="font-size:16px;line-height:1.5">${esc(n.body)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#2f5d50;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the hike</a></p>
<p style="font-size:12px;color:#666;line-height:1.5">You're getting this because you're part of a hike on Walking Up Hills. Meeting points and contact details are only shown on the hike page after you sign in. Hikes are run by fellow walkers, not qualified leaders: check the mountain forecast and use your own judgement.</p></div>`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, subject, html, text: `${n.body}\n\nOpen the hike: ${link}` }),
        });
        ok = res.ok;
        if (!ok) console.error("resend failed", res.status, (await res.text()).slice(0, 200));
      } else {
        ok = true; // no email on the account: nothing to send, don't retry
      }
    } catch (e) {
      console.error("send error", String(e));
    }
    if (ok) sent++;
    else {
      failed++;
      await admin.from("hike_notifications").update({ email_sent_at: null, email_attempts: n.email_attempts + 1 }).eq("id", n.id);
    }
  }
  return json({ sent, failed });
});
