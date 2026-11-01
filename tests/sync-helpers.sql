-- Run against the internal sync helpers in an isolated test transaction.
-- The test uses synthetic JSON only and does not modify household data.
do $test$
declare
  base jsonb := '{"dishes":[{"id":"a","name":"Alt"}],"plans":{},"pinnedMeals":{},"shoppingQuantities":{"milch":"1"}}';
  local_state jsonb := '{"dishes":[{"id":"a","name":"Lokal"},{"id":"b","name":"B"}],"plans":{},"pinnedMeals":{},"shoppingQuantities":{"milch":"2","ei":"6"}}';
  cloud_state jsonb := '{"dishes":[{"id":"a","name":"Cloud"},{"id":"c","name":"C"}],"plans":{},"pinnedMeals":{},"shoppingQuantities":{"milch":"3","brot":"1"}}';
  merged jsonb;
  state jsonb;
  conflicts jsonb;
  old_state jsonb;
  local_plan jsonb;
  remote_plan jsonb;
begin
  merged := wochentisch_sync.merge_units(wochentisch_sync.state_units(base), wochentisch_sync.state_units(local_state), wochentisch_sync.state_units(cloud_state));
  state := wochentisch_sync.units_state(merged -> 'units', jsonb_build_array(base, local_state, cloud_state));
  conflicts := merged -> 'conflicts';
  if jsonb_array_length(conflicts) <> 2 then raise exception 'expected dish and quantity conflicts: %', conflicts; end if;
  if not exists (select 1 from jsonb_array_elements(conflicts) c where c ->> 'kind' = 'dish' and c -> 'localValue' ->> 'name' = 'Lokal' and c -> 'remoteValue' ->> 'name' = 'Cloud') then raise exception 'dish conflict versions missing: %', conflicts; end if;
  if state -> 'shoppingQuantities' <> '{"milch":"3","ei":"6","brot":"1"}'::jsonb then raise exception 'independent quantities missing: %', state; end if;
  if jsonb_array_length(state -> 'dishes') <> 3 then raise exception 'independent dishes missing: %', state; end if;

  merged := wochentisch_sync.merge_units(wochentisch_sync.state_units(base), wochentisch_sync.state_units('{"dishes":[],"plans":{}}'), wochentisch_sync.state_units(cloud_state));
  if not exists (select 1 from jsonb_array_elements(merged -> 'conflicts') c where c ->> 'kind' = 'dish' and c -> 'localPresent' = 'false'::jsonb and c -> 'remoteValue' ->> 'name' = 'Cloud') then raise exception 'deletion against edit was lost: %', merged; end if;

  merged := wochentisch_sync.merge_units(wochentisch_sync.state_units(base), wochentisch_sync.state_units(local_state), wochentisch_sync.state_units(local_state));
  if jsonb_array_length(merged -> 'conflicts') <> 0 then raise exception 'identical changes conflict: %', merged; end if;

  if wochentisch_sync.dangling_meals('{"dishes":[],"plans":{"2026-10-26":[["a"]]}}') <> '[{"week":"2026-10-26","day":0,"position":0,"dishId":"a"}]'::jsonb then raise exception 'missing dangling meal'; end if;
  if wochentisch_sync.dangling_meals('{"dishes":[{"id":"a"}],"plans":{"2026-10-26":[["a"]]}}') <> '[]'::jsonb then raise exception 'existing dish incorrectly considered dangling'; end if;

  old_state := '{"dishes":[{"id":"a","name":"A"}],"plans":{}}';
  local_plan := '{"dishes":[],"plans":{}}';
  remote_plan := '{"dishes":[{"id":"a","name":"A"}],"plans":{"2026-10-26":[["a"],[],[],[],[],[],[]]}}';
  merged := wochentisch_sync.merge_units(wochentisch_sync.state_units(old_state), wochentisch_sync.state_units(local_plan), wochentisch_sync.state_units(remote_plan));
  merged := wochentisch_sync.guard_dangling(merged, old_state, local_plan, remote_plan);
  state := wochentisch_sync.units_state(merged -> 'units', jsonb_build_array(old_state, local_plan, remote_plan));
  if jsonb_array_length(state -> 'dishes') <> 1 or state -> 'plans' -> '2026-10-26' -> 0 <> '["a"]'::jsonb then raise exception 'dish deletion would lose cloud plan: %', state; end if;
  if not exists (select 1 from jsonb_array_elements(merged -> 'conflicts') c where c ->> 'kind' = 'dish' and c -> 'localPresent' = 'false'::jsonb) then raise exception 'dish deletion conflict was not preserved: %', merged; end if;

  merged := wochentisch_sync.merge_units(wochentisch_sync.state_units(old_state), wochentisch_sync.state_units(remote_plan), wochentisch_sync.state_units(local_plan));
  merged := wochentisch_sync.guard_dangling(merged, old_state, remote_plan, local_plan);
  state := wochentisch_sync.units_state(merged -> 'units', jsonb_build_array(old_state, remote_plan, local_plan));
  if jsonb_array_length(wochentisch_sync.dangling_meals(state)) <> 0 then raise exception 'local plan contains missing cloud dish: %', state; end if;
  if not exists (select 1 from jsonb_array_elements(merged -> 'conflicts') c where c ->> 'kind' = 'plan-day' and c -> 'localValue' -> 'meals' = '["a"]'::jsonb) then raise exception 'local plan conflict was not preserved: %', merged; end if;
end;
$test$;
