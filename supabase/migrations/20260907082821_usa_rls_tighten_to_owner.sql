-- Real per-user access, replacing the transitional "anyone with the anon
-- key" policies now that Chris has a real account and his trip is
-- correctly owned. From here on the app requires a signed-in session.

drop policy "anon full access" on usa.trips;
drop policy "anon full access" on usa.legs;
drop policy "anon full access" on usa.flights;
drop policy "anon full access" on usa.accommodations;
drop policy "anon full access" on usa.transport;
drop policy "anon full access" on usa.places;
drop policy "anon full access" on usa.itinerary_items;
drop policy "anon full access" on usa.checklist_items;
drop policy "anon full access" on usa.expenses;

-- trips: owned rows only.
create policy "own trip" on usa.trips for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- every child table: rows whose trip is owned by the caller.
create policy "own trip rows" on usa.legs for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.flights for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.accommodations for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.transport for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.places for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.itinerary_items for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.checklist_items for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));
create policy "own trip rows" on usa.expenses for all to authenticated
  using (trip_id in (select id from usa.trips where user_id = auth.uid()))
  with check (trip_id in (select id from usa.trips where user_id = auth.uid()));

-- Exception, additive and read-only: a leg marked is_shared, and the
-- itinerary items on it, are visible to any signed-in account -- not just
-- its owner. Nobody can edit a leg they don't own via this policy.
create policy "shared leg read" on usa.legs for select to authenticated
  using (is_shared = true);
create policy "shared leg itinerary read" on usa.itinerary_items for select to authenticated
  using (leg_id in (select id from usa.legs where is_shared = true));

-- From here on the app requires a real session -- revoke the anon key's
-- table access entirely (schema usage stays revoked-by-default too, since
-- it was only ever granted alongside these table grants).
revoke all on all tables in schema usa from anon;
revoke usage on schema usa from anon;
