-- Phase 2 stubs: schema only, no UI. See CLAUDE.md "Phase 2" section for the
-- intended flow. RLS is enabled with no policies at all for now -- deny by
-- default -- since there's no public form yet to decide access rules for.

create table fitness.runner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null, -- TODO: tighten when Phase 2 lands
  email text not null,
  age int,
  sex text,
  current_weekly_km numeric(5,2),
  longest_recent_run_km numeric(5,2),
  goal_distance text,
  goal_date date,
  days_per_week int,
  created_at timestamptz not null default now()
);

create table fitness.generated_run_plans (
  id uuid primary key default gen_random_uuid(),
  runner_profile_id uuid not null references fitness.runner_profiles(id) on delete cascade,
  plan_json jsonb not null,
  created_at timestamptz not null default now()
);
