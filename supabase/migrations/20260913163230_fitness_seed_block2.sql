-- Seed data for Block 2 -- Continued Cut (Mon 14 Sep 2026 - Sun 8 Nov 2026).
-- See fitness/CLAUDE.md for the source brief and every PLACEHOLDER noted below.
do $$
declare
  v_block_id uuid;
  v_mon_upper uuid;
  v_wed_lower uuid;
  v_fri_upper uuid;
  v_sun_rest uuid;
  i int;
begin
  insert into fitness.blocks (name, start_date, end_date, goal, notes)
  values (
    'Block 2 — Continued Cut',
    '2026-09-14', '2026-11-08',
    'Continued fat loss, ending with a properly-trained 10K on Remembrance Sunday, 8 Nov 2026, 11:10am start.',
    '8 weeks. Week 1 = Mon 14 Sep - Sun 20 Sep. Week 8 = Mon 2 Nov - Sun 8 Nov, finishing with the race on the Sunday.'
  ) returning id into v_block_id;

  for i in 0..7 loop
    insert into fitness.block_weeks (block_id, week_number, start_date, end_date, focus, notes)
    values (
      v_block_id, i + 1,
      (date '2026-09-14' + (i * 7)),
      (date '2026-09-14' + (i * 7) + 6),
      case
        when i + 1 = 4 then 'Down week'
        when i + 1 = 8 then 'Race week — 10K on the Sunday, 11:10am start'
        else null
      end,
      null
    );
  end loop;

  -- Nutrition targets -- PLACEHOLDER, carried over from the Naples block.
  -- TODO: update once Chris has weighed in; see the SQL template at the
  -- bottom of fitness/CLAUDE.md for how to do this per week/day_type.
  for i in 1..8 loop
    insert into fitness.week_targets (block_id, week_number, day_type, kcal_target, protein_floor_g) values
      (v_block_id, i, 'lift', 2080, 200),
      (v_block_id, i, 'run', 1750, 175),
      (v_block_id, i, 'rest', 1750, 175);
  end loop;

  -- Meal templates. week_number left null throughout -- identical every
  -- week for this block. Meal 5's note on lift/run days covers the
  -- "add 2 eggs" swap rule from the brief.
  insert into fitness.meal_templates (block_id, day_type, slot_order, time_label, name, kcal, protein_g, notes) values
    (v_block_id, 'lift', 1, '05:30', 'Black coffee + ABE + CarbX + creatine + electrolytes', 100, 0, null),
    (v_block_id, 'lift', 2, '07:30', '6 eggs + 2 bananas', 590, 41, null),
    (v_block_id, 'lift', 3, '12:30', '250g 5% beef mince + 200g white rice + broccoli', 530, 52, null),
    (v_block_id, 'lift', 4, '15:30', '400g skyr + blueberries', 280, 44, null),
    (v_block_id, 'lift', 5, '19:00', '250g protein source + 200g sweet potato + veg', 520, 52,
      'Add 2 eggs when the protein source is chicken breast, chicken thigh or salmon.'),

    (v_block_id, 'run', 1, '05:30', 'Black coffee + CarbX + creatine + electrolytes', 100, 0, null),
    (v_block_id, 'run', 2, '07:00', '1 scoop Bulk Pure Whey + 2 bananas', 320, 25, null),
    (v_block_id, 'run', 3, '12:30', '250g 5% beef mince + 200g white rice + broccoli', 530, 52, null),
    (v_block_id, 'run', 4, '15:30', '400g skyr + blueberries', 280, 44, null),
    (v_block_id, 'run', 5, '19:00', '250g protein source + 200g sweet potato + veg', 520, 52,
      'Add 2 eggs when the protein source is chicken breast, chicken thigh or salmon.'),

    (v_block_id, 'rest', 1, '07:00', 'Black coffee + creatine + electrolytes', 5, 0, null),
    (v_block_id, 'rest', 2, '08:00', '4 eggs + 1 banana', 390, 27, null),
    (v_block_id, 'rest', 3, '12:30', '250g 5% beef mince + 200g white rice + broccoli', 530, 52, null),
    (v_block_id, 'rest', 4, '15:30', '400g skyr + blueberries', 280, 44, null),
    (v_block_id, 'rest', 5, '19:00', '250g protein source + 200g sweet potato + veg', 520, 52, null);

  -- Training split. day_of_week: 1=Mon .. 7=Sun. Training starts on the gym
  -- floor at 06:00 on lift days.
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 1, 'upper', 'Upper lift', 'On the gym floor at 06:00.')
    returning id into v_mon_upper;
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 2, 'run', 'Run — easy', 'Distance and effort follow this week''s progression below.');
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 3, 'lower', 'Lower lift (maintenance focus)', 'On the gym floor at 06:00. Hold strength here, don''t chase PRs this block.')
    returning id into v_wed_lower;
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 4, 'run', 'Run', 'Distance and effort follow this week''s progression below.');
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 5, 'upper', 'Upper lift', 'On the gym floor at 06:00.')
    returning id into v_fri_upper;
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 6, 'run', 'Run — long', 'Distance and effort follow this week''s progression below.');
  insert into fitness.session_templates (block_id, day_of_week, session_type, title, summary) values
    (v_block_id, 7, 'rest', 'Rest or easy hike', 'Full rest, or an easy hike if you feel like moving.')
    returning id into v_sun_rest;

  -- Week 8's Sunday overrides the standing rest day: race day.
  insert into fitness.session_templates (block_id, day_of_week, week_number, session_type, title, summary) values
    (v_block_id, 7, 8, 'run', '10K Race — Remembrance Sunday', '11:10am start.');

  insert into fitness.session_exercises (session_template_id, order_num, name, prescription) values
    (v_mon_upper, 1, 'DB Bench', '50kg × 4–8'),
    (v_mon_upper, 2, 'BB Row', '120kg × 4'),
    (v_mon_upper, 3, 'Pull-ups', '8–10'),
    (v_mon_upper, 4, 'Ab wheel rollouts', '3 sets'),
    (v_fri_upper, 1, 'DB Bench', '50kg × 4–8'),
    (v_fri_upper, 2, 'BB Row', '120kg × 4'),
    (v_fri_upper, 3, 'Pull-ups', '8–10'),
    (v_fri_upper, 4, 'Ab wheel rollouts', '3 sets'),
    (v_wed_lower, 1, 'RDL', '140kg × 6'),
    (v_wed_lower, 2, 'Walking lunges', '30kg × 10 each side'),
    (v_wed_lower, 3, 'Ab wheel rollouts', '3 sets');

  -- 10K progression. day_of_week 2=Tue, 4=Thu, 6=Sat, plus the week 8 race
  -- on day_of_week 7 (Sun).
  insert into fitness.run_plan (block_id, week_number, day_of_week, distance_km, effort, detail) values
    (v_block_id, 1, 2, 5, 'easy', null),
    (v_block_id, 1, 4, 5, 'easy', null),
    (v_block_id, 1, 6, 8, 'easy', null),

    (v_block_id, 2, 2, 5, 'easy', null),
    (v_block_id, 2, 4, 5, 'easy', null),
    (v_block_id, 2, 6, 9, 'easy', null),

    (v_block_id, 3, 2, 5, 'easy', null),
    (v_block_id, 3, 4, 6, 'intervals', '3 × 1 km at 10K pace, 2 min jog recovery'),
    (v_block_id, 3, 6, 10, 'easy', null),

    (v_block_id, 4, 2, 5, 'easy', null),
    (v_block_id, 4, 4, 5, 'easy', null),
    (v_block_id, 4, 6, 8, 'easy', 'Down week — keep this one easy.'),

    (v_block_id, 5, 2, 5, 'easy', null),
    (v_block_id, 5, 4, 6, 'intervals', '4 × 1 km at 10K pace, 2 min jog recovery'),
    (v_block_id, 5, 6, 11, 'easy', null),

    (v_block_id, 6, 2, 5, 'easy', null),
    (v_block_id, 6, 4, 7, 'intervals', '5 × 1 km at 10K pace, 2 min jog recovery'),
    (v_block_id, 6, 6, 12, 'easy', null),

    (v_block_id, 7, 2, 5, 'easy', null),
    (v_block_id, 7, 4, 6, 'intervals', '3 × 1 km at 10K pace, 2 min jog recovery'),
    (v_block_id, 7, 6, 10, 'easy', null),

    (v_block_id, 8, 2, 4, 'easy', null),
    (v_block_id, 8, 4, 4, 'strides', '4 km easy with 4 × 100m strides'),
    (v_block_id, 8, 6, 3, 'shakeout', 'Shakeout run — keep it easy, legs fresh for Sunday.'),
    (v_block_id, 8, 7, 10, 'race', '10K race, 11:10am start — Remembrance Sunday.');

  insert into fitness.rules (order_num, title, detail) values
    (1, 'Office rule', 'Nothing enters my mouth at work that I didn''t bring from home.'),
    (2, 'Coffee rule', 'A flat white is fine. The pastry stays in the cabinet.'),
    (3, 'Ice cream rule', 'Friday and Saturday only. One item, not both.'),
    (4, 'Rice and potato rule', '200g cooked. Not 300g.'),
    (5, 'Weekend rule', 'One off-meal, not an off-day. Back on plan by the next meal.'),
    (6, 'Weigh daily', 'First thing, post-toilet, pre-food. Morning reads only — post-exercise and post-sauna weights are noise.');
end $$;
