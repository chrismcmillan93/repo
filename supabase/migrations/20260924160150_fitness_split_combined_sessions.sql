-- Monday (weeks 2-8), Tuesday (weeks 3-8) and Thursday (weeks 2-8) each
-- crammed two real activities into one session_templates row (one
-- session_type, one combined title/tick) -- "Upper lift + Intervals (PM)",
-- "Muay Thai + Easy run", "Muay Thai + Long run". Split each into its own
-- row so each activity gets its own tick. The existing row keeps its
-- week_number (still week-specific, still overriding that day's standing
-- null-week_number default) and is retitled to just its own activity; a
-- new row is inserted alongside it for the second activity, same
-- block_id/day_of_week/week_number.
--
-- This also fixes a real gap: Monday's session_type was 'upper', so
-- get_day_bundle() derived day_type = 'lift' and never joined run_plan for
-- it -- Monday's interval prescription (already sitting in run_plan) was
-- never actually reachable anywhere in the app despite existing in the
-- table. Splitting out a proper session_type = 'run' row for Monday's
-- evening intervals fixes that as a side effect.

-- Monday: retitle the existing upper-lift row, add the PM intervals as its
-- own run-type row.
update fitness.session_templates set title = 'Upper lift', summary = 'On the gym floor at 06:00.'
  where id in (
    'e9acb86f-997b-4585-8b12-6080fb581c14', '152d32f6-1492-4256-b96e-63ab65fe047f',
    '3730a27f-0481-4dae-afc6-e27477438238', '09d3f3ba-8c5c-4604-810c-91d9cbd26fe5',
    'f674342e-540a-433a-b059-e59025da2484', '3fcae2f4-5d5e-4d64-8b45-69cefa535560',
    'ff919275-5742-426b-bbf2-20a3ba2c9e60'
  );
insert into fitness.session_templates (block_id, day_of_week, week_number, session_type, title, summary)
select '772e46ac-5f82-4016-bfa7-4664a5d0ac04', 1, w, 'run', 'Intervals (PM)',
  'Evening intervals -- legs stay fresh since only upper precedes it. Distance and effort follow this week''s progression below.'
from unnest(array[2,3,4,5,6,7,8]) as w;

-- Tuesday: retitle the existing run row to just the easy run, add Muay
-- Thai as its own row (from week 3, when it starts).
update fitness.session_templates set title = 'Easy run', summary = 'Distance and effort follow this week''s progression below.'
  where id in (
    '8e1e8718-d16a-46dd-9a45-8b6415838a2e', '6f0c5e4d-6afa-44ae-a0ec-f7981538a829',
    '80464a8d-cb6f-40af-b5eb-678a377ff438', 'd4341aec-d076-4831-8826-b4606fffa5d6',
    '7849f23f-52c9-4428-a240-e55691a1a5da', '3e9be630-ab46-424a-b884-7ad758c34dfe'
  );
insert into fitness.session_templates (block_id, day_of_week, week_number, session_type, title, summary)
select '772e46ac-5f82-4016-bfa7-4664a5d0ac04', 2, w, 'muay_thai', 'Muay Thai', 'Johnsons, 6-7am.'
from unnest(array[3,4,5,6,7,8]) as w;

-- Thursday: retitle the existing run row to just the long run, add Muay
-- Thai as its own row (from week 2, when it starts).
update fitness.session_templates set title = 'Long run', summary = 'Distance and effort follow this week''s progression below.'
  where id in (
    '23b3bac1-621f-41e8-92a6-eaaa3cb67e68', 'a1951ef7-a650-4525-8f84-ca5ece0c7d41',
    '6a73894f-5d8a-4c00-bd9e-7c23e0d74d66', 'd8901ac3-6270-4149-a1f1-f0a6205cbd39',
    '993de53c-1850-4ec8-998d-7dc603247060', 'c1baeea9-7036-4185-aef0-5463140221aa',
    '97c599e1-c207-4737-bb71-1a4f69ae8e36'
  );
insert into fitness.session_templates (block_id, day_of_week, week_number, session_type, title, summary)
select '772e46ac-5f82-4016-bfa7-4664a5d0ac04', 4, w, 'muay_thai', 'Muay Thai', 'Johnsons, 6-7am.'
from unnest(array[2,3,4,5,6,7,8]) as w;
