-- Co-hosts also hear when a walker undoes their ticks (see 20261107150000_wainwrights_hike_cohosts.sql).
-- Split out because the function body contains a DELETE of the caller's own hike_ticks rows.

create or replace function public.undo_hike_ticks(p_hike_id uuid) returns jsonb
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
  if uid <> h.host_id or exists (select 1 from public.hike_attendees where hike_id = h.id and cohost_level is not null and status = 'approved') then
    perform private.hike_notify_hosts(h.id, 'undo',
      private.hike_display_name(uid) || ' says they weren''t on "' || h.title || '" and removed the ticks.', uid);
  end if;
  return jsonb_build_object('removed', n);
end $$;
