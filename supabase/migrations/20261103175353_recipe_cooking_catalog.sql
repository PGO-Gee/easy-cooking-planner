-- Rezeptdaten, Kochassistent und versionierte Standardkatalogverwaltung.
-- Die Migration bleibt mit v1-Haushaltsclients kompatibel: v1 liest weiterhin
-- nur die bisherigen Spalten und sein Writer ändert recipe/source fields nicht.

create schema if not exists wochentisch_private;
revoke all on schema wochentisch_private from public, anon, authenticated;

-- Vergleichsbasis für die einmalige, eindeutige Verknüpfung unveränderter
-- Katalogkopien. Sie wird nach dem Abgleich wieder entfernt.
create table wochentisch_private.catalog_migration_baseline as
select id, name, normalized_name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition
from public.catalog_dishes;
revoke all on wochentisch_private.catalog_migration_baseline from public, anon, authenticated;

alter table public.catalog_dishes
  add column recipe jsonb,
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add constraint catalog_dishes_recipe_object check (recipe is null or jsonb_typeof(recipe) = 'object'),
  add constraint catalog_dishes_version_positive check (version > 0);

alter table public.dishes
  add column recipe jsonb,
  add column catalog_source_id uuid references public.catalog_dishes(id) on delete set null,
  add column catalog_source_version integer,
  add constraint dishes_recipe_object check (recipe is null or jsonb_typeof(recipe) = 'object'),
  add constraint dishes_catalog_source_version_positive check (catalog_source_version is null or catalog_source_version > 0);

create table wochentisch_private.catalog_edit_settings (
  singleton boolean primary key default true check (singleton),
  access_mode text not null default 'authenticated' check (access_mode in ('authenticated', 'admins', 'disabled')),
  updated_at timestamptz not null default now()
);
insert into wochentisch_private.catalog_edit_settings(singleton, access_mode)
values (true, 'authenticated') on conflict (singleton) do nothing;

create table wochentisch_private.catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table wochentisch_private.catalog_edit_settings enable row level security;
alter table wochentisch_private.catalog_admins enable row level security;
revoke all on wochentisch_private.catalog_edit_settings, wochentisch_private.catalog_admins from public, anon, authenticated;

create or replace function wochentisch_private.catalog_edit_allowed()
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce((select auth.uid() is not null and settings.access_mode <> 'disabled'
    and (settings.access_mode = 'authenticated' or exists (
      select 1 from wochentisch_private.catalog_admins admins where admins.user_id = (select auth.uid())
    )) from wochentisch_private.catalog_edit_settings settings where settings.singleton), false);
$function$;
revoke all on function wochentisch_private.catalog_edit_allowed() from public, anon, authenticated;

create or replace function wochentisch_private.valid_recipe(p_recipe jsonb)
returns boolean
language plpgsql immutable security invoker set search_path = ''
as $function$
declare
  ingredient jsonb;
  step jsonb;
  amount jsonb;
  servings jsonb;
