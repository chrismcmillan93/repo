-- Extends the shared-Vegas read exception (see usa_rls_tighten_to_owner) to
-- usa.places: a place referenced by an itinerary item that itself sits on a
-- leg marked is_shared becomes readable by any authenticated account, same
-- read-only rule as the leg/itinerary-item policies. This lets the "Also
-- there" overview section show a shared item's location, not just its
-- title/time/notes, without granting any broader access to someone else's
-- places shortlist.
create policy "shared leg place read" on usa.places
  for select
  to authenticated
  using (
    id in (
      select ii.place_id
      from usa.itinerary_items ii
      join usa.legs l on l.id = ii.leg_id
      where l.is_shared = true and ii.place_id is not null
    )
  );
