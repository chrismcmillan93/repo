-- Real per-food data turned out to be mostly non-gram (6 whole eggs, 2
-- medium bananas, 1 scoop, 1 serving) -- weight_g alone can't hold that
-- without inventing gram conversions nobody supplied. Replace it with
-- quantity + unit, stored exactly as given ("6"/"whole", "250"/"g",
-- "1"/"scoop"). Table is brand new and still empty, so this is a clean
-- widen, not a migration of real data.
--
-- is_swap_option marks a food as an alternative to swap in instead of the
-- meal's default (e.g. dinner's salmon/chicken vs. its beef mince), never
-- something eaten in addition to it -- excluded from meal_templates' own
-- combined kcal/protein_g/carbs_g/fat_g, which only ever total the meal's
-- actual default foods.
alter table fitness.meal_foods drop column weight_g;
alter table fitness.meal_foods add column quantity numeric;
alter table fitness.meal_foods add column unit text;
alter table fitness.meal_foods add column is_swap_option boolean not null default false;
