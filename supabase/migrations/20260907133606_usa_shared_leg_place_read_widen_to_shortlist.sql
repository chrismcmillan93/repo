-- Widen the shared-leg place exception: previously a place was only
-- cross-trip readable if it was actually referenced from a shared leg's
-- itinerary item (usa_shared_leg_place_read). That left the Places
-- shortlist itself -- everything shortlisted, undecided, or rejected on a
-- shared leg but not yet turned into an itinerary item -- invisible cross-
-- trip, which defeats the point of comparing notes on a shared stop before
-- either of you has actually booked anything. A place now also qualifies
-- by its own leg_id pointing at a shared leg, on top of the original
-- itinerary-reference condition (kept for a place assigned to no leg of
-- its own but still linked from a shared leg's item).
drop policy "shared leg place read" on usa.places;

create policy "shared leg place read" on usa.places
  for select
  to authenticated
  using (
    leg_id in (select id from usa.legs where is_shared = true)
    or id in (
      select ii.place_id
      from usa.itinerary_items ii
      join usa.legs l on l.id = ii.leg_id
      where l.is_shared = true and ii.place_id is not null
    )
  );
