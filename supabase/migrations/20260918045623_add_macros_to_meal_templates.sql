-- RECONSTRUCTED, not the original migration text -- see the note at the top
-- of add_prep_and_shopping_tables.sql; the same caveat applies here. This
-- is the backend change the "macro row extension" change brief referred to
-- as already applied (columns added and backfilled for all 15 existing
-- meal_templates rows) -- captured afterwards from the live schema.

alter table fitness.meal_templates
  add column carbs_g numeric,
  add column fat_g numeric;
