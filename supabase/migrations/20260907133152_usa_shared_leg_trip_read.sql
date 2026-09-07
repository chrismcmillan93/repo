-- Extends the shared-Vegas read exception to usa.trips itself: without
-- this, embedding trips(name, traveller_name) from a shared leg or
-- itinerary item -- as the "Also there" / Itinerary-badge queries do --
-- silently returns null under RLS, since usa.trips previously had only the
-- owner-scoped "own trip" policy. That's what caused the badge to fall
-- back to "Someone" instead of naming the traveller.
--
-- Scope note: RLS is row-level, not column-level, so this opens up the
-- whole trips row (including fx_rate, notes, start/end dates), not just
-- name/traveller_name, for any trip that has at least one is_shared leg.
-- Accepted trade-off for a two-person app where marking a leg shared is
-- already an explicit, mutual opt-in -- narrower than exposing every trip
-- to everyone, but wider than the leg/item/place policies, which really
-- are scoped to individual rows. Revisit with a dedicated view if trips
-- ever carries something more sensitive in `notes`.
create policy "shared leg trip read" on usa.trips
  for select
  to authenticated
  using (
    id in (
      select trip_id from usa.legs where is_shared = true
    )
  );
