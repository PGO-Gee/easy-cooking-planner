-- Run inside a rolled-back transaction with a synthetic household and member.
do $test$
begin
  if has_table_privilege('authenticated', 'public.households', 'truncate')
    or has_table_privilege('authenticated', 'public.household_members', 'truncate')
    or has_column_privilege('authenticated', 'public.households', 'created_by', 'update')
    or not has_column_privilege('authenticated', 'public.households', 'name', 'update')
    or has_function_privilege('anon', 'public.read_household_v2(uuid)', 'execute')
    or has_function_privilege('anon', 'public.create_household_for_new_user()', 'execute') then
    raise exception 'unexpected household privileges';
  end if;
end;
$test$;

set local role authenticated;
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  snapshot jsonb;
begin
  snapshot := public.read_household_v2(household);
  if snapshot -> 'state' -> 'dishes' is distinct from '[]'::jsonb
    or snapshot -> 'revision' is distinct from '0'::jsonb then
    raise exception 'empty household returned an invalid snapshot: %', snapshot;
  end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.read_household_v2(household);
    raise exception 'foreign household read was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

do $test$
begin
  if exists (select 1 from wochentisch_sync.requests
    where household_id = current_setting('wochentisch.test_household')::uuid) then
    raise exception 'read-only snapshot created a journal entry';
  end if;
end;
$test$;
