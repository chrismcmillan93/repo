-- A bare `select 1` from pg_cron never touches the API gateway, so Supabase's
-- inactivity check didn't count it. Replace it with a daily real REST request.
select cron.unschedule('keep-alive-twice-weekly')
where exists (select 1 from cron.job where jobname = 'keep-alive-twice-weekly');

select cron.schedule(
  'keep-alive-daily-rest-ping',
  '17 3 * * *',
  $$ select net.http_get(
       'https://bcrmbuiuekklpocpllpw.supabase.co/rest/v1/checkbox_states?select=id&limit=1',
       headers := '{"apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcm1idWl1ZWtrbHBvY3BsbHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NzcsImV4cCI6MjEwMDc0NTU3N30.T4HIbLeAEtPVhV4JKz5HaxEJWqT_5FqdDqT7PJU2YTM"}'::jsonb
     ); $$
);
