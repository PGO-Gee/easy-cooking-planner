-- Add a constrained insert path for new central standard recipes.
create or replace function wochentisch_private.create_catalog_dish_v1(p_changes jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  created_dish public.catalog_dishes%rowtype;
  existing_dish public.catalog_dishes%rowtype;
  v_normalized_name text;
  next_ingredients jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not wochentisch_private.catalog_edit_allowed() then raise exception 'catalog editing disabled or not permitted' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or
    p_changes - array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe'] <> '{}'::jsonb or
    not (p_changes ?& array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe']) then
    raise exception 'invalid catalog creation payload' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes -> 'name') <> 'string' or length(btrim(p_changes ->> 'name')) not between 1 and 80 or
    jsonb_typeof(p_changes -> 'ingredient') <> 'string' or length(p_changes ->> 'ingredient') > 80 or
    jsonb_typeof(p_changes -> 'emoji') <> 'string' or length(p_changes ->> 'emoji') > 16 or
    jsonb_typeof(p_changes -> 'cooking_time_minutes') <> 'number' or
    (p_changes ->> 'cooking_time_minutes')::numeric not between 0 and 360 or
    trunc((p_changes ->> 'cooking_time_minutes')::numeric) <> (p_changes ->> 'cooking_time_minutes')::numeric or
    jsonb_typeof(p_changes -> 'ingredients') is distinct from 'array' or
    jsonb_typeof(p_changes -> 'recipe') is distinct from 'object' or
    not wochentisch_private.valid_recipe(p_changes -> 'recipe') or
    jsonb_typeof(p_changes -> 'recipe' -> 'servings') is distinct from 'number' or
    jsonb_typeof(p_changes -> 'recipe' -> 'ingredients') is distinct from 'array' or
    jsonb_typeof(p_changes -> 'recipe' -> 'steps') is distinct from 'array' then
    raise exception 'invalid catalog creation fields' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes -> 'recipe' -> 'ingredients') = 0 or jsonb_array_length(p_changes -> 'recipe' -> 'steps') = 0 then
    raise exception 'a catalog recipe requires ingredients and preparation steps' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_changes -> 'ingredients') as ingredient_value(value)
    where jsonb_typeof(ingredient_value.value) <> 'string' or length(btrim(ingredient_value.value #>> '{}')) not between 1 and 100) then
    raise exception 'invalid catalog ingredients' using errcode = '22023';
  end if;
  if p_changes -> 'nutrition' <> 'null'::jsonb and jsonb_typeof(p_changes -> 'nutrition') <> 'object' then
    raise exception 'invalid catalog nutrition' using errcode = '22023';
  end if;
  if jsonb_typeof(p_changes -> 'nutrition') = 'object' and exists(
    select 1 from jsonb_each(p_changes -> 'nutrition') n
    where n.key not in ('kcal','protein','fat','carbs') or jsonb_typeof(n.value) <> 'number' or (n.value #>> '{}')::numeric < 0
  ) then raise exception 'invalid nutrition values' using errcode = '22023'; end if;

  v_normalized_name := lower(regexp_replace(btrim(p_changes ->> 'name'), '[^[:alnum:]]+', '', 'g'));
  if v_normalized_name = '' then raise exception 'catalog name must contain letters or numbers' using errcode = '22023'; end if;
  select * into existing_dish from public.catalog_dishes where public.catalog_dishes.normalized_name = v_normalized_name;
  if found then return jsonb_build_object('status','duplicate','existing',to_jsonb(existing_dish)); end if;

  -- Retain the shared ingredient alias projection and first-seen spelling.
  select coalesce(jsonb_agg(to_jsonb(name) order by first_position), '[]'::jsonb) into next_ingredients
  from (
    select (array_agg(btrim(entry.value #>> '{}') order by entry.ordinality))[1] as name,
      min(entry.ordinality) as first_position
    from jsonb_array_elements(p_changes -> 'ingredients') with ordinality entry(value, ordinality)
    group by lower(btrim(entry.value #>> '{}'))
  ) projected;

  begin
    insert into public.catalog_dishes(name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition, recipe)
    values (
      btrim(p_changes ->> 'name'), btrim(p_changes ->> 'ingredient'),
      (p_changes ->> 'cooking_time_minutes')::smallint, p_changes ->> 'emoji', next_ingredients,
      nullif(p_changes -> 'nutrition', 'null'::jsonb), p_changes -> 'recipe'
    ) returning * into created_dish;
  exception when unique_violation then
    select * into existing_dish from public.catalog_dishes where public.catalog_dishes.normalized_name = v_normalized_name;
    if found then return jsonb_build_object('status','duplicate','existing',to_jsonb(existing_dish)); end if;
    raise;
  end;
  return jsonb_build_object('status','created','dish',to_jsonb(created_dish));
end;
$function$;
revoke all on function wochentisch_private.create_catalog_dish_v1(jsonb) from public, anon, authenticated;

create or replace function public.create_catalog_dish_v1(p_changes jsonb)
returns jsonb language sql security definer set search_path = ''
as $function$ select wochentisch_private.create_catalog_dish_v1(p_changes); $function$;
revoke all on function public.create_catalog_dish_v1(jsonb) from public, anon, authenticated;
grant execute on function public.create_catalog_dish_v1(jsonb) to authenticated;
