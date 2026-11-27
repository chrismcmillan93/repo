-- Life app: a books list to read or listen to (Lists -> Books). One row per book: format `book` or `audio`, stage
-- `to_read` / `reading` / `read` (shown as to listen / listening / listened for an audiobook), an optional star rating,
-- an optional link to a goal (finishing a linked book ticks progress on it) and, for books suggested from the Playbook,
-- the Playbook key. Own rows only, authenticated only, like the other Life tables.
create table life.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author text not null default '' check (char_length(author) <= 120),
  format text not null default 'book' check (format in ('book', 'audio')),
  status text not null default 'to_read' check (status in ('to_read', 'reading', 'read')),
  rating int check (rating between 1 and 5),
  goal_id uuid references life.goals(id) on delete set null,
  playbook_key text,
  started_on date,
  finished_on date,
  note text not null default '' check (char_length(note) <= 500),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index books_user_status_idx on life.books (user_id, status);

alter table life.books enable row level security;
create policy "own rows" on life.books for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.books to authenticated;
