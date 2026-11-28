-- Life app: Money. Not spending: the things that are the same every month or year. Pots (a savings goal like the USA trip,
-- or money put aside for an upcoming bill), the deposits you make into them (you tick "Moved" after making the transfer in
-- your banking app), and regular payments. Nothing here reads a bank.
-- Privacy: own rows only, authenticated only. The one deliberate exception: service_role may SELECT money_payments (and
-- nothing else), so the morning notification can name a payment that is due. Pots and deposits stay unreadable by any
-- function. The service worker never caches these tables and the backup includes them only with "Include Giving up and Money".
create table life.money_pots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'bill' check (kind in ('saving', 'bill')),
  target numeric(12,2) not null check (target > 0),
  target_date date,
  monthly_amount numeric(12,2) check (monthly_amount >= 0),
  goal_id uuid references life.goals(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table life.money_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pot_id uuid not null references life.money_pots(id) on delete cascade,
  amount numeric(12,2) not null check (amount <> 0),
  deposited_on date not null default current_date,
  note text not null default '' check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);

create table life.money_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  amount numeric(12,2) not null check (amount > 0),
  cadence text not null default 'monthly' check (cadence in ('weekly', 'monthly', 'yearly', 'one_off')),
  next_due date not null,
  pot_id uuid references life.money_pots(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index money_pots_user_idx on life.money_pots (user_id);
create index money_deposits_user_idx on life.money_deposits (user_id);
create index money_deposits_pot_idx on life.money_deposits (pot_id, deposited_on);
create index money_payments_user_idx on life.money_payments (user_id, next_due);

alter table life.money_pots enable row level security;
alter table life.money_deposits enable row level security;
alter table life.money_payments enable row level security;
create policy "own rows" on life.money_pots for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on life.money_deposits for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on life.money_payments for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.money_pots to authenticated;
grant select, insert, update, delete on life.money_deposits to authenticated;
grant select, insert, update, delete on life.money_payments to authenticated;
grant select on life.money_payments to service_role;
