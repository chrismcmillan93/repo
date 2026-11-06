-- Community heat map: where everyone has climbed (walking-up-hills project, public schema).
--
-- Strictly opt-in, separately from the leaderboard. The leaderboard terms promise that the specific fells
-- someone has climbed are not shared, so joining the leaderboard does NOT add anyone to this map; people
-- tick a separate box ("include my ticked fells, anonymously") that sets heatmap_ok.
--   * Only counts per fell leave the database, never who ticked what.
--   * Nothing is returned until at least 5 people have opted in (min_contributors), and a fell with fewer
--     than 3 opted-in ticks is left out, so a count can't point at one or two individuals.
--   * Leaving the leaderboard deletes the row, which ends the contribution. Suspended users are excluded.
--   * Opted-in people only ever change their own flag, through set_heatmap_sharing().

alter table public.leaderboard_opt_in add column if not exists heatmap_ok boolean not null default false;

create function public.set_heatmap_sharing(p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  update public.leaderboard_opt_in set heatmap_ok = coalesce(p_on, false) where user_id = uid;
  if not found then raise exception 'not_on_leaderboard'; end if;
end $$;

-- null when the caller isn't on the leaderboard, otherwise whether they contribute
create function public.my_heatmap_sharing() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select l.heatmap_ok from public.leaderboard_opt_in l where l.user_id = auth.uid()
$$;

create function public.wainwright_fell_heat() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  k_people constant int := 5;   -- people who must have opted in before anything is shown
  k_fell constant int := 3;     -- ticks a fell needs before its count is shown
  n int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select count(*) into n from public.leaderboard_opt_in l
   where l.heatmap_ok and not exists (select 1 from public.suspended_users su where su.user_id = l.user_id);
  if n < k_people then
    return jsonb_build_object('contributors', null, 'min_contributors', k_people, 'min_per_fell', k_fell, 'fells', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'contributors', n, 'min_contributors', k_people, 'min_per_fell', k_fell,
    'fells', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.item_id, 'count', t.cnt) order by t.cnt desc, t.item_id)
      from (
        select c.item_id, count(*) as cnt
        from public.checkbox_states c
        join public.leaderboard_opt_in l on l.user_id = c.user_id and l.heatmap_ok
        join public.fell_heights h on h.item_id = c.item_id
        where c.dashboard_id = 'wainwrights' and c.is_checked
          and not exists (select 1 from public.suspended_users su where su.user_id = c.user_id)
        group by c.item_id
        having count(*) >= k_fell
      ) t), '[]'::jsonb));
end $$;

revoke all on function public.set_heatmap_sharing(boolean), public.my_heatmap_sharing(), public.wainwright_fell_heat() from public, anon;
grant execute on function public.set_heatmap_sharing(boolean), public.my_heatmap_sharing(), public.wainwright_fell_heat() to authenticated;
