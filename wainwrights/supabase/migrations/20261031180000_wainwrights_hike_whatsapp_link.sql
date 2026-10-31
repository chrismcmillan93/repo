-- Hosted hikes: optional WhatsApp group invite link.
--
-- The link lives in hike_private next to the meeting point and host contact, so
-- only the host and approved attendees can read it (existing RLS policy on
-- hike_private + get_hike_by_token's can_see gate). Someone who only has the
-- hike link never sees it, so a stranger can't join the group.
--
-- Additive only: one nullable column, one new host-only function, and
-- get_hike_by_token re-created with the same signature and one extra key.
-- create_hike / edit_hike are deliberately not touched (changing their
-- signatures would leave overloads behind); the page calls set_hike_whatsapp.

alter table public.hike_private
  add column whatsapp_url text
  check (whatsapp_url is null or (
    char_length(whatsapp_url) <= 200
    and whatsapp_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{8,64}(\?[A-Za-z0-9=&_.%-]{0,100})?$'
  ));

create function public.set_hike_whatsapp(p_hike_id uuid, p_url text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  u text := nullif(trim(coalesce(p_url, '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or h.host_id <> uid then raise exception 'not_host'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  if u is not null and (char_length(u) > 200
     or u !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{8,64}(\?[A-Za-z0-9=&_.%-]{0,100})?$') then
    raise exception 'bad_whatsapp';
  end if;
  update public.hike_private set whatsapp_url = u where hike_id = h.id;
end $$;

revoke all on function public.set_hike_whatsapp(uuid, text) from public, anon, authenticated;
grant execute on function public.set_hike_whatsapp(uuid, text) to authenticated;

-- get_hike_by_token: identical to the live definition apart from 'whatsapp_url'
-- in the private object (only built when can_see = host or approved attendee).
create or replace function public.get_hike_by_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  p public.hike_private;
  is_host boolean;
  my_status text;
  my_attended boolean;
  can_see boolean;
  approved_n int;
  result jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where share_token = p_token;
  if not found then return null; end if;

  is_host := h.host_id = uid;
  select a.status, a.attended into my_status, my_attended
    from public.hike_attendees a where a.hike_id = h.id and a.user_id = uid;
  can_see := is_host or my_status = 'approved';
  select count(*) into approved_n from public.hike_attendees where hike_id = h.id and status = 'approved';

  result := jsonb_build_object(
    'id', h.id, 'title', h.title, 'area', h.area, 'start_at', h.start_at, 'spaces', h.spaces,
    'approved_count', approved_n, 'status', h.status, 'status_note', h.status_note,
    'walk', h.walk_snapshot, 'kit', to_jsonb(h.kit), 'turnaround_time', h.turnaround_time,
    'host_name', private.hike_display_name(h.host_id), 'is_host', is_host,
    'my_status', my_status, 'my_attended', my_attended, 'is_team_hike', h.team_id is not null,
    'attendance_confirmed_at', h.attendance_confirmed_at,
    'my_tick_count', (select count(*) from public.hike_ticks where hike_id = h.id and user_id = uid)
  );

  if can_see then
    select * into p from public.hike_private where hike_id = h.id;
    result := result || jsonb_build_object(
      'team_name', (select name from public.teams where id = h.team_id),
      'private', jsonb_build_object('meet_lat', p.meet_lat, 'meet_lng', p.meet_lng,
                                    'meet_note', p.meet_note, 'host_contact', p.host_contact,
                                    'whatsapp_url', p.whatsapp_url));
  end if;

  if is_host then
    result := result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'display_name', a.display_name,
               'status', a.status, 'message', a.message, 'requested_at', a.requested_at,
               'attended', a.attended) order by a.requested_at)
      from public.hike_attendees a where a.hike_id = h.id and a.status in ('requested', 'approved')), '[]'::jsonb));
  elsif can_see then
    result := result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', a.display_name) order by a.requested_at)
      from public.hike_attendees a where a.hike_id = h.id and a.status = 'approved'), '[]'::jsonb));
  end if;

  return result;
end $$;
