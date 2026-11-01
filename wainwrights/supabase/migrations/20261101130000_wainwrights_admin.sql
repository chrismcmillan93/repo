-- Admin role for the Wainwrights app.
--
-- Who is an admin is a row in public.app_admins. That row is added by hand with SQL (never in a
-- migration, and no function can add one), so nobody can make themselves admin through the app.
-- Every admin_* function starts with private.require_admin(), which raises 'not_admin' for anyone
-- else, and every action is written to public.admin_log (what, who, and the values it replaced).
--
-- Powers: remove hikes (soft: cancel with a reason, or permanently delete), remove people from a
-- hike, clear a person's leaderboard entry / name / Instagram handle, delete teams, read and dismiss
-- hike reports, suspend or unsuspend a user, and edit the word filter's lists.
-- A suspended user is hidden from the leaderboard and cannot create hikes, ask to join hikes or create
-- teams. They can still sign in and use their own tracker.
--
-- All tables here have RLS on and no client access; the functions are the only way in.

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
create table public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb
);
create table public.suspended_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  suspended_at timestamptz not null default now(),
  suspended_by uuid
);
alter table public.app_admins enable row level security;
alter table public.admin_log enable row level security;
alter table public.suspended_users enable row level security;
revoke all on public.app_admins, public.admin_log, public.suspended_users from anon, authenticated;

alter table public.hike_reports add column dismissed_at timestamptz, add column dismissed_by uuid;

-- helpers (private schema) -------------------------------------------------------------------------
create function private.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
create function private.require_admin() returns void
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'not_admin'; end if;
end $$;
create function private.is_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.suspended_users where user_id = p_user);
$$;
create function private.log_admin(p_action text, p_type text, p_id text, p_details jsonb default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.admin_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_type, p_id, p_details);
end $$;
revoke all on function private.is_admin(), private.require_admin(), private.is_suspended(uuid),
  private.log_admin(text, text, text, jsonb) from public, anon, authenticated;

-- suspension enforcement ---------------------------------------------------------------------------
create function private.trg_block_suspended_host() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if private.is_suspended(new.host_id) then raise exception 'Your account has been suspended, so you can''t do that.'; end if;
  return new;
end $$;
create trigger block_suspended before insert on public.hikes
  for each row execute function private.trg_block_suspended_host();

-- only a NEW request or join (insert, or coming back from declined/removed/withdrawn); a host approving an
-- earlier request (requested -> approved) is not blocked
create function private.trg_block_suspended_requester() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if new.status in ('requested', 'approved')
     and (tg_op = 'INSERT' or old.status not in ('requested', 'approved'))
     and private.is_suspended(new.user_id) then
    raise exception 'Your account has been suspended, so you can''t do that.';
  end if;
  return new;
end $$;
create trigger block_suspended before insert or update of status on public.hike_attendees
  for each row execute function private.trg_block_suspended_requester();

create function private.trg_block_suspended_team() returns trigger
language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if private.is_suspended(new.admin_user_id) then raise exception 'Your account has been suspended, so you can''t do that.'; end if;
  return new;
end $$;
create trigger block_suspended before insert on public.teams
  for each row execute function private.trg_block_suspended_team();

revoke all on function private.trg_block_suspended_host(), private.trg_block_suspended_requester(),
  private.trg_block_suspended_team() from public, anon, authenticated;

-- suspended users are hidden from the leaderboard (same function, one extra condition)
create or replace function public.wainwright_leaderboard()
returns table(user_id uuid, display_name text, climbed_count bigint, elevation_m bigint, instagram_handle text)
language sql security definer set search_path to 'public' as $$
  select
    l.user_id,
    l.display_name,
    count(c.item_id) as climbed_count,
    coalesce(sum(h.height_m), 0) as elevation_m,
    l.instagram_handle
  from leaderboard_opt_in l
  left join checkbox_states c
    on c.user_id = l.user_id
    and c.dashboard_id = 'wainwrights'
    and c.is_checked = true
  left join fell_heights h
    on h.item_id = c.item_id
  where not exists (select 1 from public.suspended_users su where su.user_id = l.user_id)
  group by l.user_id, l.display_name, l.instagram_handle;
$$;

