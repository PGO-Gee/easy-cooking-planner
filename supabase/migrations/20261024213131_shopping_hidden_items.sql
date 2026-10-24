alter table public.weekly_plans
  add column if not exists shopping_hidden_items jsonb not null default '[]'::jsonb;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_plans_shopping_hidden_items_array'
      and conrelid = 'public.weekly_plans'::regclass
  ) then
    alter table public.weekly_plans
      add constraint weekly_plans_shopping_hidden_items_array
      check (jsonb_typeof(shopping_hidden_items) = 'array');
  end if;
end
$migration$;
