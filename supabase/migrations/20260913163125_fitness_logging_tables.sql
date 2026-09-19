-- Daily logging tables: what the app actually writes to.

create table fitness.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2),
  nutrition_status text check (nutrition_status in ('yes', 'partial', 'no')),
  training_status text check (training_status in ('yes', 'partial', 'no')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create trigger set_updated_at before update on fitness.daily_logs
  for each row execute function fitness.set_updated_at();

-- Per-item ticks: meals, exercises, the run for the day. item_id is a plain
-- text key the client makes up (e.g. 'meal:lift:3', 'exercise:upper:1',
-- 'session:run') -- upserted with onConflict 'user_id,log_date,item_id',
-- same pattern as the legacy checkbox_states tables elsewhere in this repo.
create table fitness.daily_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  item_id text not null,
  is_checked boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, log_date, item_id)
);
create trigger set_updated_at before update on fitness.daily_checks
  for each row execute function fitness.set_updated_at();

create table fitness.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  week_number int not null,
  weight_kg numeric(5,2),
  leak_count int,
  win text,
  challenge text,
  submitted_at timestamptz not null default now(),
  unique (user_id, block_id, week_number)
);
