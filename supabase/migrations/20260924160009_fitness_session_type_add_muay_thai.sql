-- A day can now genuinely have two trainable activities (Monday's AM upper
-- lift + PM intervals; Tuesday/Thursday's AM Muay Thai + PM run), each
-- wanting its own tick. Muay Thai has no session_type of its own yet --
-- add it so it can be a real, separately-tracked row instead of text
-- crammed into another session's title/summary.
alter table fitness.session_templates drop constraint session_templates_session_type_check;
alter table fitness.session_templates add constraint session_templates_session_type_check
  check (session_type = any (array['upper', 'lower', 'run', 'rest', 'muay_thai']));
