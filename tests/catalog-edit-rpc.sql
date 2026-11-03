-- Run in a transaction as an authenticated user. Provide an existing catalog id through
-- wochentisch.test_catalog_dish and the user's subject in wochentisch.test_user.
begin;
select set_config('request.jwt.claim.sub', current_setting('wochentisch.test_user'), true);
set local role authenticated;
do $test$
declare
  catalog_id uuid := current_setting('wochentisch.test_catalog_dish')::uuid;
  original public.catalog_dishes%rowtype;
  result jsonb;
begin
  if has_function_privilege('anon','public.update_catalog_dish_v1(uuid,integer,jsonb)','execute') then
    raise exception 'anonymous role can execute catalog updates';
  end if;
  if public.catalog_edit_allowed_v1() is not true then raise exception 'authenticated starting mode did not allow catalog editing'; end if;
  select * into strict original from public.catalog_dishes where id=catalog_id;
  result := public.update_catalog_dish_v1(catalog_id,original.version,jsonb_build_object(
    'name',original.name,'ingredient',original.ingredient,'cooking_time_minutes',original.cooking_time_minutes,
    'emoji',original.emoji,'ingredients',original.ingredients,'nutrition',original.nutrition,'recipe',original.recipe
  ));
  if result ->> 'status' <> 'updated' or (result -> 'dish' ->> 'version')::integer <> original.version + 1 then
    raise exception 'catalog edit did not return a confirmed version: %', result;
  end if;
  result := public.update_catalog_dish_v1(catalog_id,original.version,jsonb_build_object(
    'name',original.name,'ingredient',original.ingredient,'cooking_time_minutes',original.cooking_time_minutes,
    'emoji',original.emoji,'ingredients',original.ingredients,'nutrition',original.nutrition,'recipe',original.recipe
  ));
  if result ->> 'status' <> 'version_conflict' or result -> 'current' ->> 'version' <> (original.version+1)::text then
    raise exception 'stale version did not return a conflict: %', result;
  end if;
  begin
    update public.catalog_dishes set name=name where id=catalog_id;
    raise exception 'authenticated user has direct catalog table write access';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
rollback;
