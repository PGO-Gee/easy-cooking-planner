-- Draft inverse of sync-state-units.sql. $1 is the merged unit object, $2 is
-- an array of the three input states (needed to retain empty planning weeks).
-- The locally scoped noteHidden preference remains the caller's responsibility.
with units as (
  select value as unit, value ->> 'kind' as kind, value -> 'key' as key, value -> 'value' as value
  from jsonb_each(coalesce($1::jsonb, '{}'::jsonb))
), weeks as (
  select key ->> 0 as week from units where kind = 'plan-day'
  union
  select week.key from jsonb_array_elements(coalesce($2::jsonb, '[]'::jsonb)) state(value),
    jsonb_object_keys(coalesce(state.value -> 'plans', '{}'::jsonb)) week(key)
), day_values as (
  select weeks.week, day,
    coalesce((select value -> 'meals' from units where kind = 'plan-day' and key ->> 0 = weeks.week and (key ->> 1)::integer = day), '[]'::jsonb) as meals,
    coalesce((select value -> 'pins' from units where kind = 'plan-day' and key ->> 0 = weeks.week and (key ->> 1)::integer = day), '[]'::jsonb) as pins
  from weeks cross join generate_series(0, 6) day
), week_plans as (
  select week, jsonb_agg(meals order by day) as meals, jsonb_agg(pins order by day) as pins
  from day_values group by week
), checks_by_week as (
  select key ->> 0 as week, jsonb_object_agg(key ->> 1, 'true'::jsonb) as items
  from units where kind = 'shopping-check' group by key ->> 0
), hidden_by_week as (
  select key ->> 0 as week, jsonb_agg(key ->> 1 order by key ->> 1) as items
  from units where kind = 'hidden-item' group by key ->> 0
), manual_by_week as (
  select key ->> 0 as week, jsonb_agg(value order by key ->> 1) as items
  from units where kind = 'manual-item' group by key ->> 0
)
select jsonb_build_object(
  'dishes', coalesce((select jsonb_agg(value order by key::text) from units where kind = 'dish'), '[]'::jsonb),
  'plans', coalesce((select jsonb_object_agg(week, meals) from week_plans), '{}'::jsonb),
  'pinnedMeals', coalesce((select jsonb_object_agg(week, pins) from week_plans), '{}'::jsonb),
  'pantryIngredients', coalesce((select jsonb_object_agg(key ->> 0, value) from units where kind = 'pantry'), '{}'::jsonb),
  'restDays', coalesce((select jsonb_object_agg(key ->> 0, value) from units where kind = 'rest-days'), '{}'::jsonb),
  'shoppingQuantities', coalesce((select jsonb_object_agg(key ->> 0, value) from units where kind = 'quantity'), '{}'::jsonb),
  'shoppingChecks', coalesce((select jsonb_object_agg(week, items) from checks_by_week), '{}'::jsonb),
  'hiddenShoppingItems', coalesce((select jsonb_object_agg(week, items) from hidden_by_week), '{}'::jsonb),
  'manualShoppingItems', coalesce((select jsonb_object_agg(week, items) from manual_by_week), '{}'::jsonb)
) as result;
