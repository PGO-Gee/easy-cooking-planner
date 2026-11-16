-- v3 keeps an entire plan (including cross-week rest references) as one merge
-- unit. A concurrent plan edit is reviewed rather than partially applied.
create table wochentisch_private.cooking_state (
  household_id uuid primary key references public.households(id) on delete cascade,
  entries jsonb not null default '{}'::jsonb check(jsonb_typeof(entries)='object'),
  settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object'),
  quantity_overrides jsonb not null default '{}'::jsonb check(jsonb_typeof(quantity_overrides)='object')
);
alter table wochentisch_private.cooking_state enable row level security;
revoke all on wochentisch_private.cooking_state from public, anon, authenticated;

create function wochentisch_private.planning_defaults() returns jsonb
language sql immutable security invoker set search_path='' as $$
select '{"configured":false,"adults":2,"children":0,"childFactor":0.5,"mode":"household","portions":2,"days":1}'::jsonb;
$$;

-- Deterministic occurrence IDs migrate old plans identically on every device.
create function wochentisch_private.complete_cooking_state(p_state jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
with slots as (
 select w.key as week, (day.ordinality-1)::integer as day, (meal.ordinality-1)::integer as position,
 meal.value as dish_id, (w.key::date+(day.ordinality-1)::integer)::text as date
 from jsonb_each(coalesce(p_state->'plans','{}')) w,
 jsonb_array_elements(w.value) with ordinality day(value,ordinality),
 jsonb_array_elements_text(day.value) with ordinality meal(value,ordinality)
), entries as (
 select coalesce(old.value->>'id','legacy:'||s.date||':'||s.position||':'||s.dish_id) as id,
 jsonb_build_object('id',coalesce(old.value->>'id','legacy:'||s.date||':'||s.position||':'||s.dish_id),
 'dishId',s.dish_id,'date',s.date,'position',s.position,
 'portions',coalesce(old.value->'portions',nullif(dish.value->'recipe'->'servings','null'), '2'::jsonb),
 'restDates',coalesce(old.value->'restDates','[]'),
 'pinned',coalesce(p_state->'pinnedMeals'->s.week->s.day->s.position,'false')) as value
 from slots s
 join lateral (select value from jsonb_array_elements(coalesce(p_state->'dishes','[]')) d(value) where value->>'id'=s.dish_id limit 1) dish on true
 left join lateral (select value from jsonb_each(coalesce(p_state->'cookingEntries','{}')) e where value->>'date'=s.date and value->>'dishId'=s.dish_id and (value->>'position')::integer=s.position limit 1) old on true
)
select p_state || jsonb_build_object('cookingEntries',coalesce((select jsonb_object_agg(id,value) from entries),'{}'),
 'planningSettings',wochentisch_private.planning_defaults()||coalesce(p_state->'planningSettings','{}'),
 'quantityOverrides',coalesce(p_state->'quantityOverrides','{}'));
$$;

create function wochentisch_private.cloud_state_v3(p_household_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
select wochentisch_private.complete_cooking_state(wochentisch_private.cloud_state_v2(p_household_id)||jsonb_build_object(
 'cookingEntries',coalesce(s.entries,'{}'), 'planningSettings',coalesce(s.settings,'{}'), 'quantityOverrides',coalesce(s.quantity_overrides,'{}')))
from (select 1) dummy left join wochentisch_private.cooking_state s on s.household_id=p_household_id;
$$;

create function wochentisch_private.state_units_v3(p_state jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
with state as (select wochentisch_private.complete_cooking_state(p_state) as value),
old as (select coalesce(jsonb_object_agg(e.key,e.value) filter(where e.value->>'kind' not in ('plan-day','rest-days')),'{}') as value from jsonb_each(wochentisch_sync.state_units(p_state)) e),
units as (
 select 'cooking-plan' as kind,'[]'::jsonb as key,'Wochenplan mit Kochmengen und Restetagen' as label,
 jsonb_build_object('plans',coalesce(value->'plans','{}'),'pinnedMeals',coalesce(value->'pinnedMeals','{}'),'restDays',coalesce(value->'restDays','{}'),'cookingEntries',value->'cookingEntries') as value from state
 union all select 'planning-settings','[]','Haushaltsportionen und Planungsvorgaben',value->'planningSettings' from state
 union all select 'quantity-override',jsonb_build_array(e.key),'Einkaufsmenge: '||e.key,e.value from state,jsonb_each(value->'quantityOverrides') e
)
select old.value || (select jsonb_object_agg(kind||':'||key::text,jsonb_build_object('kind',kind,'key',key,'label',label,'value',value)) from units) from old;
$$;

create function wochentisch_private.units_state_v3(p_units jsonb,p_inputs jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
select wochentisch_sync.units_state(p_units,p_inputs) || coalesce(p_units->'cooking-plan:[]'->'value','{}') || jsonb_build_object(
 'planningSettings',coalesce(p_units->'planning-settings:[]'->'value',wochentisch_private.planning_defaults()),
 'quantityOverrides',coalesce((select jsonb_object_agg(value->'key'->>0,value->'value') from jsonb_each(p_units) where value->>'kind'='quantity-override'),'{}'));
$$;

create function wochentisch_private.validate_cooking_state(p_state jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare e record; r jsonb; c jsonb; s jsonb:=p_state->'planningSettings'; w text; d integer; p integer; dt date; slots integer:=0; parts jsonb;
begin
 perform wochentisch_private.validate_household_recipes(p_state);
 if jsonb_typeof(p_state->'cookingEntries') is distinct from 'object' or jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(p_state->'quantityOverrides') is distinct from 'object' then raise exception 'invalid cooking state' using errcode='22023'; end if;
 if jsonb_typeof(s->'configured') is distinct from 'boolean' or s->>'mode' not in ('self','household','custom') or
 jsonb_typeof(s->'adults') is distinct from 'number' or (s->>'adults')::numeric not between 0 and 100 or trunc((s->>'adults')::numeric)<>(s->>'adults')::numeric or
 jsonb_typeof(s->'children') is distinct from 'number' or (s->>'children')::numeric not between 0 and 100 or trunc((s->>'children')::numeric)<>(s->>'children')::numeric or
 jsonb_typeof(s->'childFactor') is distinct from 'number' or (s->>'childFactor')::numeric<=0 or (s->>'childFactor')::numeric>5 or
 jsonb_typeof(s->'portions') is distinct from 'number' or (s->>'portions')::numeric<=0 or (s->>'portions')::numeric>100 or
 jsonb_typeof(s->'days') is distinct from 'number' or (s->>'days')::numeric not between 1 and 7 or trunc((s->>'days')::numeric)<>(s->>'days')::numeric then raise exception 'invalid planning settings' using errcode='22023'; end if;
 if (s->>'configured')::boolean and ((s->>'adults')::numeric+(s->>'children')::numeric*(s->>'childFactor')::numeric not between 0.001 and 100) then raise exception 'invalid household portions' using errcode='22023'; end if;
 for e in select * from jsonb_each(p_state->'cookingEntries') loop
 c:=e.value;
 if jsonb_typeof(c) is distinct from 'object' or c->>'id' is distinct from e.key or length(e.key)>200 or jsonb_typeof(c->'restDates') is distinct from 'array' or jsonb_typeof(c->'portions') is distinct from 'number' or (c->>'portions')::numeric<=0 or (c->>'portions')::numeric>100 or jsonb_typeof(c->'position') is distinct from 'number' or jsonb_typeof(c->'pinned') is distinct from 'boolean' or c->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid cooking entry' using errcode='22023'; end if;
 dt:=(c->>'date')::date; d:=extract(isodow from dt)::integer-1;w:=(dt-d)::text;p:=(c->>'position')::integer;
 if p<0 or (c->>'position')::numeric<>p or p_state->'plans'->w->d->>p is distinct from c->>'dishId' or coalesce(p_state->'pinnedMeals'->w->d->p,'false') is distinct from c->'pinned' then raise exception 'cooking entry differs from calendar' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(p_state->'dishes') dish where dish->>'id'=c->>'dishId') then raise exception 'missing cooking recipe' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(p_state->'cookingEntries') other where other.key<>e.key and other.value->>'date'=c->>'date' and other.value->'position'=c->'position') then raise exception 'duplicate cooking slot' using errcode='22023'; end if;
 if jsonb_array_length(c->'restDates')>6 or (select count(distinct value) from jsonb_array_elements(c->'restDates'))<>jsonb_array_length(c->'restDates') then raise exception 'invalid rest dates' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(c->'restDates') loop
 if jsonb_typeof(r)<>'string' or r#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' or (r#>>'{}')::date<=dt or (r#>>'{}')::date>dt+6 then raise exception 'invalid linked rest date' using errcode='22023'; end if;
 d:=extract(isodow from (r#>>'{}')::date)::integer-1;w:=((r#>>'{}')::date-d)::text;
 if not coalesce(p_state->'restDays'->w,'[]') @> to_jsonb(d) then raise exception 'missing rest marker' using errcode='22023'; end if;
 end loop;
 end loop;
 for e in select * from jsonb_each(coalesce(p_state->'plans','{}')) loop for r in select value from jsonb_array_elements(e.value) loop slots:=slots+jsonb_array_length(r);end loop;end loop;
 if slots<>(select count(*) from jsonb_each(p_state->'cookingEntries')) then raise exception 'missing cooking entries' using errcode='22023'; end if;
 for e in select * from jsonb_each(p_state->'quantityOverrides') loop
 parts:=e.key::jsonb;
 if jsonb_typeof(parts) is distinct from 'array' or jsonb_array_length(parts)<>3 or parts->>0 !~ '^\d{4}-\d{2}-\d{2}$' or extract(isodow from (parts->>0)::date)<>1 or jsonb_typeof(parts->1) is distinct from 'string' or jsonb_typeof(parts->2) is distinct from 'string' or jsonb_typeof(e.value) is distinct from 'number' or e.value::text::numeric<=0 then raise exception 'invalid quantity override' using errcode='22023';end if;
 end loop;
end;
$$;

create function wochentisch_private.write_state_v3(p_household_id uuid,p_state jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform wochentisch_private.validate_cooking_state(p_state);
 perform set_config('wochentisch.sync_v3','on',true);
 perform wochentisch_private.write_state_v2(p_household_id,p_state);
 perform set_config('wochentisch.sync_v3','off',true);
 insert into wochentisch_private.cooking_state as s(household_id,entries,settings,quantity_overrides)
 values(p_household_id,p_state->'cookingEntries',p_state->'planningSettings',p_state->'quantityOverrides')
 on conflict(household_id) do update set entries=excluded.entries,settings=excluded.settings,quantity_overrides=excluded.quantity_overrides;
 -- Existing Realtime subscription observes households as well as plan tables.
 update public.households set updated_at=now() where id=p_household_id;
end;
$$;

create or replace function wochentisch_private.guard_cooking_dangling(
  p_merge jsonb, p_base jsonb, p_local jsonb, p_remote jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  base_units jsonb := wochentisch_private.state_units_v3(p_base);
  local_units jsonb := wochentisch_private.state_units_v3(p_local);
  remote_units jsonb := wochentisch_private.state_units_v3(p_remote);
  merged_units jsonb := p_merge -> 'units';
  conflicts jsonb := coalesce(p_merge -> 'conflicts', '[]'::jsonb);
  candidate jsonb;
  dangling jsonb;
  meal jsonb;
  unit_id text;
  dish_id text;
  descriptor jsonb;
begin
  candidate := wochentisch_private.units_state_v3(merged_units, jsonb_build_array(p_base, p_local, p_remote));
  dangling := wochentisch_sync.dangling_meals(candidate);
  for meal in select value from jsonb_array_elements(dangling) loop
    dish_id := 'dish:' || jsonb_build_array(meal ->> 'dishId')::text;
    if remote_units ? dish_id then
      unit_id := dish_id;
    else
      unit_id := 'cooking-plan:[]';
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
  candidate := wochentisch_private.units_state_v3(merged_units, jsonb_build_array(p_base, p_local, p_remote));
  if jsonb_array_length(wochentisch_sync.dangling_meals(candidate)) <> 0 then
    raise exception 'cloud state contains unresolved references' using errcode = '22023';
  end if;
  return jsonb_build_object('units', merged_units, 'conflicts', conflicts);
end;
$function$;
revoke all on function wochentisch_private.guard_cooking_dangling(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;

create or replace function wochentisch_private.sync_transaction_v3(
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
  perform wochentisch_private.validate_cooking_state(p_base);
  perform wochentisch_private.validate_cooking_state(p_local);
  cached := wochentisch_sync.begin_request(p_household_id, p_request_id, 'sync_household_v3', payload);
  if cached is not null then return cached; end if;
  remote_state := wochentisch_private.cloud_state_v3(p_household_id);
  merged := wochentisch_sync.merge_units(
    wochentisch_private.state_units_v3(p_base), wochentisch_private.state_units_v3(p_local), wochentisch_private.state_units_v3(remote_state));
  merged := wochentisch_private.guard_cooking_dangling(merged, p_base, p_local, remote_state);
  candidate := wochentisch_private.units_state_v3(merged -> 'units', jsonb_build_array(p_base, p_local, remote_state));
  perform wochentisch_private.validate_cooking_state(candidate);
  changed := wochentisch_private.state_units_v3(candidate) is distinct from wochentisch_private.state_units_v3(remote_state)
    or coalesce(candidate -> 'plans', '{}'::jsonb) is distinct from coalesce(remote_state -> 'plans', '{}'::jsonb);
  if changed then
    perform wochentisch_private.write_state_v3(p_household_id, candidate);
    remote_state := wochentisch_private.cloud_state_v3(p_household_id);
  end if;
  return wochentisch_sync.finish_request(p_household_id, p_request_id, 'sync_household_v3', payload,
    jsonb_build_object('state', remote_state, 'conflicts', merged -> 'conflicts'), changed);
end;
$function$;
revoke all on function wochentisch_private.sync_transaction_v3(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
-- Draft internal conflict resolution transaction. Not a migration or public RPC.
create or replace function wochentisch_private.resolve_transaction_v3(
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
  if p_conflict ->> 'kind' not in ('dish', 'cooking-plan', 'planning-settings', 'quantity-override', 'pantry', 'quantity', 'shopping-check', 'hidden-item', 'manual-item')
    or ((p_conflict ->> 'localPresent')::boolean and not p_conflict ? 'localValue')
    or ((p_conflict ->> 'remotePresent')::boolean and not p_conflict ? 'remoteValue') then
    raise exception 'invalid conflict value' using errcode = '22023';
  end if;
  unit_id := (p_conflict ->> 'kind') || ':' || (p_conflict -> 'key')::text;
  -- Older PWA conflicts have a different ID format. Their kind and key are
  -- sufficient to derive the server ID; if an ID is supplied, validate it.
  if p_conflict ? 'id' and p_conflict ->> 'id' is distinct from unit_id then raise exception 'invalid conflict id' using errcode = '22023'; end if;
  cached := wochentisch_sync.begin_request(p_household_id, p_request_id, 'resolve_household_conflict_v3', payload);
  if cached is not null then return cached; end if;
  remote_state := wochentisch_private.cloud_state_v3(p_household_id);
  remote_units := wochentisch_private.state_units_v3(remote_state);
  actual := remote_units -> unit_id;
  expected_present := (p_conflict ->> 'remotePresent')::boolean;
  if (remote_units ? unit_id) is distinct from expected_present
      or (expected_present and actual -> 'value' is distinct from p_conflict -> 'remoteValue') then
    conflicts := jsonb_build_array(p_conflict || jsonb_build_object(
      'id', unit_id, 'remotePresent', remote_units ? unit_id, 'remoteValue', actual -> 'value'));
    return wochentisch_sync.finish_request(p_household_id, p_request_id, 'resolve_household_conflict_v3', payload,
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
  desired_state := wochentisch_private.units_state_v3(desired_units, jsonb_build_array(remote_state));
  perform wochentisch_private.validate_cooking_state(desired_state);
  checked_units := wochentisch_private.state_units_v3(desired_state);
  if (checked_units ? unit_id) is distinct from selected_present or
    (selected_present and checked_units -> unit_id -> 'value' is distinct from desired_units -> unit_id -> 'value') then
    raise exception 'conflict value does not match its unit' using errcode = '22023';
  end if;
  guarded := wochentisch_private.guard_cooking_dangling(jsonb_build_object('units', desired_units, 'conflicts', conflicts),
    remote_state, desired_state, remote_state);
  desired_state := wochentisch_private.units_state_v3(guarded -> 'units', jsonb_build_array(remote_state));
  changed := wochentisch_private.state_units_v3(desired_state) is distinct from remote_units;
  if changed then
    perform wochentisch_private.write_state_v3(p_household_id, desired_state);
    remote_state := wochentisch_private.cloud_state_v3(p_household_id);
  end if;
  return wochentisch_sync.finish_request(p_household_id, p_request_id, 'resolve_household_conflict_v3', payload,
    jsonb_build_object('state', remote_state, 'conflicts', guarded -> 'conflicts'), changed);
end;
$function$;
revoke all on function wochentisch_private.resolve_transaction_v3(uuid, uuid, jsonb, text) from public, anon, authenticated;


create function public.read_household_v3(p_household_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_household_member(p_household_id) then raise exception 'household access denied' using errcode='42501';end if;
 return jsonb_build_object('state',wochentisch_private.cloud_state_v3(p_household_id),'revision',coalesce((select revision from wochentisch_sync.household_revisions where household_id=p_household_id),0),'conflicts','[]'::jsonb);
end;
$$;
create function public.sync_household_v3(p_household_id uuid,p_request_id uuid,p_base jsonb,p_local jsonb) returns jsonb
language sql security definer set search_path='' as $$ select wochentisch_private.sync_transaction_v3(p_household_id,p_request_id,p_base,p_local); $$;
create function public.resolve_household_conflict_v3(p_household_id uuid,p_request_id uuid,p_conflict jsonb,p_choice text) returns jsonb
language sql security definer set search_path='' as $$ select wochentisch_private.resolve_transaction_v3(p_household_id,p_request_id,p_conflict,p_choice); $$;
revoke all on function public.read_household_v3(uuid), public.sync_household_v3(uuid,uuid,jsonb,jsonb),public.resolve_household_conflict_v3(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.read_household_v3(uuid), public.sync_household_v3(uuid,uuid,jsonb,jsonb),public.resolve_household_conflict_v3(uuid,uuid,jsonb,text) to authenticated;
-- Explicitly keep private helpers inaccessible through the API.
revoke all on function wochentisch_private.planning_defaults() from public,anon,authenticated;
revoke all on function wochentisch_private.complete_cooking_state(jsonb) from public,anon,authenticated;
revoke all on function wochentisch_private.cloud_state_v3(uuid) from public,anon,authenticated;
revoke all on function wochentisch_private.state_units_v3(jsonb) from public,anon,authenticated;
revoke all on function wochentisch_private.units_state_v3(jsonb,jsonb) from public,anon,authenticated;
revoke all on function wochentisch_private.validate_cooking_state(jsonb) from public,anon,authenticated;
revoke all on function wochentisch_private.write_state_v3(uuid,jsonb) from public,anon,authenticated;

create or replace function wochentisch_sync.write_state(p_household_id uuid, p_state jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $function$
declare
  dish jsonb;
  week text;
  plan_id uuid;
  quantities jsonb := coalesce(p_state -> 'shoppingQuantities', '{}'::jsonb);
begin
  if coalesce(current_setting('wochentisch.sync_v3',true),'off')<>'on' and exists(select 1 from wochentisch_private.cooking_state where household_id=p_household_id) and (
    (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(wochentisch_sync.state_units(p_state)) where value->>'kind' in ('plan-day','rest-days','quantity')) is distinct from
    (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(wochentisch_sync.state_units(wochentisch_private.cloud_state_v2(p_household_id))) where value->>'kind' in ('plan-day','rest-days','quantity'))
  ) then raise exception 'Bitte die App aktualisieren, bevor du Kochmengen oder den Wochenplan änderst.' using errcode='22023';end if;
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state -> 'dishes') <> 'array' then
    raise exception 'invalid household state' using errcode = '22023';
  end if;
  if jsonb_array_length(wochentisch_sync.dangling_meals(p_state)) <> 0 then
    raise exception 'household state contains missing dishes' using errcode = '22023';
  end if;

  for dish in select value from jsonb_array_elements(p_state -> 'dishes') loop
    insert into public.dishes as d (id, household_id, name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition)
    values ((dish ->> 'id')::uuid, p_household_id, dish ->> 'name', coalesce(dish ->> 'ingredient', ''),
      coalesce((dish ->> 'time')::smallint, 30), coalesce(dish ->> 'emoji', '🍽️'),
      coalesce(dish -> 'ingredients', '[]'::jsonb), nullif(dish -> 'nutrition', 'null'::jsonb))
    on conflict (id) do update set name = excluded.name, ingredient = excluded.ingredient,
      cooking_time_minutes = excluded.cooking_time_minutes, emoji = excluded.emoji,
      ingredients = excluded.ingredients, nutrition = excluded.nutrition
    where d.household_id = p_household_id and
      (d.name, d.ingredient, d.cooking_time_minutes, d.emoji, d.ingredients, d.nutrition)
      is distinct from (excluded.name, excluded.ingredient, excluded.cooking_time_minutes, excluded.emoji, excluded.ingredients, excluded.nutrition);
  end loop;

  -- ON CONFLICT locks any existing dish row, including a concurrent insert
  -- from another household. Validate ownership after those locks are held.
  if exists (
    select 1 from jsonb_array_elements(p_state -> 'dishes') entry
    join public.dishes d on d.id = (entry ->> 'id')::uuid
    where d.household_id <> p_household_id
  ) then raise exception 'dish belongs to another household' using errcode = '42501'; end if;

  for week in
    select jsonb_object_keys(coalesce(p_state -> 'plans', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'pantryIngredients', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'restDays', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'shoppingChecks', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'hiddenShoppingItems', '{}'::jsonb))
    union select jsonb_object_keys(coalesce(p_state -> 'manualShoppingItems', '{}'::jsonb))
    union select week_start::text from public.weekly_plans where household_id = p_household_id
  loop
    insert into public.weekly_plans (household_id, week_start) values (p_household_id, week::date)
    on conflict (household_id, week_start) do nothing;
    select id into strict plan_id from public.weekly_plans where household_id = p_household_id and week_start = week::date;
    update public.weekly_plans set
      pantry_ingredients = coalesce(p_state -> 'pantryIngredients' -> week, '[]'::jsonb),
      rest_days = array(select value::smallint from jsonb_array_elements_text(coalesce(p_state -> 'restDays' -> week, '[]'::jsonb))),
      shopping_hidden_items = coalesce(p_state -> 'hiddenShoppingItems' -> week, '[]'::jsonb),
      shopping_quantities = quantities
    where id = plan_id and (pantry_ingredients, to_jsonb(rest_days), shopping_hidden_items, shopping_quantities)
      is distinct from (coalesce(p_state -> 'pantryIngredients' -> week, '[]'::jsonb),
        coalesce(p_state -> 'restDays' -> week, '[]'::jsonb),
        coalesce(p_state -> 'hiddenShoppingItems' -> week, '[]'::jsonb), quantities);

    with desired as (
      select day::smallint as day_of_week, (meal.position - 1)::smallint as position,
        meal.id::uuid as dish_id,
        coalesce((p_state -> 'pinnedMeals' -> week -> day ->> (meal.position - 1)::integer)::boolean, false) as is_pinned
      from generate_series(0, 6) as days(day)
      cross join lateral jsonb_array_elements_text(coalesce(p_state -> 'plans' -> week -> day, '[]'::jsonb))
        with ordinality as meal(id, position)
    ), removed as (
      delete from public.planned_meals m
      where m.weekly_plan_id = plan_id and not exists (
        select 1 from desired where (desired.day_of_week, desired.position) = (m.day_of_week, m.position)
      )
    )
    insert into public.planned_meals as m (weekly_plan_id, day_of_week, position, dish_id, is_pinned)
    select plan_id, day_of_week, position, dish_id, is_pinned from desired
    on conflict (weekly_plan_id, day_of_week, position) do update
    set dish_id = excluded.dish_id, is_pinned = excluded.is_pinned
    where (m.dish_id, m.is_pinned) is distinct from (excluded.dish_id, excluded.is_pinned);

    with desired as (
      select name, lower(name) as normalized_name
      from jsonb_array_elements_text(coalesce(p_state -> 'manualShoppingItems' -> week, '[]'::jsonb)) as items(name)
    ), removed as (
      delete from public.shopping_items i
      where i.weekly_plan_id = plan_id and not exists (
        select 1 from desired where desired.normalized_name = i.normalized_name
      )
    )
    insert into public.shopping_items as i (weekly_plan_id, name, normalized_name)
    select plan_id, name, normalized_name from desired
    on conflict (weekly_plan_id, normalized_name) do update set name = excluded.name
    where i.name is distinct from excluded.name;

    with desired as (
      select key from jsonb_each(coalesce(p_state -> 'shoppingChecks' -> week, '{}'::jsonb))
      where value = 'true'::jsonb
    ), removed as (
      delete from public.shopping_item_checks c
      where c.weekly_plan_id = plan_id and not exists (
        select 1 from desired where desired.key = c.item_key
      )
    )
    insert into public.shopping_item_checks (weekly_plan_id, item_key)
    select plan_id, key from desired
    on conflict (weekly_plan_id, item_key) do nothing;
  end loop;

  if quantities <> '{}'::jsonb and not exists (select 1 from public.weekly_plans where household_id = p_household_id) then
    raise exception 'shopping quantities require a planning week' using errcode = '22023';
  end if;
  delete from public.dishes d where d.household_id = p_household_id
    and not exists (select 1 from jsonb_array_elements(p_state -> 'dishes') entry where (entry ->> 'id')::uuid = d.id);
end;
$function$;
revoke all on function wochentisch_sync.write_state(uuid,jsonb) from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='households') then
  alter publication supabase_realtime add table public.households;
 end if;
end; $$;
