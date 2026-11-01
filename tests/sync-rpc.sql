-- Run in a transaction with a test household, JWT subject and RPCs installed.
-- Roll the entire transaction back after the test.
set local role authenticated;
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  result jsonb;
begin
  if has_function_privilege('anon', 'public.sync_household_v1(uuid,uuid,jsonb,jsonb)', 'execute') or
     has_function_privilege('anon', 'public.resolve_household_conflict_v1(uuid,uuid,jsonb,text)', 'execute') then
    raise exception 'anonymous role can execute a sync RPC';
  end if;
  result := public.sync_household_v1(household, gen_random_uuid(),
    '{"dishes":[],"plans":{}}', '{"dishes":[],"plans":{}}');
  if result -> 'revision' <> '0'::jsonb then raise exception 'unexpected initial response: %', result; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.sync_household_v1(household, gen_random_uuid(),
      '{"dishes":[],"plans":{}}', '{"dishes":[],"plans":{}}');
    raise exception 'non-member was allowed to sync';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
