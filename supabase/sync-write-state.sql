-- Draft internal relational writer. Not a migration or a public RPC.
-- The caller must hold the household lock and validate household membership.
-- The entire call must share the request journal's transaction.
create or replace function wochentisch_sync.write_state(p_household_id uuid, p_state jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $function$
declare
  dish jsonb;
  week text;
  plan_id uuid;
  day integer;
  pos integer;
  meals jsonb;
  item text;
  quantities jsonb := coalesce(p_state -> 'shoppingQuantities', '{}'::jsonb);
begin
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state -> 'dishes') <> 'array' then
    raise exception 'invalid household state' using errcode = '22023';
  end if;
  if jsonb_array_length(wochentisch_sync.dangling_meals(p_state)) <> 0 then
    raise exception 'household state contains missing dishes' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_state -> 'dishes') entry
    join public.dishes d on d.id = (entry ->> 'id')::uuid
    where d.household_id <> p_household_id
  ) then raise exception 'dish belongs to another household' using errcode = '42501'; end if;

  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    insert into public.dishes as d (id, household_id, name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition)
    values ((dish ->> 'id')::uuid, p_household_id, dish ->> 'name', coalesce(dish ->> 'ingredient', ''),
      coalesce((dish ->> 'time')::smallint, 30), coalesce(dish ->> 'emoji', '🍽️'),
      coalesce(dish -> 'ingredients', '[]'::jsonb), nullif(dish -> 'nutrition', 'null'::jsonb))
    on conflict (id) do update set name = excluded.name, ingredient = excluded.ingredient,
      cooking_time_minutes = excluded.cooking_time_minutes, emoji = excluded.emoji,
      ingredients = excluded.ingredients, nutrition = excluded.nutrition
    where d.household_id = p_household_id and
      (d.name, d.ingredient, d.cooking_time_minutes, d.emoji, d.ingredients, d.nutrition)
      is distinct from (excluded.name, excluded.ingredient, excluded.cooking_time_minutes, excluded.emoji, excluded.ingredients, excluded.nutrition);
  end loop;

  for week in
    select jsonb_object_keys(coalesce(p_state -> 'plans', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'pantryIngredients', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'restDays', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'shoppingChecks', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'hiddenShoppingItems', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'manualShoppingItems', '{}'::jsonb))
    union select week_start::text from public.weekly_plans where household_id = p_household_id
  loop
    insert into public.weekly_plans (household_id, week_start) values (p_household_id, week::date)
    on conflict (household_id, week_start) do nothing;
    select id into strict plan_id from public.weekly_plans where household_id = p_household_id and week_start = week::date;
    update public.weekly_plans set
      pantry_ingredients = coalesce(p_state -> 'pantryIngredients' -> week, '[]'::jsonb),
      rest_days = array(select value::smallint from jsonb_array_elements_text(coalesce(p_state -> 'restDays' -> week, '[]'::jsonb))),
      shopping_hidden_items = coalesce(p_state -> 'hiddenShoppingItems' -> week, '[]'::jsonb),
      shopping_quantities = quantities
    where id = plan_id and (pantry_ingredients, to_jsonb(rest_days), shopping_hidden_items, shopping_quantities)
      is distinct from (coalesce(p_state -> 'pantryIngredients' -> week, '[]'::jsonb),
        coalesce(p_state -> 'restDays' -> week, '[]'::jsonb),
        coalesce(p_state -> 'hiddenShoppingItems' -> week, '[]'::jsonb), quantities);

    delete from public.planned_meals where weekly_plan_id = plan_id;
    for day in 0..6 loop
      meals := coalesce(p_state -> 'plans' -> week -> day, '[]'::jsonb);
      if jsonb_array_length(meals) > 0 then
        for pos in 0..jsonb_array_length(meals)-1 loop
          insert into public.planned_meals (weekly_plan_id, day_of_week, position, dish_id, is_pinned)
          values (plan_id, day, pos, (meals ->> pos)::uuid,
            coalesce((p_state -> 'pinnedMeals' -> week -> day ->> pos)::boolean, false));
        end loop;
      end if;
    end loop;
    delete from public.shopping_items where weekly_plan_id = plan_id;
    for item in select value from jsonb_array_elements_text(coalesce(p_state -> 'manualShoppingItems' -> week, '[]'::jsonb)) loop
      insert into public.shopping_items (weekly_plan_id, name, normalized_name) values (plan_id, item, lower(item));
    end loop;
    delete from public.shopping_item_checks where weekly_plan_id = plan_id;
    insert into public.shopping_item_checks (weekly_plan_id, item_key)
    select plan_id, key from jsonb_each(coalesce(p_state -> 'shoppingChecks' -> week, '{}'::jsonb)) where value = 'true'::jsonb;
  end loop;

  if quantities <> '{}'::jsonb and not exists (select 1 from public.weekly_plans where household_id = p_household_id) then
    raise exception 'shopping quantities require a planning week' using errcode = '22023';
  end if;
  delete from public.dishes d where d.household_id = p_household_id
    and not exists (select 1 from jsonb_array_elements(p_state -> 'dishes') entry where (entry ->> 'id')::uuid = d.id);
end;
$function$;
revoke all on function wochentisch_sync.write_state(uuid, jsonb) from public, anon, authenticated;
