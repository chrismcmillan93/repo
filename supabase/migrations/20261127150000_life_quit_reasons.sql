-- Life app, Giving up: any number of reasons and quotes per thing being given up (a reason in your own words, or a
-- quote with an optional "who said it"), read on the card and while a craving timer is running. Same privacy rules as
-- the other Giving up tables: own rows, authenticated only, and no grant to service_role, so no Edge Function can read
-- it; the service worker never caches it (sw.js) and the backup includes it only when "Include Giving up" is ticked.
create table life.quit_reasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quit_id uuid not null references life.quits(id) on delete cascade,
  kind text not null default 'reason' check (kind in ('reason', 'quote')),
  body text not null check (char_length(body) between 1 and 280),
  source text not null default '' check (char_length(source) <= 80),
  created_at timestamptz not null default now()
);

create index quit_reasons_user_idx on life.quit_reasons (user_id);
create index quit_reasons_quit_idx on life.quit_reasons (quit_id, created_at);

alter table life.quit_reasons enable row level security;
create policy "own rows" on life.quit_reasons for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.quit_reasons to authenticated;
