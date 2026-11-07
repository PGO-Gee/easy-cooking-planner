-- Run as the database test role in a rolled-back transaction. Provide an
-- authenticated member's subject, household id and catalog id through the
-- wochentisch.test_user, wochentisch.test_household and
-- wochentisch.test_catalog_dish settings.
begin;
select set_config('request.jwt.claim.sub', current_setting('wochentisch.test_user'), true);
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  catalog_id uuid := current_setting('wochentisch.test_catalog_dish')::uuid;
  dish_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  empty_state jsonb := '{"dishes":[],"plans":{}}'::jsonb;
  local_state jsonb;
  response jsonb;
  replay jsonb;
  legacy_base jsonb;
  legacy_local jsonb;
  legacy_dish_position integer;
begin
  local_state := jsonb_build_object(
    'dishes', jsonb_build_array(jsonb_build_object(
      'id',dish_id,'name','Rezept-Sync-Test','ingredient','','type','baking','time',30,'emoji','🍲',
      'ingredients',jsonb_build_array('Linsen'),'nutrition',null,
      'recipe',jsonb_build_object('servings',2,'ingredients',jsonb_build_array(
        jsonb_build_object('name','Linsen','amount',100,'unit','g','note','')
      ),'steps',jsonb_build_array('In Wasser garen.')),
      'catalogSourceId',catalog_id::text,'catalogSourceVersion',1
    )), 'plans','{}'::jsonb
  );
  response := public.sync_household_v2(household,request_id,empty_state,local_state);
  replay := public.sync_household_v2(household,request_id,empty_state,local_state);
  if replay <> response then raise exception 'v2 retry returned a different response'; end if;
  if not exists(
    select 1 from jsonb_array_elements(response -> 'state' -> 'dishes') as result_dish(value)
    where result_dish.value ->> 'id' = dish_id::text
      and result_dish.value ->> 'type' = 'baking'
      and result_dish.value -> 'recipe' = local_state -> 'dishes' -> 0 -> 'recipe'
      and result_dish.value ->> 'catalogSourceId' = catalog_id::text
      and result_dish.value ->> 'catalogSourceVersion' = '1'
  ) then
    raise exception 'v2 sync did not retain the recipe and catalog origin: %', response;
  end if;

  legacy_base := wochentisch_sync.cloud_state(household);
  select (dish.ordinality - 1)::integer into legacy_dish_position
  from jsonb_array_elements(legacy_base -> 'dishes') with ordinality as dish(value, ordinality)
  where dish.value ->> 'id' = dish_id::text;
  if legacy_dish_position is null then raise exception 'v1 cloud state omitted the v2 test dish'; end if;
  legacy_local := jsonb_set(legacy_base,array['dishes',legacy_dish_position::text,'name'],to_jsonb('Legacy v1 bearbeitet'::text));
  perform public.sync_household_v1(household,gen_random_uuid(),legacy_base,legacy_local);
  select recipe into local_state from public.dishes where id=dish_id;
  if (select recipe_type from public.dishes where id=dish_id) <> 'baking' then
    raise exception 'v1 writer removed recipe type';
  end if;
  if local_state -> 'servings' <> '2'::jsonb or local_state -> 'ingredients' -> 0 ->> 'name' <> 'Linsen' then
    raise exception 'v1 writer removed recipe fields: %', local_state;
  end if;
end;
$test$;
rollback;
