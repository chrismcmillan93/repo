// life-push: morning brief and evening "close the day" notifications for the Life app.
//
//   POST {action:'key'}   signed-in user  -> { publicKey } (VAPID key for pushManager.subscribe)
//   POST {action:'test'}  signed-in user  -> sends a test notification to that user's devices
//   POST {action:'tick'}  pg_cron (x-cron-key header, every 15 min) -> sends whatever is due
//
// Auth is done here (deployed with verify_jwt off): a user call must carry a valid
// Supabase session token; the cron call must carry life.push_config.cron_key, which
// only the database and this function (service role) can read. The VAPID key pair is
// generated on first use and stored in life.push_config, so no secret is ever typed in.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generateVapid, sendPush } from './webpush.js';

const SUBJECT = 'https://app.chris-mcmillan.co.uk/life/';
const TZ = 'Europe/London';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const life = () => admin.schema('life');
const fitness = () => admin.schema('fitness');

async function config(){
  const { data, error } = await life().from('push_config').select('*').eq('id', 1).single();
  if (error) throw error;
  if (!data.vapid) {
    data.vapid = await generateVapid();
    const { error: e2 } = await life().from('push_config').update({ vapid: data.vapid }).eq('id', 1);
    if (e2) throw e2;
  }
  return data;
}

function londonNow(){
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const dow = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(now);
  return { date, time, dow };
}
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return addDays(iso, -dow); };

type Prefs = { morning_on: boolean; morning: string; evening_on: boolean; evening: string };
function prefsOf(data: Record<string, unknown> | null): Prefs {
  const n = (data && (data.notify as Record<string, unknown>)) || {};
  return {
    morning_on: n.morning_on !== false, morning: typeof n.morning === 'string' ? n.morning : '07:00',
    evening_on: n.evening_on !== false, evening: typeof n.evening === 'string' ? n.evening : '21:00'
  };
}

async function morningBrief(userId: string, today: string, dow: string){
  const [tasks, plan, picks, events, races] = await Promise.all([
    life().from('tasks').select('title, top_date, due_date').eq('user_id', userId).eq('status', 'open').or(`due_date.lte.${today},top_date.eq.${today}`),
    fitness().from('plan_days').select('session, type').eq('plan_version', 'v2').eq('date', today),
    fitness().from('pick_sessions').select('kind, session').eq('user_id', userId).eq('log_date', today),
    life().from('events').select('title, start_date, repeats_yearly').eq('user_id', userId).gte('start_date', today).order('start_date').limit(1),
    fitness().from('races').select('name, race_date').gte('race_date', today).order('race_date').limit(1)
  ]);
  const t = tasks.data || [];
  const top = t.filter((x) => x.top_date === today).map((x) => x.title);
  const lines: string[] = [];
  const session = (picks.data || []).map((p) => p.session).filter(Boolean).join(' + ') || (plan.data || []).filter((p) => p.type !== 'rest').map((p) => p.session).join(' + ');
  lines.push(session ? `Training: ${session}` : 'No session planned. Pick one in the app.');
  if (top.length) lines.push(`Top three: ${top.join(', ')}`);
  lines.push(t.length ? `${t.length} task${t.length === 1 ? '' : 's'} due today` : 'Nothing due yet. Pick your top three.');
  const next = [...(events.data || []).map((e) => ({ t: e.title, d: e.start_date })), ...(races.data || []).map((r) => ({ t: r.name, d: r.race_date }))].sort((a, b) => (a.d < b.d ? -1 : 1))[0];
  if (next) {
    const days = Math.round((Date.parse(next.d) - Date.parse(today)) / 864e5);
    lines.push(days === 0 ? `Today: ${next.t}` : `${next.t} in ${days} day${days === 1 ? '' : 's'}`);
  }
  if (dow === 'Mon') lines.push('New week: set your commitments.');
  return { title: 'Good morning', body: lines.join('\n'), url: '#/today', tag: 'life-morning' };
}

