-- Raise the per-hike fell cap in create_hike from 30 to 50 (so the Bob Graham Round, 39 Wainwrights, can be hosted).
-- Same technique as 20261031160000: rewrite the one check in the function's current definition so nothing else can drift.
-- This was first applied straight to the live database as migration "wainwrights_hike_fell_cap_50" (version 20261107201959);
-- this file is the matching record in the repo. It is safe to run again: if the cap is already 50 it does nothing, and it
-- fails loudly if neither the 30 nor the 50 check is found.
do $$
declare
  fn regprocedure := 'public.create_hike(text, text, jsonb, text, timestamptz, int, text[], text, numeric, numeric, text, text, uuid, boolean)'::regprocedure;
  def text := pg_get_functiondef(fn);
  newdef text := replace(def, 'jsonb_array_length(fells) not between 1 and 30', 'jsonb_array_length(fells) not between 1 and 50');
begin
  if position('jsonb_array_length(fells) not between 1 and 50' in def) > 0 then return; end if;
  if newdef = def then raise exception 'fell cap check not found in create_hike'; end if;
  execute newdef;
end $$;
