-- Draft consistency guard for the merged unit set. Not a migration.
-- It restores the cloud side of a cross-unit conflict before any relational
-- writes, so deleting a dish cannot cascade into a concurrent plan edit.
create or replace function wochentisch_sync.guard_dangling(
  p_merge jsonb, p_base jsonb, p_local jsonb, p_remote jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  base_units jsonb := wochentisch_sync.state_units(p_base);
  local_units jsonb := wochentisch_sync.state_units(p_local);
  remote_units jsonb := wochentisch_sync.state_units(p_remote);
  merged_units jsonb := p_merge -> 'units';
  conflicts jsonb := coalesce(p_merge -> 'conflicts', '[]'::jsonb);
  candidate jsonb;
  dangling jsonb;
  meal jsonb;
  unit_id text;
  dish_id text;
  descriptor jsonb;
begin
  candidate := wochentisch_sync.units_state(merged_units, jsonb_build_array(p_base, p_local, p_remote));
  dangling := wochentisch_sync.dangling_meals(candidate);
  for meal in select value from jsonb_array_elements(dangling) loop
    dish_id := 'dish:' || jsonb_build_array(meal ->> 'dishId')::text;
    if remote_units ? dish_id then
      unit_id := dish_id;
    else
      unit_id := 'plan-day:' || jsonb_build_array(meal ->> 'week', (meal ->> 'day')::integer)::text;
    end if;
    descriptor := coalesce(local_units -> unit_id, remote_units -> unit_id, base_units -> unit_id);
    if descriptor is null then raise exception 'cannot preserve dangling meal: %', meal; end if;
    if remote_units ? unit_id then
      merged_units := jsonb_set(merged_units, array[unit_id], remote_units -> unit_id, true);
    else
      merged_units := merged_units - unit_id;
    end if;
    if not exists (select 1 from jsonb_array_elements(conflicts) c where c ->> 'id' = unit_id) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'id', unit_id, 'kind', descriptor -> 'kind', 'key', descriptor -> 'key', 'label', descriptor -> 'label',
        'basePresent', base_units ? unit_id, 'localPresent', local_units ? unit_id, 'remotePresent', remote_units ? unit_id,
        'baseValue', base_units -> unit_id -> 'value', 'localValue', local_units -> unit_id -> 'value', 'remoteValue', remote_units -> unit_id -> 'value'
      ));
    end if;
  end loop;
  candidate := wochentisch_sync.units_state(merged_units, jsonb_build_array(p_base, p_local, p_remote));
  if jsonb_array_length(wochentisch_sync.dangling_meals(candidate)) <> 0 then
    raise exception 'cloud state contains unresolved references' using errcode = '22023';
  end if;
  return jsonb_build_object('units', merged_units, 'conflicts', conflicts);
end;
$function$;
revoke all on function wochentisch_sync.guard_dangling(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
