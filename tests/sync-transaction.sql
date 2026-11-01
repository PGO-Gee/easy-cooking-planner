-- Run inside a rolled-back transaction with a fresh isolated test household.
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  request uuid := gen_random_uuid();
  dish_id uuid := gen_random_uuid();
  base jsonb := '{"dishes":[],"plans":{}}';
  local_state jsonb;
  other_state jsonb;
  response jsonb;
  replay jsonb;
  conflict jsonb;
  cloud_before jsonb;
begin
  local_state := jsonb_build_object('dishes',jsonb_build_array(jsonb_build_object(
    'id',dish_id,'name','Testgericht','ingredient','','time',30,'emoji','🍽️','ingredients','[]'::jsonb,'nutrition',null)), 'plans','{}'::jsonb);
  response := wochentisch_sync.sync_transaction(household, request, base, local_state);
  if response -> 'revision' <> '1'::jsonb or jsonb_array_length(response -> 'conflicts') <> 0 then raise exception 'initial sync failed: %', response; end if;
  replay := wochentisch_sync.sync_transaction(household, request, base, local_state);
  if replay <> response then raise exception 'retry returned different response'; end if;
  begin
    perform wochentisch_sync.sync_transaction(household, request, base, base);
    raise exception 'reused request id accepted changed input';
  exception when invalid_parameter_value then null;
  end;
  other_state := jsonb_set(local_state, '{dishes,0,name}', '"Anderer Name"');
  response := wochentisch_sync.sync_transaction(household, gen_random_uuid(), base, other_state);
  if jsonb_array_length(response -> 'conflicts') <> 1 then raise exception 'expected conflicting creation: %', response; end if;
  if response -> 'state' -> 'dishes' -> 0 ->> 'name' <> 'Testgericht' then raise exception 'cloud value lost: %', response; end if;
  if response -> 'revision' <> '1'::jsonb then raise exception 'unchanged cloud advanced revision: %', response; end if;
  conflict := response -> 'conflicts' -> 0;
  cloud_before := response -> 'state';
  response := wochentisch_sync.sync_transaction(household, gen_random_uuid(), cloud_before,
    jsonb_set(cloud_before, '{dishes,0,name}', '"Erneut geändert"'));
  if response -> 'revision' <> '2'::jsonb then raise exception 'cloud change failed: %', response; end if;
  -- Legacy conflicts have no server-formatted ID.
  response := wochentisch_sync.resolve_transaction(household, gen_random_uuid(), conflict - 'id', 'local');
  if jsonb_array_length(response -> 'conflicts') <> 1 or response -> 'conflicts' -> 0 -> 'remoteValue' ->> 'name' <> 'Erneut geändert' then
    raise exception 'stale decision did not return updated cloud version: %', response;
  end if;
  conflict := response -> 'conflicts' -> 0;
  if conflict ->> 'id' is null then raise exception 'server did not supply canonical conflict id'; end if;
  begin
    perform wochentisch_sync.resolve_transaction(household, gen_random_uuid(),
      jsonb_set(conflict, '{localValue,id}', to_jsonb(gen_random_uuid()::text)), 'local');
    raise exception 'conflict accepted a value for a different unit';
  exception when invalid_parameter_value then null;
  end;
  request := gen_random_uuid();
  response := wochentisch_sync.resolve_transaction(household, request, conflict, 'local');
  if response -> 'state' -> 'dishes' -> 0 ->> 'name' <> 'Anderer Name' or response -> 'revision' <> '3'::jsonb then
    raise exception 'conflict resolution was not applied: %', response;
  end if;
  if wochentisch_sync.resolve_transaction(household, request, conflict, 'local') <> response then
    raise exception 'resolution retry changed response';
  end if;
end;
$test$;
