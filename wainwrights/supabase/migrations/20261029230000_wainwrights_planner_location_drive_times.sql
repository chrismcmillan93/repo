-- PROJECT: walking-up-hills (ref jyxtduvkmztexwurrjsf) — the Wainwrights
-- tracker's own project, NOT dashboards-new. Applied with apply_migration
-- against that ref.
--
-- Fell planner (wainwrights/beta/planner.html): each user's home location,
-- for drive times to walk start points, and a per-user cache of those times.
--
-- Privacy: the postcode itself is never stored. The browser looks it up
-- (postcodes.io) and saves only coordinates snapped to a ~1 mile grid, plus
-- the postcode DISTRICT (e.g. "PR2") as a label. Users choose full postcode
-- (more accurate) or district only (more private); either way only the
-- snapped point lands here. Visible to its owner only, never on leaderboards.

create table public.planner_user_location (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lat        numeric(7,4) not null check (lat between 49 and 61),
  lng        numeric(7,4) not null check (lng between -9 and 3),
  precision  text not null check (precision in ('postcode', 'district')),
  district   text not null check (district ~ '^[A-Z]{1,2}[0-9][0-9A-Z]?$'),
  updated_at timestamptz not null default now()
);

-- Drive times from the user's saved point to each walk start. Written only by
-- the drive-times Edge Function; wiped and recomputed when the location
-- changes (the function compares origin_lat/lng to the saved point).
create table public.planner_drive_times (
  user_id     uuid not null references auth.users(id) on delete cascade,
  start_key   text not null,
  origin_lat  numeric(7,4) not null,
  origin_lng  numeric(7,4) not null,
  miles       numeric(6,1),
  minutes     int,
  computed_at timestamptz not null default now(),
  primary key (user_id, start_key)
);

alter table public.planner_user_location enable row level security;
alter table public.planner_drive_times enable row level security;

create policy "own location" on public.planner_user_location for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own drive times read" on public.planner_drive_times for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own drive times delete" on public.planner_drive_times for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.planner_user_location, public.planner_drive_times from anon;
grant select, insert, update, delete on public.planner_user_location to authenticated;
grant select, delete on public.planner_drive_times to authenticated;
grant all on public.planner_user_location, public.planner_drive_times to service_role;

-- Deleting your location also clears your cached drive times.
create or replace function public.planner_clear_drive_times()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.planner_drive_times where user_id = old.user_id;
  return old;
end $$;

create trigger planner_location_deleted
  after delete on public.planner_user_location
  for each row execute function public.planner_clear_drive_times();
