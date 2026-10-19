-- Manuell teilbare, kurzlebige Codes zum Beitritt zu einem Haushalt.
create table public.household_join_codes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null
);

alter table public.household_join_codes enable row level security;
revoke all on public.household_join_codes from anon, authenticated;

create or replace function public.create_household_join_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_id uuid := auth.uid();
  target_household_id uuid;
  raw_code text;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select household_id into target_household_id
  from public.household_members
  where user_id = actor_id
  order by joined_at desc
  limit 1;

  if target_household_id is null then
    raise exception 'Household not found';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = actor_id
  ) then
    raise exception 'Household membership required';
  end if;

  update public.household_join_codes
  set expires_at = now()
  where household_id = target_household_id
    and redeemed_at is null
    and expires_at > now();

  -- Twelve hexadecimal characters provide 48 bits of randomness; only a digest is stored.
  raw_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
  insert into public.household_join_codes (household_id, code_hash, created_by, expires_at)
  values (
    target_household_id,
    encode(extensions.digest(raw_code, 'sha256'), 'hex'),
    actor_id,
    now() + interval '30 minutes'
  );

  return raw_code;
end;
$$;

create or replace function public.join_household_with_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_id uuid := auth.uid();
  target_household_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if join_code is null or join_code !~ '^[A-F0-9]{12}$' then
    raise exception 'Invalid or expired join code';
  end if;

  -- Locking the code row makes redemption single-use, including concurrent requests.
  select household_id into target_household_id
  from public.household_join_codes
  where code_hash = encode(extensions.digest(upper(join_code), 'sha256'), 'hex')
    and redeemed_at is null
    and expires_at > now()
  for update;

  if target_household_id is null then
    raise exception 'Invalid or expired join code';
  end if;

  if exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = actor_id
  ) then
    raise exception 'Already a household member';
  end if;

  update public.household_join_codes
  set redeemed_at = now(), redeemed_by = actor_id
  where code_hash = encode(extensions.digest(upper(join_code), 'sha256'), 'hex');

  -- Keep any previous private household and its data; the most recent membership
  -- is the active household returned by ensure_my_household().
  insert into public.household_members (household_id, user_id, role, joined_at)
  values (target_household_id, actor_id, 'member', now());

  return target_household_id;
end;
$$;

create or replace function public.list_my_household_members()
returns table (user_id uuid, role text, joined_at timestamptz, email text)
language sql
stable
security definer
set search_path = public
as $$
  select hm.user_id, hm.role, hm.joined_at, u.email::text
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where hm.household_id = (
    select current_member.household_id
    from public.household_members current_member
    where current_member.user_id = auth.uid()
    order by current_member.joined_at desc
    limit 1
  )
  order by hm.joined_at;
$$;

revoke all on function public.create_household_join_code() from public, anon;
revoke all on function public.join_household_with_code(text) from public, anon;
revoke all on function public.list_my_household_members() from public, anon;
grant execute on function public.create_household_join_code() to authenticated;
grant execute on function public.join_household_with_code(text) to authenticated;
grant execute on function public.list_my_household_members() to authenticated;

-- Use the most recently joined membership as the active household. This keeps
-- existing members working and switches the account immediately after a join.
create or replace function public.ensure_my_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select household_id into existing_household_id
  from public.household_members
  where user_id = auth.uid()
  order by joined_at desc
  limit 1;

  if existing_household_id is not null then
    return existing_household_id;
  end if;

  insert into public.households (name, created_by)
  values ('Mein Haushalt', auth.uid())
  returning id into existing_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (existing_household_id, auth.uid(), 'owner');

  return existing_household_id;
end;
$$;

revoke all on function public.ensure_my_household() from public, anon;
grant execute on function public.ensure_my_household() to authenticated;
