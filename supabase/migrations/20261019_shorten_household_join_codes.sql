-- Verkürzt den manuell teilbaren Code. Der Suchraum wird durch kurze Gültigkeit,
-- Einmalnutzung und höchstens einen aktiven Code je Haushalt begrenzt.
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
  random_bytes bytea;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  character_index integer;
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

  -- Serialize code creation for this household so only the newest code remains active.
  perform 1 from public.households where id = target_household_id for update;

  update public.household_join_codes
  set expires_at = now()
  where household_id = target_household_id
    and redeemed_at is null
    and expires_at > now();

  -- Eight unambiguous base32 characters provide 40 bits; only a digest is stored.
  random_bytes := extensions.gen_random_bytes(8);
  raw_code := '';
  for character_index in 0..7 loop
    raw_code := raw_code || substr(alphabet, (get_byte(random_bytes, character_index) % 32) + 1, 1);
  end loop;
  insert into public.household_join_codes (household_id, code_hash, created_by, expires_at)
  values (
    target_household_id,
    encode(extensions.digest(raw_code, 'sha256'), 'hex'),
    actor_id,
    now() + interval '10 minutes'
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

  if join_code is null or join_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    raise exception 'Invalid or expired join code';
  end if;

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

  insert into public.household_members (household_id, user_id, role, joined_at)
  values (target_household_id, actor_id, 'member', now());

  return target_household_id;
end;
$$;
