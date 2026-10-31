-- Hosted hikes (walking-up-hills project, public schema).
--
-- A user hosts a walk, shares a link containing a random token, and other
-- signed-in users request a place; the host approves each request.
--   * Before approval a visitor sees route/date/time/area only.
--   * The exact meeting point and host contact live in hike_private and are
--     returned only to the host and approved attendees.
--   * Clients get SELECT only on these tables. Every write goes through a
--     SECURITY DEFINER function below, which checks who is calling.
--   * Policy helpers live in the non-exposed `private` schema and are
--     SECURITY DEFINER so a policy on one table never recurses through
--     another table's policy.
--   * "Tick for everyone" (complete_hike) writes into checkbox_states for
--     attendees; hike_ticks records exactly which ticks it added so each
--     person can undo them without touching ticks they already had.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables

create table public.hikes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique
    default left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 32),
  title text not null check (char_length(title) between 3 and 80),
  walk_key text not null check (char_length(walk_key) <= 80),
  walk_snapshot jsonb not null,
  area text not null check (char_length(area) between 2 and 60),
  start_at timestamptz not null,
  spaces int not null check (spaces between 1 and 20),
  status text not null default 'open' check (status in ('open', 'cancelled', 'completed')),
  status_note text check (status_note is null or char_length(status_note) <= 300),
  kit text[] not null default '{}',
  turnaround_time text check (turnaround_time is null or turnaround_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  team_id uuid references public.teams(id) on delete set null,
  host_ack_at timestamptz not null,
  attendance_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hikes_host_idx on public.hikes (host_id);

create table public.hike_private (
  hike_id uuid primary key references public.hikes(id) on delete cascade,
  meet_lat numeric(8,5) not null,
  meet_lng numeric(8,5) not null,
  meet_note text check (meet_note is null or char_length(meet_note) <= 300),
  host_contact text check (host_contact is null or char_length(host_contact) <= 120)
);

create table public.hike_attendees (
  hike_id uuid not null references public.hikes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null check (status in ('requested', 'approved', 'declined', 'withdrawn', 'removed')),
  message text check (message is null or char_length(message) <= 300),
  safety_ack_at timestamptz not null,
  attended boolean,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (hike_id, user_id)
);
create index hike_attendees_user_idx on public.hike_attendees (user_id);

create table public.hike_ticks (
  hike_id uuid not null references public.hikes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fell_name text not null,
  primary key (hike_id, user_id, fell_name)
);

create table public.hike_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hike_id uuid not null references public.hikes(id) on delete cascade,
  kind text not null,
  body text not null,
  read_at timestamptz,
  email_sent_at timestamptz,
  email_attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index hike_notifications_user_idx on public.hike_notifications (user_id, created_at desc);
create index hike_notifications_unsent_idx on public.hike_notifications (hike_id) where email_sent_at is null;

create table public.hike_reports (
  id uuid primary key default gen_random_uuid(),
  hike_id uuid not null references public.hikes(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  created_at timestamptz not null default now(),
  unique (hike_id, reporter_id)
);

create table public.host_blocks (
  host_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (host_id, blocked_user_id)
);

-- ------------------------------------------------------------ private helpers

create function private.hike_is_host(p_hike uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.hikes h where h.id = p_hike and h.host_id = (select auth.uid()))
$$;

create function private.hike_is_approved(p_hike uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.hike_attendees a
    where a.hike_id = p_hike and a.user_id = (select auth.uid()) and a.status = 'approved')
$$;

create function private.hike_display_name(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select nullif(trim(display_name), '') from public.profiles where user_id = p_user),
    (select nullif(trim(display_name), '') from public.leaderboard_opt_in where user_id = p_user),
    'Walker')
$$;

create function private.hike_notify(p_user uuid, p_hike uuid, p_kind text, p_body text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.hike_notifications (user_id, hike_id, kind, body)
  values (p_user, p_hike, p_kind, left(p_body, 300))
$$;

-- Shared field validation for create/edit.
create function private.hike_check_fields(
  p_start timestamptz, p_spaces int, p_lat numeric, p_lng numeric,
  p_kit text[], p_turnaround text, p_note text, p_contact text
) returns void language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_start is null or p_start <= now() or p_start > now() + interval '120 days' then
    raise exception 'bad_start';
  end if;
  if p_spaces is null or p_spaces not between 1 and 20 then raise exception 'bad_spaces'; end if;
  if p_lat is null or p_lng is null or p_lat not between 53.8 and 55.2 or p_lng not between -3.8 and -2.2 then
    raise exception 'bad_meeting_point';
  end if;
  if coalesce(array_length(p_kit, 1), 0) > 20
     or exists (select 1 from unnest(coalesce(p_kit, '{}')) k where char_length(k) > 60 or char_length(trim(k)) = 0) then
    raise exception 'bad_kit';
  end if;
  if p_turnaround is not null and p_turnaround !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'bad_turnaround';
  end if;
  if char_length(coalesce(p_note, '')) > 300 or char_length(coalesce(p_contact, '')) > 120 then
    raise exception 'bad_text';
  end if;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.hike_is_host(uuid), private.hike_is_approved(uuid) to authenticated;

-- ------------------------------------------------------------------- RLS

alter table public.hikes enable row level security;
alter table public.hike_private enable row level security;
alter table public.hike_attendees enable row level security;
alter table public.hike_ticks enable row level security;
alter table public.hike_notifications enable row level security;
alter table public.hike_reports enable row level security;
alter table public.host_blocks enable row level security;

create policy "host or approved attendee reads hike" on public.hikes
  for select to authenticated
  using (host_id = (select auth.uid()) or private.hike_is_approved(id));

create policy "host or approved attendee reads private details" on public.hike_private
  for select to authenticated
  using (private.hike_is_host(hike_id) or private.hike_is_approved(hike_id));

create policy "own row, host sees all, approved see approved" on public.hike_attendees
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.hike_is_host(hike_id)
    or (status = 'approved' and private.hike_is_approved(hike_id))
  );

create policy "own ticks" on public.hike_ticks
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own notifications" on public.hike_notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own blocks" on public.host_blocks
  for select to authenticated using (host_id = (select auth.uid()));

-- hike_reports: no policies, nobody reads it from the client (read via SQL).

revoke all on public.hikes, public.hike_private, public.hike_attendees, public.hike_ticks,
  public.hike_notifications, public.hike_reports, public.host_blocks from anon, authenticated;
grant select on public.hikes, public.hike_private, public.hike_attendees, public.hike_ticks,
  public.hike_notifications, public.host_blocks to authenticated;

-- ------------------------------------------------------------- functions

-- create_hike ------------------------------------------------------------
create function public.create_hike(
  p_title text, p_walk_key text, p_walk_snapshot jsonb, p_area text, p_start_at timestamptz,
  p_spaces int, p_kit text[], p_turnaround text, p_meet_lat numeric, p_meet_lng numeric,
  p_meet_note text, p_contact text, p_team_id uuid, p_ack boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  fells jsonb;
  snap jsonb;
  hid uuid;
  tok text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_ack is not true then raise exception 'ack_required'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 80 then raise exception 'bad_title'; end if;
  if char_length(trim(coalesce(p_area, ''))) not between 2 and 60 then raise exception 'bad_area'; end if;
  if char_length(coalesce(p_walk_key, '')) not between 1 and 80 then raise exception 'bad_walk'; end if;
  perform private.hike_check_fields(p_start_at, p_spaces, p_meet_lat, p_meet_lng, p_kit, p_turnaround, p_meet_note, p_contact);

  if p_walk_snapshot is null or jsonb_typeof(p_walk_snapshot) is distinct from 'object'
     or length(p_walk_snapshot::text) > 6000 then raise exception 'bad_walk'; end if;
  fells := p_walk_snapshot -> 'fells';
  if jsonb_typeof(fells) is distinct from 'array' or jsonb_array_length(fells) not between 1 and 10 then
    raise exception 'bad_walk';
  end if;
  -- Every fell must be a real Wainwright, so "tick for everyone" can only ever tick real fells.
  if exists (select 1 from jsonb_array_elements_text(fells) f
             where f not in (select item_id from public.fell_heights)) then
    raise exception 'bad_walk';
  end if;
  snap := jsonb_build_object(
    'label', left(coalesce(p_walk_snapshot ->> 'label', p_title), 120),
    'miles', case when (p_walk_snapshot ->> 'miles') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (p_walk_snapshot ->> 'miles')::numeric end,
    'ascent', case when (p_walk_snapshot ->> 'ascent') ~ '^[0-9]{1,5}$' then (p_walk_snapshot ->> 'ascent')::numeric end,
    'fells', fells,
    'top_name', left(p_walk_snapshot ->> 'top_name', 60),
    'top_m', case when (p_walk_snapshot ->> 'top_m') ~ '^[0-9]{1,4}$' then (p_walk_snapshot ->> 'top_m')::numeric end,
    'top_lat', case when (p_walk_snapshot ->> 'top_lat') ~ '^-?[0-9]{1,2}(\.[0-9]+)?$' then (p_walk_snapshot ->> 'top_lat')::numeric end,
    'top_lng', case when (p_walk_snapshot ->> 'top_lng') ~ '^-?[0-9]{1,2}(\.[0-9]+)?$' then (p_walk_snapshot ->> 'top_lng')::numeric end,
    'start_name', left(p_walk_snapshot ->> 'start_name', 120),
    'url', case when (p_walk_snapshot ->> 'url') ~ '^https://[^ ]{1,300}$' then p_walk_snapshot ->> 'url' end
  );

  if p_team_id is not null
     and not exists (select 1 from public.teams where id = p_team_id and admin_user_id = uid)
     and not exists (select 1 from public.team_members where team_id = p_team_id and user_id = uid and status = 'approved') then
    raise exception 'not_in_team';
  end if;

  if (select count(*) from public.hikes where host_id = uid and status = 'open' and start_at > now()) >= 10 then
    raise exception 'too_many_hikes';
  end if;

  insert into public.hikes (host_id, title, walk_key, walk_snapshot, area, start_at, spaces, kit,
                            turnaround_time, team_id, host_ack_at)
  values (uid, trim(p_title), p_walk_key, snap, trim(p_area), p_start_at, p_spaces,
          coalesce(p_kit, '{}'), p_turnaround, p_team_id, now())
  returning id, share_token into hid, tok;

  insert into public.hike_private (hike_id, meet_lat, meet_lng, meet_note, host_contact)
  values (hid, p_meet_lat, p_meet_lng, nullif(trim(p_meet_note), ''), nullif(trim(p_contact), ''));

  return jsonb_build_object('id', hid, 'share_token', tok);
end $$;

-- get_hike_by_token ------------------------------------------------------
create function public.get_hike_by_token(p_token text) returns jsonb
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
                                    'meet_note', p.meet_note, 'host_contact', p.host_contact));
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

