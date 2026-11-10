create table wochentisch_sync.shopping_additions (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  actor_id uuid not null,
  added_at timestamptz not null default clock_timestamp(),
  items text[] not null
);
alter table wochentisch_sync.shopping_additions enable row level security;
revoke all on wochentisch_sync.shopping_additions from public, anon, authenticated;
create index shopping_additions_household_week_idx
  on wochentisch_sync.shopping_additions (household_id, week_start, added_at desc, id desc);

-- The shared sync writer upserts the list. The transition table contains only
-- actual inserts, excluding unchanged items, renames, and replayed requests.
create function wochentisch_sync.record_shopping_additions()
returns trigger
language plpgsql security invoker set search_path = ''
as $function$
begin
  if (select auth.uid()) is not null then
    insert into wochentisch_sync.shopping_additions (household_id, week_start, actor_id, items)
    select p.household_id, p.week_start, (select auth.uid()), array_agg(i.name order by i.name)
    from added_items i
    join public.weekly_plans p on p.id = i.weekly_plan_id
    group by p.household_id, p.week_start;
  end if;
  return null;
end;
$function$;
revoke all on function wochentisch_sync.record_shopping_additions() from public, anon, authenticated;

create trigger record_shopping_additions
after insert on public.shopping_items
referencing new table as added_items
for each statement execute function wochentisch_sync.record_shopping_additions();

-- Keep the event table and Auth user data private. As with read_household_v2,
-- the read RPC checks household membership before returning any data.
create function public.read_shopping_history(p_household_id uuid, p_weeks date[])
returns table (actor_id uuid, actor_name text, added_at timestamptz, items text[])
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or public.is_household_member(p_household_id) is not true then
    raise exception 'household access denied' using errcode = '42501';
  end if;

  return query
  select a.actor_id, u.email::text,
    a.added_at, a.items
  from wochentisch_sync.shopping_additions a
  left join public.household_members m on m.household_id = a.household_id and m.user_id = a.actor_id
  left join auth.users u on u.id = m.user_id
  where a.household_id = p_household_id and a.week_start = any(p_weeks)
  order by a.added_at desc, a.id desc
  limit 30;
end;
$function$;
revoke all on function public.read_shopping_history(uuid, date[]) from public, anon, authenticated;
grant execute on function public.read_shopping_history(uuid, date[]) to authenticated;
