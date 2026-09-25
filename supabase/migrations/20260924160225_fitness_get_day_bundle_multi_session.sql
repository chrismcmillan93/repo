-- A day can now have more than one session_templates row (e.g. Monday's AM
-- upper lift + PM intervals, Tuesday/Thursday's AM Muay Thai + PM run).
-- `session` (singular) becomes `sessions` (array), each with its own
-- exercises and (for a run-type row) its own run_plan join.
--
-- Resolution: if ANY week-specific row exists for this (day_of_week,
-- week_number), it and every other week-specific row for that day are the
-- complete truth for the day -- ALL null-week_number defaults for that day
-- are discarded, not just the one matching session_type. This has to be an
-- all-or-nothing switch per day, not per session_type: week 8 Sunday's
-- race (session_type 'run') must still fully replace the standing 'rest'
-- default, a *different* session_type, not stack alongside it. Within
-- whichever set applies, rows of different session_types are independent
-- and both kept (that's the actual "two sessions in a day" case) -- the
-- data itself never has two rows of the *same* session_type for one
-- (day_of_week, week_number), enforced by the unique partial indexes.
--
-- day_type (which meal set / nutrition target applies) still needs exactly
-- one answer even on a two-session day, via a fixed priority: lift beats
-- run beats rest. Monday's AM lift + PM intervals is still a lift day for
-- eating purposes; the run is a bonus, not what the day's food should be
-- planned around. Muay Thai never sets day_type on its own -- every day it
-- appears on already has a lift or run row that does.
create or replace function fitness.get_day_bundle(p_date date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_block fitness.blocks%rowtype;
  v_week fitness.block_weeks%rowtype;
  v_target fitness.week_targets%rowtype;
  v_log fitness.daily_logs%rowtype;
  v_dow int;
  v_day_type text;
  v_has_week_override boolean;
  v_has_lift boolean;
  v_has_run boolean;
  v_has_rest boolean;
  v_sessions jsonb;
  v_meals jsonb;
  v_rules jsonb;
  v_checks jsonb;
begin
  v_dow := extract(isodow from p_date)::int;

  select * into v_block from fitness.blocks
    where p_date between start_date and end_date
    order by start_date desc limit 1;

  if v_block.id is not null then
    select * into v_week from fitness.block_weeks
      where block_id = v_block.id and p_date between start_date and end_date
      limit 1;
  end if;

  if v_week.id is not null then
    select exists(
      select 1 from fitness.session_templates
      where block_id = v_block.id and day_of_week = v_dow and week_number = v_week.week_number
    ) into v_has_week_override;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'session_type', s.session_type, 'title', s.title, 'summary', s.summary,
        'exercises', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', se.id, 'order_num', se.order_num, 'name', se.name,
                'prescription', se.prescription, 'notes', se.notes
              ) order by se.order_num)
            from fitness.session_exercises se
            where se.session_template_id = s.id
          ), '[]'::jsonb),
        'run', case when s.session_type = 'run' then (
            select jsonb_build_object(
                'id', r.id, 'distance_km', r.distance_km, 'effort', r.effort, 'detail', r.detail
              )
            from fitness.run_plan r
            where r.block_id = v_block.id and r.week_number = v_week.week_number and r.day_of_week = v_dow
          ) end
      ) order by (s.session_type = 'muay_thai'), s.session_type), '[]'::jsonb)
      into v_sessions
    from fitness.session_templates s
    where s.block_id = v_block.id and s.day_of_week = v_dow
      and (
        (v_has_week_override and s.week_number = v_week.week_number)
        or (not v_has_week_override and s.week_number is null)
      );

    select exists(
      select 1 from fitness.session_templates
      where block_id = v_block.id and day_of_week = v_dow
        and (
          (v_has_week_override and week_number = v_week.week_number)
          or (not v_has_week_override and week_number is null)
        )
        and session_type in ('upper', 'lower')
    ) into v_has_lift;
    select exists(
      select 1 from fitness.session_templates
      where block_id = v_block.id and day_of_week = v_dow
        and (
          (v_has_week_override and week_number = v_week.week_number)
          or (not v_has_week_override and week_number is null)
        )
        and session_type = 'run'
    ) into v_has_run;
    select exists(
      select 1 from fitness.session_templates
      where block_id = v_block.id and day_of_week = v_dow
        and (
          (v_has_week_override and week_number = v_week.week_number)
          or (not v_has_week_override and week_number is null)
        )
        and session_type = 'rest'
    ) into v_has_rest;
  else
    v_sessions := '[]'::jsonb;
  end if;

  v_day_type := case
    when v_has_lift then 'lift'
    when v_has_run then 'run'
    when v_has_rest then 'rest'
    else null
  end;

  if v_week.id is not null and v_day_type is not null then
    select * into v_target from fitness.week_targets
      where block_id = v_block.id and week_number = v_week.week_number and day_type = v_day_type;
  end if;

  if v_week.id is not null and v_day_type is not null then
    select coalesce(jsonb_agg(x.obj order by x.slot_order), '[]'::jsonb) into v_meals
    from (
      select distinct on (mt.slot_order) mt.slot_order, jsonb_build_object(
          'id', mt.id, 'slot_order', mt.slot_order, 'time_label', mt.time_label,
          'name', mt.name, 'description', mt.description, 'kcal', mt.kcal,
          'protein_g', mt.protein_g, 'carbs_g', mt.carbs_g, 'fat_g', mt.fat_g,
          'notes', mt.notes,
          'foods', coalesce((
              select jsonb_agg(jsonb_build_object(
                  'id', mf.id, 'order_num', mf.order_num, 'name', mf.name,
                  'quantity', mf.quantity, 'unit', mf.unit, 'is_swap_option', mf.is_swap_option,
                  'kcal', mf.kcal, 'protein_g', mf.protein_g,
                  'carbs_g', mf.carbs_g, 'fat_g', mf.fat_g
                ) order by mf.order_num)
              from fitness.meal_foods mf
              where mf.meal_template_id = mt.id
            ), '[]'::jsonb)
        ) as obj
      from fitness.meal_templates mt
      where mt.block_id = v_block.id and mt.day_type = v_day_type
        and (mt.week_number = v_week.week_number or mt.week_number is null)
      order by mt.slot_order, mt.week_number nulls last
    ) x;
  else
    v_meals := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'order_num', order_num, 'title', title, 'detail', detail
    ) order by order_num), '[]'::jsonb)
    into v_rules
    from fitness.rules;

  select * into v_log from fitness.daily_logs
    where user_id = auth.uid() and log_date = p_date;
  select coalesce(jsonb_object_agg(item_id, is_checked), '{}'::jsonb) into v_checks
    from fitness.daily_checks
    where user_id = auth.uid() and log_date = p_date;

  return jsonb_build_object(
    'date', p_date,
    'day_of_week', v_dow,
    'block', case when v_block.id is not null then jsonb_build_object(
        'id', v_block.id, 'name', v_block.name, 'start_date', v_block.start_date,
        'end_date', v_block.end_date, 'goal', v_block.goal, 'notes', v_block.notes
      ) end,
    'week', case when v_week.id is not null then jsonb_build_object(
        'id', v_week.id, 'week_number', v_week.week_number, 'start_date', v_week.start_date,
        'end_date', v_week.end_date, 'focus', v_week.focus, 'notes', v_week.notes
      ) end,
    'day_type', v_day_type,
    'target', case when v_target.id is not null then jsonb_build_object(
        'kcal_target', v_target.kcal_target, 'protein_floor_g', v_target.protein_floor_g
      ) end,
    'sessions', v_sessions,
    'meals', v_meals,
    'rules', v_rules,
    'log', case when v_log.id is not null then jsonb_build_object(
        'id', v_log.id, 'weight_kg', v_log.weight_kg,
        'nutrition_status', v_log.nutrition_status, 'training_status', v_log.training_status,
        'notes', v_log.notes, 'updated_at', v_log.updated_at
      ) end,
    'checks', v_checks
  );
end;
$$;
