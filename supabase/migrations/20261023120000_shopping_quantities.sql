alter table public.weekly_plans
  add column if not exists shopping_quantities jsonb not null default '{}'::jsonb;
