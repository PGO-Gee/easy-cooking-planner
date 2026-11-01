-- Draft internal conflict resolution transaction. Not a migration or public RPC.
create or replace function wochentisch_sync.resolve_transaction(
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
  cached := wochentisch_sync.begin_request(p_household_id, p_request_id, 'resolve_household_conflict_v1', payload);
  if cached is not null then return cached; end if;
  remote_state := wochentisch_sync.cloud_state(p_household_id);
  remote_units := wochentisch_sync.state_units(remote_state);
  actual := remote_units -> unit_id;
  expected_present := (p_conflict ->> 'remotePresent')::boolean;
  if (remote_units ? unit_id) is distinct from expected_present
      or (expected_present and actual -> 'value' is distinct from p_conflict -> 'remoteValue') then
    conflicts := jsonb_build_array(p_conflict || jsonb_build_object(
      'id', unit_id, 'remotePresent', remote_units ? unit_id, 'remoteValue', actual -> 'value'));
    return wochentisch_sync.finish_request(p_household_id, p_request_id, 'resolve_household_conflict_v1', payload,
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
    perform wochentisch_sync.write_state(p_household_id, desired_state);
    remote_state := wochentisch_sync.cloud_state(p_household_id);
  end if;
  return wochentisch_sync.finish_request(p_household_id, p_request_id, 'resolve_household_conflict_v1', payload,
    jsonb_build_object('state', remote_state, 'conflicts', guarded -> 'conflicts'), changed);
end;
$function$;
revoke all on function wochentisch_sync.resolve_transaction(uuid, uuid, jsonb, text) from public, anon, authenticated;
