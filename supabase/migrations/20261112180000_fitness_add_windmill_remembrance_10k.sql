-- Chris's own race (user-owned, like the Santa Dash): Windmill Remembrance Day 10k, 8 Nov 2026.
insert into fitness.races (plan_version, race_date, name, role, status, sort_order, user_id, distance_label)
select 'v2', date '2026-11-08', 'Windmill Remembrance Day 10k', '10K race', 'entered', 99,
       (select user_id from fitness.races where name = 'Santa Dash' and user_id is not null limit 1), '10K'
where not exists (select 1 from fitness.races where name = 'Windmill Remembrance Day 10k' and race_date = date '2026-11-08')
  and exists (select 1 from fitness.races where name = 'Santa Dash' and user_id is not null);
