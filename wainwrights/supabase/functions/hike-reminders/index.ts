// hike-reminders — emails the "your hike is tomorrow" reminders queued by
// private.queue_hike_reminders(), via Resend.
//
// PROJECT: walking-up-hills (jyxtduvkmztexwurrjsf).
// Secrets used: RESEND_API_KEY, HIKE_FROM_EMAIL, SITE_URL (same as hike-notify).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
//
// Called hourly by pg_cron (via pg_net) only when there is something unsent. There is no
// user here, so verify_jwt is false and the caller proves itself with a shared secret in the
// x-reminder-secret header; the secret lives in private.reminder_config and is checked by
// public.reminders_secret_ok(), which only the service role can execute.
//
// Reminders are rows in hike_notifications (kind 'reminder'), so they also show up in the app.
// Claim-then-send like hike-notify: email_sent_at is set first so overlapping runs can't send
// twice; a failed send is released for up to 3 attempts. Only reminders from the last 12 hours
// are sent, so a reminder is never emailed long after the moment it was meant for.
// Emails carry the hike's title, date and a link, never the meeting point or host contact.

import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const secret = req.headers.get("x-reminder-secret") ?? "";
  const { data: okSecret } = secret ? await admin.rpc("reminders_secret_ok", { p: secret }) : { data: false };
  if (okSecret !== true) return json({ error: "unauthorised" }, 401);

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("HIKE_FROM_EMAIL");
  if (!key || !from) return json({ error: "not_configured" }, 503);
  const site = (Deno.env.get("SITE_URL") ?? "https://app.chris-mcmillan.co.uk/wainwrights").replace(/\/$/, "");

  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data: claimed, error: claimErr } = await admin.from("hike_notifications")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("kind", "reminder").is("email_sent_at", null).lt("email_attempts", 3).gte("created_at", since)
    .select("id, user_id, hike_id, body, email_attempts")
    .limit(200);
  if (claimErr) return json({ error: "claim_failed" }, 500);

  const tokens = new Map<string, string>();
  let sent = 0, failed = 0;
  for (const n of claimed ?? []) {
    let ok = false;
    try {
      if (!tokens.has(n.hike_id)) {
        const { data: h } = await admin.from("hikes").select("share_token").eq("id", n.hike_id).maybeSingle();
        tokens.set(n.hike_id, h?.share_token ?? "");
      }
      const link = `${site}/hike.html?t=${encodeURIComponent(tokens.get(n.hike_id)!)}`;
      const { data: u } = await admin.auth.admin.getUserById(n.user_id);
      const to = u?.user?.email;
      if (to) {
        const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1c1c1c">
<p style="font-size:16px;line-height:1.5">${esc(n.body)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#2f5d50;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the hike</a></p>
<p style="font-size:12px;color:#666;line-height:1.5">You're getting this because you're hosting or going on a hike on Walking Up Hills. Meeting points and contact details are on the hike page after you sign in. Check the mountain forecast the evening before and again in the morning, and use your own judgement.</p></div>`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, subject: "Reminder: your hike is tomorrow", html, text: `${n.body}\n\nOpen the hike: ${link}` }),
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
