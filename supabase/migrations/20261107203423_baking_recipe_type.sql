-- Recipe types are independent of the main ingredient. Existing entries stay meals.
alter table public.dishes add column recipe_type text not null default 'meal' check (recipe_type in ('meal','baking'));
alter table public.catalog_dishes add column recipe_type text not null default 'meal' check (recipe_type in ('meal','baking'));

create or replace function wochentisch_private.cloud_state_v2(p_household_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select jsonb_set(coalesce(wochentisch_sync.cloud_state(p_household_id), '{}'::jsonb), '{dishes}',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id::text, 'name', d.name, 'ingredient', d.ingredient, 'type', d.recipe_type, 'time', d.cooking_time_minutes,
      'emoji', d.emoji, 'ingredients', d.ingredients, 'nutrition', d.nutrition, 'recipe', d.recipe,
      'catalogSourceId', d.catalog_source_id::text, 'catalogSourceVersion', d.catalog_source_version
    ) order by d.created_at, d.id) from public.dishes d where d.household_id = p_household_id), '[]'::jsonb), true);
$function$;

create or replace function wochentisch_private.validate_household_recipes(p_state jsonb)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare dish jsonb;
begin
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state -> 'dishes') <> 'array' then raise exception 'invalid household state' using errcode = '22023'; end if;
  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    if dish ? 'type' and (jsonb_typeof(dish -> 'type') <> 'string' or dish ->> 'type' not in ('meal', 'baking')) then raise exception 'invalid recipe type' using errcode = '22023'; end if;
    if dish ? 'recipe' and not wochentisch_private.valid_recipe(dish -> 'recipe') then raise exception 'invalid dish recipe' using errcode = '22023'; end if;
    if dish ? 'catalogSourceId' and dish -> 'catalogSourceId' <> 'null'::jsonb and
      (jsonb_typeof(dish -> 'catalogSourceId') <> 'string' or length(dish ->> 'catalogSourceId') > 64) then raise exception 'invalid catalog source' using errcode = '22023'; end if;
    if dish ? 'catalogSourceVersion' and dish -> 'catalogSourceVersion' <> 'null'::jsonb and
      (jsonb_typeof(dish -> 'catalogSourceVersion') <> 'number' or (dish ->> 'catalogSourceVersion')::numeric < 1 or trunc((dish ->> 'catalogSourceVersion')::numeric) <> (dish ->> 'catalogSourceVersion')::numeric) then raise exception 'invalid catalog source version' using errcode = '22023'; end if;
  end loop;
end;
$function$;

create or replace function wochentisch_private.write_state_v2(p_household_id uuid, p_state jsonb)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare dish jsonb;
begin
  perform wochentisch_private.validate_household_recipes(p_state);
  perform wochentisch_sync.write_state(p_household_id, p_state);
  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    update public.dishes d set
      recipe_type = case when dish ? 'type' then dish ->> 'type' else d.recipe_type end,
      recipe = case when dish ? 'recipe' then nullif(dish -> 'recipe', 'null'::jsonb) else d.recipe end,
      catalog_source_id = case when dish ? 'catalogSourceId' then nullif(dish ->> 'catalogSourceId', '')::uuid else d.catalog_source_id end,
      catalog_source_version = case when dish ? 'catalogSourceVersion' then nullif(dish ->> 'catalogSourceVersion', '')::integer else d.catalog_source_version end
    where d.id = (dish ->> 'id')::uuid and d.household_id = p_household_id and
      (d.recipe_type, d.recipe, d.catalog_source_id, d.catalog_source_version) is distinct from (
        case when dish ? 'type' then dish ->> 'type' else d.recipe_type end,
        case when dish ? 'recipe' then nullif(dish -> 'recipe', 'null'::jsonb) else d.recipe end,
        case when dish ? 'catalogSourceId' then nullif(dish ->> 'catalogSourceId', '')::uuid else d.catalog_source_id end,
        case when dish ? 'catalogSourceVersion' then nullif(dish ->> 'catalogSourceVersion', '')::integer else d.catalog_source_version end);
  end loop;
