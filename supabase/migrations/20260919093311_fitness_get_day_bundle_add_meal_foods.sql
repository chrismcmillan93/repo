-- Nest each meal's fitness.meal_foods rows (if any) into get_day_bundle()'s
-- meal jsonb as `foods`, so Today's per-meal accordion can list them without
-- a second round trip. meal_templates' own kcal/protein_g/carbs_g/fat_g stay
-- as the meal's combined total (unchanged) -- `foods` is additive detail,
-- empty until real per-food data is entered.
create or replace function fitness.get_day_bundle(p_date date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_block fitness.blocks%rowtype;
  v_week fitness.block_weeks%rowtype;
  v_session fitness.session_templates%rowtype;
  v_target fitness.week_targets%rowtype;
  v_run fitness.run_plan%rowtype;
  v_log fitness.daily_logs%rowtype;
  v_dow int;
  v_day_type text;
  v_exercises jsonb;
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
    -- Week-specific override (e.g. week 8 Sunday = race day) wins over the
    -- block's standing default for that day_of_week.
    select * into v_session from fitness.session_templates
      where block_id = v_block.id and day_of_week = v_dow
        and (week_number = v_week.week_number or week_number is null)
      order by week_number nulls last
      limit 1;
  end if;

  v_day_type := case
    when v_session.session_type in ('upper', 'lower') then 'lift'
    when v_session.session_type = 'run' then 'run'
    when v_session.session_type = 'rest' then 'rest'
    else null
  end;

  if v_week.id is not null and v_day_type is not null then
    select * into v_target from fitness.week_targets
      where block_id = v_block.id and week_number = v_week.week_number and day_type = v_day_type;
  end if;

  if v_session.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', se.id, 'order_num', se.order_num, 'name', se.name,
        'prescription', se.prescription, 'notes', se.notes
      ) order by se.order_num), '[]'::jsonb)
      into v_exercises
      from fitness.session_exercises se
      where se.session_template_id = v_session.id;
  else
    v_exercises := '[]'::jsonb;
  end if;

  if v_day_type = 'run' and v_week.id is not null then
    select * into v_run from fitness.run_plan
      where block_id = v_block.id and week_number = v_week.week_number and day_of_week = v_dow;
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
                  'weight_g', mf.weight_g, 'kcal', mf.kcal, 'protein_g', mf.protein_g,
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

  -- Own rows only, enforced by RLS as this function runs as the caller.
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
    'session', case when v_session.id is not null then jsonb_build_object(
        'id', v_session.id, 'session_type', v_session.session_type,
        'title', v_session.title, 'summary', v_session.summary,
        'exercises', v_exercises
      ) end,
    'run', case when v_run.id is not null then jsonb_build_object(
        'id', v_run.id, 'distance_km', v_run.distance_km, 'effort', v_run.effort, 'detail', v_run.detail
      ) end,
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
