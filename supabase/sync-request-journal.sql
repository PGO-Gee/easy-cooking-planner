-- Draft transaction primitives for the future sync RPCs. Not a migration.
-- A caller must run begin_request, all state reads and writes, and finish_request
-- in the same transaction. Rolling back any part also rolls back the journal.
create schema if not exists wochentisch_sync;
revoke all on schema wochentisch_sync from public, anon, authenticated;

create table if not exists wochentisch_sync.household_revisions (
  household_id uuid primary key references public.households(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);

create table if not exists wochentisch_sync.requests (
  household_id uuid not null references public.households(id) on delete cascade,
  request_id uuid not null,
  user_id uuid not null,
  operation text not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, request_id)
);
alter table wochentisch_sync.household_revisions enable row level security;
alter table wochentisch_sync.requests enable row level security;
revoke all on all tables in schema wochentisch_sync from public, anon, authenticated;

-- Locking the actual household row serializes all sync operations for it.
-- The owner of the eventual RPC is responsible for calling this with elevated
-- privileges. Membership is checked here, before cached responses are read.
create or replace function wochentisch_sync.begin_request(
  p_household_id uuid, p_request_id uuid, p_operation text, p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare prior wochentisch_sync.requests%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  ) then raise exception 'household access denied' using errcode = '42501'; end if;
  if p_request_id is null or p_operation is null or p_payload is null then
    raise exception 'request id, operation and payload are required' using errcode = '22023';
  end if;
  perform 1 from public.households where id = p_household_id for update;
  if not found then raise exception 'household unavailable' using errcode = '42501'; end if;
  -- A request may have waited for the household lock while membership changed.
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  ) then raise exception 'household access denied' using errcode = '42501'; end if;
  select * into prior from wochentisch_sync.requests
  where household_id = p_household_id and request_id = p_request_id;
  if found then
    if prior.user_id <> auth.uid() or prior.operation <> p_operation or prior.payload <> p_payload then
      raise exception 'request id already used with different input' using errcode = '22023';
    end if;
    return prior.response;
  end if;
  return null;
end;
$function$;

-- The caller invokes this exactly once after applying a newly accepted request.
create or replace function wochentisch_sync.finish_request(
  p_household_id uuid, p_request_id uuid, p_operation text, p_payload jsonb,
  p_response jsonb, p_changed boolean
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare current_revision bigint; response jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  ) then raise exception 'household access denied' using errcode = '42501'; end if;
  if p_request_id is null or p_operation is null or p_payload is null or p_response is null or p_changed is null then
    raise exception 'incomplete request result' using errcode = '22023';
  end if;
  insert into wochentisch_sync.household_revisions as revisions (household_id, revision)
  values (p_household_id, case when p_changed then 1 else 0 end)
  on conflict (household_id) do update set revision = revisions.revision + case when p_changed then 1 else 0 end
  returning revision into current_revision;
  response := p_response || jsonb_build_object('revision', current_revision);
  insert into wochentisch_sync.requests (household_id, request_id, user_id, operation, payload, response)
  values (p_household_id, p_request_id, auth.uid(), p_operation, p_payload, response);
  return response;
end;
$function$;
revoke all on function wochentisch_sync.begin_request(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function wochentisch_sync.finish_request(uuid, uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;
