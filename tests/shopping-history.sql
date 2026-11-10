-- Run inside a rolled-back transaction with a fresh isolated test household.
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  actor uuid := current_setting('wochentisch.test_user')::uuid;
  reader uuid := current_setting('wochentisch.test_other_user')::uuid;
  request uuid := gen_random_uuid();
  week date := '2026-11-09';
  base jsonb := '{"dishes":[],"plans":{}}';
  response jsonb;
  desired jsonb := base || '{"manualShoppingItems":{"2026-11-09":["Milch","Eier"]}}';
  events jsonb;
begin
  response := public.sync_household_v2(household, request, base, desired);
  perform public.sync_household_v2(household, request, base, desired);
  base := response -> 'state';
  perform public.sync_household_v2(household, gen_random_uuid(), base,
    jsonb_set(base, '{manualShoppingItems,2026-11-09}', '["MILCH","Eier"]'));

  perform set_config('request.jwt.claim.sub', reader::text, true);
  begin
    perform public.read_shopping_history(household, array[week]);
    raise exception 'outsider could read shopping history';
  exception when insufficient_privilege then null;
  end;

  insert into public.household_members (household_id, user_id, role)
  values (household, reader, 'member');

  if exists (select 1 from public.read_shopping_history(household, array[week]) where actor_name is not null) then
    raise exception 'history exposed an account email without a display name';
  end if;
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"display_name":"  Anna  "}'::jsonb
  where id = actor;

  select jsonb_agg(to_jsonb(entry) - 'added_at') into events
  from public.read_shopping_history(household, array[week]) entry;
  if events is distinct from jsonb_build_array(jsonb_build_object(
    'actor_id', actor, 'actor_name', 'Anna',
    'items', array['Eier','Milch'])) then
    raise exception 'expected one attributed batch, got %', events;
  end if;
  if exists (select 1 from public.read_shopping_history(household, array[week + 7])) then
    raise exception 'history included a different week';
  end if;
end;
$test$;
