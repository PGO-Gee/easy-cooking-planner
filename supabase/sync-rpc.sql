-- Draft public wrappers. Do not install independently: all helpers, security
-- tests and the client rollout must be ready before these are exposed.
create or replace function public.sync_household_v1(
  p_household_id uuid, p_request_id uuid, p_base jsonb, p_local jsonb
) returns jsonb
language sql security definer set search_path = ''
as $function$
  select wochentisch_sync.sync_transaction(p_household_id, p_request_id, p_base, p_local);
$function$;

create or replace function public.resolve_household_conflict_v1(
  p_household_id uuid, p_request_id uuid, p_conflict jsonb, p_choice text
) returns jsonb
language sql security definer set search_path = ''
as $function$
  select wochentisch_sync.resolve_transaction(p_household_id, p_request_id, p_conflict, p_choice);
$function$;

revoke all on function public.sync_household_v1(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_household_conflict_v1(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.sync_household_v1(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.resolve_household_conflict_v1(uuid, uuid, jsonb, text) to authenticated;
