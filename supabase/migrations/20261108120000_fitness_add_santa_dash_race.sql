-- One-off: add the Santa Dash (Sun 6 Dec 2026) to Chris's own races. A fun run
-- where the distance (5K or 10K) is picked on the day. Not booked. Looked up by
-- email so no user id is committed; does nothing if the race already exists.
insert into fitness.races (plan_version, race_date, name, distance_label, role, status, sort_order, user_id)
select 'v2', '2026-12-06', 'Santa Dash', '5K or 10K (pick on the day)', 'Fun run', 'planned', 100, u.id
from auth.users u
where u.email = 'chris@chris-mcmillan.co.uk'
on conflict (plan_version, race_date, name) do nothing;
