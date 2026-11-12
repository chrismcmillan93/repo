-- Nutrition plan (Edale 50km, v4): replaces Block 2's meal plan going forward.
-- Block 2's own rows (blocks, week_targets, meal_templates, meal_foods) are left
-- in place so past days (up to 8 Nov) still show what they showed; the new plan
-- covers 9 Nov 2026 to 19 Sep 2027. Read-only to the app. Quantities are scaled
-- client-side from the weigh-in (see js/nutrition.js), so the plan stores the
-- base meals exactly as written.

create table fitness.nutrition_plans (
  plan_version text primary key,
  title text not null,
  status text,
  start_date date not null,
  end_date date not null,
  height_cm numeric not null,
  age integer not null,
  reference_weight_kg numeric not null,
  maintenance_kcal numeric not null,
  planned_avg_kcal numeric not null,
  planned_deficit_kcal numeric not null,
  protein_floor_g numeric not null,
  protein_aim_g numeric not null,
  week_map jsonb not null,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table fitness.nutrition_day_types (
  plan_version text not null references fitness.nutrition_plans(plan_version) on delete cascade,
  key text not null,
  label text not null,
  applies_to text,
  sort_order integer not null default 0,
  meals jsonb not null,
  totals jsonb not null,
  primary key (plan_version, key)
);

create table fitness.nutrition_phases (
  plan_version text not null references fitness.nutrition_plans(plan_version) on delete cascade,
  from_date date not null,
  to_date date not null,
  deficit_kcal numeric not null,
  label text not null,
  primary key (plan_version, from_date)
);

alter table fitness.nutrition_plans enable row level security;
alter table fitness.nutrition_day_types enable row level security;
alter table fitness.nutrition_phases enable row level security;

create policy "authenticated read" on fitness.nutrition_plans for select to authenticated using (true);
create policy "authenticated read" on fitness.nutrition_day_types for select to authenticated using (true);
create policy "authenticated read" on fitness.nutrition_phases for select to authenticated using (true);

grant select on fitness.nutrition_plans, fitness.nutrition_day_types, fitness.nutrition_phases to authenticated;
