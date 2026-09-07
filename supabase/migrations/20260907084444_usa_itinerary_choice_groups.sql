-- Undecided options for the same slot (e.g. Vegas: UFC vs the Sphere on the
-- same night). Items sharing a choice_group_id are alternatives; exactly
-- one should have is_selected = true. Standalone items (choice_group_id
-- null) default is_selected = true so cost summing can filter on
-- is_selected uniformly without special-casing standalone rows.
alter table usa.itinerary_items add column choice_group_id uuid;
alter table usa.itinerary_items add column is_selected boolean not null default true;
create index on usa.itinerary_items (choice_group_id);
comment on column usa.itinerary_items.choice_group_id is 'Items sharing this id are alternative options for the same slot -- exactly one should have is_selected = true at a time.';
comment on column usa.itinerary_items.is_selected is 'Whether this option is the currently chosen one. Always true for standalone items (choice_group_id null); only cost/summary screens should filter on it.';
