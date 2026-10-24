alter table public.planned_meals
  add column if not exists is_pinned boolean not null default false;
