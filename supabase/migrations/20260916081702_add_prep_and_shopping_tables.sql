-- RECONSTRUCTED, not the original migration text: this table set already
-- existed in the live `dashboards-new` project when this session started
-- (applied by an earlier session today, outside this repo's tracked
-- migrations -- confirmed via list_migrations, whose version/name this
-- file's filename matches exactly). This file was written afterwards by
-- introspecting the live schema (columns, constraints, RLS policies) so
-- the repo's migration history isn't silently missing the table
-- definitions a later migration in this same file set depends on. It is a
-- best-effort match, not a byte-for-byte replay of what actually ran.
--
-- "This week" section: prep tasks and shopping list, each with a matching
-- per-user weekly check table, same *_tasks/*_items (plan, read-mostly) vs
-- *_checks (logging, RLS-scoped to the caller) split as the rest of this
-- schema. Checks are keyed by week_start_date, not log_date -- these are
-- weekly-cadence items, "checked" means "done for this week".
--
-- NOTE: prep_tasks has no day-of-week column yet here -- see
-- allow_flexible_prep_days_v2 (same day, later), which adds
-- prep_day_of_week and covers_day_of_week. Exactly what (if anything)
-- shipped for day-targeting in between is not recoverable from the live
-- schema alone; not guessed at further than that.

create table fitness.prep_tasks (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  title text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table fitness.prep_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  task_id uuid not null references fitness.prep_tasks(id) on delete cascade,
  is_checked boolean not null default false,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date, task_id)
);

create table fitness.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references fitness.blocks(id) on delete cascade,
  category text not null,
  item text not null,
  weekly_quantity text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table fitness.shopping_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  item_id uuid not null references fitness.shopping_list_items(id) on delete cascade,
  is_checked boolean not null default false,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date, item_id)
);

alter table fitness.prep_tasks enable row level security;
alter table fitness.prep_checks enable row level security;
alter table fitness.shopping_list_items enable row level security;
alter table fitness.shopping_checks enable row level security;

create policy "read prep tasks" on fitness.prep_tasks for select using (true);
create policy "own prep checks" on fitness.prep_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "read shopping items" on fitness.shopping_list_items for select using (true);
create policy "own shopping checks" on fitness.shopping_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- NOTE: table grants to `authenticated` were missing at this point -- RLS
-- policies alone don't grant PostgREST access. Not caught until
-- fitness_prep_and_shopping_grants_and_indexes; see that file.
