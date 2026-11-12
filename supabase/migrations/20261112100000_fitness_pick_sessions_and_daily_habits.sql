-- 1) Which specific session was done when you pick Weights / Cardio for a day
--    (e.g. Full Body #2, Long run). The on/off pick itself stays in
--    daily_checks (pick:weights / pick:cardio); this only names the session.
-- 2) Two daily yes/no answers under "How did today go?": progress pictures taken,
--    and read one chapter / 10 pages. Null = not answered.

create table fitness.pick_sessions (
  user_id uuid not null references auth.users(id),
  log_date date not null,
  kind text not null check (kind in ('weights', 'cardio')),
  session text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date, kind)
);

alter table fitness.pick_sessions enable row level security;

create policy "own rows" on fitness.pick_sessions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on fitness.pick_sessions to authenticated;

alter table fitness.daily_logs
  add column if not exists progress_pics boolean,
  add column if not exists read_pages boolean;
