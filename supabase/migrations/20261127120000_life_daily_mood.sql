-- Life app: one mood + energy tap per day (Today), read back on Health > Progress next to sleep.
-- Same ownership rule as the other life tables: own rows, authenticated only. One row per
-- user per day, so a second tap the same day just updates it.
create table life.daily_mood (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mood_date date not null default current_date,
  energy int check (energy between 1 and 5),
  mood int check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, mood_date)
);

alter table life.daily_mood enable row level security;
create policy "own rows" on life.daily_mood for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.daily_mood to authenticated;