end;
$function$;

create or replace function wochentisch_private.update_catalog_dish_v1(
  p_catalog_id uuid, p_expected_version integer, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  current_dish public.catalog_dishes%rowtype;
  next_ingredients jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not wochentisch_private.catalog_edit_allowed() then raise exception 'catalog editing disabled or not permitted' using errcode = '42501'; end if;
  if p_catalog_id is null or p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_changes) <> 'object' or
    p_changes - array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe','recipe_type'] <> '{}'::jsonb or
    not (p_changes ?& array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe']) then
    raise exception 'invalid catalog edit payload' using errcode = '22023';
  end if;
  if p_changes ? 'recipe_type' and (jsonb_typeof(p_changes -> 'recipe_type') <> 'string' or p_changes ->> 'recipe_type' not in ('meal','baking')) then raise exception 'invalid recipe type' using errcode = '22023'; end if;
  if jsonb_typeof(p_changes -> 'name') <> 'string' or length(btrim(p_changes ->> 'name')) not between 1 and 80 or
    jsonb_typeof(p_changes -> 'ingredient') <> 'string' or length(p_changes ->> 'ingredient') > 80 or
    jsonb_typeof(p_changes -> 'emoji') <> 'string' or length(p_changes ->> 'emoji') > 16 or
    jsonb_typeof(p_changes -> 'cooking_time_minutes') <> 'number' or
    (p_changes ->> 'cooking_time_minutes')::numeric not between 0 and 360 or
    trunc((p_changes ->> 'cooking_time_minutes')::numeric) <> (p_changes ->> 'cooking_time_minutes')::numeric or
    jsonb_typeof(p_changes -> 'ingredients') <> 'array' or not wochentisch_private.valid_recipe(p_changes -> 'recipe') then
    raise exception 'invalid catalog edit fields' using errcode = '22023';
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

  select * into current_dish from public.catalog_dishes where id = p_catalog_id for update;
  if not found then raise exception 'catalog dish not found' using errcode = 'P0002'; end if;
  if current_dish.version <> p_expected_version then
    return jsonb_build_object('status','version_conflict','current',to_jsonb(current_dish));
  end if;

  -- The client sends the projection produced by the shared ingredient alias
  -- catalog; retain that canonical spelling and first-seen order.
  select coalesce(jsonb_agg(to_jsonb(name) order by first_position), '[]'::jsonb) into next_ingredients
  from (
    select (array_agg(btrim(entry.value #>> '{}') order by entry.ordinality))[1] as name,
      min(entry.ordinality) as first_position
    from jsonb_array_elements(p_changes -> 'ingredients') with ordinality entry(value, ordinality)
    group by lower(btrim(entry.value #>> '{}'))
  ) projected;

  update public.catalog_dishes set
    recipe_type = coalesce(p_changes ->> 'recipe_type', current_dish.recipe_type),
    name = btrim(p_changes ->> 'name'), ingredient = btrim(p_changes ->> 'ingredient'),
    cooking_time_minutes = (p_changes ->> 'cooking_time_minutes')::smallint,
    emoji = p_changes ->> 'emoji', ingredients = next_ingredients,
    nutrition = nullif(p_changes -> 'nutrition', 'null'::jsonb), recipe = nullif(p_changes -> 'recipe', 'null'::jsonb),
    version = version + 1, updated_at = now()
  where id = p_catalog_id returning * into current_dish;
  return jsonb_build_object('status','updated','dish',to_jsonb(current_dish));
end;
$function$;

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
    p_changes - array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe','recipe_type'] <> '{}'::jsonb or
    not (p_changes ?& array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe']) then
    raise exception 'invalid catalog creation payload' using errcode = '22023';
  end if;
  if p_changes ? 'recipe_type' and (jsonb_typeof(p_changes -> 'recipe_type') <> 'string' or p_changes ->> 'recipe_type' not in ('meal','baking')) then raise exception 'invalid recipe type' using errcode = '22023'; end if;
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
    insert into public.catalog_dishes(name, recipe_type, ingredient, cooking_time_minutes, emoji, ingredients, nutrition, recipe)
    values (
      btrim(p_changes ->> 'name'), coalesce(p_changes ->> 'recipe_type', 'meal'), btrim(p_changes ->> 'ingredient'),
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

-- New catalog entries never overwrite existing recipes.
insert into public.catalog_dishes (name, ingredient, cooking_time_minutes, emoji, ingredients, recipe, recipe_type)
select seed.name, seed.ingredient, seed.minutes, seed.emoji, seed.ingredients, seed.recipe, 'baking'
from (values
  ('Apfelkuchen','Äpfel',90,'🍰','["Äpfel", "Weizenmehl", "Butter", "Zucker", "Eier", "Backpulver", "Milch"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Äpfel", "amount": 750, "unit": "g", "note": ""}, {"name": "Weizenmehl", "amount": 250, "unit": "g", "note": ""}, {"name": "Butter", "amount": 125, "unit": "g", "note": ""}, {"name": "Zucker", "amount": 125, "unit": "g", "note": ""}, {"name": "Eier", "amount": 3, "unit": "Stück", "note": ""}, {"name": "Backpulver", "amount": 2, "unit": "TL", "note": ""}, {"name": "Milch", "amount": 3, "unit": "EL", "note": ""}], "steps": ["Backofen auf 180 °C Ober-/Unterhitze vorheizen. Eine Springform (26 cm) fetten. Äpfel schälen, entkernen und in Spalten schneiden.", "Butter und Zucker cremig rühren, Eier einzeln einrühren. Mehl mit Backpulver mischen und abwechselnd mit Milch kurz unterrühren.", "Teig in die Form streichen, Äpfel darauf verteilen und etwa 45 Minuten backen. Stäbchenprobe machen und auskühlen lassen."]}'::jsonb),
  ('Käsekuchen','Quark',120,'🍰','["Weizenmehl", "Butter", "Zucker", "Eier", "Magerquark", "Vanillepuddingpulver", "Zitrone"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Weizenmehl", "amount": 200, "unit": "g", "note": ""}, {"name": "Butter", "amount": 150, "unit": "g", "note": ""}, {"name": "Zucker", "amount": 200, "unit": "g", "note": ""}, {"name": "Eier", "amount": 4, "unit": "Stück", "note": ""}, {"name": "Magerquark", "amount": 750, "unit": "g", "note": ""}, {"name": "Vanillepuddingpulver", "amount": 1, "unit": "Päckchen", "note": ""}, {"name": "Zitrone", "amount": 1, "unit": "Stück", "note": ""}], "steps": ["Ofen auf 175 °C Ober-/Unterhitze vorheizen und eine Springform (26 cm) fetten. Mehl, 100 g Butter, 50 g Zucker und ein Ei zu einem Teig kneten; Boden und Rand damit auskleiden.", "Restliche Butter und Zucker mit drei Eiern verrühren. Quark, Puddingpulver und etwas Zitronenabrieb einrühren und auf dem Boden verteilen.", "Etwa 60–70 Minuten backen. Im ausgeschalteten Ofen bei leicht geöffneter Tür abkühlen lassen, dann vollständig kalt stellen."]}'::jsonb),
  ('Marmorkuchen','Schokolade',90,'🍰','["Butter", "Zucker", "Eier", "Weizenmehl", "Backpulver", "Milch", "Backkakao"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Butter", "amount": 250, "unit": "g", "note": ""}, {"name": "Zucker", "amount": 200, "unit": "g", "note": ""}, {"name": "Eier", "amount": 4, "unit": "Stück", "note": ""}, {"name": "Weizenmehl", "amount": 300, "unit": "g", "note": ""}, {"name": "Backpulver", "amount": 2, "unit": "TL", "note": ""}, {"name": "Milch", "amount": 120, "unit": "ml", "note": ""}, {"name": "Backkakao", "amount": 25, "unit": "g", "note": ""}], "steps": ["Ofen auf 175 °C Ober-/Unterhitze vorheizen, eine Gugelhupfform fetten und mit Mehl ausstreuen.", "Butter und Zucker cremig rühren, Eier einzeln zugeben. Mehl und Backpulver mit 80 ml Milch kurz unterrühren. Die Hälfte des Teigs in die Form geben.", "Kakao und restliche Milch unter den übrigen Teig rühren. Dunklen Teig daraufgeben und mit einer Gabel spiralförmig durchziehen. 50–60 Minuten backen, Stäbchenprobe machen und abkühlen lassen."]}'::jsonb),
  ('Zitronenkuchen','Zitrone',90,'🍰','["Butter", "Zucker", "Eier", "Weizenmehl", "Backpulver", "Zitrone", "Puderzucker"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Butter", "amount": 200, "unit": "g", "note": ""}, {"name": "Zucker", "amount": 180, "unit": "g", "note": ""}, {"name": "Eier", "amount": 4, "unit": "Stück", "note": ""}, {"name": "Weizenmehl", "amount": 250, "unit": "g", "note": ""}, {"name": "Backpulver", "amount": 2, "unit": "TL", "note": ""}, {"name": "Zitrone", "amount": 2, "unit": "Stück", "note": ""}, {"name": "Puderzucker", "amount": 120, "unit": "g", "note": ""}], "steps": ["Ofen auf 175 °C Ober-/Unterhitze vorheizen und eine Kastenform fetten. Zitronenschale fein abreiben und Saft auspressen.", "Butter und Zucker cremig rühren, Eier einzeln zugeben. Mehl und Backpulver mit Zitronenabrieb und 3 EL Saft kurz unterrühren.", "In die Form füllen und 45–55 Minuten backen; Stäbchenprobe machen. Abkühlen lassen und mit einem Guss aus Puderzucker und etwas Zitronensaft bestreichen."]}'::jsonb),
  ('Schwarzwälder Kirschtorte','Kirschen',120,'🍰','["Eier", "Zucker", "Weizenmehl", "Backkakao", "Backpulver", "Sauerkirschen", "Speisestärke", "Schlagsahne", "Sahnesteif", "Schokoraspel"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Eier", "amount": 4, "unit": "Stück", "note": ""}, {"name": "Zucker", "amount": 150, "unit": "g", "note": ""}, {"name": "Weizenmehl", "amount": 100, "unit": "g", "note": ""}, {"name": "Backkakao", "amount": 30, "unit": "g", "note": ""}, {"name": "Backpulver", "amount": 1, "unit": "TL", "note": ""}, {"name": "Sauerkirschen", "amount": 1, "unit": "Glas", "note": "Abtropfgewicht etwa 350 g"}, {"name": "Speisestärke", "amount": 20, "unit": "g", "note": ""}, {"name": "Schlagsahne", "amount": 600, "unit": "ml", "note": ""}, {"name": "Sahnesteif", "amount": 2, "unit": "Päckchen", "note": ""}, {"name": "Schokoraspel", "amount": 60, "unit": "g", "note": ""}], "steps": ["Ofen auf 180 °C Ober-/Unterhitze vorheizen. Eier und 120 g Zucker 5 Minuten schaumig schlagen. Mehl, Kakao und Backpulver vorsichtig unterheben. In einer mit Backpapier ausgelegten Springform (26 cm) 25–30 Minuten backen und abkühlen lassen.", "Kirschen abtropfen, Saft auffangen. Stärke mit etwas Saft anrühren, 200 ml Saft aufkochen und mit Stärke binden. Kirschen unterheben und abkühlen lassen.", "Sahne mit restlichem Zucker und Sahnesteif steif schlagen. Boden zweimal waagerecht teilen. Kirschen und etwas Sahne auf dem unteren Boden verteilen, zweiten Boden und Sahne auflegen, mit dem dritten bedecken. Torte mit übriger Sahne und Schokoraspeln verzieren und kalt stellen."]}'::jsonb),
  ('Bienenstich','Mandeln',120,'🍰','["Weizenmehl", "Trockenhefe", "Milch", "Zucker", "Butter", "Eier", "Honig", "Mandelblättchen", "Vanillepuddingpulver", "Schlagsahne"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Weizenmehl", "amount": 300, "unit": "g", "note": ""}, {"name": "Trockenhefe", "amount": 1, "unit": "Päckchen", "note": ""}, {"name": "Milch", "amount": 300, "unit": "ml", "note": ""}, {"name": "Zucker", "amount": 100, "unit": "g", "note": ""}, {"name": "Butter", "amount": 100, "unit": "g", "note": ""}, {"name": "Eier", "amount": 1, "unit": "Stück", "note": ""}, {"name": "Honig", "amount": 2, "unit": "EL", "note": ""}, {"name": "Mandelblättchen", "amount": 100, "unit": "g", "note": ""}, {"name": "Vanillepuddingpulver", "amount": 1, "unit": "Päckchen", "note": ""}, {"name": "Schlagsahne", "amount": 200, "unit": "ml", "note": ""}], "steps": ["Mehl mit Hefe, 150 ml lauwarmer Milch, 40 g Zucker, 50 g weicher Butter und Ei zu einem glatten Teig kneten. Zugedeckt etwa 45 Minuten gehen lassen und in eine gefettete Springform (26 cm) drücken.", "Restliche Butter, 30 g Zucker und Honig kurz erwärmen, Mandeln einrühren und auf dem Teig verteilen. Bei 180 °C Ober-/Unterhitze 25–30 Minuten backen und auskühlen lassen.", "Puddingpulver mit restlichem Zucker und 150 ml Milch nach Packungsprinzip zu einem festen Pudding kochen und unter gelegentlichem Rühren abkühlen lassen. Sahne steif schlagen und unterheben. Kuchen waagerecht teilen, mit Creme füllen und kalt stellen."]}'::jsonb),
  ('Streuselkuchen','Butter',90,'🍰','["Weizenmehl", "Zucker", "Butter", "Eier", "Backpulver", "Milch", "Vanillezucker"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Weizenmehl", "amount": 400, "unit": "g", "note": ""}, {"name": "Zucker", "amount": 180, "unit": "g", "note": ""}, {"name": "Butter", "amount": 250, "unit": "g", "note": ""}, {"name": "Eier", "amount": 2, "unit": "Stück", "note": ""}, {"name": "Backpulver", "amount": 2, "unit": "TL", "note": ""}, {"name": "Milch", "amount": 80, "unit": "ml", "note": ""}, {"name": "Vanillezucker", "amount": 1, "unit": "Päckchen", "note": ""}], "steps": ["Ofen auf 180 °C Ober-/Unterhitze vorheizen und eine Springform (26 cm) fetten.", "250 g Mehl mit Backpulver, 100 g Zucker, 100 g Butter, Eiern und Milch zu einem Rührteig verarbeiten und in die Form streichen.", "Übriges Mehl, Zucker, Vanillezucker und kalte Butter zu Streuseln verkneten und auf dem Teig verteilen. 35–40 Minuten goldbraun backen und abkühlen lassen."]}'::jsonb),
  ('Brownies','Schokolade',60,'🍰','["Zartbitterschokolade", "Butter", "Zucker", "Eier", "Weizenmehl", "Backkakao"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Zartbitterschokolade", "amount": 200, "unit": "g", "note": ""}, {"name": "Butter", "amount": 150, "unit": "g", "note": ""}, {"name": "Zucker", "amount": 180, "unit": "g", "note": ""}, {"name": "Eier", "amount": 3, "unit": "Stück", "note": ""}, {"name": "Weizenmehl", "amount": 100, "unit": "g", "note": ""}, {"name": "Backkakao", "amount": 25, "unit": "g", "note": ""}], "steps": ["Ofen auf 175 °C Ober-/Unterhitze vorheizen und eine etwa 20 × 20 cm große Form mit Backpapier auslegen. Schokolade und Butter vorsichtig schmelzen und etwas abkühlen lassen.", "Eier und Zucker verrühren, Schokoladenmischung einrühren. Mehl und Kakao kurz unterheben.", "Teig in die Form geben und 22–28 Minuten backen; die Mitte darf noch leicht feucht sein. Vollständig abkühlen lassen und in 12 Stücke schneiden."]}'::jsonb),
  ('Schokomuffins','Schokolade',45,'🧁','["Weizenmehl", "Backkakao", "Backpulver", "Zucker", "Eier", "Milch", "Rapsöl", "Schokotropfen"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Weizenmehl", "amount": 220, "unit": "g", "note": ""}, {"name": "Backkakao", "amount": 30, "unit": "g", "note": ""}, {"name": "Backpulver", "amount": 2, "unit": "TL", "note": ""}, {"name": "Zucker", "amount": 120, "unit": "g", "note": ""}, {"name": "Eier", "amount": 2, "unit": "Stück", "note": ""}, {"name": "Milch", "amount": 180, "unit": "ml", "note": ""}, {"name": "Rapsöl", "amount": 80, "unit": "ml", "note": ""}, {"name": "Schokotropfen", "amount": 100, "unit": "g", "note": ""}], "steps": ["Ofen auf 180 °C Ober-/Unterhitze vorheizen und ein Muffinblech mit 12 Förmchen auslegen.", "Mehl, Kakao, Backpulver und Zucker mischen. Eier, Milch und Öl verrühren und nur kurz unter die trockenen Zutaten heben. Schokotropfen unterheben.", "Teig auf die Förmchen verteilen und 20–25 Minuten backen. Stäbchenprobe machen und auskühlen lassen."]}'::jsonb),
  ('Blaubeermuffins','Blaubeeren',45,'🧁','["Weizenmehl", "Backpulver", "Zucker", "Eier", "Milch", "Rapsöl", "Blaubeeren"]'::jsonb,'{"servings": 12, "ingredients": [{"name": "Weizenmehl", "amount": 250, "unit": "g", "note": ""}, {"name": "Backpulver", "amount": 2, "unit": "TL", "note": ""}, {"name": "Zucker", "amount": 120, "unit": "g", "note": ""}, {"name": "Eier", "amount": 2, "unit": "Stück", "note": ""}, {"name": "Milch", "amount": 150, "unit": "ml", "note": ""}, {"name": "Rapsöl", "amount": 80, "unit": "ml", "note": ""}, {"name": "Blaubeeren", "amount": 180, "unit": "g", "note": ""}], "steps": ["Ofen auf 180 °C Ober-/Unterhitze vorheizen und ein Muffinblech mit 12 Förmchen auslegen. Blaubeeren waschen und abtropfen lassen.", "Mehl, Backpulver und Zucker mischen. Eier, Milch und Öl verrühren und kurz unter die trockenen Zutaten rühren. Blaubeeren vorsichtig unterheben.", "Teig auf die Förmchen verteilen und 20–25 Minuten backen. Stäbchenprobe machen und auskühlen lassen."]}'::jsonb)
) as seed(name, ingredient, minutes, emoji, ingredients, recipe)
where not exists (select 1 from public.catalog_dishes existing where existing.normalized_name = lower(regexp_replace(btrim(seed.name), '[^[:alnum:]]+', '', 'g')))
on conflict do nothing;
