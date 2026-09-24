-- These two partial unique indexes enforced "exactly one row per
-- (day_of_week, week_number)" -- the very assumption this change removes.
-- Widen both to include session_type, so a day can have up to one row
-- per session_type (e.g. one 'upper' + one 'run' for Monday) while still
-- blocking a genuine duplicate (two 'run' rows for the same day/week).
drop index fitness.session_templates_default;
drop index fitness.session_templates_override;
create unique index session_templates_default on fitness.session_templates (block_id, day_of_week, session_type) where week_number is null;
create unique index session_templates_override on fitness.session_templates (block_id, day_of_week, week_number, session_type) where week_number is not null;
