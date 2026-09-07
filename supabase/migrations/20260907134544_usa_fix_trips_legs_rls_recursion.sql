-- URGENT FIX: "shared leg trip read" (added in usa_shared_leg_trip_read) put
-- usa.trips' RLS in a circular dependency with usa.legs:
--   trips."shared leg trip read"  -> queries usa.legs
--   legs."own trip rows"          -> queries usa.trips
-- Evaluating either table's RLS now requires evaluating the other's, forever
-- -- "infinite recursion detected in policy for relation ...". Since every
-- child table's own-row policy also queries usa.trips, this broke RLS for
-- the entire schema, not just sharing.
--
-- Fix: move the "does this trip own a shared leg" check into a SECURITY
-- DEFINER function. Called from inside a policy, it runs as its (elevated,
-- RLS-bypassing) owner rather than the querying role, so its internal query
-- against usa.legs does not re-trigger legs' RLS and cannot recurse back
-- into trips.
create or replace function usa.trip_has_shared_leg(check_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from usa.legs where trip_id = check_trip_id and is_shared = true
  );
$$;

revoke execute on function usa.trip_has_shared_leg(uuid) from public;
grant execute on function usa.trip_has_shared_leg(uuid) to authenticated;

drop policy "shared leg trip read" on usa.trips;

create policy "shared leg trip read" on usa.trips
  for select
  to authenticated
  using (usa.trip_has_shared_leg(id));
