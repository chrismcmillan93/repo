-- Custom hikes let the host pick any Wainwrights, so raise the per-hike fell
-- cap from 10 to 30 in create_hike. Done by rewriting the one check in the
-- function's current definition (so it can't drift from the previous
-- migration), and asserting the rewrite actually changed something.
do $$
declare
  fn regprocedure := 'public.create_hike(text, text, jsonb, text, timestamptz, int, text[], text, numeric, numeric, text, text, uuid, boolean)'::regprocedure;
  def text := pg_get_functiondef(fn);
  newdef text := replace(def, 'jsonb_array_length(fells) not between 1 and 10', 'jsonb_array_length(fells) not between 1 and 30');
begin
  if newdef = def then raise exception 'fell cap check not found in create_hike'; end if;
  execute newdef;
end $$;
