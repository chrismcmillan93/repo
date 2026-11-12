-- Life app (`/life`): own schema, real per-user ownership from day one.
-- Every table: RLS on, one policy `user_id = auth.uid()` for all operations,
-- granted to `authenticated` only (anon gets nothing). No policy here queries
-- another table, so there is no RLS recursion risk.
create schema if not exists life;

create table life.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  area text not null default 'Personal',
  why text not null default '',
  start_date date not null default current_date,
  target_date date,
  measure text not null default 'steps' check (measure in ('numeric', 'steps')),
  start_value numeric,
  target_value numeric,
  current_value numeric,
  unit text not null default '',
  auto_source text check (auto_source in ('fitness_weight', 'fitness_training')),
  status text not null default 'active' check (status in ('active', 'paused', 'achieved', 'stopped')),
  source_goal_id uuid,
  last_progress_on date,
  created_at timestamptz not null default now(),
  unique (user_id, source_goal_id)
);

create table life.goal_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references life.goals(id) on delete cascade,
  level text not null default 'month' check (level in ('year', 'quarter', 'month')),
  title text not null,
  due_date date,
  done_on date,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table life.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid references life.goals(id) on delete set null,
  week_start date not null,
  title text not null,
  target_count int not null default 1 check (target_count > 0),
  done_count int not null default 0 check (done_count >= 0),
  source text check (source in ('fit_training', 'fit_meals', 'fit_weigh')),
  created_at timestamptz not null default now()
);
create unique index commitments_auto_one_per_week on life.commitments (user_id, week_start, source) where source is not null;

create table life.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('inbox', 'open', 'done')),
  due_date date,
  top_date date,
  goal_id uuid references life.goals(id) on delete set null,
  commitment_id uuid references life.commitments(id) on delete set null,
  done_on date,
  carried_count int not null default 0,
  repeat text check (repeat in ('daily', 'weekly', 'monthly')),
  created_at timestamptz not null default now()
);

create table life.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table life.habit_checks (
  habit_id uuid not null references life.habits(id) on delete cascade,
  check_date date not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (habit_id, check_date)
);

create table life.journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  kind text not null default 'note' check (kind in ('note', 'miss', 'decision', 'close')),
  body text not null,
  created_at timestamptz not null default now()
);

create table life.list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list text not null check (list in ('shopping', 'packing', 'wishlist')),
  group_name text not null default '',
  title text not null,
  done boolean not null default false,
  cost numeric(12,2),
  status text not null default 'idea' check (status in ('idea', 'planned', 'booked', 'done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table life.career_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('win', 'skill', 'agenda', 'deal', 'income', 'learning')),
  title text not null,
  detail text not null default '',
  stage text not null default '',
  amount numeric(12,2),
  progress int not null default 0,
  target int not null default 0,
  item_date date not null default current_date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table life.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'event' check (kind in ('trip', 'event', 'renewal', 'birthday')),
  start_date date not null,
  end_date date,
  note text not null default '',
  repeats_yearly boolean not null default false,
  created_at timestamptz not null default now()
);

create table life.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index goals_user_idx on life.goals (user_id, status);
create index goal_steps_goal_idx on life.goal_steps (goal_id);
create index goal_steps_user_idx on life.goal_steps (user_id);
create index commitments_user_week_idx on life.commitments (user_id, week_start);
create index commitments_goal_idx on life.commitments (goal_id);
create index tasks_user_status_idx on life.tasks (user_id, status, due_date);
create index tasks_goal_idx on life.tasks (goal_id);
create index tasks_commitment_idx on life.tasks (commitment_id);
create index habits_user_idx on life.habits (user_id);
create index habit_checks_user_date_idx on life.habit_checks (user_id, check_date);
create index journal_user_date_idx on life.journal (user_id, entry_date);
create index list_items_user_list_idx on life.list_items (user_id, list);
create index career_items_user_kind_idx on life.career_items (user_id, kind);
create index events_user_date_idx on life.events (user_id, start_date);

do $$
declare t text;
begin
  foreach t in array array['goals', 'goal_steps', 'commitments', 'tasks', 'habits', 'habit_checks', 'journal', 'list_items', 'career_items', 'events', 'settings']
  loop
    execute format('alter table life.%I enable row level security', t);
    execute format('create policy "own rows" on life.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on life.%I to authenticated', t);
  end loop;
end $$;

grant usage on schema life to authenticated;
