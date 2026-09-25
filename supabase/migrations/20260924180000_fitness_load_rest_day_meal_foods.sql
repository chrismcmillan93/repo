-- RECONSTRUCTED, not the original migration text. This data is already
-- live in the database (verified via execute_sql -- meal_templates totals
-- and meal_foods rows for every REST-day meal match exactly) but has no
-- corresponding entry in `list_migrations`, meaning it was applied
-- directly (e.g. via the SQL editor) rather than through apply_migration --
-- the same "schema drift" pattern already documented elsewhere in this
-- file. Reconstructed here from the live end-state so the migrations
-- folder reflects what's actually running, per this repo's established
-- convention for drift like this.
--
-- REST day's real per-food breakdown, mirroring the LIFT/RUN load
-- (fitness_load_real_meal_foods_lift_run): same per-gram/per-unit rates for
-- every matching food (eggs, banana, mince, rice, skyr, sweet potato), just
-- REST's own quantities (5 eggs not 6, 250g mince at lunch not 300g, no
-- CarbX/ABE pre-day). One food has no rate anywhere in the source CSV --
-- "cooked pepper & tomato" at lunch, part of REST's staple meal but never
-- itemized -- estimated at ~40 kcal (150g) so the day's total lands on the
-- ~2,156 kcal figure given as the reconciliation target; flagged here in
-- case the real figure differs. Dinner's swap-protein options (salmon,
-- chicken breast, chicken thigh) are scaled to REST's own 300g default
-- portion (not LIFT/RUN's 250g) to match the base food they're standing in
-- for; the fixed 2-egg add-on is unchanged regardless of portion size.

update fitness.meal_templates set kcal = 2, protein_g = 0, carbs_g = 0, fat_g = 0
  where id = 'a078f3e8-2ac3-4f1b-a27a-e69519a3ac87'; -- 07:00 Black coffee + creatine + electrolytes
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('a078f3e8-2ac3-4f1b-a27a-e69519a3ac87', 1, 'Black coffee', 1, 'serving', 2, 0, 0, 0),
  ('a078f3e8-2ac3-4f1b-a27a-e69519a3ac87', 2, 'Creatine monohydrate', 5, 'g', 0, 0, 0, 0),
  ('a078f3e8-2ac3-4f1b-a27a-e69519a3ac87', 3, 'Electrolytes', 1, 'serving', 0, 0, 0, 0);

update fitness.meal_templates set kcal = 431, protein_g = 33.1, carbs_g = 24.5, fat_g = 23.8
  where id = 'e3da82f7-3426-44ab-a9be-eb22110f758c'; -- 08:00 5 whole eggs + 1 banana
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('e3da82f7-3426-44ab-a9be-eb22110f758c', 1, 'Eggs', 5, 'whole', 340, 32.0, 1.5, 23.5),
  ('e3da82f7-3426-44ab-a9be-eb22110f758c', 2, 'Banana', 1, 'whole', 91, 1.1, 23.0, 0.3);

update fitness.meal_templates set kcal = 736, protein_g = 64.5, carbs_g = 88.0, fat_g = 14.3
  where id = '7136cf1c-7abc-403e-a6c3-41db42df43f4'; -- 12:30 250g mince + 250g rice + broccoli + pepper & tomato
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('7136cf1c-7abc-403e-a6c3-41db42df43f4', 1, '5% beef mince', 250, 'g', 320, 52.0, 0, 12.5),
  ('7136cf1c-7abc-403e-a6c3-41db42df43f4', 2, 'White rice', 250, 'g', 325, 6.8, 70.0, 0.8),
  ('7136cf1c-7abc-403e-a6c3-41db42df43f4', 3, 'Broccoli', 150, 'g', 51, 4.2, 10.0, 0.6),
  ('7136cf1c-7abc-403e-a6c3-41db42df43f4', 4, 'Pepper & tomato side (cooked)', 150, 'g', 40, 1.5, 8.0, 0.4);

update fitness.meal_templates set kcal = 282, protein_g = 44.4, carbs_g = 23.6, fat_g = 1.0
  where id = '68b2d48b-fef2-4e52-aee6-0218b90d7e9e'; -- 15:30 400g skyr + blueberries
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('68b2d48b-fef2-4e52-aee6-0218b90d7e9e', 1, 'Skyr plain', 400, 'g', 248, 44.0, 15.2, 0.8),
  ('68b2d48b-fef2-4e52-aee6-0218b90d7e9e', 2, 'Blueberries', 60, 'g', 34, 0.4, 8.4, 0.2);

update fitness.meal_templates set kcal = 705, protein_g = 72.6, carbs_g = 72.1, fat_g = 15.9
  where id = '4758fbda-7647-4a10-8115-71f30b8d6c59'; -- 19:00 300g protein source + 300g sweet potato + veg
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, is_swap_option) values
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 1, '5% beef mince', 300, 'g', 384, 62.4, 0, 15.0, false),
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 2, 'Sweet potato', 300, 'g', 270, 6.0, 62.1, 0.3, false),
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 3, 'Carrots / asparagus / spring greens', 150, 'g', 51, 4.2, 10.0, 0.6, false),
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 4, 'Salmon', 300, 'g', 552, 61.2, 0, 34.6, true),
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 5, 'Chicken breast', 300, 'g', 316, 66.0, 0, 4.0, true),
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 6, 'Chicken thigh', 300, 'g', 366, 57.6, 0, 15.6, true),
  ('4758fbda-7647-4a10-8115-71f30b8d6c59', 7, 'Eggs (add-on)', 2, 'whole', 136, 12.8, 0.6, 9.4, true);
