-- Two real-world adjustments Chris reported on 29 Sept (week 3, Tuesday):
--
-- 1. Tuesday's Muay Thai (originally set to start today, "from Tue 29
--    Sept") is pushed back one week -- delete the week-3 Tuesday
--    muay_thai row so this Tuesday reverts to just its easy run; week 4's
--    muay_thai row (already seeded) becomes the real start (6 Oct).
--
-- 2. Monday (28 Sept) was missed entirely -- neither the upper lift nor
--    its evening intervals happened. The upper lift is being done today
--    instead: a one-off session_templates row for (day_of_week=2,
--    week_number=3) -- week_number uniquely identifies this exact Tuesday
--    within this block (no repeating weeks), so this doesn't touch any
--    other Tuesday. Today's evening run is undecided between the normal
--    Tuesday easy run and Monday's missed intervals -- noted on the easy
--    run's own run_plan.detail (which also needed its stale "from Tue 29
--    Sept" Muay Thai mention removed).
delete from fitness.session_templates where id = 'b878c9a9-522e-4443-b5fd-727bc161e8d7';

update fitness.run_plan set detail = 'Or swap for Monday''s missed intervals instead (5 x 800m hard, 2 min jog recovery, 7.5km) if you didn''t do them yesterday.'
  where id = 'c10522d8-ba2c-4f25-a5a0-86ab59796c1e';

insert into fitness.session_templates (block_id, day_of_week, week_number, session_type, title, summary)
values ('772e46ac-5f82-4016-bfa7-4664a5d0ac04', 2, 3, 'upper', 'Upper lift (make-up from Monday)', 'Missed Monday entirely -- doing it today instead. On the gym floor at 06:00.');
