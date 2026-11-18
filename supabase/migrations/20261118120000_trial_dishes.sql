-- NULL is a regular recipe with no trial history. An explicit false records promotion.
-- Missing fields in queued requests from earlier clients preserve the current values.
alter table public.dishes
  add column is_trial boolean,
  add column trial_source text check (length(trial_source) <= 50000);

create or replace function wochentisch_private.cloud_state_v2(p_household_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select jsonb_set(coalesce(wochentisch_sync.cloud_state(p_household_id), '{}'::jsonb), '{dishes}',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id::text, 'name', d.name, 'ingredient', d.ingredient, 'type', d.recipe_type, 'time', d.cooking_time_minutes,
      'emoji', d.emoji, 'ingredients', d.ingredients, 'nutrition', d.nutrition, 'recipe', d.recipe,
      'catalogSourceId', d.catalog_source_id::text, 'catalogSourceVersion', d.catalog_source_version
    ) || jsonb_strip_nulls(jsonb_build_object('isTrial', d.is_trial, 'trialSource', d.trial_source))
      order by d.created_at, d.id) from public.dishes d where d.household_id = p_household_id), '[]'::jsonb), true);
$function$;

create or replace function wochentisch_private.validate_household_recipes(p_state jsonb)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare dish jsonb;
begin
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state -> 'dishes') <> 'array' then raise exception 'invalid household state' using errcode = '22023'; end if;
  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    if dish ? 'isTrial' and jsonb_typeof(dish -> 'isTrial') is distinct from 'boolean' then
      raise exception 'invalid trial recipe status' using errcode = '22023';
    end if;
    if dish ? 'trialSource' and (jsonb_typeof(dish -> 'trialSource') is distinct from 'string' or length(dish ->> 'trialSource') > 50000) then
      raise exception 'invalid trial recipe source' using errcode = '22023';
    end if;
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
      is_trial = coalesce((dish ->> 'isTrial')::boolean, d.is_trial),
      trial_source = coalesce(dish ->> 'trialSource', d.trial_source),
      recipe_type = case when dish ? 'type' then dish ->> 'type' else d.recipe_type end,
      recipe = case when dish ? 'recipe' then nullif(dish -> 'recipe', 'null'::jsonb) else d.recipe end,
      catalog_source_id = case when dish ? 'catalogSourceId' then nullif(dish ->> 'catalogSourceId', '')::uuid else d.catalog_source_id end,
      catalog_source_version = case when dish ? 'catalogSourceVersion' then nullif(dish ->> 'catalogSourceVersion', '')::integer else d.catalog_source_version end
    where d.id = (dish ->> 'id')::uuid and d.household_id = p_household_id and
      (d.is_trial, d.trial_source, d.recipe_type, d.recipe, d.catalog_source_id, d.catalog_source_version) is distinct from (
        coalesce((dish ->> 'isTrial')::boolean, d.is_trial),
        coalesce(dish ->> 'trialSource', d.trial_source),
        case when dish ? 'type' then dish ->> 'type' else d.recipe_type end,
        case when dish ? 'recipe' then nullif(dish -> 'recipe', 'null'::jsonb) else d.recipe end,
        case when dish ? 'catalogSourceId' then nullif(dish ->> 'catalogSourceId', '')::uuid else d.catalog_source_id end,
        case when dish ? 'catalogSourceVersion' then nullif(dish ->> 'catalogSourceVersion', '')::integer else d.catalog_source_version end);
  end loop;
end;
$function$;
