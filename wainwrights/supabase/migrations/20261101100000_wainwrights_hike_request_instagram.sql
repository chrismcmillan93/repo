-- Hosted hikes: optional Instagram handle when asking to join.
--
-- The person can give a handle on the request form so the host can look them up
-- before approving. It is stored on their hike_attendees row and shown only to:
--   * the host (in the requests list and the going list), and
--   * approved walkers (in "Who's going", approved people only).
-- The existing RLS policy on hike_attendees ("own row, host sees all, approved
-- see approved") already limits direct reads the same way, so a pending
-- request's handle is never visible to other walkers. It is not emailed and it
-- is not used for Instagram Story images (those still use leaderboard handles).
--
-- Backwards compatible: request_hike_place gains an optional 4th parameter with a
-- default, so existing 3-argument calls (the production page) keep working. The
-- old signature is dropped in the same migration so no overload is left behind.

alter table public.hike_attendees
  add column instagram_handle text
  check (instagram_handle is null or instagram_handle ~ '^[a-z0-9._]{1,30}$');

drop function public.request_hike_place(text, text, boolean);

create function public.request_hike_place(
  p_token text, p_message text, p_ack boolean, p_instagram text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  existing text;
  new_status text;
  nm text;
  approved_n int;
  -- accept "@Name", "name" etc.; empty means none
  ig text := nullif(lower(regexp_replace(trim(coalesce(p_instagram, '')), '^@', '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_ack is not true then raise exception 'ack_required'; end if;
  if ig is not null and ig !~ '^[a-z0-9._]{1,30}$' then raise exception 'bad_instagram'; end if;
  select * into h from public.hikes where share_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if h.host_id = uid then raise exception 'is_host'; end if;
  if h.status <> 'open' or h.start_at <= now() then raise exception 'hike_closed'; end if;

  select status into existing from public.hike_attendees where hike_id = h.id and user_id = uid;
  if existing in ('requested', 'approved') then return jsonb_build_object('status', existing); end if;
  if existing in ('declined', 'removed') then raise exception 'cannot_rejoin'; end if;

  nm := private.hike_display_name(uid);
  select count(*) into approved_n from public.hike_attendees where hike_id = h.id and status = 'approved';

  if exists (select 1 from public.host_blocks where host_id = h.host_id and blocked_user_id = uid) then
    new_status := 'declined';
  elsif h.team_id is not null and approved_n < h.spaces and (
      exists (select 1 from public.teams where id = h.team_id and admin_user_id = uid)
      or exists (select 1 from public.team_members where team_id = h.team_id and user_id = uid and status = 'approved')) then
    new_status := 'approved';
  else
    new_status := 'requested';
  end if;

  insert into public.hike_attendees (hike_id, user_id, display_name, status, message, instagram_handle, safety_ack_at, requested_at, decided_at)
  values (h.id, uid, nm, new_status, nullif(left(trim(coalesce(p_message, '')), 300), ''), ig, now(), now(),
          case when new_status = 'requested' then null else now() end)
  on conflict (hike_id, user_id) do update
    set display_name = excluded.display_name, status = excluded.status, message = excluded.message,
        instagram_handle = excluded.instagram_handle,
        safety_ack_at = excluded.safety_ack_at, requested_at = excluded.requested_at,
        decided_at = excluded.decided_at, attended = null;

  if new_status = 'requested' then
    perform private.hike_notify(h.host_id, h.id, 'request', nm || ' asked to join "' || h.title || '".');
  elsif new_status = 'approved' then
    perform private.hike_notify(h.host_id, h.id, 'joined', nm || ' (team member) joined "' || h.title || '".');
    perform private.hike_notify(uid, h.id, 'approved', 'You''re in for "' || h.title || '". Open the hike to see the meeting point.');
  end if;
  return jsonb_build_object('status', new_status);
end $$;

revoke all on function public.request_hike_place(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.request_hike_place(text, text, boolean, text) to authenticated;

-- get_hike_by_token: identical to the live definition apart from 'instagram_handle' in the
-- host's attendee list (requested + approved) and in the approved walkers' list (approved only).
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
               'attended', a.attended, 'instagram_handle', a.instagram_handle) order by a.requested_at)
      from public.hike_attendees a where a.hike_id = h.id and a.status in ('requested', 'approved')), '[]'::jsonb));
  elsif can_see then
    result := result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', a.display_name,
               'instagram_handle', a.instagram_handle) order by a.requested_at)
      from public.hike_attendees a where a.hike_id = h.id and a.status = 'approved'), '[]'::jsonb));
  end if;

  return result;
end $$;
