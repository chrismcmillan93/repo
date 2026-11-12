-- Every half hour, ask garmin-sync to pull anything new from Garmin (and carry on
-- loading history until it is all in). Same pattern as life-push-tick: the job
-- proves itself with a key only the database and the function can read, and the
-- timeout is long because the function works for up to 50 seconds per run.
select cron.schedule(
  'garmin-sync-tick',
  '5,35 * * * *',
  $cron$
  select net.http_post(
    url := 'https://bcrmbuiuekklpocpllpw.supabase.co/functions/v1/garmin-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', (select cron_key from fitness.garmin_config where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
