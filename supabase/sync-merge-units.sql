-- Draft query for the versioned sync implementation. The three arguments are
-- JSON objects keyed by a stable unit ID. Each unit contains a `value` and a
-- descriptor (`kind`, `key`, `label`). A missing key represents deletion;
-- explicit JSON null is a present value and remains distinct from deletion.
-- This file is a query, not a migration and does not change the database.
with keys as (
  select jsonb_object_keys(coalesce($1::jsonb, '{}'::jsonb)) as id
  union select jsonb_object_keys(coalesce($2::jsonb, '{}'::jsonb))
  union select jsonb_object_keys(coalesce($3::jsonb, '{}'::jsonb))
), values_by_unit as (
  select id,
    $1::jsonb ? id as base_present, $2::jsonb ? id as local_present, $3::jsonb ? id as remote_present,
    $1::jsonb -> id as base_unit, $2::jsonb -> id as local_unit, $3::jsonb -> id as remote_unit
  from keys
), comparable as (
  select *,
    case when coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item' and base_present then 'true'::jsonb else base_unit -> 'value' end as base_value,
    case when coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item' and local_present then 'true'::jsonb else local_unit -> 'value' end as local_value,
    case when coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item' and remote_present then 'true'::jsonb else remote_unit -> 'value' end as remote_value
  from values_by_unit
), decisions as (
  select *,
    (local_present is distinct from base_present or local_value is distinct from base_value) as local_changed,
    (remote_present is distinct from base_present or remote_value is distinct from base_value) as remote_changed,
    (local_present is not distinct from remote_present and local_value is not distinct from remote_value) as equal_changes
  from comparable
), merged as (
  select *,
    local_changed and remote_changed and not equal_changes as conflicted,
    case when not local_changed or (remote_changed and not equal_changes)
      or (local_present and remote_present and coalesce(local_unit, remote_unit, base_unit) ->> 'kind' = 'manual-item')
      then remote_unit else local_unit end as result_unit,
    case when not local_changed or (remote_changed and not equal_changes) then remote_present else local_present end as result_present,
    coalesce(local_unit, remote_unit, base_unit) as descriptor
  from decisions
)
select jsonb_build_object(
  'units', coalesce(jsonb_object_agg(id, result_unit) filter (where result_present), '{}'::jsonb),
  'conflicts', coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'kind', descriptor -> 'kind', 'key', descriptor -> 'key', 'label', descriptor -> 'label',
    'basePresent', base_present, 'localPresent', local_present, 'remotePresent', remote_present,
    'baseValue', base_unit -> 'value', 'localValue', local_unit -> 'value', 'remoteValue', remote_unit -> 'value'
  ) order by id) filter (where conflicted), '[]'::jsonb)
) as result
from merged;
