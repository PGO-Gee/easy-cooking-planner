-- Draft internal implementation of a sync transaction. Not a migration.
-- The eventual public, security-definer RPC must validate its JSON contract and
-- invoke this function with its own fixed search path and explicit EXECUTE grant.
create or replace function wochentisch_sync.sync_transaction(
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
  cached := wochentisch_sync.begin_request(p_household_id, p_request_id, 'sync_household_v1', payload);
  if cached is not null then return cached; end if;
  remote_state := wochentisch_sync.cloud_state(p_household_id);
  merged := wochentisch_sync.merge_units(
    wochentisch_sync.state_units(p_base), wochentisch_sync.state_units(p_local), wochentisch_sync.state_units(remote_state));
  merged := wochentisch_sync.guard_dangling(merged, p_base, p_local, remote_state);
  candidate := wochentisch_sync.units_state(merged -> 'units', jsonb_build_array(p_base, p_local, remote_state));
  changed := wochentisch_sync.state_units(candidate) is distinct from wochentisch_sync.state_units(remote_state)
    or coalesce(candidate -> 'plans', '{}'::jsonb) is distinct from coalesce(remote_state -> 'plans', '{}'::jsonb);
  if changed then
    perform wochentisch_sync.write_state(p_household_id, candidate);
    remote_state := wochentisch_sync.cloud_state(p_household_id);
  end if;
  return wochentisch_sync.finish_request(p_household_id, p_request_id, 'sync_household_v1', payload,
    jsonb_build_object('state', remote_state, 'conflicts', merged -> 'conflicts'), changed);
end;
$function$;
revoke all on function wochentisch_sync.sync_transaction(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
