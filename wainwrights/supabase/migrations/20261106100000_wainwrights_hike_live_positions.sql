-- Live hike map (walking-up-hills project, public schema).
--
-- On the day of a hosted hike, the host and approved attendees can each choose
-- to share where they are, and see where everyone else who opted in is.
--   * Strictly opt-in, per person, per hike: a row exists only while someone is
--     sharing. Stopping sharing deletes it.
--   * Only the host and approved attendees of that hike can read positions, and
--     only positions from people who are (still) the host or approved.
--   * Only the latest position is kept (one row per person per hike) - there is
--     no trail or history.
--   * Sharing only works in a window around the hike (3 h before the start to
--     18 h after) and only while the hike is open; cancelling or completing a
--     hike clears everyone's position.
--   * Clients get no table access at all. Every read and write goes through a
--     SECURITY DEFINER function below, which checks who is calling.

create table public.hike_live_positions (
  hike_id uuid not null references public.hikes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  lat numeric(8,5) not null check (lat between 49 and 61),
  lng numeric(8,5) not null check (lng between -9 and 2),
  accuracy_m int check (accuracy_m is null or accuracy_m between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (hike_id, user_id)
);
create index hike_live_positions_updated_idx on public.hike_live_positions (updated_at);

alter table public.hike_live_positions enable row level security;
revoke all on public.hike_live_positions from public, anon, authenticated;
-- No policies on purpose: with RLS on and no policy, the table is closed to
-- clients; the functions below run as their owner.

-- share_hike_position ---------------------------------------------------
create function public.share_hike_position(
  p_hike_id uuid, p_lat numeric, p_lng numeric, p_accuracy int default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id;
  if not found then raise exception 'not_found'; end if;
  if not (h.host_id = uid or exists (
        select 1 from public.hike_attendees a
        where a.hike_id = h.id and a.user_id = uid and a.status = 'approved')) then
    raise exception 'not_attendee';
  end if;
  if h.status <> 'open'
     or now() < h.start_at - interval '3 hours'
     or now() > h.start_at + interval '18 hours' then
    raise exception 'not_live';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 49 and 61 or p_lng not between -9 and 2 then
    raise exception 'bad_position';
  end if;

  insert into public.hike_live_positions (hike_id, user_id, display_name, lat, lng, accuracy_m, updated_at)
  values (h.id, uid, private.hike_display_name(uid), round(p_lat, 5), round(p_lng, 5),
          case when p_accuracy is null then null else least(greatest(p_accuracy, 0), 100000) end, now())
  on conflict (hike_id, user_id) do update
    set display_name = excluded.display_name, lat = excluded.lat, lng = excluded.lng,
        accuracy_m = excluded.accuracy_m, updated_at = excluded.updated_at;

  -- Housekeeping: nobody's position needs to outlive the day.
  delete from public.hike_live_positions where updated_at < now() - interval '1 day';
end $$;

-- stop_sharing_hike_position --------------------------------------------
create function public.stop_sharing_hike_position(p_hike_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.hike_live_positions where hike_id = p_hike_id and user_id = auth.uid();
end $$;

-- get_hike_positions ----------------------------------------------------
-- Positions updated in the last 3 hours, for the host and approved attendees only.
create function public.get_hike_positions(p_hike_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id;
  if not found then raise exception 'not_found'; end if;
  if not (h.host_id = uid or exists (
        select 1 from public.hike_attendees a
        where a.hike_id = h.id and a.user_id = uid and a.status = 'approved')) then
    raise exception 'not_attendee';
  end if;
  if h.status <> 'open' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', p.user_id,
      'name', p.display_name,
      'lat', p.lat,
      'lng', p.lng,
      'accuracy_m', p.accuracy_m,
      'updated_at', p.updated_at,
      'is_me', p.user_id = uid,
      'is_host', p.user_id = h.host_id
    ) order by p.updated_at desc)
    from public.hike_live_positions p
    where p.hike_id = h.id
      and p.updated_at > now() - interval '3 hours'
      and (p.user_id = h.host_id or exists (
            select 1 from public.hike_attendees a
            where a.hike_id = h.id and a.user_id = p.user_id and a.status = 'approved'))
  ), '[]'::jsonb);
end $$;

-- Cancelling or completing a hike clears everyone's position, and so does
-- someone leaving it (withdrawn / removed / declined).
create function private.hike_clear_positions_on_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status <> 'open' and old.status = 'open' then
    delete from public.hike_live_positions where hike_id = new.id;
  end if;
  return new;
end $$;
create trigger hikes_clear_positions after update of status on public.hikes
  for each row execute function private.hike_clear_positions_on_status();

create function private.hike_clear_position_on_leave() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status <> 'approved' and old.status = 'approved' then
    delete from public.hike_live_positions where hike_id = new.hike_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger hike_attendees_clear_position after update of status on public.hike_attendees
  for each row execute function private.hike_clear_position_on_leave();

-- Grants: signed-in users call the three public functions; nothing else.
revoke all on function private.hike_clear_positions_on_status(), private.hike_clear_position_on_leave()
  from public, anon, authenticated;
revoke all on function public.share_hike_position(uuid, numeric, numeric, int),
  public.stop_sharing_hike_position(uuid), public.get_hike_positions(uuid) from public, anon;
grant execute on function public.share_hike_position(uuid, numeric, numeric, int),
  public.stop_sharing_hike_position(uuid), public.get_hike_positions(uuid) to authenticated;
