-- Recurring commitments with a cadence. A rule says "N times per day / week / month";
-- the app creates one life.commitments row per period from the rule (idempotent: the
-- unique index on (user_id, rule_id, week_start) stops duplicates). A daily rule becomes a
-- weekly row with target N x 7, so a missed day can be made up later in the week. A
-- monthly row keeps the first day of its month in week_start. Existing rows are plain
-- one-off weekly commitments (cadence 'weekly', no rule).
create table life.commitment_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid references life.goals(id) on delete cascade,
  title text not null,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  per_period int not null default 1 check (per_period > 0),
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index commitment_rules_user_idx on life.commitment_rules (user_id);
create index commitment_rules_goal_idx on life.commitment_rules (goal_id);
alter table life.commitment_rules enable row level security;
create policy "own rows" on life.commitment_rules for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.commitment_rules to authenticated, service_role;

alter table life.commitments add column cadence text not null default 'weekly' check (cadence in ('daily', 'weekly', 'monthly'));
alter table life.commitments add column rule_id uuid references life.commitment_rules(id) on delete set null;
create unique index commitments_rule_period_key on life.commitments (user_id, rule_id, week_start);
create index commitments_rule_idx on life.commitments (rule_id);
