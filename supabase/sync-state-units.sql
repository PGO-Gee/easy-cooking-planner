-- Draft read-only conversion of a normalized app state ($1::jsonb) into
-- independently mergeable units. This query is not a database migration.
with state as (select $1::jsonb as value),
units as (
  select 'dish'::text as kind, jsonb_build_array(dish ->> 'id') as key,
    'Gericht: ' || coalesce(dish ->> 'name', '') as label, dish as value
  from state, jsonb_array_elements(coalesce(state.value -> 'dishes', '[]'::jsonb)) dish
  union all
  select 'plan-day', jsonb_build_array(week.key, day.ordinality - 1),
    'Wochenplan ' || week.key || ', Tag ' || day.ordinality,
    jsonb_build_object('meals', day.value, 'pins', (
      select jsonb_agg(coalesce(state.value -> 'pinnedMeals' -> week.key -> ((day.ordinality - 1)::integer) -> position, 'false'::jsonb) order by position)
      from generate_series(0, jsonb_array_length(day.value) - 1) position
    ))
  from state, jsonb_each(coalesce(state.value -> 'plans', '{}'::jsonb)) week,
    jsonb_array_elements(week.value) with ordinality day(value, ordinality)
  where jsonb_array_length(day.value) > 0
  union all
  select 'pantry', jsonb_build_array(week.key), 'Vorrat: ' || week.key, week.value
  from state, jsonb_each(coalesce(state.value -> 'pantryIngredients', '{}'::jsonb)) week
  union all
  select 'rest-days', jsonb_build_array(week.key), 'Resteabend: ' || week.key, week.value
  from state, jsonb_each(coalesce(state.value -> 'restDays', '{}'::jsonb)) week
  union all
  select 'quantity', jsonb_build_array(item.key), 'Menge: ' || item.key, item.value
  from state, jsonb_each(coalesce(state.value -> 'shoppingQuantities', '{}'::jsonb)) item
  union all
  select 'shopping-check', jsonb_build_array(week.key, item.key), 'Einkaufsstatus: ' || item.key, 'true'::jsonb
  from state, jsonb_each(coalesce(state.value -> 'shoppingChecks', '{}'::jsonb)) week,
    jsonb_each(week.value) item
  where item.value = 'true'::jsonb
  union all
  select 'hidden-item', jsonb_build_array(week.key, item.value), 'Ausgeblendeter Eintrag: ' || item.value, 'true'::jsonb
  from state, jsonb_each(coalesce(state.value -> 'hiddenShoppingItems', '{}'::jsonb)) week,
    jsonb_array_elements_text(week.value) item(value)
  union all
  select 'manual-item', jsonb_build_array(week.key, lower(item.value)), 'Einkaufsartikel: ' || item.value,
    to_jsonb(item.value)
  from state, jsonb_each(coalesce(state.value -> 'manualShoppingItems', '{}'::jsonb)) week,
    jsonb_array_elements_text(week.value) item(value)
)
select coalesce(jsonb_object_agg(
  kind || ':' || key::text,
  jsonb_build_object('kind', kind, 'key', key, 'label', label, 'value', value)
), '{}'::jsonb) as result
from units;
