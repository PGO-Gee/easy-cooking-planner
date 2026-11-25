begin;
insert into public.households (id, name) values ('01000000-0000-4000-8000-000000000001', 'Verlauf');
insert into auth.users (id, raw_user_meta_data)
values ('02000000-0000-4000-8000-000000000001', '{"display_name":" Anna "}');
insert into public.household_members (household_id, user_id)
values ('01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001'),
       ('01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000002');
insert into wochentisch_sync.shopping_additions (household_id, week_start, actor_id, added_at, items)
values ('01000000-0000-4000-8000-000000000001', '2026-11-23', '02000000-0000-4000-8000-000000000001',
        '2026-11-23 10:00+00', array['Milch']);

set local role authenticated;
do $test$
declare
  household constant uuid := '01000000-0000-4000-8000-000000000001';
  actor constant uuid := '02000000-0000-4000-8000-000000000001';
  member constant uuid := '02000000-0000-4000-8000-000000000002';
  outsider constant uuid := '02000000-0000-4000-8000-000000000003';
  request constant uuid := '03000000-0000-4000-8000-000000000001';
  week constant date := '2026-11-23';
  events jsonb;
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.record_shopping_clear(household, request, 'all', true, array[week, week + 7], '2026-11-23 11:00+00');
  perform public.record_shopping_clear(household, request, 'all', true, array[week, week + 7], '2026-11-23 11:00+00');

  perform set_config('request.jwt.claim.sub', member::text, true);
  select jsonb_agg(to_jsonb(entry) - 'added_at' order by entry.added_at desc) into events
  from public.read_shopping_history_v2(household, array[week, week + 7]) entry;
  if events is distinct from jsonb_build_array(
    jsonb_build_object('event_id', request, 'actor_id', actor, 'actor_name', 'Anna',
      'clear_scope', 'all', 'include_checked', true, 'items', null),
    jsonb_build_object('event_id', null, 'actor_id', actor, 'actor_name', 'Anna',
      'clear_scope', null, 'include_checked', null, 'items', array['Milch'])
  ) then
    raise exception 'unexpected shopping history: %', events;
  end if;
  if (select count(*) from public.read_shopping_history_v2(household, array[week + 7])) <> 1
    or exists (select 1 from public.read_shopping_history_v2(household, array[week + 14])) then
    raise exception 'clear event has incorrect week visibility';
  end if;
  if (select count(*) from public.read_shopping_history(household, array[week])) <> 1 then
    raise exception 'legacy history contract changed';
  end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.read_shopping_history_v2(household, array[week]);
    raise exception 'outsider read the household history';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_shopping_clear(household, request, 'all', true, array[week], now());
    raise exception 'outsider recorded an event for the household';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
rollback;
