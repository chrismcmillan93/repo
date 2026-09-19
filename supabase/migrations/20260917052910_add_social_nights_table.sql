-- RECONSTRUCTED, not the original migration text -- see the note at the top
-- of add_prep_and_shopping_tables.sql; the same caveat applies here. Added
-- outside this repo's tracked migrations; captured afterwards from the
-- live schema so this table isn't silently missing from the repo's
-- migration history.
--
-- Schema drift only -- no app code in this repo reads or writes this table
-- as of this migration. Not part of any change requested through this
-- repo; noted in fitness/CLAUDE.md. Table/column shapes below match the
-- live schema; RLS policy/grant details were not introspected (out of
-- scope for whatever prompted this capture) and are not asserted here.

create table fitness.social_nights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  status text not null check (status in ('tbc', 'confirmed')),
  note text,
  created_at timestamptz not null default now()
);

alter table fitness.social_nights enable row level security;
