-- RECONSTRUCTED, not the original migration text -- see the note at the top
-- of add_prep_and_shopping_tables.sql; the same caveat applies here.
--
-- Adds day-of-week targeting to prep_tasks, "v2"/flexible from the start
-- here: prep_day_of_week is an *array*, not a single day, so one task can
-- be valid to prep on more than one day (e.g. "Wed or Thu") and shows
-- under every day group it's valid for in the UI -- ticking it once, from
-- any of those groups, marks the same task_id done for the week either
-- way. covers_day_of_week separately records which day's meals the task
-- is actually *for*, independent of which day(s) it's valid to prep on.

alter table fitness.prep_tasks
  add column prep_day_of_week integer[] not null default array[]::integer[],
  add column covers_day_of_week integer;

alter table fitness.prep_tasks
  alter column prep_day_of_week drop default,
  add constraint prep_day_of_week_valid check (prep_day_of_week <@ array[1, 2, 3, 4, 5, 6, 7]),
  add constraint prep_tasks_covers_day_of_week_check check (covers_day_of_week >= 1 and covers_day_of_week <= 7);
