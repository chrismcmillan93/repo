-- Lifting tab: a read-only mirror of Chris's Hevy workouts.
--
-- Hevy stays the place lifts are logged. These tables are written only by
-- the `hevy-sync` Edge Function (service role, bypasses RLS); the browser
-- only ever reads its own rows. Weights are stored exactly as Hevy reports
-- them -- for dumbbell lifts that is the TOTAL of both dumbbells (logging
-- convention), so 100 kg on a dumbbell lift means the gym's 2 x 50 kg max.

create table fitness.hevy_workouts (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  hevy_id      text        not null,
  title        text        not null default '',
  routine_id   text,
  start_time   timestamptz not null,
  end_time     timestamptz,
  hevy_updated_at timestamptz,
  synced_at    timestamptz not null default now(),
  primary key (user_id, hevy_id)
);

create table fitness.hevy_sets (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  hevy_workout_id text       not null,
  exercise_index int         not null,
  set_index      int         not null,
  exercise_template_id text  not null,
  exercise_title text        not null,
  set_type       text        not null default 'normal',
  weight_kg      numeric(7,2),
  reps           int,
  distance_m     numeric(9,2),
  duration_s     int,
  rpe            numeric(3,1),
  performed_at   timestamptz not null,
  primary key (user_id, hevy_workout_id, exercise_index, set_index),
  foreign key (user_id, hevy_workout_id)
    references fitness.hevy_workouts(user_id, hevy_id) on delete cascade
);

create index hevy_sets_user_template_time_idx
  on fitness.hevy_sets (user_id, exercise_template_id, performed_at);
create index hevy_workouts_user_time_idx
  on fitness.hevy_workouts (user_id, start_time);

-- Shared lookup: Hevy's exercise library (muscle groups, equipment).
create table fitness.hevy_exercise_templates (
  id                   text primary key,
  title                text not null,
  type                 text,
  primary_muscle_group text,
  secondary_muscle_groups text[] not null default '{}',
  equipment            text,
  is_custom            boolean not null default false,
  synced_at            timestamptz not null default now()
);

create table fitness.hevy_sync_state (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  last_event_at  timestamptz,      -- high-water mark for /workouts/events
  last_run_at    timestamptz,
  last_status    text,             -- 'ok' | 'error'
  last_message   text
);

alter table fitness.hevy_workouts enable row level security;
alter table fitness.hevy_sets enable row level security;
alter table fitness.hevy_exercise_templates enable row level security;
alter table fitness.hevy_sync_state enable row level security;

create policy "own rows read" on fitness.hevy_workouts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own rows read" on fitness.hevy_sets for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own rows read" on fitness.hevy_sync_state for select to authenticated
  using (user_id = (select auth.uid()));
create policy "authenticated read" on fitness.hevy_exercise_templates for select to authenticated
  using (true);

-- Read-only for the browser. No insert/update/delete grants: only the
-- Edge Function (service_role) writes.
grant select on
  fitness.hevy_workouts, fitness.hevy_sets,
  fitness.hevy_exercise_templates, fitness.hevy_sync_state
  to authenticated;
grant select, insert, update, delete on
  fitness.hevy_workouts, fitness.hevy_sets,
  fitness.hevy_exercise_templates, fitness.hevy_sync_state
  to service_role;
grant usage on schema fitness to service_role;
