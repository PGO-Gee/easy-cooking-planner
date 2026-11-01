-- Requires a test household and authenticated member. Always run in a
-- transaction that is rolled back; the caller provides these settings.
do $test$
declare
  household uuid := current_setting('wochentisch.test_household')::uuid;
  request uuid := '37f68c25-ae74-4657-a5f9-4a39358237a9';
  response jsonb;
  next_request uuid := gen_random_uuid();
begin
  if wochentisch_sync.begin_request(household, request, 'sync', '{"state":1}') is not null then
    raise exception 'new request unexpectedly cached';
  end if;
  response := wochentisch_sync.finish_request(household, request, 'sync', '{"state":1}', '{"state":"ok"}', true);
  if response <> '{"state":"ok","revision":1}'::jsonb then raise exception 'incorrect first response: %', response; end if;
  if wochentisch_sync.begin_request(household, request, 'sync', '{"state":1}') <> response then
    raise exception 'retry did not return the original response';
  end if;
  begin
    perform wochentisch_sync.begin_request(household, request, 'sync', '{"state":2}');
    raise exception 'changed payload was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform wochentisch_sync.begin_request(household, next_request, 'sync', '{}');
  response := wochentisch_sync.finish_request(household, next_request, 'sync', '{}', '{}', false);
  if response -> 'revision' <> '1'::jsonb then raise exception 'unchanged state advanced revision: %', response; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform wochentisch_sync.begin_request(household, request, 'sync', '{"state":1}');
    raise exception 'non-member could read cached response';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
