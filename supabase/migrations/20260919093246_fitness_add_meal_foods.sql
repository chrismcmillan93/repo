-- Per-food breakdown for a meal_templates row (e.g. "6 eggs" and "2 bananas"
-- as two separate rows instead of one aggregate "6 eggs + 2 bananas" row).
-- meal_templates keeps its own kcal/protein_g/carbs_g/fat_g as the combined
-- total for the meal (still what Plan's meal tables and Today's fuel totals
-- use) -- this table is additive detail for Today's per-meal accordion, not
-- a replacement. Starts empty: real name/weight_g/macro figures per food are
-- Chris's own data entry to do via SQL, same as meal_templates itself.
create table fitness.meal_foods (
  id uuid primary key default gen_random_uuid(),
  meal_template_id uuid not null references fitness.meal_templates(id) on delete cascade,
  order_num int not null,
  name text not null,
  weight_g numeric,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz not null default now()
);

alter table fitness.meal_foods enable row level security;

-- Same shape as every other read-mostly Plan table: any authenticated user
-- can read, no write policy (edited via SQL/dashboard directly).
create policy "authenticated read" on fitness.meal_foods
  for select
  to authenticated
  using (true);

grant select on fitness.meal_foods to authenticated;

create index meal_foods_meal_template_id_idx on fitness.meal_foods (meal_template_id);
