create table wochentisch_sync.shopping_clears (
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid not null,
  request_id uuid not null,
  week_starts date[] not null,
  cleared_at timestamptz not null,
  clear_scope text not null check (clear_scope in ('manual', 'planned', 'all')),
  include_checked boolean not null,
  primary key (household_id, actor_id, request_id)
);
alter table wochentisch_sync.shopping_clears enable row level security;
revoke all on wochentisch_sync.shopping_clears from public, anon, authenticated;
create index shopping_clears_household_time_idx
  on wochentisch_sync.shopping_clears (household_id, cleared_at desc);

create function wochentisch_sync.record_shopping_clear(
  p_household_id uuid, p_request_id uuid, p_scope text,
  p_include_checked boolean, p_weeks date[], p_cleared_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $function$
declare actor uuid := auth.uid();
begin
  if actor is null or public.is_household_member(p_household_id) is not true then
    raise exception 'household access denied' using errcode = '42501';
  end if;
  if p_request_id is null or p_scope is null or p_scope not in ('manual', 'planned', 'all')
    or p_include_checked is null or p_weeks is null or cardinality(p_weeks) not between 1 and 2
    or array_position(p_weeks, null) is not null
    or p_cleared_at is null or not isfinite(p_cleared_at) then
    raise exception 'invalid shopping clear event' using errcode = '22023';
  end if;
  insert into wochentisch_sync.shopping_clears
    (household_id, actor_id, request_id, week_starts, cleared_at, clear_scope, include_checked)
  values (p_household_id, actor, p_request_id, p_weeks, least(p_cleared_at, clock_timestamp()), p_scope, p_include_checked)
  on conflict (household_id, actor_id, request_id) do nothing;
end;
$function$;

create function wochentisch_sync.read_shopping_history_v2(p_household_id uuid, p_weeks date[])
returns table (
  event_id uuid, actor_id uuid, actor_name text, added_at timestamptz, items text[],
  clear_scope text, include_checked boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or public.is_household_member(p_household_id) is not true then
    raise exception 'household access denied' using errcode = '42501';
  end if;

  return query
  with events as (
    select null::uuid as event_id, a.actor_id, a.added_at, a.items, null::text as clear_scope,
      null::boolean as include_checked, a.id as addition_id
    from wochentisch_sync.shopping_additions a
    where a.household_id = p_household_id and a.week_start = any(p_weeks)
    union all
    select c.request_id, c.actor_id, c.cleared_at, null::text[], c.clear_scope, c.include_checked, null::bigint
    from wochentisch_sync.shopping_clears c
    where c.household_id = p_household_id and c.week_starts && p_weeks
    order by added_at desc, addition_id desc nulls last, event_id desc
    limit 30
  )
  select e.event_id, e.actor_id,
    case when jsonb_typeof(u.raw_user_meta_data -> 'display_name') = 'string'
      then nullif(left(btrim(u.raw_user_meta_data ->> 'display_name'), 60), '')
    end,
    e.added_at, e.items, e.clear_scope, e.include_checked
  from events e
  left join public.household_members m on m.household_id = p_household_id and m.user_id = e.actor_id
  left join auth.users u on u.id = m.user_id
  order by e.added_at desc, e.addition_id desc nulls last, e.event_id desc;
end;
$function$;

-- Parsed SQL bodies reference the private functions without exposing their schema.
create function public.record_shopping_clear(
  p_household_id uuid, p_request_id uuid, p_scope text,
  p_include_checked boolean, p_weeks date[], p_cleared_at timestamptz
) returns void
language sql security invoker set search_path = ''
return wochentisch_sync.record_shopping_clear(p_household_id, p_request_id, p_scope, p_include_checked, p_weeks, p_cleared_at);

create function public.read_shopping_history_v2(p_household_id uuid, p_weeks date[])
returns table (
  event_id uuid, actor_id uuid, actor_name text, added_at timestamptz, items text[],
  clear_scope text, include_checked boolean
)
language sql stable security invoker set search_path = ''
begin atomic
  select * from wochentisch_sync.read_shopping_history_v2(p_household_id, p_weeks);
end;

revoke all on function
  wochentisch_sync.record_shopping_clear(uuid, uuid, text, boolean, date[], timestamptz),
  wochentisch_sync.read_shopping_history_v2(uuid, date[]),
  public.record_shopping_clear(uuid, uuid, text, boolean, date[], timestamptz),
  public.read_shopping_history_v2(uuid, date[])
from public, anon, authenticated;
grant execute on function
  wochentisch_sync.record_shopping_clear(uuid, uuid, text, boolean, date[], timestamptz),
  wochentisch_sync.read_shopping_history_v2(uuid, date[]),
  public.record_shopping_clear(uuid, uuid, text, boolean, date[], timestamptz),
  public.read_shopping_history_v2(uuid, date[])
to authenticated;
