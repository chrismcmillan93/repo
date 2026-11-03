-- get_day_bundle(): honour day swaps. If the signed-in user swapped this date
-- with another (fitness.day_swaps: log_date <- source_date), the planned session
-- shown is the one belonging to source_date. Picks still win over everything.
-- plan.swapped_from carries the source date (null when not swapped).

create or replace function fitness.get_day_bundle(p_date date)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_block fitness.blocks%rowtype;
  v_week fitness.block_weeks%rowtype;
  v_target fitness.week_targets%rowtype;
  v_log fitness.daily_logs%rowtype;
  v_plan fitness.training_plans%rowtype;
  v_pweek fitness.plan_weeks%rowtype;
  v_pday fitness.plan_days%rowtype;
  v_dow int;
  v_day_type text;
  v_has_week_override boolean := false;
  v_has_lift boolean := false;
  v_has_run boolean := false;
  v_has_rest boolean := false;
  v_sessions jsonb := '[]'::jsonb;
  v_meals jsonb;
  v_rules jsonb;
  v_checks jsonb;
  v_pick_w boolean;
  v_pick_c boolean;
  v_in_plan boolean := false;
  v_src date;
  v_stype text;
  v_summary text;
  v_mode_desc text;
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

    select coalesce(bool_or(s.session_type in ('upper', 'lower')), false),
           coalesce(bool_or(s.session_type = 'run'), false),
           coalesce(bool_or(s.session_type = 'rest'), false)
      into v_has_lift, v_has_run, v_has_rest
    from fitness.session_templates s
    where s.block_id = v_block.id and s.day_of_week = v_dow
      and (
        (v_has_week_override and s.week_number = v_week.week_number)
        or (not v_has_week_override and s.week_number is null)
      );
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

  -- The v2 training plan, if this date falls inside it.
  select * into v_plan from fitness.training_plans where plan_version = 'v2';
  if v_plan.plan_version is not null and p_date between v_plan.start_date and v_plan.end_date then
    v_in_plan := true;
    select source_date into v_src from fitness.day_swaps
      where user_id = auth.uid() and log_date = p_date;
    select * into v_pday from fitness.plan_days
      where plan_version = v_plan.plan_version and date = coalesce(v_src, p_date)
      order by session limit 1;
    select * into v_pweek from fitness.plan_weeks
      where plan_version = v_plan.plan_version and p_date between start_date and end_date
      limit 1;
  end if;

  v_pick_w := coalesce((v_checks ->> 'pick:weights')::boolean, false);
  v_pick_c := coalesce((v_checks ->> 'pick:cardio')::boolean, false);

  if v_pick_w or v_pick_c then
    -- The user chose what to do today: picks replace the planned session.
    if v_pick_w then
      v_sessions := v_sessions || jsonb_build_array(jsonb_build_object(
        'session_type', 'lift', 'source', 'pick', 'title', 'Weights session',
        'summary', 'Picked: weights', 'exercises', '[]'::jsonb, 'run', null));
    end if;
    if v_pick_c then
      v_sessions := v_sessions || jsonb_build_array(jsonb_build_object(
        'session_type', 'run', 'source', 'pick', 'title', 'Cardio session',
        'summary', 'Picked: cardio', 'exercises', '[]'::jsonb, 'run', null));
    end if;
  elsif v_pday.id is not null then
    v_stype := case v_pday.type when 'lift' then 'lift' when 'rest' then 'rest' else 'run' end;
    select description into v_mode_desc from fitness.lift_modes
      where plan_version = v_pday.plan_version and mode = v_pday.mode;
    v_summary := concat_ws(' · ',
      case when v_pday.type = 'lift' and v_pday.mode is not null then 'Mode: ' || v_pday.mode end,
      v_pday.finisher,
      case when v_pday.time_cap_min is not null then 'Time cap ' || v_pday.time_cap_min || ' min' end,
      case when v_pday.optional then 'Optional' end);
    v_sessions := jsonb_build_array(jsonb_build_object(
      'id', v_pday.id,
      'session_type', v_stype,
      'source', 'plan',
      'title', v_pday.session,
      'summary', v_summary,
      'exercises', '[]'::jsonb,
      'run', case when v_stype = 'run' and v_pday.distance_km is not null then jsonb_build_object(
          'distance_km', v_pday.distance_km, 'distance_miles', v_pday.distance_miles,
          'effort', v_pday.effort, 'detail', null, 'time_cap_min', v_pday.time_cap_min) end,
      'plan_day', jsonb_build_object(
          'day_id', v_pday.day_id, 'type', v_pday.type, 'kind', v_pday.kind, 'mode', v_pday.mode,
          'mode_description', v_mode_desc, 'effort', v_pday.effort,
          'distance_miles', v_pday.distance_miles, 'distance_km', v_pday.distance_km,
          'time_cap_min', v_pday.time_cap_min, 'finisher', v_pday.finisher,
          'venue_hint', v_pday.venue_hint, 'optional', v_pday.optional,
          'load_label', v_pday.load_label, 'legacy_session', v_pday.legacy_session,
          'source_date', v_pday.date)));
  end if;

  return jsonb_build_object(
    'date', p_date,
    'day_of_week', v_dow,
    'block', case
      when v_block.id is not null then jsonb_build_object(
        'id', v_block.id, 'name', v_block.name, 'start_date', v_block.start_date,
        'end_date', v_block.end_date, 'goal', v_block.goal, 'notes', v_block.notes)
      when v_in_plan then jsonb_build_object(
        'id', null, 'name', v_plan.name, 'start_date', v_plan.start_date,
        'end_date', v_plan.end_date, 'goal', null, 'notes', null)
      end,
    'week', case when v_week.id is not null then jsonb_build_object(
        'id', v_week.id, 'week_number', v_week.week_number, 'start_date', v_week.start_date,
        'end_date', v_week.end_date, 'focus', v_week.focus, 'notes', v_week.notes
      ) end,
    'plan', case when v_in_plan then jsonb_build_object(
        'plan_version', v_plan.plan_version, 'name', v_plan.name,
        'start_date', v_plan.start_date, 'end_date', v_plan.end_date,
        'has_day', v_pday.id is not null,
        'swapped_from', v_src,
        'week', case when v_pweek.id is not null then jsonb_build_object(
            'week_number', v_pweek.week_number,
            'total_weeks', (select count(*) from fitness.plan_weeks where plan_version = v_plan.plan_version),
            'start_date', v_pweek.start_date, 'end_date', v_pweek.end_date,
            'phase', v_pweek.phase, 'load', v_pweek.load, 'notes', v_pweek.notes,
            'weight_target_kg_monday', v_pweek.weight_target_kg_monday,
            'run_miles', v_pweek.run_miles, 'run_km', v_pweek.run_km) end
      ) end,
    'picks', jsonb_build_object('weights', v_pick_w, 'cardio', v_pick_c),
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
$function$;
