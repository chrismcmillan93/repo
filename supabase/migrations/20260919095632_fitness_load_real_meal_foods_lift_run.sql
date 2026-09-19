-- Real per-food breakdown for LIFT and RUN day meals, supplied by Chris.
-- Confirmed with him first: this data is the *update* -- it reflects
-- smaller/simpler portions than what was seeded (no whey at post-workout,
-- no pepper & tomato side at lunch, 250g/200g portions rather than 300g),
-- so meal_templates' own combined totals and names are corrected here to
-- match exactly, not just layered underneath as a mismatching breakdown.
-- REST day wasn't covered by this data and is untouched.
--
-- Dinner's alt proteins (salmon, chicken breast, chicken thigh, an egg
-- add-on) are alternatives to the mince, not extra food on top of it --
-- inserted with is_swap_option = true so they're excluded from the meal's
-- own totals below and rendered as a separate "swap" list, not summed.

-- LIFT Pre-workout (05:30) -- totals already match exactly, no update needed.
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('792136df-f480-4a26-8828-37935576e870', 1, 'Black coffee', 1, 'serving', 2, 0, 0, 0),
  ('792136df-f480-4a26-8828-37935576e870', 2, 'ABE pre-workout', 1, 'scoop', 3, 0, 0, 0),
  ('792136df-f480-4a26-8828-37935576e870', 3, 'CarbX Blackcurrant', 1, 'serving', 95, 0, 24, 0),
  ('792136df-f480-4a26-8828-37935576e870', 4, 'Creatine monohydrate', 5, 'g', 0, 0, 0, 0),
  ('792136df-f480-4a26-8828-37935576e870', 5, 'Electrolytes', 1, 'serving', 0, 0, 0, 0);

-- LIFT M1 Post-workout (07:30) -- was "4 whole eggs + 1 scoop Bulk Pure Whey + 2 bananas", 645/50/57/24.
update fitness.meal_templates set
  name = '6 whole eggs + 2 bananas', kcal = 590, protein_g = 40.6, carbs_g = 47.8, fat_g = 28.8
  where id = '675e3265-cb33-4df6-8d37-aaf4329851d0';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('675e3265-cb33-4df6-8d37-aaf4329851d0', 1, 'Eggs', 6, 'whole', 408, 38.4, 1.8, 28.2),
  ('675e3265-cb33-4df6-8d37-aaf4329851d0', 2, 'Bananas', 2, 'medium', 182, 2.2, 46.0, 0.6);

-- LIFT M2 Lunch (12:30) -- was "300g mince + 300g rice + broccoli + pepper & tomato side", 745/63/95/13.
update fitness.meal_templates set
  name = '250g 5% beef mince + 200g white rice + broccoli', kcal = 631, protein_g = 61.6, carbs_g = 66.0, fat_g = 13.7
  where id = '7760516a-0538-48fe-9b59-528a231bb2ac';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('7760516a-0538-48fe-9b59-528a231bb2ac', 1, '5% beef mince', 250, 'g', 320, 52.0, 0, 12.5),
  ('7760516a-0538-48fe-9b59-528a231bb2ac', 2, 'White rice', 200, 'g', 260, 5.4, 56.0, 0.6),
  ('7760516a-0538-48fe-9b59-528a231bb2ac', 3, 'Broccoli', 150, 'g', 51, 4.2, 10.0, 0.6);

-- LIFT M3 Afternoon (15:30) -- was 280/44/24/1 (rounded); exact CSV sum below.
update fitness.meal_templates set
  name = '400g skyr + blueberries', kcal = 282, protein_g = 44.4, carbs_g = 23.6, fat_g = 1.0
  where id = '6eeb0f54-d708-4cb7-8a0d-28d959a7b304';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('6eeb0f54-d708-4cb7-8a0d-28d959a7b304', 1, 'Skyr plain', 400, 'g', 248, 44.0, 15.2, 0.8),
  ('6eeb0f54-d708-4cb7-8a0d-28d959a7b304', 2, 'Blueberries', 60, 'g', 34, 0.4, 8.4, 0.2);

-- LIFT M4 Dinner (19:00) -- was "300g protein + 300g sweet potato + veg", 750/64/67/25.
update fitness.meal_templates set
  name = '250g 5% beef mince + 200g sweet potato + green veg (or swap the protein)', kcal = 551, protein_g = 60.2, carbs_g = 51.4, fat_g = 13.3
  where id = '2a1548b4-2746-4518-93c3-3557d1fa7280';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, is_swap_option) values
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 1, '5% beef mince', 250, 'g', 320, 52.0, 0, 12.5, false),
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 2, 'Sweet potato', 200, 'g', 180, 4.0, 41.4, 0.2, false),
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 3, 'Green veg', 150, 'g', 51, 4.2, 10.0, 0.6, false),
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 4, 'Salmon', 250, 'g', 460, 51.0, 0, 28.8, true),
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 5, 'Chicken breast', 250, 'g', 263, 55.0, 0, 3.3, true),
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 6, 'Chicken thigh', 250, 'g', 305, 48.0, 0, 13.0, true),
  ('2a1548b4-2746-4518-93c3-3557d1fa7280', 7, 'Eggs (add-on)', 2, 'whole', 136, 12.8, 0.6, 9.4, true);

