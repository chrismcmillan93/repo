-- "Booked" tick per race. Plan races are read-only plan data, so the user's own
-- ticks live in their own table: effective booked = this row if there is one,
-- else races.status = 'entered'. Only the Edale 50km starts out booked; every
-- other race is not booked until the user ticks it.

create table fitness.race_booked (
  user_id uuid not null references auth.users(id),
  race_id uuid not null references fitness.races(id) on delete cascade,
  booked boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, race_id)
);
create index race_booked_race_idx on fitness.race_booked (race_id);

alter table fitness.race_booked enable row level security;

create policy "own rows" on fitness.race_booked for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on fitness.race_booked to authenticated;

update fitness.races set status = 'entered'
  where plan_version = 'v2' and user_id is null and name like 'Edale 50km%';
