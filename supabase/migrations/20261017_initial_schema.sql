-- Wochentisch: gemeinsame Daten, geschützt über Supabase Auth und RLS.
-- Diese Datei einmal im Supabase SQL Editor ausführen.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mein Haushalt' check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  ingredient text not null default '',
  cooking_time_minutes smallint not null default 30 check (cooking_time_minutes between 0 and 360),
  emoji text not null default '🍽️',
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  nutrition jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null check (week_start = date_trunc('week', week_start)::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (weekly_plan_id, day_of_week, position)
);

-- Zutaten aus Gerichten werden in der App berechnet. Diese Tabelle speichert
-- nur zusätzlich eingetragene Artikel.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  normalized_name text not null check (char_length(normalized_name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (weekly_plan_id, normalized_name)
);

-- Der Schlüssel ist z. B. "reis" für eine Zutat oder "manual:<uuid>" für
-- einen manuell angelegten Artikel. Nur abgehakte Einträge werden gespeichert.
create table public.shopping_item_checks (
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 160),
  checked_at timestamptz not null default now(),
  primary key (weekly_plan_id, item_key)
);

create index dishes_household_id_idx on public.dishes(household_id);
create index weekly_plans_household_week_idx on public.weekly_plans(household_id, week_start);
create index planned_meals_plan_day_idx on public.planned_meals(weekly_plan_id, day_of_week, position);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger households_set_updated_at before update on public.households
for each row execute procedure public.set_updated_at();
create trigger dishes_set_updated_at before update on public.dishes
for each row execute procedure public.set_updated_at();
create trigger weekly_plans_set_updated_at before update on public.weekly_plans
for each row execute procedure public.set_updated_at();

-- Jeder neue angemeldete Nutzer erhält automatisch einen privaten Haushalt.
create function public.create_household_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.households (name, created_by)
  values ('Mein Haushalt', new.id)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');
  return new;
end;
$$;

create trigger create_household_after_signup
after insert on auth.users
for each row execute procedure public.create_household_for_new_user();

-- Der bereits angemeldete erste Nutzer existiert vor dem Trigger. Diese Zeilen
-- legen ihm deshalb ebenfalls genau einen privaten Haushalt an.
insert into public.households (name, created_by)
select 'Mein Haushalt', u.id
from auth.users u
where not exists (
  select 1 from public.household_members hm where hm.user_id = u.id
);

insert into public.household_members (household_id, user_id, role)
select h.id, h.created_by, 'owner'
from public.households h
where not exists (
  select 1 from public.household_members hm
  where hm.household_id = h.id and hm.user_id = h.created_by
);

-- Policies prüfen die Mitgliedschaft innerhalb der Datenbank. Der Client darf
-- nur einen Publishable Key verwenden; Secret/service_role Keys bleiben geheim.
create function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid()
  );
$$;

create function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create function public.can_use_dish_in_plan(target_plan_id uuid, target_dish_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.weekly_plans wp
    join public.dishes d on d.id = target_dish_id and d.household_id = wp.household_id
    where wp.id = target_plan_id and public.is_household_member(wp.household_id)
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.dishes enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.planned_meals enable row level security;
alter table public.shopping_items enable row level security;
alter table public.shopping_item_checks enable row level security;

revoke all on public.households, public.household_members, public.dishes,
  public.weekly_plans, public.planned_meals, public.shopping_items,
  public.shopping_item_checks from anon;
revoke all on function public.is_household_member(uuid), public.is_household_owner(uuid),
  public.can_use_dish_in_plan(uuid, uuid) from public, anon;
grant select, update on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.dishes to authenticated;
grant select, insert, update, delete on public.weekly_plans to authenticated;
grant select, insert, update, delete on public.planned_meals to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.shopping_item_checks to authenticated;
grant execute on function public.is_household_member(uuid), public.is_household_owner(uuid),
  public.can_use_dish_in_plan(uuid, uuid) to authenticated;

create policy "Household members can read their household"
on public.households for select to authenticated
using (public.is_household_member(id));
create policy "Household owners can rename their household"
on public.households for update to authenticated
using (public.is_household_owner(id))
with check (public.is_household_owner(id));

create policy "Household members can view members"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));

create policy "Members manage dishes"
on public.dishes for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage weekly plans"
on public.weekly_plans for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Members manage planned meals"
on public.planned_meals for all to authenticated
using (public.can_use_dish_in_plan(weekly_plan_id, dish_id))
with check (public.can_use_dish_in_plan(weekly_plan_id, dish_id));

create policy "Members manage manual shopping items"
on public.shopping_items for all to authenticated
using (exists (
  select 1 from public.weekly_plans wp
  where wp.id = weekly_plan_id and public.is_household_member(wp.household_id)
))
with check (exists (
  select 1 from public.weekly_plans wp
  where wp.id = weekly_plan_id and public.is_household_member(wp.household_id)
));

create policy "Members manage shopping checks"
on public.shopping_item_checks for all to authenticated
using (exists (
  select 1 from public.weekly_plans wp
  where wp.id = weekly_plan_id and public.is_household_member(wp.household_id)
))
with check (exists (
  select 1 from public.weekly_plans wp
  where wp.id = weekly_plan_id and public.is_household_member(wp.household_id)
));
