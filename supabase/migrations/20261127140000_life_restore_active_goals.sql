-- Life app: bring the still-active goals back from life_archive after the fresh start, with dates reset
-- so nothing earlier shows. The achieved goal and the one completed step stay archived (history before
-- 30 Nov). Same ids are kept. Start dates move to the start day, target dates already in the past are
-- cleared (later ones are kept), and last-progress dates are cleared so a restored goal is not flagged as
-- stalled on day one. Idempotent: a goal already in life.goals is skipped. Run once, on request.
insert into life.goals (id, user_id, title, area, why, start_date, target_date, measure, start_value, target_value, current_value, unit, auto_source, status, source_goal_id, last_progress_on, created_at)
select a.id, a.user_id, a.title, a.area, a.why, date '2026-11-30',
       case when a.target_date >= date '2026-11-30' then a.target_date else null end,
       a.measure, a.start_value, a.target_value, a.current_value, a.unit, a.auto_source, 'active', null, null, a.created_at
from life_archive.goals a
where a.status = 'active'
  and not exists (select 1 from life.goals g where g.id = a.id);
