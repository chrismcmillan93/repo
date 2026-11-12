-- 1) Weekly check-ins against the Edale training plan (plan weeks), instead of
--    Block 2's block_weeks. weekly_checkins (Block 2) stays as history.
-- 2) Ticks for the shopping list and prep tasks, which are now generated from the
--    nutrition plan for the week (so they have no row of their own to point at,
--    unlike the old shopping_list_items / prep_tasks): keyed by week + list + item.

create table fitness.plan_checkins (
  user_id uuid not null references auth.users(id),
  plan_version text not null,
  week_number integer not null check (week_number > 0),
  weight_kg numeric,
  leak_count integer,
  win text,
  challenge text,
  submitted_at timestamptz not null default now(),
  primary key (user_id, plan_version, week_number)
);

create table fitness.week_list_ticks (
  user_id uuid not null references auth.users(id),
  week_start_date date not null,
  list text not null check (list in ('shopping', 'prep')),
  item_key text not null,
  is_checked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start_date, list, item_key)
);

alter table fitness.plan_checkins enable row level security;
alter table fitness.week_list_ticks enable row level security;

create policy "own rows" on fitness.plan_checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on fitness.week_list_ticks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on fitness.plan_checkins, fitness.week_list_ticks to authenticated;
