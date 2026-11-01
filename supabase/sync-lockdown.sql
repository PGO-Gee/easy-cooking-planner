-- After the RPC-based client is ready, restrict household data writes to the
-- checked sync functions. Household membership and invitation functions retain
-- their existing permissions.
revoke insert, update, delete, truncate on public.dishes, public.weekly_plans,
  public.planned_meals, public.shopping_items, public.shopping_item_checks
  from public, anon, authenticated;
revoke execute on function public.merge_shopping_quantities(uuid, jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.add_catalog_dish_to_household(uuid) from public, anon, authenticated;
