-- "Today" and "last month" were computed in UTC, which is a day/month behind
-- UK time between midnight and 1am during BST. The app (Chris, UK) now uses
-- the browser's local date; these server-side calculations use Europe/London
-- so both always agree on the date.

create or replace function goals.pending_reviews()
 returns table(period_type goals.review_period, period_start date, period_end date, updates_logged bigint)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  with uk as (select now() at time zone 'Europe/London' as t),
  periods as (
    select 'month'::goals.review_period as pt,
           (date_trunc('month', uk.t) - interval '1 month')::date as ps,
           (date_trunc('month', uk.t) - interval '1 day')::date as pe
    from uk
    union all
    select 'quarter'::goals.review_period,
           (date_trunc('quarter', uk.t) - interval '3 months')::date,
           (date_trunc('quarter', uk.t) - interval '1 day')::date
    from uk
    union all
    select 'year'::goals.review_period,
           (date_trunc('year', uk.t) - interval '1 year')::date,
           (date_trunc('year', uk.t) - interval '1 day')::date
    from uk
  )
  select p.pt, p.ps, p.pe,
    (select count(*) from goals.goal_updates u
      where u.user_id = auth.uid() and u.occurred_on between p.ps and p.pe)
  from periods p
  where auth.uid() is not null
    and exists (
      select 1 from goals.goals g
      where g.user_id = auth.uid() and g.start_date <= p.pe
    )
    and not exists (
      select 1 from goals.reviews r
      where r.user_id = auth.uid() and r.period_type = p.pt and r.period_start = p.ps
    );
$function$;

create or replace view goals.goal_progress with (security_invoker = true) as
with mil as (
  select milestones.goal_id, count(*)::numeric as total, count(milestones.completed_on)::numeric as done
  from goals.milestones group by milestones.goal_id
), latest as (
  select distinct on (goal_updates.goal_id) goal_updates.goal_id, goal_updates.occurred_on, goal_updates.value, goal_updates.confidence
  from goals.goal_updates
  order by goal_updates.goal_id, goal_updates.occurred_on desc, goal_updates.created_at desc
), counts as (
  select goal_updates.goal_id, count(*) as update_count
  from goals.goal_updates group by goal_updates.goal_id
), passfail as (
  select goal_updates.goal_id,
    count(*) filter (where goal_updates.value >= 1::numeric) as hits,
    count(*) as total
  from goals.goal_updates group by goal_updates.goal_id
), sums as (
  select goal_updates.goal_id, sum(goal_updates.value) as total
  from goals.goal_updates group by goal_updates.goal_id
), cur as (
  select g.id,
    case when g.measure_type = 'numeric'::goals.measure_type and g.cumulative
      then g.start_value + coalesce(s.total, 0::numeric)
      else coalesce(l.value, g.start_value)
    end as value
  from goals.goals g
    left join latest l on l.goal_id = g.id
    left join sums s on s.goal_id = g.id
), today as (
  select (now() at time zone 'Europe/London')::date as d
)
select g.id, g.user_id, g.area_id, g.title, g.status, g.horizon, g.priority, g.measure_type,
  g.start_date, g.target_date, g.unit, g.start_value, g.target_value, g.direction,
  cur.value as current_value,
  l.occurred_on as last_update_on,
  l.confidence as latest_confidence,
  coalesce(c.update_count, 0::bigint) as update_count,
  coalesce(m.total, 0::numeric) as milestone_count,
  coalesce(m.done, 0::numeric) as milestones_done,
  case
    when g.measure_type = 'numeric'::goals.measure_type and g.target_value is not null and g.target_value <> g.start_value
      then greatest(0::numeric, least(1::numeric, (cur.value - g.start_value) / (g.target_value - g.start_value)))
    when g.measure_type = 'milestone'::goals.measure_type and coalesce(m.total, 0::numeric) > 0::numeric then m.done / m.total
    when g.measure_type = 'pass_fail'::goals.measure_type and coalesce(p.total, 0::bigint) > 0 then p.hits::numeric / p.total::numeric
    else null::numeric
  end as percent_complete,
  case
    when g.target_date is null or g.target_date = g.start_date then null::numeric
    else greatest(0::numeric, least(1::numeric, (today.d - g.start_date)::numeric / (g.target_date - g.start_date)::numeric))
  end as percent_elapsed,
  case when g.target_date is null then null::integer else g.target_date - today.d end as days_remaining,
  case when l.occurred_on is null then null::integer else today.d - l.occurred_on end as days_since_update,
  coalesce(p.hits, 0::bigint) as pass_fail_hits,
  coalesce(p.total, 0::bigint) as pass_fail_total
from goals.goals g
  cross join today
  join cur on cur.id = g.id
  left join mil m on m.goal_id = g.id
  left join latest l on l.goal_id = g.id
  left join counts c on c.goal_id = g.id
  left join passfail p on p.goal_id = g.id;

notify pgrst, 'reload schema';
