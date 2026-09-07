-- One-off cleanup: Chris asked to reset two of his own test accounts
-- (used earlier to exercise cross-trip sharing) so he can sign up fresh
-- and test the RLS-recursion fix from a clean state.
--
-- Checked before running: neither account has any goals.* rows (auth.users
-- is shared with the Goals app) -- safe to remove entirely. Their usa data
-- was minimal: one trip + one leg each, nothing else.
delete from usa.trips
where id in (
  '42de211d-353d-4a7d-a55c-51f3bcb0a62f', -- "Test USA 2027" (orders@chris-mcmillan.co.uk)
  '9c3edfda-d9e5-4c9c-add1-785f2f9ea548'  -- "usa" (chris.mcmillan@cms-group.net)
);
-- Cascades to legs/flights/accommodations/transport/places/itinerary_items/
-- checklist_items/expenses via their trip_id FK.

delete from auth.users
where id in (
  '6f7009d3-b7d5-4d80-a0c2-9eb495bb21de', -- chris.mcmillan@cms-group.net
  'f0e6e788-bac1-4798-b727-144f798a37f6'  -- orders@chris-mcmillan.co.uk
);
-- Cascades to auth.identities/sessions/refresh_tokens/etc. via Supabase's
-- own auth schema FKs.
