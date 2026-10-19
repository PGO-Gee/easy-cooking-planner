-- Globaler Standardkatalog und haushaltseigene Gerichtssammlungen.

create table if not exists public.catalog_dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  normalized_name text generated always as (lower(regexp_replace(trim(name), '[^[:alnum:]]+', '', 'g'))) stored,
  ingredient text not null default '',
  cooking_time_minutes smallint not null default 30 check (cooking_time_minutes between 0 and 360),
  emoji text not null default '🍽️',
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  nutrition jsonb,
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

alter table public.dishes add column if not exists normalized_name text
  generated always as (lower(regexp_replace(trim(name), '[^[:alnum:]]+', '', 'g'))) stored;
create unique index if not exists dishes_household_normalized_name_idx
  on public.dishes (household_id, normalized_name);

alter table public.catalog_dishes enable row level security;
grant select on public.catalog_dishes to authenticated;
grant select, insert, update, delete on public.dishes to authenticated;
create policy "Authenticated users can read catalog" on public.catalog_dishes
  for select to authenticated using (true);

-- Einmaliger Umzug: bisherige Standardgerichte werden zentral zusammengeführt.
insert into public.catalog_dishes (name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition)
select distinct on (lower(regexp_replace(trim(name), '[^[:alnum:]]+', '', 'g')))
  name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition
from public.dishes
order by lower(regexp_replace(trim(name), '[^[:alnum:]]+', '', 'g')), created_at;

create or replace function public.add_catalog_dish_to_household(catalog_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.dishes
    (household_id, name, ingredient, cooking_time_minutes, emoji, ingredients, nutrition)
  select hm.household_id, c.name, c.ingredient, c.cooking_time_minutes, c.emoji, c.ingredients, c.nutrition
  from public.household_members hm cross join public.catalog_dishes c
  where hm.user_id = auth.uid() and c.id = catalog_id
  returning id into result_id;
  if result_id is null then raise exception 'Dish not found or household unavailable'; end if;
  return result_id;
end; $$;
revoke all on function public.add_catalog_dish_to_household(uuid) from public, anon;
grant execute on function public.add_catalog_dish_to_household(uuid) to authenticated;
