-- Day swaps: "on log_date, do the planned session that belongs to source_date".
-- Swapping Tuesday and Wednesday stores two rows (Tue <- Wed, Wed <- Tue). Only
-- non-identity entries are stored. The plan itself is never edited; swaps are
-- the signed-in user's own and are read by get_day_bundle().

create table fitness.day_swaps (
  user_id uuid not null references auth.users(id),
  log_date date not null,
  source_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, log_date),
  check (source_date <> log_date)
);

alter table fitness.day_swaps enable row level security;

create policy "own rows" on fitness.day_swaps for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on fitness.day_swaps to authenticated;