-- admin functions ----------------------------------------------------------------------------------
create function public.am_i_admin() returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.is_admin();
$$;

create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'leaderboard_entries', (select count(*) from public.leaderboard_opt_in),
    'teams', (select count(*) from public.teams),
    'hikes_total', (select count(*) from public.hikes),
    'hikes_open', (select count(*) from public.hikes where status = 'open'),
    'open_reports', (select count(*) from public.hike_reports where dismissed_at is null),
    'suspended', (select count(*) from public.suspended_users));
end $$;

create function public.admin_list_hikes() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object(
      'id', h.id, 'title', h.title, 'area', h.area, 'start_at', h.start_at, 'status', h.status,
      'status_note', h.status_note, 'created_at', h.created_at, 'share_token', h.share_token,
      'host_id', h.host_id, 'host_name', private.hike_display_name(h.host_id),
      'host_email', (select u.email from auth.users u where u.id = h.host_id),
      'approved', (select count(*) from public.hike_attendees a where a.hike_id = h.id and a.status = 'approved'),
      'requested', (select count(*) from public.hike_attendees a where a.hike_id = h.id and a.status = 'requested'),
      'open_reports', (select count(*) from public.hike_reports r where r.hike_id = h.id and r.dismissed_at is null),
      'team', (select t.name from public.teams t where t.id = h.team_id)) x
    from public.hikes h order by h.created_at desc limit 300) s), '[]'::jsonb);
end $$;

create function public.admin_hike_people(p_hike_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'name', a.display_name, 'status', a.status, 'message', a.message,
      'instagram_handle', a.instagram_handle, 'requested_at', a.requested_at,
      'email', (select u.email from auth.users u where u.id = a.user_id),
      'suspended', private.is_suspended(a.user_id)) order by a.requested_at)
    from public.hike_attendees a where a.hike_id = p_hike_id), '[]'::jsonb);
end $$;

create function public.admin_list_people() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object(
      'user_id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'name', coalesce(l.display_name, p.display_name), 'instagram_handle', l.instagram_handle,
      'on_leaderboard', l.user_id is not null, 'suspended', s.user_id is not null, 'suspended_reason', s.reason,
      'is_admin', ad.user_id is not null,
      'hikes_hosted', (select count(*) from public.hikes h where h.host_id = u.id),
      'fells', (select count(*) from public.checkbox_states c where c.user_id = u.id and c.dashboard_id = 'wainwrights' and c.is_checked)) x
    from auth.users u
    left join public.leaderboard_opt_in l on l.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    left join public.suspended_users s on s.user_id = u.id
    left join public.app_admins ad on ad.user_id = u.id
    order by u.created_at desc limit 500) s), '[]'::jsonb);
end $$;

create function public.admin_list_teams() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'is_public', t.is_public, 'created_at', t.created_at,
      'admin_id', t.admin_user_id, 'admin_name', private.hike_display_name(t.admin_user_id),
      'members', (select count(*) from public.team_members m where m.team_id = t.id and m.status = 'approved')) order by t.created_at desc)
    from public.teams t), '[]'::jsonb);
end $$;

create function public.admin_list_reports(p_include_dismissed boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'hike_id', r.hike_id, 'hike_title', h.title, 'hike_status', h.status, 'share_token', h.share_token,
      'host_id', h.host_id, 'host_name', private.hike_display_name(h.host_id),
      'reporter_id', r.reporter_id, 'reporter_name', private.hike_display_name(r.reporter_id),
      'reporter_email', (select u.email from auth.users u where u.id = r.reporter_id),
      'reason', r.reason, 'created_at', r.created_at, 'dismissed_at', r.dismissed_at) order by r.created_at desc)
    from public.hike_reports r join public.hikes h on h.id = r.hike_id
    where p_include_dismissed or r.dismissed_at is null), '[]'::jsonb);
end $$;

create function public.admin_dismiss_report(p_report_id uuid) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  update public.hike_reports set dismissed_at = now(), dismissed_by = auth.uid()
   where id = p_report_id and dismissed_at is null;
  if not found then raise exception 'not_found'; end if;
  perform private.log_admin('dismiss_report', 'report', p_report_id::text, null);
end $$;

