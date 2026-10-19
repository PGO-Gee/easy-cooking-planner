alter table public.weekly_plans
  add column pantry_ingredients jsonb not null default '[]'::jsonb
  check (jsonb_typeof(pantry_ingredients) = 'array');