-- RUN Pre-run (05:30) -- was 100/0/24/0, exact CSV sum is 97 kcal.
update fitness.meal_templates set kcal = 97, protein_g = 0, carbs_g = 24.0, fat_g = 0
  where id = 'd4b507bd-223d-49be-b2ed-e993aa214645';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('d4b507bd-223d-49be-b2ed-e993aa214645', 1, 'Black coffee', 1, 'serving', 2, 0, 0, 0),
  ('d4b507bd-223d-49be-b2ed-e993aa214645', 2, 'CarbX Blackcurrant', 1, 'serving', 95, 0, 24, 0),
  ('d4b507bd-223d-49be-b2ed-e993aa214645', 3, 'Creatine monohydrate', 5, 'g', 0, 0, 0, 0),
  ('d4b507bd-223d-49be-b2ed-e993aa214645', 4, 'Electrolytes', 1, 'serving', 0, 0, 0, 0);

-- RUN Post-run (07:00) -- was "1 scoop whey + 3 bananas (swap 1 for pineapple)", 435/27/78/2.
update fitness.meal_templates set
  name = '1 scoop Bulk Pure Whey + 2 bananas', kcal = 303, protein_g = 25.2, carbs_g = 47.8, fat_g = 2.6
  where id = '726579a5-cb0d-47d8-a67b-d44d40f795d5';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('726579a5-cb0d-47d8-a67b-d44d40f795d5', 1, 'Bulk Pure Whey', 1, 'scoop', 121, 23.0, 1.8, 2.0),
  ('726579a5-cb0d-47d8-a67b-d44d40f795d5', 2, 'Bananas', 2, 'medium', 182, 2.2, 46.0, 0.6);

-- RUN M1 Lunch (12:30) -- was "300g mince + 250g rice + broccoli + pepper & tomato side", 685/63/79/13.
update fitness.meal_templates set
  name = '250g 5% beef mince + 200g white rice + broccoli', kcal = 631, protein_g = 61.6, carbs_g = 66.0, fat_g = 13.7
  where id = 'e3574643-146a-42fc-ba63-969e5fd81696';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('e3574643-146a-42fc-ba63-969e5fd81696', 1, '5% beef mince', 250, 'g', 320, 52.0, 0, 12.5),
  ('e3574643-146a-42fc-ba63-969e5fd81696', 2, 'White rice', 200, 'g', 260, 5.4, 56.0, 0.6),
  ('e3574643-146a-42fc-ba63-969e5fd81696', 3, 'Broccoli', 150, 'g', 51, 4.2, 10.0, 0.6);

-- RUN M2 Afternoon (15:30).
update fitness.meal_templates set
  name = '400g skyr + blueberries', kcal = 282, protein_g = 44.4, carbs_g = 23.6, fat_g = 1.0
  where id = 'fd4f5a8c-337a-41b6-8607-561a8e0ef78e';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g) values
  ('fd4f5a8c-337a-41b6-8607-561a8e0ef78e', 1, 'Skyr plain', 400, 'g', 248, 44.0, 15.2, 0.8),
  ('fd4f5a8c-337a-41b6-8607-561a8e0ef78e', 2, 'Blueberries', 60, 'g', 34, 0.4, 8.4, 0.2);

-- RUN M3 Dinner (19:00) -- was "300g protein + 300g sweet potato + veg", 750/64/67/25.
update fitness.meal_templates set
  name = '250g 5% beef mince + 200g sweet potato + green veg (or swap the protein)', kcal = 551, protein_g = 60.2, carbs_g = 51.4, fat_g = 13.3
  where id = '7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4';
insert into fitness.meal_foods (meal_template_id, order_num, name, quantity, unit, kcal, protein_g, carbs_g, fat_g, is_swap_option) values
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 1, '5% beef mince', 250, 'g', 320, 52.0, 0, 12.5, false),
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 2, 'Sweet potato', 200, 'g', 180, 4.0, 41.4, 0.2, false),
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 3, 'Green veg', 150, 'g', 51, 4.2, 10.0, 0.6, false),
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 4, 'Salmon', 250, 'g', 460, 51.0, 0, 28.8, true),
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 5, 'Chicken breast', 250, 'g', 263, 55.0, 0, 3.3, true),
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 6, 'Chicken thigh', 250, 'g', 305, 48.0, 0, 13.0, true),
  ('7ead235b-ab4b-4f8b-882f-e7dfd0ea5ae4', 7, 'Eggs (add-on)', 2, 'whole', 136, 12.8, 0.6, 9.4, true);
