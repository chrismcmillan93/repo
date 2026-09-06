-- USA 2027 trip planner: schema + enum types.
-- Schema is dedicated to this app; the `public` schema belongs to another app and is never touched.
create schema if not exists usa;

create type usa.booking_status as enum ('placeholder', 'held', 'booked');
create type usa.accommodation_type as enum ('hotel', 'apartment', 'airbnb', 'other');
create type usa.transport_type as enum ('hire_car', 'transfer', 'rideshare', 'rail', 'other');
create type usa.place_category as enum (
  'activity', 'hike', 'national_park', 'restaurant', 'bbq', 'coffee',
  'bar', 'comedy', 'shopping', 'landmark', 'other'
);
create type usa.itinerary_item_type as enum ('fixed', 'planned', 'idea');
create type usa.checklist_category as enum ('admin', 'tickets', 'packing', 'other');
create type usa.expense_category as enum ('activities', 'food_and_drink', 'other');

-- Shared updated_at trigger for every table in this schema.
create or replace function usa.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
