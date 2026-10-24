create or replace function public.merge_shopping_quantities(
  p_household_id uuid,
  p_quantity_updates jsonb default '{}'::jsonb,
  p_keys_to_remove text[] default '{}'::text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if coalesce(jsonb_typeof(p_quantity_updates), 'object') <> 'object' then
    raise exception 'p_quantity_updates must be a JSON object' using errcode = '22023';
  end if;

  update public.weekly_plans as plan
  set shopping_quantities = (coalesce(plan.shopping_quantities, '{}'::jsonb) - coalesce(p_keys_to_remove, '{}'::text[])) || coalesce(p_quantity_updates, '{}'::jsonb)
  where plan.household_id = p_household_id;
end;
$function$;

revoke all on function public.merge_shopping_quantities(uuid, jsonb, text[]) from public;
grant execute on function public.merge_shopping_quantities(uuid, jsonb, text[]) to authenticated;

alter publication supabase_realtime
  add table public.dishes,
             public.weekly_plans,
             public.planned_meals,
             public.shopping_items,
             public.shopping_item_checks;
