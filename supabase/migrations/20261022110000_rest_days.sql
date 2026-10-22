alter table public.weekly_plans
  add column if not exists rest_days smallint[] not null default '{}'::smallint[];
