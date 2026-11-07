-- Co-hosts on hosted hikes (walking-up-hills project).
--
-- The host picks an approved attendee and gives them one of three levels:
--   approvals  approve / decline join requests
--   standard   approvals + remove people, edit details, WhatsApp link, tick the fells for everyone
--   full       standard + cancel the hike, remove-and-block, add/remove other co-hosts (not full ones)
-- The original host (hikes.host_id) always keeps everything, is the only one who can grant or take away `full`,
-- and the only one who changes the host contact line. A co-host is still an approved attendee (counts toward the
-- places, sees the private details, can share their position); the level lives on hike_attendees.cohost_level.
-- Co-hosts get the emails a host gets (new request, someone pulled out...) because those notifications now also go
-- to every co-host. Stepping out of the hike (withdrawn / removed) clears the level.
--
-- Only CREATE OR REPLACE and ADD COLUMN: no function is dropped and nothing is deleted.
-- (undo_hike_ticks, which contains a DELETE of the walker's own tick records, is in the next migration on its own, because the
-- Supabase connector asks for confirmation on anything containing a delete.)

alter table public.hike_attendees add column if not exists cohost_level text
  check (cohost_level is null or cohost_level in ('approvals', 'standard', 'full'));

-- 4 = the host, 3 = full co-host, 2 = standard, 1 = approvals only, 0 = nobody special
create or replace function private.hike_rank(p_hike uuid, p_uid uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_uid is null then 0
    when exists (select 1 from public.hikes h where h.id = p_hike and h.host_id = p_uid) then 4
    else coalesce((select case a.cohost_level when 'full' then 3 when 'standard' then 2 when 'approvals' then 1 else 0 end
                   from public.hike_attendees a
                   where a.hike_id = p_hike and a.user_id = p_uid and a.status = 'approved'), 0)
  end
$$;
revoke all on function private.hike_rank(uuid, uuid) from public, anon, authenticated;

-- A level never outlives the place
create or replace function private.trg_cohost_reset() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status <> 'approved' then new.cohost_level := null; end if;
  return new;
end $$;
create or replace trigger cohost_reset before insert or update on public.hike_attendees
  for each row execute function private.trg_cohost_reset();

-- Tell the host and every co-host (optionally not one person, usually the one who did it)
create or replace function private.hike_notify_hosts(p_hike uuid, p_kind text, p_body text, p_except uuid default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.hike_notifications (user_id, hike_id, kind, body)
  select u.uid, p_hike, p_kind, left(p_body, 300)
  from (
    select h.host_id as uid from public.hikes h where h.id = p_hike
    union
    select a.user_id from public.hike_attendees a
     where a.hike_id = p_hike and a.status = 'approved' and a.cohost_level is not null
  ) u
  where u.uid is distinct from p_except
$$;
revoke all on function private.hike_notify_hosts(uuid, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- set / clear a co-host

create or replace function public.set_hike_cohost(p_hike_id uuid, p_user_id uuid, p_level text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  my_rank int;
  st text;
  cur text;
  lvl text := nullif(lower(trim(coalesce(p_level, ''))), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found then raise exception 'not_found'; end if;
  my_rank := private.hike_rank(h.id, uid);
  if my_rank < 3 then raise exception 'not_allowed'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  if lvl is not null and lvl not in ('approvals', 'standard', 'full') then raise exception 'bad_level'; end if;
  if p_user_id = uid then raise exception 'cannot_change_self'; end if;
  if p_user_id = h.host_id then raise exception 'is_host'; end if;
  select status, cohost_level into st, cur from public.hike_attendees where hike_id = h.id and user_id = p_user_id;
  if st is distinct from 'approved' then raise exception 'not_attendee'; end if;
  if my_rank < 4 and (lvl = 'full' or cur = 'full') then raise exception 'host_only'; end if;
  if lvl is not distinct from cur then return; end if;
  update public.hike_attendees set cohost_level = lvl where hike_id = h.id and user_id = p_user_id;
  perform private.hike_notify(p_user_id, h.id, 'cohost',
    case when lvl is null then 'You''re no longer a co-host of "' || h.title || '".'
         else 'You''re now a co-host of "' || h.title || '" (' ||
              case lvl when 'approvals' then 'you can approve or decline requests'
                       when 'standard' then 'you can approve requests, edit details, remove people and tick the fells'
                       else 'you can do everything the host can' end || ').' end);
end $$;
revoke all on function public.set_hike_cohost(uuid, uuid, text) from public, anon;
grant execute on function public.set_hike_cohost(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- what each level may do

create or replace function public.decide_hike_request(p_hike_id uuid, p_user_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  approved_n int;
  new_status text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or private.hike_rank(h.id, uid) < 1 then raise exception 'not_host'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  if not exists (select 1 from public.hike_attendees where hike_id = h.id and user_id = p_user_id and status = 'requested') then
    raise exception 'no_pending_request';
  end if;
  if p_approve then
    select count(*) into approved_n from public.hike_attendees where hike_id = h.id and status = 'approved';
    if approved_n >= h.spaces then raise exception 'hike_full'; end if;
    new_status := 'approved';
  else
    new_status := 'declined';
  end if;
  update public.hike_attendees set status = new_status, decided_at = now()
    where hike_id = h.id and user_id = p_user_id;
  perform private.hike_notify(p_user_id, h.id, new_status,
    case when p_approve then 'You''re in for "' || h.title || '". Open the hike to see the meeting point.'
         else 'The host couldn''t offer you a place on "' || h.title || '".' end);
  return jsonb_build_object('status', new_status);
end $$;

create or replace function public.remove_hike_attendee(p_hike_id uuid, p_user_id uuid, p_block boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  my_rank int;
  nm text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found then raise exception 'not_host'; end if;
  my_rank := private.hike_rank(h.id, uid);
  if my_rank < 2 then raise exception 'not_host'; end if;
  if coalesce(p_block, false) and my_rank < 3 then raise exception 'not_allowed'; end if;
  if p_user_id = uid then raise exception 'not_allowed'; end if;
  -- only the host can remove another co-host
  if my_rank < 4 and private.hike_rank(h.id, p_user_id) >= 1 then raise exception 'host_only'; end if;
  select display_name into nm from public.hike_attendees where hike_id = h.id and user_id = p_user_id;
  if nm is null then raise exception 'not_attendee'; end if;
  update public.hike_attendees set status = 'removed', decided_at = now()
    where hike_id = h.id and user_id = p_user_id and status in ('requested', 'approved');
  if coalesce(p_block, false) then
    insert into public.host_blocks (host_id, blocked_user_id, display_name)
    values (h.host_id, p_user_id, nm) on conflict do nothing;
  end if;
  perform private.hike_notify(p_user_id, h.id, 'removed', 'The host has removed you from "' || h.title || '".');
end $$;

create or replace function public.set_hike_whatsapp(p_hike_id uuid, p_url text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  u text := nullif(trim(coalesce(p_url, '')), '');
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or private.hike_rank(h.id, uid) < 2 then raise exception 'not_host'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  if u is not null and (char_length(u) > 200
     or u !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{8,64}(\?[A-Za-z0-9=&_.%-]{0,100})?$') then
    raise exception 'bad_whatsapp';
  end if;
  update public.hike_private set whatsapp_url = u where hike_id = h.id;
end $$;

create or replace function public.edit_hike(
  p_hike_id uuid, p_start_at timestamptz, p_spaces int, p_meet_lat numeric, p_meet_lng numeric,
  p_meet_note text, p_contact text, p_kit text[], p_turnaround text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  p public.hike_private;
  my_rank int;
  approved_n int;
  significant boolean;
  r record;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found then raise exception 'not_host'; end if;
  my_rank := private.hike_rank(h.id, uid);
  if my_rank < 2 then raise exception 'not_host'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  perform private.hike_check_fields(p_start_at, p_spaces, p_meet_lat, p_meet_lng, p_kit, p_turnaround, p_meet_note, p_contact);
  select count(*) into approved_n from public.hike_attendees where hike_id = h.id and status = 'approved';
  if p_spaces < approved_n then raise exception 'spaces_below_approved'; end if;
  select * into p from public.hike_private where hike_id = h.id;

  significant := p_start_at is distinct from h.start_at
    or p_meet_lat is distinct from p.meet_lat or p_meet_lng is distinct from p.meet_lng
    or nullif(trim(p_meet_note), '') is distinct from p.meet_note
    or nullif(trim(coalesce(p_note, '')), '') is not null;

  update public.hikes set start_at = p_start_at, spaces = p_spaces, kit = coalesce(p_kit, '{}'),
    turnaround_time = p_turnaround, updated_at = now() where id = h.id;
  -- the host contact line is the host's own: a co-host's edit leaves it alone
  update public.hike_private set meet_lat = p_meet_lat, meet_lng = p_meet_lng,
    meet_note = nullif(trim(p_meet_note), ''),
    host_contact = case when my_rank = 4 then nullif(trim(p_contact), '') else host_contact end
    where hike_id = h.id;

  if significant then
    for r in select user_id from public.hike_attendees
              where hike_id = h.id and status in ('requested', 'approved') and user_id <> uid loop
      perform private.hike_notify(r.user_id, h.id, 'edited',
        '"' || h.title || '" was updated.' || coalesce(' ' || nullif(trim(p_note), ''), ' Open the hike for the new details.'));
    end loop;
    if h.host_id <> uid then
      perform private.hike_notify(h.host_id, h.id, 'edited',
        private.hike_display_name(uid) || ' updated "' || h.title || '".' || coalesce(' ' || nullif(trim(p_note), ''), ''));
    end if;
  end if;
end $$;

create or replace function public.cancel_hike(p_hike_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  r record;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or private.hike_rank(h.id, uid) < 3 then raise exception 'not_host'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  update public.hikes set status = 'cancelled', status_note = nullif(left(trim(coalesce(p_reason, '')), 300), ''),
    updated_at = now() where id = h.id;
  for r in select user_id from public.hike_attendees
            where hike_id = h.id and status in ('requested', 'approved') and user_id <> uid loop
    perform private.hike_notify(r.user_id, h.id, 'cancelled',
      '"' || h.title || '" has been cancelled.' || coalesce(' ' || nullif(trim(p_reason), ''), ''));
  end loop;
  if h.host_id <> uid then
    perform private.hike_notify(h.host_id, h.id, 'cancelled',
      private.hike_display_name(uid) || ' cancelled "' || h.title || '".' || coalesce(' ' || nullif(trim(p_reason), ''), ''));
  end if;
end $$;

create or replace function public.complete_hike(p_hike_id uuid, p_attendee_ids uuid[], p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  who uuid;
  fell text;
  n_for_user int;
  total int := 0;
  ids uuid[];
  everyone uuid[];
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_confirmed is not true then raise exception 'confirmation_required'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or private.hike_rank(h.id, uid) < 2 then raise exception 'not_host'; end if;
  if h.status = 'completed' then raise exception 'already_completed'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  if h.start_at > now() then raise exception 'not_started'; end if;
  if h.start_at < now() - interval '14 days' then raise exception 'too_late'; end if;

  -- the person pressing the button and the host are always counted; the rest come from the list
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_attendee_ids, '{}')) x
    where x <> uid and x <> h.host_id;
  if exists (select 1 from unnest(ids) x
             where not exists (select 1 from public.hike_attendees a
                               where a.hike_id = h.id and a.user_id = x and a.status = 'approved')) then
    raise exception 'not_attendee';
  end if;
  select array_agg(distinct x) into everyone from unnest(array_cat(ids, array[uid, h.host_id])) x;

  for who in select unnest(everyone) loop
    n_for_user := 0;
    for fell in select jsonb_array_elements_text(h.walk_snapshot -> 'fells') loop
      if not exists (select 1 from public.checkbox_states
                     where user_id = who and dashboard_id = 'wainwrights' and item_id = fell and is_checked) then
        insert into public.checkbox_states (dashboard_id, item_id, is_checked, user_id)
        values ('wainwrights', fell, true, who)
        on conflict (user_id, dashboard_id, item_id) do update set is_checked = true;
        insert into public.hike_ticks (hike_id, user_id, fell_name) values (h.id, who, fell) on conflict do nothing;
        n_for_user := n_for_user + 1;
        total := total + 1;
      end if;
    end loop;
    if who <> uid then
      perform private.hike_notify(who, h.id, 'ticked',
        case when n_for_user > 0
          then 'The host ticked ' || n_for_user || ' new fell' || case when n_for_user = 1 then '' else 's' end
               || ' for you after "' || h.title || '". Wasn''t on the walk? Undo it from the hike page.'
          else 'The host confirmed you on "' || h.title || '". You already had all its fells ticked.' end);
    end if;
  end loop;

  update public.hike_attendees set attended = (user_id = any(ids) or user_id = uid)
    where hike_id = h.id and status = 'approved';
  update public.hikes set status = 'completed', attendance_confirmed_at = now(), updated_at = now() where id = h.id;
  return jsonb_build_object('ticked', total, 'people', coalesce(array_length(everyone, 1), 0));
end $$;

-- ---------------------------------------------------------------- co-hosts get the host's notifications

create or replace function public.request_hike_place(p_token text, p_message text, p_ack boolean, p_instagram text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  existing text;
  new_status text;
  nm text;
  approved_n int;
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
    perform private.hike_notify_hosts(h.id, 'request', nm || ' asked to join "' || h.title || '".');
  elsif new_status = 'approved' then
    perform private.hike_notify_hosts(h.id, 'joined', nm || ' (team member) joined "' || h.title || '".');
    perform private.hike_notify(uid, h.id, 'approved', 'You''re in for "' || h.title || '". Open the hike to see the meeting point.');
  end if;
  return jsonb_build_object('status', new_status);
end $$;

create or replace function public.withdraw_hike_place(p_hike_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  was text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found then raise exception 'not_found'; end if;
  select status into was from public.hike_attendees where hike_id = h.id and user_id = uid;
  if was not in ('requested', 'approved') then raise exception 'not_attendee'; end if;
  update public.hike_attendees set status = 'withdrawn', decided_at = now() where hike_id = h.id and user_id = uid;
  perform private.hike_notify_hosts(h.id, 'withdrawn',
    private.hike_display_name(uid) || ' ' || case when was = 'approved' then 'pulled out of' else 'withdrew their request for' end
    || ' "' || h.title || '".', uid);
end $$;

create or replace function private.queue_hike_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n int;
  uk_now timestamp := p_now at time zone 'Europe/London';
begin
  if uk_now::time < time '10:00' then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('hike_reminders'));

  with due as (
    select h.id, h.title, h.start_at, h.host_id
    from public.hikes h
    where h.status = 'open'
      and h.start_at > p_now
      and (h.start_at at time zone 'Europe/London')::date = uk_now::date + 1
  ), people as (
    select d.id as hike_id, d.host_id as user_id, null::text as lvl from due d
    union
    select d.id, a.user_id, a.cohost_level from due d
      join public.hike_attendees a on a.hike_id = d.id and a.status = 'approved'
  ), ins as (
    insert into public.hike_notifications (user_id, hike_id, kind, body)
    select p.user_id, p.hike_id, 'reminder',
           left('Reminder: ' || case when p.user_id = d.host_id then 'you''re hosting'
                                     when p.lvl is not null then 'you''re co-hosting' else 'you''re walking' end
                || ' "' || d.title || '" tomorrow, ' || to_char(d.start_at at time zone 'Europe/London', 'FMDy FMDD FMMon')
                || ' at ' || to_char(d.start_at at time zone 'Europe/London', 'HH24:MI') || '.', 300)
    from people p join due d on d.id = p.hike_id
    on conflict (hike_id, user_id) where kind = 'reminder' do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- ---------------------------------------------------------------- what the hike page is told

create or replace function public.get_hike_by_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  p public.hike_private;
  my_rank int;
  is_host boolean;
  my_status text;
  my_attended boolean;
  my_level text;
  can_see boolean;
  approved_n int;
  result jsonb;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where share_token = p_token;
  if not found then return null; end if;

  my_rank := private.hike_rank(h.id, uid);
  is_host := h.host_id = uid;
  select a.status, a.attended, a.cohost_level into my_status, my_attended, my_level
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
    'my_tick_count', (select count(*) from public.hike_ticks where hike_id = h.id and user_id = uid),
    'my_cohost_level', my_level,
    'is_manager', my_rank >= 1,
    'can', jsonb_build_object('approve', my_rank >= 1, 'edit', my_rank >= 2, 'remove', my_rank >= 2, 'tick', my_rank >= 2,
                              'cancel', my_rank >= 3, 'block', my_rank >= 3, 'cohosts', my_rank >= 3, 'grant_full', my_rank >= 4,
                              'host_contact', my_rank >= 4),
    'cohosts', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', a.display_name, 'level', a.cohost_level) order by a.requested_at)
      from public.hike_attendees a
      where a.hike_id = h.id and a.status = 'approved' and a.cohost_level is not null), '[]'::jsonb)
  );

  if can_see then
    select * into p from public.hike_private where hike_id = h.id;
    result := result || jsonb_build_object(
      'team_name', (select name from public.teams where id = h.team_id),
      'private', jsonb_build_object('meet_lat', p.meet_lat, 'meet_lng', p.meet_lng,
                                    'meet_note', p.meet_note, 'host_contact', p.host_contact,
                                    'whatsapp_url', p.whatsapp_url));
  end if;

  if my_rank >= 1 then
    result := result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'display_name', a.display_name,
               'status', a.status, 'message', a.message, 'requested_at', a.requested_at,
               'attended', a.attended, 'instagram_handle', a.instagram_handle,
               'cohost_level', a.cohost_level) order by a.requested_at)
      from public.hike_attendees a where a.hike_id = h.id and a.status in ('requested', 'approved')), '[]'::jsonb));
  elsif can_see then
    result := result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', a.display_name,
               'instagram_handle', a.instagram_handle, 'cohost_level', a.cohost_level) order by a.requested_at)
      from public.hike_attendees a where a.hike_id = h.id and a.status = 'approved'), '[]'::jsonb));
  end if;

  return result;
end $$;

create or replace function public.my_hikes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'start_at' desc) from (
      select jsonb_build_object('id', h.id, 'share_token', h.share_token, 'title', h.title,
               'start_at', h.start_at, 'status', h.status, 'role', 'host',
               'approved_count', (select count(*) from public.hike_attendees a where a.hike_id = h.id and a.status = 'approved'),
               'pending_count', (select count(*) from public.hike_attendees a where a.hike_id = h.id and a.status = 'requested')) x
      from public.hikes h where h.host_id = uid
      union all
      select jsonb_build_object('id', h.id, 'share_token', h.share_token, 'title', h.title,
               'start_at', h.start_at, 'status', h.status, 'role', a.status, 'cohost_level', a.cohost_level,
               'approved_count', (select count(*) from public.hike_attendees b where b.hike_id = h.id and b.status = 'approved'),
               'pending_count', case when a.cohost_level is not null
                                     then (select count(*) from public.hike_attendees b where b.hike_id = h.id and b.status = 'requested')
                                     else 0 end) x
      from public.hike_attendees a join public.hikes h on h.id = a.hike_id
      where a.user_id = uid and a.status in ('requested', 'approved')
    ) s), '[]'::jsonb);
end $$;