create function public.admin_remove_hike(p_hike_id uuid, p_reason text, p_delete boolean default false) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  h public.hikes;
  r record;
  snap jsonb;
begin
  perform private.require_admin();
  select * into h from public.hikes where id = p_hike_id for update;
  if not found then raise exception 'not_found'; end if;
  snap := jsonb_build_object('title', h.title, 'area', h.area, 'host_id', h.host_id, 'status', h.status,
                             'start_at', h.start_at, 'reason', p_reason);
  if p_delete then
    delete from public.hikes where id = h.id;
    perform private.log_admin('delete_hike', 'hike', h.id::text, snap);
  else
    if h.status = 'cancelled' then raise exception 'already_cancelled'; end if;
    update public.hikes
       set status = 'cancelled',
           status_note = coalesce(nullif(left(trim(coalesce(p_reason, '')), 250), ''), 'Removed by an admin.'),
           updated_at = now()
     where id = h.id;
    for r in select user_id from public.hike_attendees where hike_id = h.id and status in ('requested', 'approved') loop
      perform private.hike_notify(r.user_id, h.id, 'cancelled', '"' || h.title || '" was cancelled by an admin.');
    end loop;
    perform private.log_admin('cancel_hike', 'hike', h.id::text, snap);
  end if;
end $$;

create function public.admin_remove_attendee(p_hike_id uuid, p_user_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  a public.hike_attendees;
  t text;
begin
  perform private.require_admin();
  select * into a from public.hike_attendees where hike_id = p_hike_id and user_id = p_user_id for update;
  if not found or a.status = 'removed' then raise exception 'not_found'; end if;
  update public.hike_attendees set status = 'removed', decided_at = now(), attended = null
   where hike_id = p_hike_id and user_id = p_user_id;
  select title into t from public.hikes where id = p_hike_id;
  perform private.hike_notify(p_user_id, p_hike_id, 'removed', 'You were removed from "' || coalesce(t, 'a hike') || '" by an admin.');
  perform private.log_admin('remove_attendee', 'hike', p_hike_id::text,
    jsonb_build_object('user_id', p_user_id, 'name', a.display_name, 'was', a.status,
                       'instagram_handle', a.instagram_handle, 'message', a.message, 'reason', p_reason));
end $$;

create function public.admin_clear_person(
  p_user_id uuid, p_clear_name boolean default false, p_clear_handle boolean default false,
  p_remove_from_leaderboard boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  l public.leaderboard_opt_in;
  pn text;
  changed jsonb := '{}'::jsonb;
begin
  perform private.require_admin();
  select * into l from public.leaderboard_opt_in where user_id = p_user_id;
  select display_name into pn from public.profiles where user_id = p_user_id;

  if p_remove_from_leaderboard and found then
    delete from public.leaderboard_opt_in where user_id = p_user_id;
    changed := changed || jsonb_build_object('removed_from_leaderboard', true);
  elsif l.user_id is not null then
    if p_clear_name then update public.leaderboard_opt_in set display_name = 'Walker' where user_id = p_user_id; end if;
    if p_clear_handle then update public.leaderboard_opt_in set instagram_handle = null where user_id = p_user_id; end if;
  end if;
  if p_clear_name then
    update public.profiles set display_name = null where user_id = p_user_id;
    update public.hike_attendees set display_name = 'Walker' where user_id = p_user_id;
  end if;
  if p_clear_handle then
    update public.hike_attendees set instagram_handle = null where user_id = p_user_id;
  end if;
  perform private.log_admin('clear_person', 'user', p_user_id::text, jsonb_build_object(
    'leaderboard_name', l.display_name, 'leaderboard_handle', l.instagram_handle, 'profile_name', pn,
    'clear_name', p_clear_name, 'clear_handle', p_clear_handle, 'remove_from_leaderboard', p_remove_from_leaderboard));
  return changed;
end $$;

create function public.admin_delete_team(p_team_id uuid) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare t public.teams;
begin
  perform private.require_admin();
  select * into t from public.teams where id = p_team_id for update;
  if not found then raise exception 'not_found'; end if;
  delete from public.teams where id = t.id;
  perform private.log_admin('delete_team', 'team', t.id::text,
    jsonb_build_object('name', t.name, 'admin_user_id', t.admin_user_id, 'is_public', t.is_public));
end $$;

create function public.admin_set_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  if p_suspended then
    if exists (select 1 from public.app_admins where user_id = p_user_id) then raise exception 'cannot_suspend_admin'; end if;
    insert into public.suspended_users (user_id, reason, suspended_by)
    values (p_user_id, nullif(left(trim(coalesce(p_reason, '')), 250), ''), auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now();
    perform private.log_admin('suspend_user', 'user', p_user_id::text, jsonb_build_object('reason', p_reason));
  else
    delete from public.suspended_users where user_id = p_user_id;
    perform private.log_admin('unsuspend_user', 'user', p_user_id::text, null);
  end if;
end $$;

-- word filter lists --------------------------------------------------------------------------------
create function public.admin_word_lists() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'mode', mode) order by word) from private.blocked_words), '[]'::jsonb),
    'allowed', coalesce((select jsonb_agg(word order by word) from private.allowed_words), '[]'::jsonb));
