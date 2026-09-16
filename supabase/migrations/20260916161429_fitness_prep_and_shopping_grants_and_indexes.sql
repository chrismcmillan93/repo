-- prep_tasks/prep_checks/shopping_list_items/shopping_checks already exist
-- (added by an earlier session today, outside this repo's tracked
-- migrations -- see add_prep_and_shopping_tables and
-- allow_flexible_prep_days_v2, both reconstructed) with reasonable RLS
-- policies already in place. But `authenticated` was never granted table
-- privileges on any of the four -- only `postgres` has any grant at all --
-- so every PostgREST call from the app would fail with a permission error
-- regardless of RLS. Same "belt and suspenders" gap this schema has hit
-- before: a policy alone is not enough, the role also needs the underlying
-- GRANT.

grant select on fitness.prep_tasks, fitness.shopping_list_items to authenticated;
grant select, insert, update, delete on fitness.prep_checks, fitness.shopping_checks to authenticated;

-- Bring the two "own rows" policies in line with the rest of this schema's
-- auth_rls_initplan fix (see fitness_perf_fixes) -- (select auth.uid())
-- evaluates once per query instead of once per row.
drop policy "own prep checks" on fitness.prep_checks;
create policy "own prep checks" on fitness.prep_checks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own shopping checks" on fitness.shopping_checks;
create policy "own shopping checks" on fitness.shopping_checks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Covering indexes for the foreign keys the linter flags as unindexed,
-- same pattern as fitness_perf_fixes.
create index prep_tasks_block_id_fkey on fitness.prep_tasks (block_id);
create index prep_checks_task_id_fkey on fitness.prep_checks (task_id);
create index shopping_list_items_block_id_fkey on fitness.shopping_list_items (block_id);
create index shopping_checks_item_id_fkey on fitness.shopping_checks (item_id);
