-- Admin: permanently delete a user (2026-11-07). Suspending was the only option before.
--
-- Deleting the auth user removes everything of theirs that references it with ON DELETE CASCADE: ticks, leaderboard
-- entry, profile, planner location, notifications, their requests on other people's hikes, reports they filed, and
-- any hikes they hosted (with those hikes' requests and tick records; people's own ticks stay). Two tables do NOT
-- cascade (team_members and teams.admin_user_id), so this handles them explicitly.
--
-- Guards, all enforced here rather than only in the page:
--   * admins only (private.require_admin), and never yourself or another admin;
--   * the admin must type the person's email address (p_confirm_email) as a second check;
--   * refused if they host an OPEN hike (cancel or delete it first, so people going are told) or run a team
--     (delete the team first), because deleting them would silently take those with it;
--   * everything is recorded in admin_log with a snapshot of who was deleted and what went with them.
--
-- The log keeps the email address (admin-only table, no client access) so a repeat of the same address can be
-- recognised. Remove a row from public.admin_log by hand if someone ever asks for their address to be erased.

create function public.admin_delete_user(p_user_id uuid, p_confirm_email text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  u auth.users;
  snap jsonb;
begin
  perform private.require_admin();
  if p_user_id is null then raise exception 'not_found'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_delete_self'; end if;

  select * into u from auth.users where id = p_user_id for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.app_admins where user_id = u.id) then raise exception 'cannot_delete_admin'; end if;
  if lower(trim(coalesce(p_confirm_email, ''))) <> lower(coalesce(u.email, '')) then raise exception 'email_mismatch'; end if;
  if exists (select 1 from public.hikes where host_id = u.id and status = 'open') then raise exception 'hosts_open_hikes'; end if;
  if exists (select 1 from public.teams where admin_user_id = u.id) then raise exception 'admin_of_team'; end if;

  snap := jsonb_build_object(
    'email', u.email,
    'confirmed', u.email_confirmed_at is not null,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'name', coalesce((select l.display_name from public.leaderboard_opt_in l where l.user_id = u.id),
                     (select p.display_name from public.profiles p where p.user_id = u.id)),
    'fells', (select count(*) from public.checkbox_states c where c.user_id = u.id and c.dashboard_id = 'wainwrights' and c.is_checked),
    'on_leaderboard', exists (select 1 from public.leaderboard_opt_in l where l.user_id = u.id),
    'hikes_hosted', (select count(*) from public.hikes h where h.host_id = u.id),
    'hike_requests', (select count(*) from public.hike_attendees a where a.user_id = u.id),
    'team_memberships', (select count(*) from public.team_members m where m.user_id = u.id),
    'was_suspended', exists (select 1 from public.suspended_users s where s.user_id = u.id),
    'reason', nullif(left(trim(coalesce(p_reason, '')), 250), ''));

  delete from public.team_members where user_id = u.id;   -- no cascade on this foreign key
  delete from auth.users where id = u.id;                 -- cascades to everything else of theirs
  perform private.log_admin('delete_user', 'user', u.id::text, snap);
  return snap;
end $$;

revoke all on function public.admin_delete_user(uuid, text, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text, text) to authenticated;
