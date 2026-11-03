-- Let the signed-in user add their own races. Plan races (user_id null) stay
-- read-only to everyone; user-added races are visible only to their owner (this
-- project also hosts other people's accounts, so the old "authenticated read
-- everything" policy is narrowed rather than left as is).

alter table fitness.races
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists distance_label text;

create index if not exists races_user_idx on fitness.races (user_id);

alter policy "authenticated read" on fitness.races
  using (user_id is null or user_id = (select auth.uid()));

create policy "own races write" on fitness.races for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant insert, update, delete on fitness.races to authenticated;