-- my_hikes ---------------------------------------------------------------
create function public.my_hikes() returns jsonb
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
               'start_at', h.start_at, 'status', h.status, 'role', a.status,
               'approved_count', (select count(*) from public.hike_attendees b where b.hike_id = h.id and b.status = 'approved'),
               'pending_count', 0) x
      from public.hike_attendees a join public.hikes h on h.id = a.hike_id
      where a.user_id = uid and a.status in ('requested', 'approved')
    ) s), '[]'::jsonb);
end $$;

-- request_hike_place -----------------------------------------------------
create function public.request_hike_place(p_token text, p_message text, p_ack boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  existing text;
  new_status text;
  nm text;
  approved_n int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_ack is not true then raise exception 'ack_required'; end if;
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

  insert into public.hike_attendees (hike_id, user_id, display_name, status, message, safety_ack_at, requested_at, decided_at)
  values (h.id, uid, nm, new_status, nullif(left(trim(coalesce(p_message, '')), 300), ''), now(), now(),
          case when new_status = 'requested' then null else now() end)
  on conflict (hike_id, user_id) do update
    set display_name = excluded.display_name, status = excluded.status, message = excluded.message,
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

-- decide_hike_request ----------------------------------------------------
create function public.decide_hike_request(p_hike_id uuid, p_user_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  approved_n int;
  new_status text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or h.host_id <> uid then raise exception 'not_host'; end if;
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

-- remove_hike_attendee ---------------------------------------------------
create function public.remove_hike_attendee(p_hike_id uuid, p_user_id uuid, p_block boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  nm text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or h.host_id <> uid then raise exception 'not_host'; end if;
  select display_name into nm from public.hike_attendees where hike_id = h.id and user_id = p_user_id;
  if nm is null then raise exception 'not_attendee'; end if;
  update public.hike_attendees set status = 'removed', decided_at = now()
    where hike_id = h.id and user_id = p_user_id and status in ('requested', 'approved');
  if coalesce(p_block, false) then
    insert into public.host_blocks (host_id, blocked_user_id, display_name)
    values (uid, p_user_id, nm) on conflict do nothing;
  end if;
  perform private.hike_notify(p_user_id, h.id, 'removed', 'The host has removed you from "' || h.title || '".');
end $$;

create function public.unblock_hiker(p_user_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.host_blocks where host_id = auth.uid() and blocked_user_id = p_user_id
$$;

-- withdraw_hike_place ----------------------------------------------------
create function public.withdraw_hike_place(p_hike_id uuid) returns void
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
  perform private.hike_notify(h.host_id, h.id, 'withdrawn',
    private.hike_display_name(uid) || ' ' || case when was = 'approved' then 'pulled out of' else 'withdrew their request for' end
    || ' "' || h.title || '".');
end $$;

-- edit_hike --------------------------------------------------------------
create function public.edit_hike(
  p_hike_id uuid, p_start_at timestamptz, p_spaces int, p_meet_lat numeric, p_meet_lng numeric,
  p_meet_note text, p_contact text, p_kit text[], p_turnaround text, p_note text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  p public.hike_private;
  approved_n int;
  significant boolean;
  r record;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or h.host_id <> uid then raise exception 'not_host'; end if;
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
  update public.hike_private set meet_lat = p_meet_lat, meet_lng = p_meet_lng,
    meet_note = nullif(trim(p_meet_note), ''), host_contact = nullif(trim(p_contact), '') where hike_id = h.id;

  if significant then
    for r in select user_id from public.hike_attendees where hike_id = h.id and status in ('requested', 'approved') loop
      perform private.hike_notify(r.user_id, h.id, 'edited',
        '"' || h.title || '" was updated.' || coalesce(' ' || nullif(trim(p_note), ''), ' Open the hike for the new details.'));
    end loop;
  end if;
end $$;

-- cancel_hike ------------------------------------------------------------
create function public.cancel_hike(p_hike_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  r record;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or h.host_id <> uid then raise exception 'not_host'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  update public.hikes set status = 'cancelled', status_note = nullif(left(trim(coalesce(p_reason, '')), 300), ''),
    updated_at = now() where id = h.id;
  for r in select user_id from public.hike_attendees where hike_id = h.id and status in ('requested', 'approved') loop
    perform private.hike_notify(r.user_id, h.id, 'cancelled',
      '"' || h.title || '" has been cancelled.' || coalesce(' ' || nullif(trim(p_reason), ''), ''));
  end loop;
end $$;

-- complete_hike (tick for everyone) --------------------------------------
create function public.complete_hike(p_hike_id uuid, p_attendee_ids uuid[], p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  who uuid;
  fell text;
  n_for_user int;
  total int := 0;
  ids uuid[];
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_confirmed is not true then raise exception 'confirmation_required'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found or h.host_id <> uid then raise exception 'not_host'; end if;
  if h.status = 'completed' then raise exception 'already_completed'; end if;
  if h.status <> 'open' then raise exception 'hike_closed'; end if;
  if h.start_at > now() then raise exception 'not_started'; end if;
  if h.start_at < now() - interval '14 days' then raise exception 'too_late'; end if;

  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_attendee_ids, '{}')) x where x <> uid;
  if exists (select 1 from unnest(ids) x
             where not exists (select 1 from public.hike_attendees a
                               where a.hike_id = h.id and a.user_id = x and a.status = 'approved')) then
    raise exception 'not_attendee';
  end if;

  for who in select unnest(array_append(ids, uid)) loop
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

  update public.hike_attendees set attended = (user_id = any(ids)) where hike_id = h.id and status = 'approved';
  update public.hikes set status = 'completed', attendance_confirmed_at = now(), updated_at = now() where id = h.id;
  return jsonb_build_object('ticked', total, 'people', coalesce(array_length(ids, 1), 0) + 1);
end $$;

-- undo_hike_ticks --------------------------------------------------------
create function public.undo_hike_ticks(p_hike_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  h public.hikes;
  n int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into h from public.hikes where id = p_hike_id for update;
  if not found then raise exception 'not_found'; end if;
  select count(*) into n from public.hike_ticks where hike_id = h.id and user_id = uid;
  update public.checkbox_states cs set is_checked = false
    where cs.user_id = uid and cs.dashboard_id = 'wainwrights'
      and cs.item_id in (select fell_name from public.hike_ticks where hike_id = h.id and user_id = uid);
  delete from public.hike_ticks where hike_id = h.id and user_id = uid;
  update public.hike_attendees set attended = false where hike_id = h.id and user_id = uid;
  if uid <> h.host_id then
    perform private.hike_notify(h.host_id, h.id, 'undo',
      private.hike_display_name(uid) || ' says they weren''t on "' || h.title || '" and removed the ticks.');
  end if;
  return jsonb_build_object('removed', n);
end $$;

-- report_hike / notifications -------------------------------------------
create function public.report_hike(p_token text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 5 and 500 then raise exception 'bad_reason'; end if;
  select id into hid from public.hikes where share_token = p_token;
  if hid is null then raise exception 'not_found'; end if;
  insert into public.hike_reports (hike_id, reporter_id, reason) values (hid, uid, trim(p_reason))
    on conflict (hike_id, reporter_id) do nothing;
end $$;

create function public.mark_hike_notifications_read() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.hike_notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- Callable by signed-in users only (Supabase grants EXECUTE to anon by default).
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'create_hike', 'get_hike_by_token', 'my_hikes', 'request_hike_place', 'decide_hike_request',
             'remove_hike_attendee', 'unblock_hiker', 'withdraw_hike_place', 'edit_hike', 'cancel_hike',
             'complete_hike', 'undo_hike_ticks', 'report_hike', 'mark_hike_notifications_read')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
