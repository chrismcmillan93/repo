-- Life app: a log of when progress pictures were taken (a date and a short note, e.g. "front, side, back,
-- same light"). The pictures themselves are never stored here: they stay on the phone and go to Claude by
-- hand. Used by the weekly check-in and Today's "pictures are due" reminder. Own rows, authenticated only.
create table life.progress_pics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index progress_pics_user_date_idx on life.progress_pics (user_id, taken_on);

alter table life.progress_pics enable row level security;
create policy "own rows" on life.progress_pics for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on life.progress_pics to authenticated;
