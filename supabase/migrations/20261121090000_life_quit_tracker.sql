-- Life app: "Giving up" tracker. Things you've stopped (or are stopping), with a quit date
-- and a log of slips, so the app can show days since, best run and so on.
-- Private by design: own-rows RLS for signed-in users only, and deliberately NOT granted to
-- service_role, so the notification and sync Edge Functions cannot read these tables.
create table life.quits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  alias text not null default '',
  why text not null default '',
  started_on date not null default current_date,
  target_days int check (target_days is null or target_days > 0),
  show_today boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table life.quit_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quit_id uuid not null references life.quits(id) on delete cascade,
  slip_date date not null default current_date,
  trigger text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index quits_user_idx on life.quits (user_id);
create index quit_slips_user_idx on life.quit_slips (user_id);
create index quit_slips_quit_idx on life.quit_slips (quit_id, slip_date);

alter table life.quits enable row level security;
alter table life.quit_slips enable row level security;
create policy "own rows" on life.quits for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on life.quit_slips for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.quits to authenticated;
grant select, insert, update, delete on life.quit_slips to authenticated;
