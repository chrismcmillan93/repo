-- Beta access list (2026-11-07). The beta pages (/wainwrights/beta/) are only for admins and people an admin has let in.
--
--   * Admins always have beta access. Everyone else needs a row here with revoked_at null.
--   * Turned on and off by an admin with admin_set_beta_access(); both are written to admin_log.
--   * Turning off is a soft revoke (revoked_at), so there is a record of who had access and when it ended,
--     and turning someone back on is the same call.
--   * Clients get no table access. The beta pages call am_i_beta() after sign-in.
--
-- Note: this is a gate on what the beta PAGES show. Beta shares the production database, so it does not protect
-- any data (that is what sign-in and the row-level security already do), and the beta files themselves are
-- still public static files.

create table public.beta_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.beta_access enable row level security;
revoke all on public.beta_access from public, anon, authenticated;

create function public.am_i_beta() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    exists (select 1 from public.app_admins where user_id = auth.uid())
    or exists (select 1 from public.beta_access where user_id = auth.uid() and revoked_at is null));
$$;

create function public.admin_set_beta_access(p_user_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then raise exception 'not_found'; end if;
  if p_on then
    insert into public.beta_access (user_id, granted_by) values (p_user_id, auth.uid())
    on conflict (user_id) do update set revoked_at = null, granted_by = auth.uid(), granted_at = now();
    perform private.log_admin('beta_access_on', 'user', p_user_id::text, null);
  else
    update public.beta_access set revoked_at = now() where user_id = p_user_id and revoked_at is null;
    perform private.log_admin('beta_access_off', 'user', p_user_id::text, null);
  end if;
end $$;

-- the People list says who currently has beta access (same signature as before)
create or replace function public.admin_list_people() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object(
      'user_id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'name', coalesce(l.display_name, p.display_name), 'instagram_handle', l.instagram_handle,
      'on_leaderboard', l.user_id is not null, 'suspended', s.user_id is not null, 'suspended_reason', s.reason,
      'is_admin', ad.user_id is not null,
      'beta_access', ba.user_id is not null and ba.revoked_at is null,
      'hikes_hosted', (select count(*) from public.hikes h where h.host_id = u.id),
      'fells', (select count(*) from public.checkbox_states c where c.user_id = u.id and c.dashboard_id = 'wainwrights' and c.is_checked)) x
    from auth.users u
    left join public.leaderboard_opt_in l on l.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    left join public.suspended_users s on s.user_id = u.id
    left join public.app_admins ad on ad.user_id = u.id
    left join public.beta_access ba on ba.user_id = u.id
    where u.email_confirmed_at is not null
    order by u.created_at desc limit 500) s), '[]'::jsonb);
end $$;

revoke all on function public.am_i_beta(), public.admin_set_beta_access(uuid, boolean) from public, anon;
grant execute on function public.am_i_beta(), public.admin_set_beta_access(uuid, boolean) to authenticated;
