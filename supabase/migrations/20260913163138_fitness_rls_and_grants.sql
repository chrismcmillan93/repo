-- RLS on every table from the start -- this app never has an "anon full
-- access" transitional phase like usa did; it launches straight into real
-- magic-link auth, so the anon key never gets schema usage at all.

alter table fitness.blocks enable row level security;
alter table fitness.block_weeks enable row level security;
alter table fitness.week_targets enable row level security;
alter table fitness.meal_templates enable row level security;
alter table fitness.session_templates enable row level security;
alter table fitness.session_exercises enable row level security;
alter table fitness.run_plan enable row level security;
alter table fitness.rules enable row level security;
alter table fitness.daily_logs enable row level security;
alter table fitness.daily_checks enable row level security;
alter table fitness.weekly_checkins enable row level security;
alter table fitness.runner_profiles enable row level security;
alter table fitness.generated_run_plans enable row level security;

-- Plan/reference tables: readable by any authenticated user. No insert/
-- update/delete policy -- these are edited by hand via SQL (execute_sql or
-- the dashboard), never through the app.
create policy "authenticated read" on fitness.blocks for select to authenticated using (true);
create policy "authenticated read" on fitness.block_weeks for select to authenticated using (true);
create policy "authenticated read" on fitness.week_targets for select to authenticated using (true);
create policy "authenticated read" on fitness.meal_templates for select to authenticated using (true);
create policy "authenticated read" on fitness.session_templates for select to authenticated using (true);
create policy "authenticated read" on fitness.session_exercises for select to authenticated using (true);
create policy "authenticated read" on fitness.run_plan for select to authenticated using (true);
create policy "authenticated read" on fitness.rules for select to authenticated using (true);

-- Logging tables: strictly the signed-in user's own rows.
create policy "own rows" on fitness.daily_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on fitness.daily_checks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on fitness.weekly_checkins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Phase 2 stub tables: RLS enabled above, deliberately no policies yet (see
-- fitness_phase2_stub_tables.sql). Nothing to grant either.

grant usage on schema fitness to authenticated;
grant select on
  fitness.blocks, fitness.block_weeks, fitness.week_targets, fitness.meal_templates,
  fitness.session_templates, fitness.session_exercises, fitness.run_plan, fitness.rules
  to authenticated;
grant select, insert, update, delete on
  fitness.daily_logs, fitness.daily_checks, fitness.weekly_checkins
  to authenticated;
