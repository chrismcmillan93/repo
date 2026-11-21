-- Life app: craving log + if-then plans + time of day on slips (Giving up), and the niggle
-- log (training). Same ownership rule as the other life tables: own rows, authenticated
-- only. The quit tables stay unreadable by service_role on purpose (private).
alter table life.quits add column plans jsonb not null default '{}'::jsonb;
alter table life.quit_slips add column slip_part text not null default ''
  check (slip_part in ('', 'Morning', 'Afternoon', 'Evening', 'Late night'));

create table life.quit_cravings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quit_id uuid not null references life.quits(id) on delete cascade,
  outcome text not null check (outcome in ('held', 'slipped')),
  trigger text not null default '',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table life.niggles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area text not null,
  severity int not null default 2 check (severity between 1 and 5),
  note text not null default '',
  started_on date not null default current_date,
  resolved_on date,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index quit_cravings_user_idx on life.quit_cravings (user_id);
create index quit_cravings_quit_idx on life.quit_cravings (quit_id, started_at);
create index niggles_user_idx on life.niggles (user_id, resolved_on);

alter table life.quit_cravings enable row level security;
alter table life.niggles enable row level security;
create policy "own rows" on life.quit_cravings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on life.niggles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.quit_cravings to authenticated;
grant select, insert, update, delete on life.niggles to authenticated;