begin
  if p_recipe is null or p_recipe = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p_recipe) <> 'object' or p_recipe - array['servings','ingredients','steps'] <> '{}'::jsonb then return false; end if;
  servings := p_recipe -> 'servings';
  if servings is not null and servings <> 'null'::jsonb and
    (jsonb_typeof(servings) <> 'number' or (servings #>> '{}')::numeric < 1 or
      (servings #>> '{}')::numeric > 100 or trunc((servings #>> '{}')::numeric) <> (servings #>> '{}')::numeric) then return false; end if;
  if p_recipe ? 'ingredients' and jsonb_typeof(p_recipe -> 'ingredients') <> 'array' then return false; end if;
  for ingredient in select value from jsonb_array_elements(coalesce(p_recipe -> 'ingredients', '[]'::jsonb)) loop
    if jsonb_typeof(ingredient) <> 'object' or ingredient - array['name','amount','unit','note'] <> '{}'::jsonb or
      jsonb_typeof(ingredient -> 'name') <> 'string' or length(btrim(ingredient ->> 'name')) not between 1 and 100 then return false; end if;
    if ingredient ? 'unit' and (jsonb_typeof(ingredient -> 'unit') <> 'string' or length(ingredient ->> 'unit') > 24) then return false; end if;
    if ingredient ? 'note' and (jsonb_typeof(ingredient -> 'note') <> 'string' or length(ingredient ->> 'note') > 100) then return false; end if;
    amount := ingredient -> 'amount';
    if amount is not null and amount <> 'null'::jsonb then
      if jsonb_typeof(amount) = 'number' then
        if (amount #>> '{}')::numeric <= 0 or (amount #>> '{}')::numeric > 1000000000 then return false; end if;
      elsif jsonb_typeof(amount) = 'string' then
        if length(btrim(amount #>> '{}')) not between 1 and 80 then return false; end if;
        if btrim(amount #>> '{}') ~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' and
          (replace(btrim(amount #>> '{}'), ',', '.')::numeric <= 0 or
            replace(btrim(amount #>> '{}'), ',', '.')::numeric > 1000000000) then return false; end if;
      else return false;
      end if;
    end if;
  end loop;
  if p_recipe ? 'steps' and jsonb_typeof(p_recipe -> 'steps') <> 'array' then return false; end if;
  if jsonb_array_length(coalesce(p_recipe -> 'steps', '[]'::jsonb)) > 100 then return false; end if;
  for step in select value from jsonb_array_elements(coalesce(p_recipe -> 'steps', '[]'::jsonb)) loop
    if jsonb_typeof(step) <> 'string' or length(btrim(step #>> '{}')) not between 1 and 1200 then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$function$;
revoke all on function wochentisch_private.valid_recipe(jsonb) from public, anon, authenticated;

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
    p_changes - array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe'] <> '{}'::jsonb or
    not (p_changes ?& array['name','ingredient','cooking_time_minutes','emoji','ingredients','nutrition','recipe']) then
    raise exception 'invalid catalog edit payload' using errcode = '22023';
  end if;
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
    name = btrim(p_changes ->> 'name'), ingredient = btrim(p_changes ->> 'ingredient'),
    cooking_time_minutes = (p_changes ->> 'cooking_time_minutes')::smallint,
    emoji = p_changes ->> 'emoji', ingredients = next_ingredients,
    nutrition = nullif(p_changes -> 'nutrition', 'null'::jsonb), recipe = nullif(p_changes -> 'recipe', 'null'::jsonb),
    version = version + 1, updated_at = now()
  where id = p_catalog_id returning * into current_dish;
  return jsonb_build_object('status','updated','dish',to_jsonb(current_dish));
end;
$function$;
revoke all on function wochentisch_private.update_catalog_dish_v1(uuid, integer, jsonb) from public, anon, authenticated;

create or replace function public.catalog_edit_allowed_v1()
returns boolean language sql security definer set search_path = ''
as $function$ select wochentisch_private.catalog_edit_allowed(); $function$;
revoke all on function public.catalog_edit_allowed_v1() from public, anon, authenticated;
grant execute on function public.catalog_edit_allowed_v1() to authenticated;

create or replace function public.update_catalog_dish_v1(p_catalog_id uuid, p_expected_version integer, p_changes jsonb)
returns jsonb language sql security definer set search_path = ''
as $function$ select wochentisch_private.update_catalog_dish_v1(p_catalog_id, p_expected_version, p_changes); $function$;
revoke all on function public.update_catalog_dish_v1(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.update_catalog_dish_v1(uuid, integer, jsonb) to authenticated;

-- Zentraler Katalog bleibt lesbar; direkte Schreibrechte gibt es ausschließlich
-- über update_catalog_dish_v1.
revoke insert, update, delete, truncate on public.catalog_dishes from public, anon, authenticated;
grant select on public.catalog_dishes to anon, authenticated;

create or replace function wochentisch_private.cloud_state_v2(p_household_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select jsonb_set(coalesce(wochentisch_sync.cloud_state(p_household_id), '{}'::jsonb), '{dishes}',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id::text, 'name', d.name, 'ingredient', d.ingredient, 'time', d.cooking_time_minutes,
      'emoji', d.emoji, 'ingredients', d.ingredients, 'nutrition', d.nutrition, 'recipe', d.recipe,
      'catalogSourceId', d.catalog_source_id::text, 'catalogSourceVersion', d.catalog_source_version
    ) order by d.created_at, d.id) from public.dishes d where d.household_id = p_household_id), '[]'::jsonb), true);
$function$;
revoke all on function wochentisch_private.cloud_state_v2(uuid) from public, anon, authenticated;

create or replace function wochentisch_private.validate_household_recipes(p_state jsonb)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare dish jsonb;
begin
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state -> 'dishes') <> 'array' then raise exception 'invalid household state' using errcode = '22023'; end if;
  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    if dish ? 'recipe' and not wochentisch_private.valid_recipe(dish -> 'recipe') then raise exception 'invalid dish recipe' using errcode = '22023'; end if;
    if dish ? 'catalogSourceId' and dish -> 'catalogSourceId' <> 'null'::jsonb and
      (jsonb_typeof(dish -> 'catalogSourceId') <> 'string' or length(dish ->> 'catalogSourceId') > 64) then raise exception 'invalid catalog source' using errcode = '22023'; end if;
    if dish ? 'catalogSourceVersion' and dish -> 'catalogSourceVersion' <> 'null'::jsonb and
      (jsonb_typeof(dish -> 'catalogSourceVersion') <> 'number' or (dish ->> 'catalogSourceVersion')::numeric < 1 or trunc((dish ->> 'catalogSourceVersion')::numeric) <> (dish ->> 'catalogSourceVersion')::numeric) then raise exception 'invalid catalog source version' using errcode = '22023'; end if;
  end loop;
end;
$function$;
revoke all on function wochentisch_private.validate_household_recipes(jsonb) from public, anon, authenticated;

-- The v2 writer sets additive recipe/source fields after the unchanged v1 writer.
create or replace function wochentisch_private.write_state_v2(p_household_id uuid, p_state jsonb)
returns void language plpgsql security invoker set search_path = ''
as $function$
declare dish jsonb;
begin
  perform wochentisch_private.validate_household_recipes(p_state);
  perform wochentisch_sync.write_state(p_household_id, p_state);
  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    update public.dishes d set
      recipe = case when dish ? 'recipe' then nullif(dish -> 'recipe', 'null'::jsonb) else d.recipe end,
      catalog_source_id = case when dish ? 'catalogSourceId' then nullif(dish ->> 'catalogSourceId', '')::uuid else d.catalog_source_id end,
      catalog_source_version = case when dish ? 'catalogSourceVersion' then nullif(dish ->> 'catalogSourceVersion', '')::integer else d.catalog_source_version end
    where d.id = (dish ->> 'id')::uuid and d.household_id = p_household_id and
      (d.recipe, d.catalog_source_id, d.catalog_source_version) is distinct from (
        case when dish ? 'recipe' then nullif(dish -> 'recipe', 'null'::jsonb) else d.recipe end,
        case when dish ? 'catalogSourceId' then nullif(dish ->> 'catalogSourceId', '')::uuid else d.catalog_source_id end,
        case when dish ? 'catalogSourceVersion' then nullif(dish ->> 'catalogSourceVersion', '')::integer else d.catalog_source_version end);
  end loop;
end;
$function$;
revoke all on function wochentisch_private.write_state_v2(uuid, jsonb) from public, anon, authenticated;

-- Rezeptbasis einmalig ergänzen. Eine Wiederholung überschreibt bestehende Korrekturen nicht.
with recipe_seed(name, recipe, shopping_ingredients) as (values
    ('Bauernomelett mit Kartoffeln', '{"servings":2,"ingredients":[{"name":"Eier","amount":4,"unit":"Stück","note":"Größe M"},{"name":"Kartoffeln","amount":400,"unit":"g","note":"festkochend"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Schnittlauch","amount":10,"unit":"g"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Salz","amount":null,"unit":"","note":"nach Geschmack"},{"name":"Pfeffer","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Kartoffeln waschen und in leicht gesalzenem Wasser 18–20 Minuten garen. Abgießen, kurz ausdampfen lassen und in Scheiben schneiden.","Zwiebel würfeln, Paprika klein schneiden. Öl in einer ofenfesten Pfanne erhitzen und beides 4 Minuten anbraten. Kartoffelscheiben zugeben und weitere 4 Minuten braten.","Eier verquirlen, mit Salz und Pfeffer würzen und über das Gemüse gießen. Bei kleiner Hitze 6–8 Minuten stocken lassen; für eine gebräunte Oberfläche die Pfanne 2 Minuten unter den Grill stellen. Mit Schnittlauch bestreuen."]}'::jsonb, '["Eier","Kartoffeln","Zwiebeln","Paprika","Schnittlauch","Rapsöl","Salz","Pfeffer"]'::jsonb),
    ('Buchweizen-Eintopf', '{"servings":2,"ingredients":[{"name":"Buchweizen","amount":150,"unit":"g"},{"name":"Kartoffeln","amount":250,"unit":"g"},{"name":"Karotten","amount":2,"unit":"Stück"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Gemüsebrühe","amount":700,"unit":"ml"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Majoran","amount":1,"unit":"TL"},{"name":"Salz und Pfeffer","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Buchweizen in einem Sieb heiß abspülen. Kartoffeln und Karotten würfeln, Zwiebel fein hacken.","Öl in einem Topf erhitzen und die Zwiebel 3 Minuten anschwitzen. Kartoffeln, Karotten und Buchweizen einrühren, Brühe angießen und Majoran zugeben.","Aufkochen, dann zugedeckt bei kleiner Hitze 20–25 Minuten köcheln lassen, bis Buchweizen und Kartoffeln weich sind. Mit Salz und Pfeffer abschmecken und 5 Minuten ruhen lassen."]}'::jsonb, '["Buchweizen","Kartoffeln","Karotten","Zwiebeln","Gemüsebrühe","Rapsöl","Majoran","Salz und Pfeffer"]'::jsonb),
    ('Burger und Kartoffel-Pommes', '{"servings":2,"ingredients":[{"name":"Burgerbrötchen","amount":2,"unit":"Stück"},{"name":"Rinderpatty","amount":2,"unit":"Stück","note":"je etwa 150 g"},{"name":"Käse","amount":2,"unit":"Scheiben"},{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Salat","amount":4,"unit":"Blätter"},{"name":"Tomaten","amount":1,"unit":"Stück"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Salz und Pfeffer","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Backofen auf 220 °C Ober-/Unterhitze vorheizen. Kartoffeln in Stifte schneiden, mit Öl und Salz mischen und auf einem Blech verteilen. 30–35 Minuten backen, nach der Hälfte wenden.","Tomate in Scheiben schneiden, Salat waschen. Brötchen halbieren und in einer Pfanne oder im Ofen kurz anrösten.","Patties salzen und pfeffern. In einer heißen Pfanne je Seite 3–4 Minuten braten, bis sie durchgegart sind. Käse in der letzten Minute auflegen. Burger mit Salat und Tomate zusammensetzen und mit Pommes servieren."]}'::jsonb, '["Burgerbrötchen","Rindfleisch","Käse","Kartoffeln","Salat","Tomaten","Rapsöl","Salz und Pfeffer"]'::jsonb),
    ('Butter Chicken mit Reis', '{"servings":2,"ingredients":[{"name":"Hähnchenbrust","amount":300,"unit":"g"},{"name":"Basmatireis","amount":150,"unit":"g"},{"name":"Passierte Tomaten","amount":200,"unit":"g"},{"name":"Sahne","amount":100,"unit":"ml"},{"name":"Butter","amount":25,"unit":"g"},{"name":"Ingwer","amount":10,"unit":"g"},{"name":"Knoblauch","amount":2,"unit":"Zehen"},{"name":"Currypulver","amount":2,"unit":"TL"},{"name":"Joghurt","amount":2,"unit":"EL"},{"name":"Salz","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Hähnchen in mundgerechte Stücke schneiden und mit Joghurt, der Hälfte des Currypulvers und Salz mischen. 10 Minuten ziehen lassen. Reis nach Packungsangabe garen.","Butter in einer Pfanne erhitzen. Hähnchen rundum 6–8 Minuten anbraten. Fein geriebenen Ingwer und Knoblauch kurz mitbraten.","Passierte Tomaten und restliches Currypulver einrühren. Bei mittlerer Hitze 10 Minuten köcheln lassen, Sahne einrühren und weitere 3 Minuten erhitzen. Mit Reis servieren."]}'::jsonb, '["Hähnchen","Reis","Passierte Tomaten","Sahne","Butter","Ingwer","Knoblauch","Currypulver","Joghurt","Salz"]'::jsonb),
    ('Chili con Carne mit Reis', '{"servings":2,"ingredients":[{"name":"Rinderhackfleisch","amount":250,"unit":"g"},{"name":"Kidneybohnen","amount":240,"unit":"g","note":"Abtropfgewicht"},{"name":"Passierte Tomaten","amount":300,"unit":"g"},{"name":"Reis","amount":150,"unit":"g"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Tomatenmark","amount":1,"unit":"EL"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Chilipulver","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Reis nach Packungsangabe garen. Zwiebel und Paprika würfeln, Bohnen abspülen und abtropfen lassen.","Öl in einem Topf erhitzen. Hackfleisch krümelig und vollständig braun braten. Zwiebel und Paprika 4 Minuten mitbraten, Tomatenmark einrühren.","Passierte Tomaten und Chili zugeben. 15 Minuten offen köcheln lassen, Bohnen in den letzten 5 Minuten mitwärmen. Abschmecken und mit Reis servieren."]}'::jsonb, '["Rindfleisch","Kidneybohnen","Passierte Tomaten","Reis","Zwiebeln","Paprika","Tomatenmark","Rapsöl","Chilipulver"]'::jsonb),
    ('Currywurst mit Pommes', '{"servings":2,"ingredients":[{"name":"Bratwurst","amount":2,"unit":"Stück"},{"name":"Pommes","amount":400,"unit":"g"},{"name":"Ketchup","amount":120,"unit":"g"},{"name":"Currypulver","amount":2,"unit":"TL"},{"name":"Rapsöl","amount":1,"unit":"TL"}],"steps":["Backofen auf die auf der Pommespackung angegebene Temperatur vorheizen. Pommes auf einem Blech verteilen und nach Packungsangabe knusprig backen.","Würste in einer leicht geölten Pfanne bei mittlerer Hitze rundum 8–10 Minuten braten, bis sie innen vollständig heiß sind.","Ketchup in einem kleinen Topf erwärmen und mit der Hälfte des Currypulvers verrühren. Würste in Scheiben schneiden, Sauce darübergeben und mit restlichem Curry bestäuben. Pommes dazu reichen."]}'::jsonb, '["Bratwurst","Pommes","Ketchup","Currypulver","Rapsöl"]'::jsonb),
    ('Fisch mit Kartoffeln', '{"servings":2,"ingredients":[{"name":"Fischfilet","amount":300,"unit":"g"},{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Zitrone","amount":1,"unit":"Stück"},{"name":"Butter","amount":20,"unit":"g"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Dill","amount":1,"unit":"EL"},{"name":"Salz und Pfeffer","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Kartoffeln schälen, in Stücke schneiden und in Salzwasser 18–20 Minuten weich kochen. Abgießen und mit Butter schwenken.","Fisch trocken tupfen und mit Salz und Pfeffer würzen. Öl in einer Pfanne erhitzen und das Filet je nach Dicke 3–5 Minuten pro Seite braten, bis es innen undurchsichtig ist und leicht zerfällt.","Zitrone halbieren und Fisch mit Zitronensaft und Dill würzen. Mit den Kartoffeln servieren."]}'::jsonb, '["Fischfilet","Kartoffeln","Zitronen","Butter","Rapsöl","Dill","Salz und Pfeffer"]'::jsonb),
    ('Fischstäbchen mit Kartoffelpüree', '{"servings":2,"ingredients":[{"name":"Fischstäbchen","amount":8,"unit":"Stück"},{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Milch","amount":100,"unit":"ml"},{"name":"Butter","amount":25,"unit":"g"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Salz","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Kartoffeln schälen, würfeln und in Salzwasser 18–20 Minuten weich kochen. Abgießen.","Milch und Butter erwärmen. Kartoffeln stampfen, die warme Milch nach und nach einarbeiten und das Püree mit Salz abschmecken.","Fischstäbchen nach Packungsangabe im Ofen backen oder in wenig Öl in der Pfanne je Seite 3–4 Minuten goldbraun braten. Mit dem Püree servieren."]}'::jsonb, '["Fischstäbchen","Kartoffeln","Milch","Butter","Rapsöl","Salz"]'::jsonb),
    ('Frikadellen mit Kartoffelpüree', '{"servings":2,"ingredients":[{"name":"Rinderhackfleisch","amount":300,"unit":"g"},{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Eier","amount":1,"unit":"Stück"},{"name":"Paniermehl","amount":30,"unit":"g"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Milch","amount":100,"unit":"ml"},{"name":"Butter","amount":25,"unit":"g"},{"name":"Rapsöl","amount":1,"unit":"EL"}],"steps":["Kartoffeln schälen, würfeln und in Salzwasser 18–20 Minuten kochen. Zwiebel fein würfeln.","Hackfleisch mit Ei, Paniermehl und der Hälfte der Zwiebel verkneten. Zwei flache Frikadellen formen. In heißem Öl bei mittlerer Hitze je Seite 5–6 Minuten braten, bis sie durchgegart sind.","Kartoffeln abgießen und mit erwärmter Milch und Butter stampfen. Mit Salz abschmecken und zusammen mit den Frikadellen servieren."]}'::jsonb, '["Rindfleisch","Kartoffeln","Eier","Paniermehl","Zwiebeln","Milch","Butter","Rapsöl"]'::jsonb),
    ('Gebratener Reis mit Hähnchen und Ei', '{"servings":2,"ingredients":[{"name":"Reis","amount":150,"unit":"g"},{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Eier","amount":2,"unit":"Stück"},{"name":"Erbsen","amount":100,"unit":"g"},{"name":"Karotten","amount":1,"unit":"Stück"},{"name":"Sojasauce","amount":2,"unit":"EL"},{"name":"Sesamöl","amount":1,"unit":"EL"},{"name":"Frühlingszwiebeln","amount":2,"unit":"Stück"}],"steps":["Reis garen, auf einem großen Teller ausbreiten und möglichst vollständig abkühlen lassen. Hähnchen würfeln, Karotte klein schneiden und Frühlingszwiebeln in Ringe schneiden.","Hähnchen in der Hälfte des Sesamöls in einer großen Pfanne 6–8 Minuten vollständig durchbraten. An den Pfannenrand schieben, Eier in die freie Fläche schlagen und unter Rühren stocken lassen.","Karotte und Erbsen 4 Minuten braten. Reis, Sojasauce und übriges Öl zugeben und unter Rühren 4–5 Minuten erhitzen. Frühlingszwiebeln darüberstreuen."]}'::jsonb, '["Reis","Hähnchen","Eier","Erbsen","Karotten","Sojasauce","Sesamöl","Frühlingszwiebeln"]'::jsonb),
    ('Gulasch mit Reis', '{"servings":2,"ingredients":[{"name":"Rindergulasch","amount":400,"unit":"g"},{"name":"Reis","amount":150,"unit":"g"},{"name":"Zwiebeln","amount":2,"unit":"Stück"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Rinderbrühe","amount":400,"unit":"ml"},{"name":"Tomatenmark","amount":1,"unit":"EL"},{"name":"Paprikapulver","amount":2,"unit":"TL"},{"name":"Rapsöl","amount":1,"unit":"EL"}],"steps":["Zwiebeln würfeln und Paprika in Streifen schneiden. Öl in einem schweren Topf erhitzen und das Rindfleisch portionsweise kräftig anbraten.","Zwiebeln zugeben und 4 Minuten mitbraten. Tomatenmark und Paprikapulver einrühren, Brühe angießen und aufkochen.","Zugedeckt bei kleiner Hitze 75–90 Minuten schmoren, bis das Fleisch weich ist; bei Bedarf etwas Wasser nachgießen. Reis nach Packungsangabe garen und zum Gulasch servieren."]}'::jsonb, '["Rindfleisch","Reis","Zwiebeln","Paprika","Rinderbrühe","Tomatenmark","Paprikapulver","Rapsöl"]'::jsonb),
    ('Hähnchen-Woknudeln', '{"servings":2,"ingredients":[{"name":"Mie-Nudeln","amount":180,"unit":"g"},{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Brokkoli","amount":150,"unit":"g"},{"name":"Karotten","amount":1,"unit":"Stück"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Sojasauce","amount":3,"unit":"EL"},{"name":"Ingwer","amount":10,"unit":"g"},{"name":"Sesamöl","amount":1,"unit":"EL"}],"steps":["Nudeln nach Packungsangabe garen und abtropfen lassen. Hähnchen in Streifen, Gemüse in dünne Stücke schneiden und Ingwer fein reiben.","Wok oder große Pfanne stark erhitzen. Öl zugeben und Hähnchen 6–8 Minuten vollständig durchbraten. Herausnehmen.","Gemüse und Ingwer 4–5 Minuten unter Rühren braten. Nudeln, Hähnchen und Sojasauce dazugeben und 2 Minuten heiß schwenken."]}'::jsonb, '["Mie-Nudeln","Hähnchen","Brokkoli","Karotten","Paprika","Sojasauce","Ingwer","Sesamöl"]'::jsonb),
    ('Hähnchenschenkel mit Ofenkartoffeln', '{"servings":2,"ingredients":[{"name":"Hähnchenschenkel","amount":2,"unit":"Stück"},{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Paprikapulver","amount":1,"unit":"TL"},{"name":"Rosmarin","amount":1,"unit":"TL"},{"name":"Rapsöl","amount":2,"unit":"EL"},{"name":"Salz","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Backofen auf 200 °C Umluft vorheizen. Kartoffeln in Spalten und Zwiebel in Stücke schneiden. Mit einem Esslöffel Öl, Rosmarin und Salz mischen.","Hähnchenschenkel trocken tupfen und mit restlichem Öl, Paprikapulver und Salz einreiben. Mit den Kartoffeln auf ein Blech legen.","45–55 Minuten backen, Kartoffeln nach 25 Minuten wenden. Hähnchen ist fertig, wenn es am Knochen durchgegart ist und der austretende Saft klar ist."]}'::jsonb, '["Hähnchen","Kartoffeln","Zwiebeln","Paprikapulver","Rosmarin","Rapsöl","Salz"]'::jsonb),
    ('Hühnchen mit Kartoffeln', '{"servings":2,"ingredients":[{"name":"Hähnchenbrust","amount":300,"unit":"g"},{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Karotten","amount":2,"unit":"Stück"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Hühnerbrühe","amount":250,"unit":"ml"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Thymian","amount":1,"unit":"TL"}],"steps":["Kartoffeln und Karotten schälen und in gleich große Stücke schneiden. Zwiebel würfeln, Hähnchen trocken tupfen und in Stücke schneiden.","Öl in einem breiten Topf erhitzen. Hähnchen rundum anbraten, Zwiebel zugeben und 3 Minuten mitbraten.","Kartoffeln, Karotten, Brühe und Thymian zugeben. Zugedeckt 20–25 Minuten sanft köcheln, bis Gemüse weich und Hähnchen vollständig durchgegart ist. Abschmecken."]}'::jsonb, '["Hähnchen","Kartoffeln","Karotten","Zwiebeln","Hühnerbrühe","Rapsöl","Thymian"]'::jsonb),
    ('Hühnchen-Wraps', '{"servings":2,"ingredients":[{"name":"Tortilla-Wraps","amount":4,"unit":"Stück"},{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Salat","amount":4,"unit":"Blätter"},{"name":"Tomaten","amount":1,"unit":"Stück"},{"name":"Joghurt","amount":100,"unit":"g"},{"name":"Gurke","amount":0.5,"unit":"Stück"},{"name":"Paprikapulver","amount":1,"unit":"TL"},{"name":"Rapsöl","amount":1,"unit":"EL"}],"steps":["Hähnchen in Streifen schneiden und mit Paprikapulver würzen. Öl in einer Pfanne erhitzen und die Streifen 6–8 Minuten vollständig durchbraten.","Gurke raspeln und mit Joghurt verrühren, mit Salz und Pfeffer abschmecken. Salat waschen und Tomate würfeln.","Wraps nach Packungsangabe erwärmen. Mit Joghurtsauce, Salat, Tomate und Hähnchen belegen, Seiten einschlagen und eng aufrollen."]}'::jsonb, '["Tortilla-Wraps","Hähnchen","Salat","Tomaten","Joghurt","Gurken","Paprikapulver","Rapsöl"]'::jsonb),
    ('Hühnerfrikassee mit Reis', '{"servings":2,"ingredients":[{"name":"Hähnchenbrust","amount":300,"unit":"g"},{"name":"Reis","amount":150,"unit":"g"},{"name":"Erbsen","amount":100,"unit":"g"},{"name":"Karotten","amount":2,"unit":"Stück"},{"name":"Champignons","amount":100,"unit":"g"},{"name":"Hühnerbrühe","amount":400,"unit":"ml"},{"name":"Sahne","amount":100,"unit":"ml"},{"name":"Butter","amount":20,"unit":"g"},{"name":"Weizenmehl","amount":1,"unit":"EL"}],"steps":["Reis nach Packungsangabe garen. Hähnchen in Würfel, Karotten in Scheiben und Champignons in Viertel schneiden.","Hähnchen in der Brühe bei kleiner Hitze 12–15 Minuten gar ziehen lassen. Herausnehmen. Karotten und Champignons in derselben Brühe 8 Minuten kochen, Erbsen zum Schluss 3 Minuten zugeben.","Butter in einem zweiten Topf schmelzen, Mehl einrühren und portionsweise Brühe zu einer glatten Sauce einrühren. Sahne zugeben, Gemüse und Hähnchen einlegen und 3 Minuten erhitzen. Mit Reis servieren."]}'::jsonb, '["Hähnchen","Reis","Erbsen","Karotten","Champignons","Hühnerbrühe","Sahne","Butter","Weizenmehl"]'::jsonb),
    ('Kartoffelgratin', '{"servings":2,"ingredients":[{"name":"Kartoffeln","amount":600,"unit":"g"},{"name":"Sahne","amount":200,"unit":"ml"},{"name":"Käse","amount":100,"unit":"g","note":"gerieben"},{"name":"Knoblauch","amount":1,"unit":"Zehe"},{"name":"Muskatnuss","amount":1,"unit":"Prise"},{"name":"Butter","amount":1,"unit":"TL"},{"name":"Salz und Pfeffer","amount":null,"unit":"","note":"nach Geschmack"}],"steps":["Backofen auf 190 °C Ober-/Unterhitze vorheizen. Auflaufform mit Butter ausstreichen. Kartoffeln schälen und in dünne Scheiben schneiden.","Sahne mit fein geriebenem Knoblauch, Muskat, Salz und Pfeffer verrühren. Kartoffeln dachziegelartig in die Form schichten und Sahne darübergeben.","Mit Käse bestreuen und 45–55 Minuten backen, bis die Kartoffeln weich und die Oberfläche goldbraun ist. Vor dem Servieren 5 Minuten ruhen lassen."]}'::jsonb, '["Kartoffeln","Sahne","Käse","Knoblauch","Muskatnuss","Butter","Salz und Pfeffer"]'::jsonb),
    ('Kartoffelpuffer mit Apfelmus', '{"servings":2,"ingredients":[{"name":"Kartoffeln","amount":500,"unit":"g"},{"name":"Eier","amount":1,"unit":"Stück"},{"name":"Weizenmehl","amount":2,"unit":"EL"},{"name":"Zwiebeln","amount":0.5,"unit":"Stück"},{"name":"Sonnenblumenöl","amount":4,"unit":"EL"},{"name":"Apfelmus","amount":200,"unit":"g"},{"name":"Salz","amount":1,"unit":"Prise"}],"steps":["Kartoffeln und Zwiebel fein reiben. In ein sauberes Tuch geben und möglichst viel Flüssigkeit ausdrücken.","Mit Ei, Mehl und Salz vermischen. Öl portionsweise in einer Pfanne erhitzen und kleine flache Puffer hineingeben.","Bei mittlerer Hitze je Seite 3–4 Minuten goldbraun und knusprig braten. Auf Küchenpapier abtropfen lassen und mit Apfelmus servieren."]}'::jsonb, '["Kartoffeln","Eier","Weizenmehl","Zwiebeln","Sonnenblumenöl","Apfelmus","Salz"]'::jsonb),
    ('Linsensuppe', '{"servings":2,"ingredients":[{"name":"Linsen","amount":180,"unit":"g","note":"Tellerlinsen"},{"name":"Kartoffeln","amount":200,"unit":"g"},{"name":"Karotten","amount":1,"unit":"Stück"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Gemüsebrühe","amount":700,"unit":"ml"},{"name":"Tomatenmark","amount":1,"unit":"EL"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Lorbeerblatt","amount":1,"unit":"Stück"},{"name":"Essig","amount":1,"unit":"EL"}],"steps":["Linsen abspülen. Kartoffeln und Karotte würfeln, Zwiebel fein hacken.","Öl in einem Topf erhitzen und Zwiebel 3 Minuten anschwitzen. Tomatenmark einrühren, Linsen, Gemüse, Brühe und Lorbeer zugeben.","Aufkochen und zugedeckt 30–35 Minuten sanft köcheln, bis die Linsen weich sind. Lorbeer entfernen, Essig einrühren und mit Salz und Pfeffer abschmecken."]}'::jsonb, '["Linsen","Kartoffeln","Karotten","Zwiebeln","Gemüsebrühe","Tomatenmark","Rapsöl","Lorbeerblatt","Essig"]'::jsonb),
    ('Miso-Ramen mit Hähnchen', '{"servings":2,"ingredients":[{"name":"Ramen-Nudeln","amount":180,"unit":"g"},{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Hühnerbrühe","amount":700,"unit":"ml"},{"name":"Misopaste","amount":2,"unit":"EL"},{"name":"Eier","amount":2,"unit":"Stück"},{"name":"Shiitake","amount":100,"unit":"g"},{"name":"Frühlingszwiebeln","amount":2,"unit":"Stück"},{"name":"Sojasauce","amount":1,"unit":"EL"}],"steps":["Eier 7 Minuten kochen, kalt abschrecken und schälen. Brühe erhitzen. Hähnchen in dünne Streifen und Shiitake in Scheiben schneiden.","Hähnchen in der Brühe bei kleiner Hitze 8–10 Minuten vollständig gar ziehen lassen. Shiitake zugeben und 5 Minuten köcheln.","Nudeln nach Packungsangabe kochen und auf Schalen verteilen. Miso und Sojasauce in die heiße Brühe rühren, nicht mehr sprudelnd kochen. Brühe und Einlagen über die Nudeln geben, mit Ei und Frühlingszwiebeln servieren."]}'::jsonb, '["Ramen-Nudeln","Hähnchen","Hühnerbrühe","Misopaste","Eier","Shiitake","Frühlingszwiebeln","Sojasauce"]'::jsonb),
    ('Nudeln mit Fleisch und Gemüse', '{"servings":2,"ingredients":[{"name":"Pasta","amount":180,"unit":"g"},{"name":"Rinderhackfleisch","amount":250,"unit":"g"},{"name":"Zucchini","amount":1,"unit":"Stück"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Passierte Tomaten","amount":250,"unit":"g"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Italienische Kräuter","amount":1,"unit":"TL"}],"steps":["Nudeln in Salzwasser nach Packungsangabe bissfest kochen. Zucchini und Paprika würfeln, Zwiebel fein hacken.","Öl in einer großen Pfanne erhitzen. Hackfleisch krümelig und vollständig braun braten. Zwiebel, Zucchini und Paprika zugeben und 5 Minuten anbraten.","Passierte Tomaten und Kräuter einrühren und 10 Minuten köcheln lassen. Mit Salz und Pfeffer abschmecken und mit den Nudeln servieren."]}'::jsonb, '["Pasta","Rindfleisch","Zucchini","Paprika","Passierte Tomaten","Zwiebeln","Rapsöl","Italienische Kräuter"]'::jsonb),
    ('Nudelsuppe mit Würstchen', '{"servings":2,"ingredients":[{"name":"Suppennudeln","amount":100,"unit":"g"},{"name":"Würstchen","amount":3,"unit":"Stück"},{"name":"Karotten","amount":2,"unit":"Stück"},{"name":"Sellerie","amount":80,"unit":"g"},{"name":"Lauch","amount":0.5,"unit":"Stange"},{"name":"Gemüsebrühe","amount":800,"unit":"ml"},{"name":"Petersilie","amount":1,"unit":"EL"}],"steps":["Karotten und Sellerie würfeln, Lauch in Ringe schneiden. Brühe in einem Topf aufkochen.","Gemüse zugeben und 10 Minuten sanft kochen. Nudeln einrühren und nach Packungszeit garen.","Würstchen in Scheiben schneiden und in den letzten 4 Minuten in der Suppe erhitzen. Mit Petersilie bestreuen und abschmecken."]}'::jsonb, '["Suppennudeln","Würstchen","Karotten","Sellerie","Lauch","Gemüsebrühe","Petersilie"]'::jsonb),
    ('Ofenkartoffel mit Quark', '{"servings":2,"ingredients":[{"name":"Kartoffeln","amount":2,"unit":"Stück","note":"groß, je etwa 300 g"},{"name":"Magerquark","amount":200,"unit":"g"},{"name":"Joghurt","amount":2,"unit":"EL"},{"name":"Gurke","amount":0.5,"unit":"Stück"},{"name":"Schnittlauch","amount":10,"unit":"g"},{"name":"Zitrone","amount":1,"unit":"TL","note":"Saft"},{"name":"Rapsöl","amount":1,"unit":"TL"}],"steps":["Backofen auf 200 °C Ober-/Unterhitze vorheizen. Kartoffeln gründlich waschen, trocken reiben und rundum mit einer Gabel einstechen. Dünn mit Öl einreiben.","Kartoffeln auf dem Rost 55–65 Minuten backen, bis ein Messer leicht hineingleitet. Quark und Joghurt glatt rühren.","Gurke fein würfeln, Schnittlauch schneiden und beides mit Zitronensaft unter den Quark rühren. Abschmecken, Kartoffeln längs öffnen und mit Kräuterquark servieren."]}'::jsonb, '["Kartoffeln","Magerquark","Joghurt","Gurken","Schnittlauch","Zitronen","Rapsöl"]'::jsonb),
    ('Pad Thai mit Hähnchen', '{"servings":2,"ingredients":[{"name":"Reisnudeln","amount":180,"unit":"g"},{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Eier","amount":2,"unit":"Stück"},{"name":"Mungobohnensprossen","amount":100,"unit":"g"},{"name":"Erdnüsse","amount":30,"unit":"g"},{"name":"Limette","amount":1,"unit":"Stück"},{"name":"Sojasauce","amount":2,"unit":"EL"},{"name":"Fischsauce","amount":1,"unit":"EL"},{"name":"Rapsöl","amount":1,"unit":"EL"}],"steps":["Reisnudeln nach Packungsangabe einweichen oder garen und abtropfen lassen. Hähnchen in Streifen schneiden, Erdnüsse grob hacken.","Öl in einer großen Pfanne erhitzen und Hähnchen 6–8 Minuten vollständig durchbraten. An den Rand schieben, Eier in die Pfanne geben und stocken lassen.","Nudeln, Soja- und Fischsauce zugeben und 2–3 Minuten schwenken. Sprossen kurz unterheben. Mit gehackten Erdnüssen und Limettenspalten servieren."]}'::jsonb, '["Reisnudeln","Hähnchen","Eier","Mungobohnensprossen","Erdnüsse","Limetten","Sojasauce","Fischsauce","Rapsöl"]'::jsonb),
    ('Pelmeni (russische Teigtaschen)', '{"servings":2,"ingredients":[{"name":"Pelmeni","amount":400,"unit":"g","note":"tiefgekühlt oder frisch"},{"name":"Sauerrahm","amount":100,"unit":"g"},{"name":"Butter","amount":20,"unit":"g"},{"name":"Dill","amount":1,"unit":"EL"},{"name":"Salz","amount":1,"unit":"TL"},{"name":"Schwarze Pfefferkörner","amount":4,"unit":"Stück"}],"steps":["Einen großen Topf mit Wasser und Salz zum Kochen bringen. Pfefferkörner zugeben.","Pelmeni ins siedende Wasser geben und vorsichtig umrühren. Sobald sie aufsteigen, nach Packungsangabe noch 4–6 Minuten garen; tiefgekühlte Ware vollständig durchgaren.","Pelmeni mit einer Schaumkelle herausheben, abtropfen lassen und mit Butter schwenken. Mit Sauerrahm und Dill servieren."]}'::jsonb, '["Pelmeni","Sauerrahm","Butter","Dill","Salz","Schwarze Pfefferkörner"]'::jsonb),
    ('Pizza Prosciutto e funghi', '{"servings":2,"ingredients":[{"name":"Pizzateig","amount":1,"unit":"Stück","note":"etwa 400 g"},{"name":"Passierte Tomaten","amount":100,"unit":"g"},{"name":"Mozzarella","amount":125,"unit":"g"},{"name":"Prosciutto","amount":80,"unit":"g"},{"name":"Champignons","amount":100,"unit":"g"},{"name":"Oregano","amount":1,"unit":"TL"},{"name":"Olivenöl","amount":1,"unit":"TL"}],"steps":["Backofen mit Blech oder Pizzastein auf 240 °C Ober-/Unterhitze vorheizen. Champignons in Scheiben schneiden und Mozzarella abtropfen lassen.","Teig auf Backpapier dünn ausrollen. Passierte Tomaten darauf verstreichen und mit Oregano würzen. Mozzarella und Champignons verteilen.","Pizza 10–14 Minuten auf dem heißen Blech backen, bis der Rand gebräunt ist. Prosciutto nach dem Backen darauf verteilen und mit wenig Olivenöl beträufeln."]}'::jsonb, '["Pizzateig","Passierte Tomaten","Käse","Schweinefleisch","Champignons","Oregano","Olivenöl"]'::jsonb),
    ('Plov mit Hühnchen', '{"servings":2,"ingredients":[{"name":"Hähnchenbrust","amount":300,"unit":"g"},{"name":"Langkornreis","amount":180,"unit":"g"},{"name":"Karotten","amount":2,"unit":"Stück"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Hühnerbrühe","amount":350,"unit":"ml"},{"name":"Rapsöl","amount":2,"unit":"EL"},{"name":"Kreuzkümmel","amount":1,"unit":"TL"},{"name":"Knoblauch","amount":2,"unit":"Zehen"}],"steps":["Reis in kaltem Wasser spülen, bis das Wasser klar bleibt. Hähnchen würfeln, Karotten in Stifte und Zwiebel in Streifen schneiden.","Öl in einem schweren Topf erhitzen. Hähnchen rundum anbraten, Zwiebel und Karotten zugeben und 5 Minuten braten. Kreuzkümmel und Knoblauch einrühren.","Reis gleichmäßig darauf verteilen und Brühe angießen, nicht umrühren. Aufkochen, zugedeckt bei kleinster Hitze 18 Minuten garen und anschließend 10 Minuten ruhen lassen. Vor dem Servieren lockern."]}'::jsonb, '["Hähnchen","Langkornreis","Karotten","Zwiebeln","Hühnerbrühe","Rapsöl","Kreuzkümmel","Knoblauch"]'::jsonb),
    ('Pommes und Chicken Nuggets', '{"servings":2,"ingredients":[{"name":"Pommes","amount":400,"unit":"g"},{"name":"Chicken Nuggets","amount":300,"unit":"g"},{"name":"Rapsöl","amount":1,"unit":"TL","note":"nur falls laut Packung nötig"},{"name":"Ketchup","amount":50,"unit":"g"}],"steps":["Backofen auf die auf den Packungen angegebene Temperatur vorheizen. Pommes auf einem Blech verteilen und gemäß Packung backen.","Nuggets nach Packungsangabe auf einem zweiten Blech oder nach der Hälfte der Pommes-Backzeit mit in den Ofen geben. Die Produkte vollständig durcherhitzen.","Pommes einmal wenden und alles goldbraun backen. Mit Ketchup servieren."]}'::jsonb, '["Pommes","Hähnchen","Rapsöl","Ketchup"]'::jsonb),
    ('Reis mit Hühnchen und Gemüse', '{"servings":2,"ingredients":[{"name":"Reis","amount":150,"unit":"g"},{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Brokkoli","amount":150,"unit":"g"},{"name":"Karotten","amount":1,"unit":"Stück"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Hühnerbrühe","amount":250,"unit":"ml"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Sojasauce","amount":1,"unit":"EL"}],"steps":["Reis nach Packungsangabe garen. Hähnchen würfeln und Gemüse in mundgerechte Stücke schneiden.","Öl in einer großen Pfanne erhitzen und Hähnchen 6–8 Minuten vollständig durchbraten. Herausnehmen. Gemüse in die Pfanne geben und 5 Minuten anbraten.","Brühe und Sojasauce angießen, Hähnchen zurückgeben und zugedeckt 4–5 Minuten garen, bis das Gemüse bissfest und heiß ist. Mit Reis servieren."]}'::jsonb, '["Reis","Hähnchen","Brokkoli","Karotten","Paprika","Hühnerbrühe","Rapsöl","Sojasauce"]'::jsonb),
    ('Reis-Bowl mit Salat', '{"servings":2,"ingredients":[{"name":"Reis","amount":150,"unit":"g"},{"name":"Salat","amount":100,"unit":"g"},{"name":"Gurke","amount":0.5,"unit":"Stück"},{"name":"Tomaten","amount":1,"unit":"Stück"},{"name":"Avocado","amount":1,"unit":"Stück"},{"name":"Mais","amount":100,"unit":"g"},{"name":"Joghurt","amount":80,"unit":"g"},{"name":"Zitrone","amount":1,"unit":"EL","note":"Saft"}],"steps":["Reis nach Packungsangabe garen und auf zwei Schalen verteilen. Mais abtropfen lassen.","Salat waschen, Gurke und Tomate würfeln. Avocado halbieren, Kern entfernen und das Fruchtfleisch in Scheiben schneiden.","Joghurt mit Zitronensaft, Salz und Pfeffer verrühren. Gemüse auf dem Reis anrichten und mit dem Dressing servieren."]}'::jsonb, '["Reis","Salat","Gurken","Tomaten","Avocados","Mais","Joghurt","Zitronen"]'::jsonb),
    ('Rotes Thai-Curry mit Hähnchen und Reis', '{"servings":2,"ingredients":[{"name":"Hähnchenbrust","amount":250,"unit":"g"},{"name":"Reis","amount":150,"unit":"g"},{"name":"Kokosmilch","amount":400,"unit":"ml"},{"name":"Rote Currypaste","amount":1,"unit":"EL"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Zucchini","amount":1,"unit":"Stück"},{"name":"Rapsöl","amount":1,"unit":"TL"},{"name":"Limette","amount":0.5,"unit":"Stück"}],"steps":["Reis nach Packungsangabe garen. Hähnchen in Streifen und Gemüse in mundgerechte Stücke schneiden.","Öl in einem Topf erhitzen und Currypaste 1 Minute anrösten. Hähnchen zugeben und unter Rühren 5 Minuten anbraten.","Kokosmilch und Gemüse einrühren. 12–15 Minuten sanft köcheln lassen, bis Hähnchen durchgegart und Gemüse weich ist. Mit Limettensaft abschmecken und mit Reis servieren."]}'::jsonb, '["Hähnchen","Reis","Kokosmilch","Rote Currypaste","Paprika","Zucchini","Rapsöl","Limetten"]'::jsonb),
    ('Schnitzel mit Pommes', '{"servings":2,"ingredients":[{"name":"Schweineschnitzel","amount":2,"unit":"Stück","note":"je etwa 150 g"},{"name":"Pommes","amount":400,"unit":"g"},{"name":"Eier","amount":1,"unit":"Stück"},{"name":"Paniermehl","amount":80,"unit":"g"},{"name":"Weizenmehl","amount":50,"unit":"g"},{"name":"Sonnenblumenöl","amount":100,"unit":"ml"},{"name":"Zitrone","amount":0.5,"unit":"Stück"}],"steps":["Pommes nach Packungsangabe im vorgeheizten Ofen backen. Schnitzel zwischen Folie flach klopfen.","Mehl auf einen Teller geben, Ei verquirlen und Paniermehl auf einen dritten Teller streuen. Schnitzel nacheinander in Mehl, Ei und Paniermehl wenden.","Öl etwa fingerdick in einer Pfanne erhitzen. Schnitzel je Seite 3–4 Minuten goldbraun ausbacken und auf Küchenpapier abtropfen lassen. Mit Pommes und Zitrone servieren."]}'::jsonb, '["Schweinefleisch","Pommes","Eier","Paniermehl","Weizenmehl","Sonnenblumenöl","Zitronen"]'::jsonb),
    ('Schweinebraten mit Semmelknödeln', '{"servings":2,"ingredients":[{"name":"Schweinebraten","amount":600,"unit":"g"},{"name":"Semmelknödel","amount":4,"unit":"Stück"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Karotten","amount":2,"unit":"Stück"},{"name":"Gemüsebrühe","amount":400,"unit":"ml"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Senf","amount":1,"unit":"EL"},{"name":"Kümmel","amount":1,"unit":"TL"}],"steps":["Backofen auf 170 °C Ober-/Unterhitze vorheizen. Braten trocken tupfen, mit Salz, Pfeffer, Senf und Kümmel einreiben. Zwiebel und Karotten grob schneiden.","Öl in einem ofenfesten Topf erhitzen und den Braten rundum anbraten. Gemüse zugeben, Brühe angießen und zugedeckt in den Ofen stellen.","Etwa 100–120 Minuten schmoren, gelegentlich wenden und bei Bedarf Brühe nachgießen. Knödel nach Packungsangabe garen. Braten vor dem Aufschneiden 10 Minuten ruhen lassen und mit Gemüse und Sauce servieren."]}'::jsonb, '["Schweinefleisch","Semmelknödel","Zwiebeln","Karotten","Gemüsebrühe","Rapsöl","Senf","Kümmel"]'::jsonb),
    ('Spaghetti Bolognese', '{"servings":2,"ingredients":[{"name":"Spaghetti","amount":180,"unit":"g"},{"name":"Rinderhackfleisch","amount":250,"unit":"g"},{"name":"Passierte Tomaten","amount":300,"unit":"g"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Karotten","amount":1,"unit":"Stück"},{"name":"Tomatenmark","amount":1,"unit":"EL"},{"name":"Olivenöl","amount":1,"unit":"EL"},{"name":"Parmesan","amount":30,"unit":"g"}],"steps":["Zwiebel und Karotte fein würfeln. Spaghetti in reichlich Salzwasser nach Packungsangabe bissfest kochen.","Olivenöl in einem Topf erhitzen. Hackfleisch krümelig und vollständig braun braten. Gemüse und Tomatenmark zugeben und 4 Minuten anbraten.","Passierte Tomaten einrühren und die Sauce 15–20 Minuten sanft köcheln lassen. Abschmecken, mit Spaghetti anrichten und Parmesan darüberreiben."]}'::jsonb, '["Spaghetti","Rindfleisch","Passierte Tomaten","Zwiebeln","Karotten","Tomatenmark","Olivenöl","Käse"]'::jsonb),
    ('Teriyaki-Lachs mit Reis', '{"servings":2,"ingredients":[{"name":"Lachsfilet","amount":300,"unit":"g"},{"name":"Reis","amount":150,"unit":"g"},{"name":"Sojasauce","amount":3,"unit":"EL"},{"name":"Honig","amount":1,"unit":"EL"},{"name":"Ingwer","amount":10,"unit":"g"},{"name":"Sesam","amount":1,"unit":"EL"},{"name":"Rapsöl","amount":1,"unit":"TL"},{"name":"Brokkoli","amount":150,"unit":"g"}],"steps":["Reis nach Packungsangabe garen. Brokkoli in Röschen teilen und 5–6 Minuten dämpfen oder in wenig Wasser bissfest kochen.","Sojasauce, Honig und fein geriebenen Ingwer verrühren. Lachs trocken tupfen. Öl in einer Pfanne erhitzen und den Lachs je Seite 3–4 Minuten braten.","Sauce in die Pfanne geben und den Lachs 1–2 Minuten darin glasieren, dabei wenden. Mit Sesam bestreuen und mit Reis und Brokkoli servieren."]}'::jsonb, '["Lachsfilet","Reis","Sojasauce","Honig","Ingwer","Sesam","Rapsöl","Brokkoli"]'::jsonb),
    ('Thunfisch-Nudeln', '{"servings":2,"ingredients":[{"name":"Pasta","amount":180,"unit":"g"},{"name":"Thunfisch","amount":1,"unit":"Dose","note":"im eigenen Saft, abgetropft"},{"name":"Passierte Tomaten","amount":250,"unit":"g"},{"name":"Zwiebeln","amount":1,"unit":"Stück"},{"name":"Kapern","amount":1,"unit":"EL"},{"name":"Olivenöl","amount":1,"unit":"EL"},{"name":"Oregano","amount":1,"unit":"TL"}],"steps":["Nudeln in Salzwasser nach Packungsangabe bissfest kochen. Zwiebel fein würfeln und Thunfisch abtropfen lassen.","Olivenöl in einer Pfanne erhitzen und Zwiebel 3 Minuten anschwitzen. Passierte Tomaten und Oregano einrühren und 8 Minuten köcheln.","Thunfisch und Kapern vorsichtig unterheben und 2 Minuten erhitzen. Mit Salz und Pfeffer abschmecken und mit den Nudeln servieren."]}'::jsonb, '["Pasta","Thunfisch","Passierte Tomaten","Zwiebeln","Kapern","Olivenöl","Oregano"]'::jsonb),
    ('Tofu-Curry mit Reis', '{"servings":2,"ingredients":[{"name":"Tofu","amount":250,"unit":"g","note":"fest"},{"name":"Reis","amount":150,"unit":"g"},{"name":"Kokosmilch","amount":400,"unit":"ml"},{"name":"Rote Currypaste","amount":1,"unit":"EL"},{"name":"Brokkoli","amount":150,"unit":"g"},{"name":"Paprika","amount":1,"unit":"Stück"},{"name":"Rapsöl","amount":1,"unit":"EL"},{"name":"Limette","amount":0.5,"unit":"Stück"}],"steps":["Reis nach Packungsangabe garen. Tofu trocken pressen und würfeln, Brokkoli in Röschen und Paprika in Streifen schneiden.","Öl in einem Topf erhitzen. Tofu rundum 5–6 Minuten goldbraun braten. Currypaste einrühren und 1 Minute anrösten.","Kokosmilch und Gemüse zugeben und 10–12 Minuten sanft köcheln, bis Brokkoli gar, aber noch bissfest ist. Mit Limettensaft abschmecken und mit Reis servieren."]}'::jsonb, '["Tofu","Reis","Kokosmilch","Rote Currypaste","Brokkoli","Paprika","Rapsöl","Limetten"]'::jsonb)
)
update public.catalog_dishes d set
  recipe = seed.recipe,
  ingredients = seed.shopping_ingredients,
  updated_at = now()
from recipe_seed seed
where d.name = seed.name and d.recipe is null;

-- Nur exakte, eindeutige persönliche Kopien erhalten Herkunft und die neue
-- Rezeptbasis. Veränderte, doppelte oder nicht passende Gerichte bleiben unangetastet.
with exact_copies as (
  select d.id as dish_id, d.household_id, b.id as catalog_id,
    count(*) over (partition by d.household_id, b.id) as matches
  from public.dishes d
  join wochentisch_private.catalog_migration_baseline b
    on d.normalized_name = b.normalized_name
   and d.name = b.name
   and d.ingredient is not distinct from b.ingredient
   and d.cooking_time_minutes is not distinct from b.cooking_time_minutes
   and d.emoji is not distinct from b.emoji
   and d.ingredients is not distinct from b.ingredients
   and d.nutrition is not distinct from b.nutrition
  where d.recipe is null and d.catalog_source_id is null
), unambiguous as (
  select * from exact_copies where matches = 1
)
update public.dishes d set
  recipe = c.recipe,
  ingredients = c.ingredients,
  catalog_source_id = c.id,
  catalog_source_version = c.version,
  updated_at = now()
from unambiguous u
join public.catalog_dishes c on c.id = u.catalog_id
where d.id = u.dish_id and c.recipe is not null;

drop table wochentisch_private.catalog_migration_baseline;

-- Haushalts-Sync v2 transportiert recipe- und Herkunftsfelder; Requests bleiben
-- über ihre gespeicherte API-Version idempotent und alte v1-RPCs bleiben aktiv.
-- Draft internal implementation of a sync transaction. Not a migration.
-- The eventual public, security-definer RPC must validate its JSON contract and
-- invoke this function with its own fixed search path and explicit EXECUTE grant.
create or replace function wochentisch_private.sync_transaction_v2(
  p_household_id uuid, p_request_id uuid, p_base jsonb, p_local jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  payload jsonb := jsonb_build_object('base', p_base, 'local', p_local);
  cached jsonb;
  remote_state jsonb;
  merged jsonb;
  candidate jsonb;
  changed boolean;
begin
  if jsonb_typeof(p_base) is distinct from 'object' or jsonb_typeof(p_local) is distinct from 'object' then
    raise exception 'base and local states are required' using errcode = '22023';
  end if;
  perform wochentisch_private.validate_household_recipes(p_base);
  perform wochentisch_private.validate_household_recipes(p_local);
  cached := wochentisch_sync.begin_request(p_household_id, p_request_id, 'sync_household_v2', payload);
  if cached is not null then return cached; end if;
  remote_state := wochentisch_private.cloud_state_v2(p_household_id);
  merged := wochentisch_sync.merge_units(
    wochentisch_sync.state_units(p_base), wochentisch_sync.state_units(p_local), wochentisch_sync.state_units(remote_state));
  merged := wochentisch_sync.guard_dangling(merged, p_base, p_local, remote_state);
  candidate := wochentisch_sync.units_state(merged -> 'units', jsonb_build_array(p_base, p_local, remote_state));
  perform wochentisch_private.validate_household_recipes(candidate);
  changed := wochentisch_sync.state_units(candidate) is distinct from wochentisch_sync.state_units(remote_state)
    or coalesce(candidate -> 'plans', '{}'::jsonb) is distinct from coalesce(remote_state -> 'plans', '{}'::jsonb);
  if changed then
    perform wochentisch_private.write_state_v2(p_household_id, candidate);
    remote_state := wochentisch_private.cloud_state_v2(p_household_id);
  end if;
  return wochentisch_sync.finish_request(p_household_id, p_request_id, 'sync_household_v2', payload,
    jsonb_build_object('state', remote_state, 'conflicts', merged -> 'conflicts'), changed);
end;
$function$;
revoke all on function wochentisch_private.sync_transaction_v2(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
-- Draft internal conflict resolution transaction. Not a migration or public RPC.
create or replace function wochentisch_private.resolve_transaction_v2(
  p_household_id uuid, p_request_id uuid, p_conflict jsonb, p_choice text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  payload jsonb := jsonb_build_object('conflict', p_conflict, 'choice', p_choice);
  cached jsonb;
  remote_state jsonb;
  remote_units jsonb;
  desired_units jsonb;
  desired_state jsonb;
  checked_units jsonb;
  guarded jsonb;
  actual jsonb;
  unit_id text;
  expected_present boolean;
  selected_present boolean;
  changed boolean;
  conflicts jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_conflict) is distinct from 'object' or p_choice not in ('local', 'remote') or p_choice is null
    or jsonb_typeof(p_conflict -> 'key') is distinct from 'array'
    or jsonb_typeof(p_conflict -> 'kind') is distinct from 'string'
    or jsonb_typeof(p_conflict -> 'localPresent') is distinct from 'boolean'
    or jsonb_typeof(p_conflict -> 'remotePresent') is distinct from 'boolean' then
    raise exception 'invalid conflict decision' using errcode = '22023';
  end if;
  if p_conflict ->> 'kind' not in ('dish', 'plan-day', 'pantry', 'rest-days', 'quantity', 'shopping-check', 'hidden-item', 'manual-item')
    or ((p_conflict ->> 'localPresent')::boolean and not p_conflict ? 'localValue')
    or ((p_conflict ->> 'remotePresent')::boolean and not p_conflict ? 'remoteValue') then
    raise exception 'invalid conflict value' using errcode = '22023';
  end if;
  unit_id := (p_conflict ->> 'kind') || ':' || (p_conflict -> 'key')::text;
  -- Older PWA conflicts have a different ID format. Their kind and key are
  -- sufficient to derive the server ID; if an ID is supplied, validate it.
  if p_conflict ? 'id' and p_conflict ->> 'id' is distinct from unit_id then raise exception 'invalid conflict id' using errcode = '22023'; end if;
  cached := wochentisch_sync.begin_request(p_household_id, p_request_id, 'resolve_household_conflict_v2', payload);
  if cached is not null then return cached; end if;
  remote_state := wochentisch_private.cloud_state_v2(p_household_id);
  remote_units := wochentisch_sync.state_units(remote_state);
  actual := remote_units -> unit_id;
  expected_present := (p_conflict ->> 'remotePresent')::boolean;
  if (remote_units ? unit_id) is distinct from expected_present
      or (expected_present and actual -> 'value' is distinct from p_conflict -> 'remoteValue') then
    conflicts := jsonb_build_array(p_conflict || jsonb_build_object(
      'id', unit_id, 'remotePresent', remote_units ? unit_id, 'remoteValue', actual -> 'value'));
    return wochentisch_sync.finish_request(p_household_id, p_request_id, 'resolve_household_conflict_v2', payload,
      jsonb_build_object('state', remote_state, 'conflicts', conflicts), false);
  end if;
  desired_units := remote_units;
  selected_present := (p_conflict ->> case when p_choice = 'local' then 'localPresent' else 'remotePresent' end)::boolean;
  if selected_present then
    desired_units := jsonb_set(desired_units, array[unit_id], jsonb_build_object(
      'kind', p_conflict -> 'kind', 'key', p_conflict -> 'key', 'label', p_conflict -> 'label',
      'value', p_conflict -> case when p_choice = 'local' then 'localValue' else 'remoteValue' end), true);
  else
    desired_units := desired_units - unit_id;
  end if;
  desired_state := wochentisch_sync.units_state(desired_units, jsonb_build_array(remote_state));
  perform wochentisch_private.validate_household_recipes(desired_state);
  checked_units := wochentisch_sync.state_units(desired_state);
  if (checked_units ? unit_id) is distinct from selected_present or
    (selected_present and checked_units -> unit_id -> 'value' is distinct from desired_units -> unit_id -> 'value') then
    raise exception 'conflict value does not match its unit' using errcode = '22023';
  end if;
  guarded := wochentisch_sync.guard_dangling(jsonb_build_object('units', desired_units, 'conflicts', conflicts),
    remote_state, desired_state, remote_state);
  desired_state := wochentisch_sync.units_state(guarded -> 'units', jsonb_build_array(remote_state));
  changed := wochentisch_sync.state_units(desired_state) is distinct from remote_units;
  if changed then
    perform wochentisch_private.write_state_v2(p_household_id, desired_state);
    remote_state := wochentisch_private.cloud_state_v2(p_household_id);
  end if;
  return wochentisch_sync.finish_request(p_household_id, p_request_id, 'resolve_household_conflict_v2', payload,
    jsonb_build_object('state', remote_state, 'conflicts', guarded -> 'conflicts'), changed);
end;
$function$;
revoke all on function wochentisch_private.resolve_transaction_v2(uuid, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.sync_household_v2(
  p_household_id uuid, p_request_id uuid, p_base jsonb, p_local jsonb
) returns jsonb
language sql security definer set search_path = ''
as $function$ select wochentisch_private.sync_transaction_v2(p_household_id, p_request_id, p_base, p_local); $function$;

create or replace function public.resolve_household_conflict_v2(
  p_household_id uuid, p_request_id uuid, p_conflict jsonb, p_choice text
) returns jsonb
language sql security definer set search_path = ''
as $function$ select wochentisch_private.resolve_transaction_v2(p_household_id, p_request_id, p_conflict, p_choice); $function$;

revoke all on function public.sync_household_v2(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_household_conflict_v2(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.sync_household_v2(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.resolve_household_conflict_v2(uuid, uuid, jsonb, text) to authenticated;
