-- v2 training plan (Edale 50km, 30 Nov 2026 - 19 Sep 2027): plan tables,
-- lift templates/modes, races, and the user's own race results.
-- Plan tables are read-only to the app (authenticated SELECT, no write
-- policy), same as the other plan tables. race_results is per-user.

create table fitness.training_plans (
  plan_version text primary key,
  plan_id text not null,
  name text not null,
  athlete text,
  start_date date not null,
  end_date date not null,
  effort_guide jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  generated_on date,
  created_at timestamptz not null default now()
);

create table fitness.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  plan_version text not null references fitness.training_plans(plan_version) on delete cascade,
  week_number integer not null check (week_number > 0),
  start_date date not null,
  end_date date not null,
  phase text not null,
  load text not null,
  notes text not null default '',
  weight_target_kg_monday numeric(4,1),
  run_miles numeric(5,1),
  run_km numeric(5,1),
  unique (plan_version, week_number)
);

create table fitness.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_version text not null,
  week_number integer not null,
  day_id text not null,
  date date not null,
  dow text not null check (dow in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  type text not null check (type in ('lift','run','race','rest','travel','walk','hike_or_run')),
  session text not null,
  legacy_session text,
  kind text check (kind in ('easy','sprints','strides','steady','hills','climb','long','shakeout','race','walk','hike_or_run','travel')),
  mode text check (mode in ('full','reduced','heavy','short','taper','upper','hotel','optional','none')),
  effort text,
  distance_miles numeric(5,1),
  distance_km numeric(5,1),
  duration_min integer,
  time_cap_min integer,
  finisher text,
  venue_hint text,
  optional boolean not null default false,
  load_label text not null check (load_label in ('None','Low','Low-Moderate','Moderate','Moderate-High','High')),
  foreign key (plan_version, week_number) references fitness.plan_weeks(plan_version, week_number) on delete cascade,
  unique (plan_version, date, session),
  unique (plan_version, day_id)
);
create index plan_days_week_idx on fitness.plan_days (plan_version, week_number);

create table fitness.lift_modes (
  plan_version text not null references fitness.training_plans(plan_version) on delete cascade,
  mode text not null check (mode in ('full','reduced','heavy','short','taper','upper','hotel','optional','none')),
  description text not null,
  primary key (plan_version, mode)
);

create table fitness.lift_templates (
  id uuid primary key default gen_random_uuid(),
  plan_version text not null references fitness.training_plans(plan_version) on delete cascade,
  name text not null,
  when_label text,
  sort_order integer not null default 0,
  unique (plan_version, name)
);

create table fitness.lift_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references fitness.lift_templates(id) on delete cascade,
  order_num integer not null,
  name text not null,
  sets text not null,
  note text not null default '',
  unique (template_id, order_num)
);

create table fitness.races (
  id uuid primary key default gen_random_uuid(),
  plan_version text not null references fitness.training_plans(plan_version) on delete cascade,
  race_date date not null,
  start_time text,
  name text not null,
  role text,
  status text not null default 'planned' check (status in ('planned','entered')),
  sort_order integer not null default 0,
  unique (plan_version, race_date, name)
);

create table fitness.race_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  race_id uuid not null references fitness.races(id) on delete cascade,
  finish_time_seconds integer not null check (finish_time_seconds > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, race_id)
);
create index race_results_race_idx on fitness.race_results (race_id);

alter table fitness.training_plans enable row level security;
alter table fitness.plan_weeks enable row level security;
alter table fitness.plan_days enable row level security;
alter table fitness.lift_modes enable row level security;
alter table fitness.lift_templates enable row level security;
alter table fitness.lift_template_exercises enable row level security;
alter table fitness.races enable row level security;
alter table fitness.race_results enable row level security;

create policy "authenticated read" on fitness.training_plans for select to authenticated using (true);
create policy "authenticated read" on fitness.plan_weeks for select to authenticated using (true);
create policy "authenticated read" on fitness.plan_days for select to authenticated using (true);
create policy "authenticated read" on fitness.lift_modes for select to authenticated using (true);
create policy "authenticated read" on fitness.lift_templates for select to authenticated using (true);
create policy "authenticated read" on fitness.lift_template_exercises for select to authenticated using (true);
create policy "authenticated read" on fitness.races for select to authenticated using (true);
create policy "own rows" on fitness.race_results for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on fitness.training_plans, fitness.plan_weeks, fitness.plan_days, fitness.lift_modes,
  fitness.lift_templates, fitness.lift_template_exercises, fitness.races to authenticated;
grant select, insert, update, delete on fitness.race_results to authenticated;
