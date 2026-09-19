-- Fitness app: dedicated schema. `public`, `usa` and `goals` belong to other
-- apps in this repo and are never touched from here.
create schema if not exists fitness;

-- Shared updated_at trigger for tables in this schema that track it.
-- search_path pinned from the start (avoids the function_search_path_mutable
-- advisor finding the usa schema hit and had to fix up after the fact).
create or replace function fitness.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