async function eveningReminder(userId: string, today: string, dow: string){
  const [closed, due] = await Promise.all([
    life().from('journal').select('id').eq('user_id', userId).eq('entry_date', today).eq('kind', 'close').limit(1),
    life().from('tasks').select('status, done_on').eq('user_id', userId).or(`due_date.eq.${today},top_date.eq.${today},done_on.eq.${today}`)
  ]);
  const lines: string[] = [];
  if (!(closed.data || []).length) {
    const all = due.data || [];
    const done = all.filter((x) => x.status === 'done').length;
    lines.push(all.length ? `${done} of ${all.length} tasks done. Close the day and give a reason for anything missed.` : 'Close the day before bed.');
  }
  if (dow === 'Sun') {
    const { data } = await life().from('reviews').select('status').eq('user_id', userId).eq('period_type', 'week').eq('period_start', mondayOf(today)).eq('status', 'complete').limit(1);
    if (!(data || []).length) lines.push('Sunday: do your weekly review and set next week\'s commitments.');
  }
  if (!lines.length) return null;
  return { title: 'Evening review', body: lines.join('\n'), url: dow === 'Sun' ? '#/review' : '#/today', tag: 'life-evening' };
}

async function deliver(subs: Record<string, unknown>[], payload: Record<string, unknown>, vapid: unknown){
  let sent = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(s, payload, vapid, SUBJECT);
      if (status === 404 || status === 410) await life().from('push_subscriptions').delete().eq('id', s.id);
      else if (status >= 200 && status < 300) sent += 1;
      else console.warn('push status', status);
    } catch (err) { console.warn('push failed', (err as Error).message); }
  }
  return sent;
}

async function tick(vapid: unknown){
  const { date, time, dow } = londonNow();
  const now = minutes(time);
  const { data: subs } = await life().from('push_subscriptions').select('*');
  if (!subs || !subs.length) return { sent: 0 };
  const byUser = new Map<string, Record<string, unknown>[]>();
  subs.forEach((s) => { const k = s.user_id as string; byUser.set(k, [...(byUser.get(k) || []), s]); });
  let sent = 0;
  for (const [userId, list] of byUser) {
    const { data: set } = await life().from('settings').select('data').eq('user_id', userId).maybeSingle();
    const p = prefsOf(set ? set.data : null);
    // Due once a day, from the chosen time until 3 hours after (so a late cron run still sends, a very late one doesn't).
    const due = (on: boolean, at: string) => on && now >= minutes(at) && now < minutes(at) + 180;
    if (due(p.morning_on, p.morning)) {
      const pending = list.filter((s) => s.last_morning_on !== date);
      if (pending.length) {
        sent += await deliver(pending, await morningBrief(userId, date, dow), vapid);
        await life().from('push_subscriptions').update({ last_morning_on: date }).in('id', pending.map((s) => s.id));
      }
    }
    if (due(p.evening_on, p.evening)) {
      const pending = list.filter((s) => s.last_evening_on !== date);
      if (pending.length) {
        const msg = await eveningReminder(userId, date, dow);
        if (msg) sent += await deliver(pending, msg, vapid);
        await life().from('push_subscriptions').update({ last_evening_on: date }).in('id', pending.map((s) => s.id));
      }
    }
  }
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const cfg = await config();
    const cronKey = req.headers.get('x-cron-key');
    if (cronKey) {
      if (cronKey !== cfg.cron_key) return json({ error: 'forbidden' }, 403);
      return json(await tick(cfg.vapid));
    }
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error } = await admin.auth.getUser(token);
    if (error || !who || !who.user) return json({ error: 'not_signed_in' }, 401);
    const userId = who.user.id;
    if (body.action === 'key') return json({ publicKey: cfg.vapid.publicKey });
    if (body.action === 'test') {
      const { data: subs } = await life().from('push_subscriptions').select('*').eq('user_id', userId);
      if (!subs || !subs.length) return json({ sent: 0, error: 'no_devices' });
      const { date, dow } = londonNow();
      const brief = await morningBrief(userId, date, dow);
      return json({ sent: await deliver(subs, { ...brief, title: 'Test: your morning brief' }, cfg.vapid) });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'server', message: (err as Error).message }, 500);
  }
});
