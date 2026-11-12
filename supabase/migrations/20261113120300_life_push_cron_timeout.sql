-- Re-schedule life-push-tick with a 30 s timeout: pg_net's default 5 s is shorter
-- than an Edge Function cold start. cron.schedule with an existing name replaces it.
select cron.schedule(
  'life-push-tick',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://bcrmbuiuekklpocpllpw.supabase.co/functions/v1/life-push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', (select cron_key from life.push_config where id = 1)),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
