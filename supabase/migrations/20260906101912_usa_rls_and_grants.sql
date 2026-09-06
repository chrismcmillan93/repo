-- RLS on every table. No auth yet, so every table gets one permissive policy
-- for the anon key. TODO: tighten when auth lands (scope to auth.uid() = user_id).

alter table usa.trips enable row level security;
alter table usa.legs enable row level security;
alter table usa.flights enable row level security;
alter table usa.accommodations enable row level security;
alter table usa.transport enable row level security;
alter table usa.places enable row level security;
alter table usa.itinerary_items enable row level security;
alter table usa.checklist_items enable row level security;
alter table usa.expenses enable row level security;

-- TODO: tighten when auth lands
create policy "anon full access" on usa.trips for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.legs for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.flights for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.accommodations for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.transport for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.places for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.itinerary_items for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.checklist_items for all using (true) with check (true);
-- TODO: tighten when auth lands
create policy "anon full access" on usa.expenses for all using (true) with check (true);

-- PostgREST access: the anon/authenticated roles need schema usage + table
-- privileges in addition to the RLS policies above.
grant usage on schema usa to anon, authenticated;
grant all on all tables in schema usa to anon, authenticated;
alter default privileges in schema usa grant all on tables to anon, authenticated;
