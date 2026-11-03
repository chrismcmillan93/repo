-- Retire the v1 (Block 2) training plan. Nothing is deleted: the rows are
-- flagged archived and tagged plan_version = 'v1'. Backup of every row:
-- backups/old-plan-20261102.json. Nutrition tables, blocks and block_weeks
-- are untouched. session_exercises rows follow their parent template.
-- Archived session_templates are still read by get_day_bundle() ONLY to work
-- out the nutrition day type (lift/run/rest) for dates inside Block 2.

alter table fitness.session_templates
  add column if not exists plan_version text not null default 'v1',
  add column if not exists archived boolean not null default false;

alter table fitness.run_plan
  add column if not exists plan_version text not null default 'v1',
  add column if not exists archived boolean not null default false;

update fitness.session_templates set plan_version = 'v1', archived = true where plan_version = 'v1';
update fitness.run_plan          set plan_version = 'v1', archived = true where plan_version = 'v1';

do $$
begin
  if (select count(*) from fitness.session_templates where archived) <> 56
     or (select count(*) from fitness.run_plan where archived) <> 32
     or (select count(*) from fitness.session_exercises) <> 11 then
    raise exception 'v1 retire: unexpected row counts, aborting';
  end if;
end $$;
