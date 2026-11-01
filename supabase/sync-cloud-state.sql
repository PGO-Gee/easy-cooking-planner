-- Draft read-only snapshot of the existing relational household tables.
-- $1 is a household UUID. A privileged caller MUST check membership and hold
-- the household lock before using this query as part of a write transaction.
with plans as (
  select * from public.weekly_plans where household_id = $1::uuid
), day_values as (
  select p.week_start::text as week, d.day,
    coalesce((select jsonb_agg(m.dish_id::text order by m.position)
      from public.planned_meals m where m.weekly_plan_id = p.id and m.day_of_week = d.day), '[]'::jsonb) as meals,
    coalesce((select jsonb_agg(m.is_pinned order by m.position)
      from public.planned_meals m where m.weekly_plan_id = p.id and m.day_of_week = d.day), '[]'::jsonb) as pins
  from plans p cross join generate_series(0, 6) d(day)
), week_plans as (
  select week, jsonb_agg(meals order by day) as meals, jsonb_agg(pins order by day) as pins
  from day_values group by week
), checks_by_week as (
  select p.week_start::text as week, jsonb_object_agg(c.item_key, 'true'::jsonb) as items
  from plans p join public.shopping_item_checks c on c.weekly_plan_id = p.id group by p.week_start
), manual_by_week as (
  select p.week_start::text as week, jsonb_agg(i.name order by i.normalized_name) as items
  from plans p join public.shopping_items i on i.weekly_plan_id = p.id group by p.week_start
), quantities as (
  -- The legacy app applies week rows in ascending order: later weeks win.
  select distinct on (entry.key) entry.key, entry.value
  from plans p cross join lateral jsonb_each(coalesce(p.shopping_quantities, '{}'::jsonb)) entry
  order by entry.key, p.week_start desc
)
select jsonb_build_object(
  'dishes', coalesce((select jsonb_agg(jsonb_build_object(
    'id', d.id::text, 'name', d.name, 'ingredient', d.ingredient,
    'time', d.cooking_time_minutes, 'emoji', d.emoji,
    'ingredients', d.ingredients, 'nutrition', d.nutrition
  ) order by d.created_at, d.id) from public.dishes d where d.household_id = $1::uuid), '[]'::jsonb),
  'plans', coalesce((select jsonb_object_agg(week, meals) from week_plans), '{}'::jsonb),
  'pinnedMeals', coalesce((select jsonb_object_agg(week, pins) from week_plans), '{}'::jsonb),
  'pantryIngredients', coalesce((select jsonb_object_agg(week_start::text, pantry_ingredients) from plans), '{}'::jsonb),
  'restDays', coalesce((select jsonb_object_agg(week_start::text, to_jsonb(rest_days)) from plans), '{}'::jsonb),
  'shoppingQuantities', coalesce((select jsonb_object_agg(key, value) from quantities), '{}'::jsonb),
  'shoppingChecks', coalesce((select jsonb_object_agg(week, items) from checks_by_week), '{}'::jsonb),
  'hiddenShoppingItems', coalesce((select jsonb_object_agg(week_start::text, shopping_hidden_items) from plans), '{}'::jsonb),
  'manualShoppingItems', coalesce((select jsonb_object_agg(week, items) from manual_by_week), '{}'::jsonb)
) as result;
