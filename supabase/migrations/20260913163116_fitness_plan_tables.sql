-- Plan definition tables: read-mostly, edited by hand via SQL, not through
-- any app UI. See fitness/CLAUDE.md for how these compose in get_day_bundle().

create table fitness.blocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  goal text,
  notes text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table fitness.block_weeks (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  week_number int not null check (week_number > 0),
  start_date date not null,
  end_date date not null,
  focus text,
  notes text,
  unique (block_id, week_number),
  check (end_date >= start_date)
);

-- Nutrition targets per week -- seeded individually per week (not shared
-- rows) so a single week can be edited later without touching the rest.
create table fitness.week_targets (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  week_number int not null,
  day_type text not null check (day_type in ('lift', 'run', 'rest')),
  kcal_target numeric(6,1) not null,
  protein_floor_g numeric(6,1) not null,
  unique (block_id, week_number, day_type),
  foreign key (block_id, week_number) references fitness.block_weeks(block_id, week_number) on delete cascade
);

-- Meal templates per day type. week_number is nullable: null = the default
-- for every week of the block, a specific week_number overrides it for that
-- week only (get_day_bundle prefers the specific row over the null one for
-- the same slot_order). Seeded with week_number null throughout for now --
-- the brief's meal plan is identical across all 8 weeks.
create table fitness.meal_templates (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  day_type text not null check (day_type in ('lift', 'run', 'rest')),
  week_number int,
  slot_order int not null,
  time_label text not null,
  name text not null,
  description text,
  kcal numeric(6,1) not null,
  protein_g numeric(6,1) not null,
  notes text,
  foreign key (block_id, week_number) references fitness.block_weeks(block_id, week_number) on delete cascade
);
create index meal_templates_lookup on fitness.meal_templates (block_id, day_type, week_number);

-- One row per day of the week (1=Mon..7=Sun). week_number is the same kind
-- of nullable override as meal_templates -- used for exactly one case today:
-- week 8's Sunday is race day, not the standing "rest or easy hike".
create table fitness.session_templates (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),
  week_number int,
  session_type text not null check (session_type in ('upper', 'lower', 'run', 'rest')),
  title text not null,
  summary text,
  foreign key (block_id, week_number) references fitness.block_weeks(block_id, week_number) on delete cascade
);
create unique index session_templates_default on fitness.session_templates (block_id, day_of_week) where week_number is null;
create unique index session_templates_override on fitness.session_templates (block_id, day_of_week, week_number) where week_number is not null;

create table fitness.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_template_id uuid not null references fitness.session_templates(id) on delete cascade,
  order_num int not null,
  name text not null,
  prescription text not null,
  notes text,
  unique (session_template_id, order_num)
);

-- The 10K progression. One row per Tue/Thu/Sat run, plus the week 8 race
-- entry on the Sunday.
create table fitness.run_plan (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  week_number int not null,
  day_of_week int not null check (day_of_week between 1 and 7),
  distance_km numeric(5,2) not null,
  effort text not null,
  detail text,
  unique (block_id, week_number, day_of_week),
  foreign key (block_id, week_number) references fitness.block_weeks(block_id, week_number) on delete cascade
);

-- Standing rules -- not tied to a block, they apply across all of them.
create table fitness.rules (
  id uuid primary key default gen_random_uuid(),
  order_num int not null unique,
  title text not null,
  detail text not null
);
