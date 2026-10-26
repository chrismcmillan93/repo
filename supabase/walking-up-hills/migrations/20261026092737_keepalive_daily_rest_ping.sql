-- A bare `select 1` from pg_cron never touches the API gateway, so Supabase's
-- inactivity check didn't count it. Replace it with a daily real REST request.
select cron.unschedule('keep-alive-twice-weekly')
where exists (select 1 from cron.job where jobname = 'keep-alive-twice-weekly');

select cron.schedule(
  'keep-alive-daily-rest-ping',
  '17 3 * * *',
  $$ select net.http_get(
       'https://jyxtduvkmztexwurrjsf.supabase.co/rest/v1/fell_heights?select=item_id&limit=1',
       headers := '{"apikey":"sb_publishable_KY9uqIN4zqY0WYmDJoCe3A_dr-YwArX"}'::jsonb
     ); $$
);
