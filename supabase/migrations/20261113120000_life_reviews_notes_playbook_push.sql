-- Life app, second build: guided reviews, notes pages, Playbook progress and push
-- notifications. Same ownership rule as life_schema: RLS on, `user_id = auth.uid()`,
-- authenticated only. push_config is the exception: server-only (RLS on, no policy,
-- no grants), read by the life-push Edge Function with the service role and by the
-- pg_cron job, which runs as the database owner.
create table life.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month', 'quarter')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'complete')),
  went_well text not null default '',
  went_badly text not null default '',
  learned text not null default '',
  focus_next text not null default '',
  rating int check (rating between 1 and 5),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, period_type, period_start)
);

create table life.review_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  review_id uuid not null references life.reviews(id) on delete cascade,
  goal_id uuid not null references life.goals(id) on delete cascade,
  rating int check (rating between 1 and 5),
  decision text check (decision in ('continue', 'adjust', 'pause', 'complete', 'stop')),
  note text not null default '',
  pct_at_review int,
  created_at timestamptz not null default now(),
  unique (review_id, goal_id)
);

create table life.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  area text not null default '',
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_id)
);

create table life.playbook_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  directive_key text not null,
  status text not null default 'not_started' check (status in ('not_started', 'working_on_it', 'adopted')),
  note text not null default '',
  habit_id uuid references life.habits(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, directive_key)
);

create table life.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text not null default '',
  last_morning_on date,
  last_evening_on date,
  created_at timestamptz not null default now()
);

create table life.push_config (
  id int primary key default 1 check (id = 1),
  cron_key text not null,
  vapid jsonb
);
insert into life.push_config (cron_key) values (encode(extensions.gen_random_bytes(24), 'hex'));

alter table life.list_items add column source_id uuid;
create unique index list_items_source_idx on life.list_items (user_id, source_id) where source_id is not null;

create index reviews_user_idx on life.reviews (user_id, period_type, period_start);
create index review_goals_review_idx on life.review_goals (review_id);
create index review_goals_goal_idx on life.review_goals (goal_id);
create index review_goals_user_idx on life.review_goals (user_id);
create index notes_user_idx on life.notes (user_id, updated_at);
create index playbook_progress_habit_idx on life.playbook_progress (habit_id);
create index push_subscriptions_user_idx on life.push_subscriptions (user_id);

do $$
declare t text;
begin
  foreach t in array array['reviews', 'review_goals', 'notes', 'playbook_progress', 'push_subscriptions']
  loop
    execute format('alter table life.%I enable row level security', t);
    execute format('create policy "own rows" on life.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on life.%I to authenticated', t);
  end loop;
end $$;

alter table life.push_config enable row level security;
revoke all on life.push_config from anon, authenticated;

-- Every 15 minutes, ask life-push to send any morning briefs / evening reminders that are due.
select cron.schedule(
  'life-push-tick',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://bcrmbuiuekklpocpllpw.supabase.co/functions/v1/life-push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', (select cron_key from life.push_config where id = 1)),
    body := '{"action":"tick"}'::jsonb
  );
  $cron$
);
