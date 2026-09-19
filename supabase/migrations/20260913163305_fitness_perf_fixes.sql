-- Advisor fixes: wrap auth.uid() as (select auth.uid()) so it's evaluated
-- once per query instead of once per row (auth_rls_initplan), and add
-- covering indexes for foreign keys the linter flagged as unindexed.

drop policy "own rows" on fitness.daily_logs;
create policy "own rows" on fitness.daily_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own rows" on fitness.daily_checks;
create policy "own rows" on fitness.daily_checks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own rows" on fitness.weekly_checkins;
create policy "own rows" on fitness.weekly_checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index meal_templates_block_week_fkey on fitness.meal_templates (block_id, week_number);
create index session_templates_block_week_fkey on fitness.session_templates (block_id, week_number);
create index weekly_checkins_block_id_fkey on fitness.weekly_checkins (block_id);
create index runner_profiles_user_id_fkey on fitness.runner_profiles (user_id);
create index generated_run_plans_runner_profile_id_fkey on fitness.generated_run_plans (runner_profile_id);
