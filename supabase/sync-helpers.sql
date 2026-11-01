-- Draft internal sync helpers. Not a migration and not yet wired to the app.
-- Deploy only as part of the complete, tested sync migration.
create schema if not exists wochentisch_sync;
revoke all on schema wochentisch_sync from public, anon, authenticated;

create or replace function wochentisch_sync.state_units(jsonb)
returns jsonb
language sql immutable
security invoker
set search_path = ''
as $sync_helper$
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
$sync_helper$;
revoke all on function wochentisch_sync.state_units(jsonb) from public, anon, authenticated;

create or replace function wochentisch_sync.merge_units(jsonb, jsonb, jsonb)
returns jsonb
language sql immutable
security invoker
set search_path = ''
as $sync_helper$
-- Draft query for the versioned sync implementation. The three arguments are
-- JSON objects keyed by a stable unit ID. Each unit contains a `value` and a
-- descriptor (`kind`, `key`, `label`). A missing key represents deletion;
-- explicit JSON null is a present value and remains distinct from deletion.
-- This file is a query, not a migration and does not change the database.
with keys as (
  select jsonb_object_keys(coalesce($1::jsonb, '{}'::jsonb)) as id
  union select jsonb_object_keys(coalesce($2::jsonb, '{}'::jsonb))
  union select jsonb_object_keys(coalesce($3::jsonb, '{}'::jsonb))
), values_by_unit as (
  select id,
    $1::jsonb ? id as base_present, $2::jsonb ? id as local_present, $3::jsonb ? id as remote_present,
    $1::jsonb -> id as base_unit, $2::jsonb -> id as local_unit, $3::jsonb -> id as remote_unit
  from keys
), comparable as (
  select *,
    case when coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item' and base_present then 'true'::jsonb else base_unit -> 'value' end as base_value,
    case when coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item' and local_present then 'true'::jsonb else local_unit -> 'value' end as local_value,
    case when coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item' and remote_present then 'true'::jsonb else remote_unit -> 'value' end as remote_value
  from values_by_unit
), decisions as (
  select *,
    (local_present is distinct from base_present or local_value is distinct from base_value) as local_changed,
    (remote_present is distinct from base_present or remote_value is distinct from base_value) as remote_changed,
    (local_present is not distinct from remote_present and local_value is not distinct from remote_value) as equal_changes
  from comparable
), merged as (
  select *,
    local_changed and remote_changed and not equal_changes as conflicted,
    case when not local_changed or (remote_changed and not equal_changes)
      or (local_present and remote_present and coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item')
      then remote_unit else local_unit end as result_unit,
    case when not local_changed or (remote_changed and not equal_changes) then remote_present else local_present end as result_present,
    coalesce(local_unit, remote_unit, base_unit) as descriptor
  from decisions
)
select jsonb_build_object(
  'units', coalesce(jsonb_object_agg(id, result_unit) filter (where result_present), '{}'::jsonb),
  'conflicts', coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'kind', descriptor -> 'kind', 'key', descriptor -> 'key', 'label', descriptor -> 'label',
    'basePresent', base_present, 'localPresent', local_present, 'remotePresent', remote_present,
    'baseValue', base_unit -> 'value', 'localValue', local_unit -> 'value', 'remoteValue', remote_unit -> 'value'
  ) order by id) filter (where conflicted), '[]'::jsonb)
) as result
from merged;
$sync_helper$;
revoke all on function wochentisch_sync.merge_units(jsonb, jsonb, jsonb) from public, anon, authenticated;

create or replace function wochentisch_sync.units_state(jsonb, jsonb)
returns jsonb
language sql immutable
security invoker
set search_path = ''
as $sync_helper$
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
$sync_helper$;
revoke all on function wochentisch_sync.units_state(jsonb, jsonb) from public, anon, authenticated;

create or replace function wochentisch_sync.dangling_meals(jsonb)
returns jsonb
language sql immutable
security invoker
set search_path = ''
as $sync_helper$
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
$sync_helper$;
revoke all on function wochentisch_sync.dangling_meals(jsonb) from public, anon, authenticated;

create or replace function wochentisch_sync.cloud_state(uuid)
returns jsonb
language sql stable
security invoker
set search_path = ''
as $sync_helper$
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
$sync_helper$;
revoke all on function wochentisch_sync.cloud_state(uuid) from public, anon, authenticated;
