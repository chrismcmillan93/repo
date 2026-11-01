-- Hike reminders: everyone on a hike (host + approved walkers) gets a reminder the day before.
--
-- Hourly, pg_cron runs private.queue_hike_reminders(), which writes one hike_notifications row
-- (kind 'reminder') per person for each open hike that starts tomorrow (UK date), from 10:00 UK
-- time onwards. Then, only if some reminder is still unsent, it calls the hike-reminders Edge
-- Function through pg_net, which emails them via Resend. Reminders show in the app too.
--
-- * One reminder per person per hike, ever (partial unique index): editing a hike's time later
--   does not send a second one.
-- * Hikes created or joined after 10:00 the day before still get theirs, at the next hourly run.
-- * Cancelled hikes (status <> 'open') and hikes already started are skipped.
-- * The Edge Function has no signed-in user, so the cron call carries a shared secret kept in
--   private.reminder_config (generated here, never in the repo) and checked by
--   public.reminders_secret_ok(), executable by the service role only.
-- * When push notifications exist, send them from the same place: have the Edge Function (or a
--   sibling) also push for each claimed reminder row. Queueing and the schedule don't change.

create unique index hike_notifications_one_reminder
  on public.hike_notifications (hike_id, user_id) where kind = 'reminder';

create table private.reminder_config (
  id int primary key default 1 check (id = 1),
  secret text not null
);
alter table private.reminder_config enable row level security;
revoke all on private.reminder_config from public, anon, authenticated;
insert into private.reminder_config (secret)
  values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create function public.reminders_secret_ok(p text) returns boolean
language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce((select secret = p from private.reminder_config where id = 1), false)
$$;
revoke all on function public.reminders_secret_ok(text) from public, anon, authenticated;
grant execute on function public.reminders_secret_ok(text) to service_role;

-- p_now exists so this can be tested at any moment; the cron job uses the default.
create function private.queue_hike_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n int;
  uk_now timestamp := p_now at time zone 'Europe/London';
begin
  if uk_now::time < time '10:00' then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('hike_reminders'));

  with due as (
    select h.id, h.title, h.start_at, h.host_id
    from public.hikes h
    where h.status = 'open'
      and h.start_at > p_now
      and (h.start_at at time zone 'Europe/London')::date = uk_now::date + 1
  ), people as (
    select d.id as hike_id, d.host_id as user_id from due d
    union
    select d.id, a.user_id from due d
      join public.hike_attendees a on a.hike_id = d.id and a.status = 'approved'
  ), ins as (
    insert into public.hike_notifications (user_id, hike_id, kind, body)
    select p.user_id, p.hike_id, 'reminder',
           left('Reminder: ' || case when p.user_id = d.host_id then 'you''re hosting' else 'you''re walking' end
                || ' "' || d.title || '" tomorrow, ' || to_char(d.start_at at time zone 'Europe/London', 'FMDy FMDD FMMon')
                || ' at ' || to_char(d.start_at at time zone 'Europe/London', 'HH24:MI') || '.', 300)
    from people p join due d on d.id = p.hike_id
    on conflict (hike_id, user_id) where kind = 'reminder' do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function private.queue_hike_reminders(timestamptz) from public, anon, authenticated;

-- Hourly at :05. Queue, then call the Edge Function only if a reminder is waiting to be sent
-- (this also retries failed sends, up to 3 attempts, within 12 hours of being queued).
select cron.schedule('hike-reminders-hourly', '5 * * * *', $job$
  select private.queue_hike_reminders();
  select net.http_post(
    url := 'https://jyxtduvkmztexwurrjsf.supabase.co/functions/v1/hike-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-reminder-secret', (select secret from private.reminder_config where id = 1)),
    body := '{}'::jsonb
  ) where exists (
    select 1 from public.hike_notifications
    where kind = 'reminder' and email_sent_at is null and email_attempts < 3
      and created_at > now() - interval '12 hours'
  );
$job$);