end $$;

create function public.admin_set_blocked_word(p_word text, p_mode text, p_remove boolean default false) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare w text := lower(btrim(coalesce(p_word, '')));
begin
  perform private.require_admin();
  if w !~ '^[a-z]{2,40}$' then raise exception 'bad_word'; end if;
  if p_remove then
    delete from private.blocked_words where word = w;
    perform private.log_admin('remove_blocked_word', 'word', w, null);
  else
    if p_mode not in ('word', 'substring') then raise exception 'bad_mode'; end if;
    insert into private.blocked_words (word, mode) values (w, p_mode)
    on conflict (word) do update set mode = excluded.mode;
    perform private.log_admin('add_blocked_word', 'word', w, jsonb_build_object('mode', p_mode));
  end if;
end $$;

create function public.admin_set_allowed_word(p_word text, p_remove boolean default false) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare w text := lower(btrim(coalesce(p_word, '')));
begin
  perform private.require_admin();
  if w !~ '^[a-z]{2,40}$' then raise exception 'bad_word'; end if;
  if p_remove then
    delete from private.allowed_words where word = w;
    perform private.log_admin('remove_allowed_word', 'word', w, null);
  else
    insert into private.allowed_words (word) values (w) on conflict (word) do nothing;
    perform private.log_admin('add_allowed_word', 'word', w, null);
  end if;
end $$;

create function public.admin_log_list(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'at', g.at, 'action', g.action, 'target_type', g.target_type, 'target_id', g.target_id,
      'details', g.details, 'admin', (select u.email from auth.users u where u.id = g.admin_id)) order by g.id desc)
    from (select * from public.admin_log order by id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) g), '[]'::jsonb);
end $$;

-- only signed-in users may call these (each one still checks admin itself)
revoke all on function
  public.am_i_admin(), public.admin_overview(), public.admin_list_hikes(), public.admin_hike_people(uuid),
  public.admin_list_people(), public.admin_list_teams(), public.admin_list_reports(boolean),
  public.admin_dismiss_report(uuid), public.admin_remove_hike(uuid, text, boolean),
  public.admin_remove_attendee(uuid, uuid, text), public.admin_clear_person(uuid, boolean, boolean, boolean),
  public.admin_delete_team(uuid), public.admin_set_suspended(uuid, boolean, text), public.admin_word_lists(),
  public.admin_set_blocked_word(text, text, boolean), public.admin_set_allowed_word(text, boolean),
  public.admin_log_list(int)
from public, anon, authenticated;
grant execute on function
  public.am_i_admin(), public.admin_overview(), public.admin_list_hikes(), public.admin_hike_people(uuid),
  public.admin_list_people(), public.admin_list_teams(), public.admin_list_reports(boolean),
  public.admin_dismiss_report(uuid), public.admin_remove_hike(uuid, text, boolean),
  public.admin_remove_attendee(uuid, uuid, text), public.admin_clear_person(uuid, boolean, boolean, boolean),
  public.admin_delete_team(uuid), public.admin_set_suspended(uuid, boolean, text), public.admin_word_lists(),
  public.admin_set_blocked_word(text, text, boolean), public.admin_set_allowed_word(text, boolean),
  public.admin_log_list(int)
to authenticated;
