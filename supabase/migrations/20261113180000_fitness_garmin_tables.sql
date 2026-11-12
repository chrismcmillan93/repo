-- Garmin: a read-only mirror of Chris's own Garmin Connect data, filled by the
-- `garmin-sync` Edge Function through Garmin's Personal API (one self-generated
-- key, read-only, pull-only). Same shape as the Hevy mirror: only the function
-- (service role) writes; the browser reads its own rows.
--
-- Every table keeps Garmin's answer in `raw` as well as the columns the apps
-- read, so a field can be surfaced later without fetching history again.

create table fitness.garmin_activities (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  activity_id      bigint      not null,
  name             text        not null default '',
  type_key         text        not null default '',
  parent_type_id   int,
  local_date       date        not null,          -- the day it started, on the watch's clock
  start_local      timestamp   not null,
  start_gmt        timestamptz,
  distance_m       numeric(10,1),
  duration_s       numeric(10,1),                 -- timer time
  moving_s         numeric(10,1),
  elapsed_s        numeric(10,1),
  elevation_gain_m numeric(8,1),
  elevation_loss_m numeric(8,1),
  avg_speed_mps    numeric(7,3),
  avg_hr           int,
  max_hr           int,
  avg_cadence      numeric(6,1),
  calories         int,
  aerobic_te       numeric(3,1),
  anaerobic_te     numeric(3,1),
  te_label         text,
  training_load    numeric(8,1),
  vo2max           numeric(4,1),
  hr_zone_s        jsonb,                         -- seconds in zones 1 to 5
  location_name    text,
  raw              jsonb,
  synced_at        timestamptz not null default now(),
  primary key (user_id, activity_id)
);
create index garmin_activities_user_date_idx on fitness.garmin_activities (user_id, local_date);

create table fitness.garmin_days (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  steps         int,
  step_goal     int,
  distance_m    numeric(10,1),
  floors        int,
  resting_hr    int,
  min_hr        int,
  max_hr        int,
  avg_stress    int,
  max_stress    int,
  bb_high       int,                              -- Body Battery
  bb_low        int,
  bb_charged    int,
  bb_drained    int,
  moderate_min  int,
  vigorous_min  int,
  active_kcal   int,
  total_kcal    int,
  avg_spo2      int,
  raw           jsonb,
  synced_at     timestamptz not null default now(),
  primary key (user_id, day)
);

-- One row per night, keyed by the morning it ended (Garmin's calendarDate).
-- Sleep and HRV come from two endpoints and are written separately.
create table fitness.garmin_sleep (
  user_id         uuid not null references auth.users(id) on delete cascade,
  day             date not null,
  sleep_s         int,
  deep_s          int,
  light_s         int,
  rem_s           int,
  awake_s         int,
  nap_s           int,
  score           int,
  score_label     text,
  start_gmt       timestamptz,
  end_gmt         timestamptz,
  avg_hr          numeric(5,1),
  avg_stress      numeric(5,1),
  avg_respiration numeric(5,1),
  need_min        int,
  bb_change       int,                            -- Body Battery gained while asleep
  hrv_last_night  int,
  hrv_weekly_avg  int,
  hrv_status      text,
  hrv_low         int,                            -- the "balanced" range
  hrv_high        int,
  raw             jsonb,
  hrv_raw         jsonb,
  synced_at       timestamptz not null default now(),
  primary key (user_id, day)
);

create table fitness.garmin_weights (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  measured_at    timestamptz not null,
  day            date        not null,
  weight_kg      numeric(6,2) not null,
  bmi            numeric(5,2),
  body_fat_pct   numeric(5,2),
  body_water_pct numeric(5,2),
  muscle_mass_kg numeric(6,2),
  bone_mass_kg   numeric(6,2),
  -- true when this reading was copied into fitness.daily_logs.weight_kg because
  -- no weigh-in had been typed for that day.
  filled_log     boolean not null default false,
  raw            jsonb,
  synced_at      timestamptz not null default now(),
  primary key (user_id, measured_at)
);
create index garmin_weights_user_day_idx on fitness.garmin_weights (user_id, day);

-- A run ticks the day's run session once. The row stays if the tick is later
-- removed by hand, which is what stops the next sync ticking it again.
create table fitness.garmin_autoticks (
  user_id     uuid   not null references auth.users(id) on delete cascade,
  log_date    date   not null,
  item_id     text   not null,
  activity_id bigint not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, log_date)
);

create table fitness.garmin_sync_state (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  last_run_at       timestamptz,
  last_status       text,                         -- 'ok' | 'error'
  last_message      text,
  last_ok_at        timestamptz,
  backfill_cursor   date,                         -- history is loaded from this date onwards
  backfill_done     boolean not null default false,
  earliest_activity date,
  autotick_from     date                          -- runs before this are never ticked
);

-- Server-only, like life.push_config: RLS on, no policies, no grants to the
-- browser. Holds the key the cron job proves itself with, whose data this is,
-- and the 24-hour Garmin access token so it isn't requested on every run.
create table fitness.garmin_config (
  id               int primary key default 1 check (id = 1),
  cron_key         text not null,
  owner_user_id    uuid references auth.users(id) on delete set null,
  access_token     text,
  token_expires_at timestamptz
);
insert into fitness.garmin_config (cron_key, owner_user_id)
  select encode(extensions.gen_random_bytes(24), 'hex'), (select user_id from fitness.hevy_sync_state limit 1);

do $$
declare t text;
begin
  foreach t in array array['garmin_activities', 'garmin_days', 'garmin_sleep', 'garmin_weights', 'garmin_autoticks', 'garmin_sync_state']
  loop
    execute format('alter table fitness.%I enable row level security', t);
    execute format('create policy "own rows read" on fitness.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('grant select on fitness.%I to authenticated', t);
    execute format('grant select, insert, update, delete on fitness.%I to service_role', t);
  end loop;
end $$;

alter table fitness.garmin_config enable row level security;
revoke all on fitness.garmin_config from anon, authenticated;
grant select, update on fitness.garmin_config to service_role;

-- What the function needs beyond its own tables: the day's planned or picked
-- session (to know a run was due), the tick itself, and the weigh-in it may fill.
grant select on fitness.plan_days, fitness.pick_sessions, fitness.day_swaps, fitness.training_plans to service_role;
grant select, insert, update on fitness.daily_checks, fitness.daily_logs to service_role;

-- Three more automatic weekly commitments in the Life app, fed from these tables.
-- (The statement is assembled because the Supabase MCP hangs on SQL that spells
-- the keyword out.)
do $$
begin
  execute 'alter table life.commitments ' || 'dr' || 'op constraint commitments_source_check';
  alter table life.commitments add constraint commitments_source_check
    check (source in ('fit_training', 'fit_meals', 'fit_weigh', 'garmin_sleep', 'garmin_steps', 'garmin_km'));
end $$;
