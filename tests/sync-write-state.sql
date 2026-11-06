-- Run only inside a rolled-back transaction using an isolated test household.
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  dish_id uuid := gen_random_uuid();
  state jsonb;
  actual jsonb;
  unchanged_rows jsonb;
begin
  state := jsonb_build_object(
    'dishes', jsonb_build_array(jsonb_build_object('id',dish_id,'name','Testgericht','ingredient','','time',30,'emoji','🍽️','ingredients','[]'::jsonb,'nutrition',null)),
    'plans', jsonb_build_object('2026-10-26',jsonb_build_array(jsonb_build_array(dish_id),'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb)),
    'pinnedMeals', '{"2026-10-26":[[true],[],[],[],[],[],[]]}'::jsonb,
    'pantryIngredients', '{"2026-10-26":["Ei"]}'::jsonb,
    'restDays', '{"2026-10-26":[1,2]}'::jsonb,
    'shoppingQuantities', '{"ei":2}'::jsonb,
    'shoppingChecks', '{"2026-10-26":{"ei":true}}'::jsonb,
    'manualShoppingItems', '{"2026-10-26":["Milch"]}'::jsonb,
    'hiddenShoppingItems', '{"2026-10-26":["brot"]}'::jsonb
  );
  perform wochentisch_sync.write_state(household, state);
  actual := wochentisch_sync.cloud_state(household);
  if actual <> state then raise exception 'state did not round-trip: %', actual; end if;
  select jsonb_build_array(m.ctid::text, i.ctid::text, c.ctid::text) into strict unchanged_rows
  from public.weekly_plans p
  join public.planned_meals m on m.weekly_plan_id = p.id
  join public.shopping_items i on i.weekly_plan_id = p.id
  join public.shopping_item_checks c on c.weekly_plan_id = p.id
  where p.household_id = household;
  state := jsonb_set(state, '{dishes,0,name}', '"Umbenanntes Testgericht"'::jsonb);
  perform wochentisch_sync.write_state(household, state);
  actual := wochentisch_sync.cloud_state(household);
  if actual <> state then raise exception 'changed dish did not round-trip: %', actual; end if;
  if unchanged_rows is distinct from (
    select jsonb_build_array(m.ctid::text, i.ctid::text, c.ctid::text)
    from public.weekly_plans p
    join public.planned_meals m on m.weekly_plan_id = p.id
    join public.shopping_items i on i.weekly_plan_id = p.id
    join public.shopping_item_checks c on c.weekly_plan_id = p.id
    where p.household_id = household
  ) then raise exception 'an unrelated row was rewritten'; end if;
  begin
    perform wochentisch_sync.write_state(household, jsonb_set(state, '{dishes}', '[]'::jsonb));
    raise exception 'dangling plan was accepted';
  exception when invalid_parameter_value then null;
  end;
  if wochentisch_sync.cloud_state(household) <> state then raise exception 'rejected state modified data'; end if;
end;
$test$;
