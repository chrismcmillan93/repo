-- Cross-trip visibility: a leg marked is_shared can be read by any
-- authenticated user, not just its own trip's owner. Used so two different
-- people's trips can both mark their Vegas leg shared and see each other's
-- schedule there -- nothing else on either trip.
alter table usa.legs add column is_shared boolean not null default false;
comment on column usa.legs.is_shared is 'When true, this leg (and its itinerary_items) is readable by any authenticated user, not just the trip owner. Used for cross-trip coordination on a shared stop (e.g. two travellers both in Vegas for the same wedding).';
