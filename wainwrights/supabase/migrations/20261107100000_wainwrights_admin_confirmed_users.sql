-- Admin People view: show only confirmed accounts (2026-11-07).
--
-- Typing an email into the sign-in box creates an auth user straight away, even if the link in the email is
-- never clicked, so junk or mistyped addresses were piling up in the People list. The list, and the "people"
-- count in the overview, now only include accounts that have confirmed their email. The accounts that haven't
-- are counted separately and can be listed (and deleted) from the People tab on request.
--
-- Same signatures as before (create or replace), so the existing pages keep working and no overloads are left behind.

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users where email_confirmed_at is not null),
    'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'leaderboard_entries', (select count(*) from public.leaderboard_opt_in),
    'teams', (select count(*) from public.teams),
    'hikes_total', (select count(*) from public.hikes),
    'hikes_open', (select count(*) from public.hikes where status = 'open'),
    'open_reports', (select count(*) from public.hike_reports where dismissed_at is null),
    'suspended', (select count(*) from public.suspended_users));
end $$;

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
      'hikes_hosted', (select count(*) from public.hikes h where h.host_id = u.id),
      'fells', (select count(*) from public.checkbox_states c where c.user_id = u.id and c.dashboard_id = 'wainwrights' and c.is_checked)) x
    from auth.users u
    left join public.leaderboard_opt_in l on l.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    left join public.suspended_users s on s.user_id = u.id
    left join public.app_admins ad on ad.user_id = u.id
    where u.email_confirmed_at is not null
    order by u.created_at desc limit 500) s), '[]'::jsonb);
end $$;

-- the accounts that never confirmed their email: nothing but who and when, newest first
create function public.admin_list_unconfirmed() returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', u.id, 'email', u.email, 'created_at', u.created_at, 'confirmation_sent_at', u.confirmation_sent_at)
      order by u.created_at desc)
    from (select * from auth.users where email_confirmed_at is null order by created_at desc limit 200) u), '[]'::jsonb);
end $$;

revoke all on function public.admin_list_unconfirmed() from public, anon;
grant execute on function public.admin_list_unconfirmed() to authenticated;
