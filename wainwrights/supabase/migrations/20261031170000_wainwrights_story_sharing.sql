-- Instagram Story sharing.
--
-- 1. checkbox_states.ticked_at: when a wainwrights fell was ticked. Set by a
--    trigger so every path (tracker, complete_hike) is covered. Ticks made
--    before this migration have null and can't be shared as a "today" story.
-- 2. hike_story_people(): names + Instagram handles of the walkers on a hike,
--    returned only to the host and approved attendees.

alter table public.checkbox_states add column if not exists ticked_at timestamptz;

create or replace function private.set_ticked_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.dashboard_id is distinct from 'wainwrights' then
    return new;
  end if;
  if new.is_checked is true then
    if tg_op = 'INSERT' or old.is_checked is distinct from true then
      new.ticked_at := now();
    end if;
  else
    new.ticked_at := null;
  end if;
  return new;
end $$;

drop trigger if exists checkbox_states_ticked_at on public.checkbox_states;
create trigger checkbox_states_ticked_at
  before insert or update on public.checkbox_states
  for each row execute function private.set_ticked_at();

create index if not exists checkbox_states_user_ticked_idx
  on public.checkbox_states (user_id, ticked_at desc)
  where dashboard_id = 'wainwrights' and ticked_at is not null;

create or replace function public.hike_story_people(p_hike_id uuid)
returns table (display_name text, instagram_handle text, is_host boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmed timestamptz;
  v_host uuid;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if not (private.hike_is_host(p_hike_id) or private.hike_is_approved(p_hike_id)) then
    raise exception 'not part of this hike';
  end if;
  select h.attendance_confirmed_at, h.host_id into v_confirmed, v_host
    from public.hikes h where h.id = p_hike_id;

  return query
  select private.hike_display_name(u.uid)::text,
         (select o.instagram_handle from public.leaderboard_opt_in o where o.user_id = u.uid),
         u.uid = v_host
  from (
    select v_host as uid
    union
    select a.user_id from public.hike_attendees a
     where a.hike_id = p_hike_id and a.status = 'approved'
       and (v_confirmed is null or a.attended is true)
  ) u
  order by (u.uid = v_host) desc, 1;
end $$;

revoke all on function public.hike_story_people(uuid) from public, anon, authenticated;
grant execute on function public.hike_story_people(uuid) to authenticated;
