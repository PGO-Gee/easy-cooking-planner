-- Read-only validation of a candidate merged state ($1::jsonb). A merge can
-- independently accept a dish deletion and a concurrent plan edit; never
-- apply it by cascading that deletion. The caller must retain those values as
-- a conflict before attempting relational writes.
with state as (select $1::jsonb as value), planned as (
  select week.key as week, day.ordinality - 1 as day, meal.ordinality - 1 as position, meal.value as dish_id
  from state, jsonb_each(coalesce(state.value -> 'plans', '{}'::jsonb)) week,
    jsonb_array_elements(week.value) with ordinality day(value, ordinality),
    jsonb_array_elements_text(day.value) with ordinality meal(value, ordinality)
), dishes as (
  select dish ->> 'id' as id
  from state, jsonb_array_elements(coalesce(state.value -> 'dishes', '[]'::jsonb)) dish
)
select coalesce(jsonb_agg(jsonb_build_object(
  'week', planned.week, 'day', planned.day, 'position', planned.position, 'dishId', planned.dish_id
) order by planned.week, planned.day, planned.position), '[]'::jsonb) as dangling_meals
from planned left join dishes on dishes.id = planned.dish_id
where dishes.id is null;
