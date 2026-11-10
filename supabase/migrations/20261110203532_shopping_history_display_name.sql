-- Resolve the current display name for past and future history entries.
create or replace function public.read_shopping_history(p_household_id uuid, p_weeks date[])
returns table (actor_id uuid, actor_name text, added_at timestamptz, items text[])
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or public.is_household_member(p_household_id) is not true then
    raise exception 'household access denied' using errcode = '42501';
  end if;

  return query
  select a.actor_id,
    case when jsonb_typeof(u.raw_user_meta_data -> 'display_name') = 'string'
      then nullif(left(btrim(u.raw_user_meta_data ->> 'display_name'), 60), '')
    end,
    a.added_at, a.items
  from wochentisch_sync.shopping_additions a
  left join public.household_members m on m.household_id = a.household_id and m.user_id = a.actor_id
  left join auth.users u on u.id = m.user_id
  where a.household_id = p_household_id and a.week_start = any(p_weeks)
  order by a.added_at desc, a.id desc
  limit 30;
end;
$function$;
