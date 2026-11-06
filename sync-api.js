(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WochentischSyncApi = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Conflicts created by earlier PWAs have no presence flags and use another
  // ID format. Omit their ID; the server derives it from the kind and key.
  function conflictForServer(conflict) {
    if (!conflict || typeof conflict !== 'object' || typeof conflict.kind !== 'string' || !Array.isArray(conflict.key)) {
      throw new TypeError('Ungültiger Konflikt.');
    }
    const modern = ['base', 'local', 'remote'].every(side => typeof conflict[`${side}Present`] === 'boolean');
    const result = { kind: conflict.kind, key: structuredClone(conflict.key), label: conflict.label || '' };
    if (modern && typeof conflict.id === 'string') result.id = conflict.id;
    for (const side of ['base', 'local', 'remote']) {
      const value = conflict[`${side}Value`];
      const present = modern ? conflict[`${side}Present`] : value !== undefined &&
        !(['shopping-check', 'hidden-item'].includes(conflict.kind) && value === false);
      if (present && value === undefined) throw new TypeError('Konfliktfassung fehlt.');
      result[`${side}Present`] = present;
      result[`${side}Value`] = present ? structuredClone(value) : null;
    }
    return result;
  }

  // Request persistence and acknowledgement belong to the sync coordinator.
  function create(client) {
    if (!client || typeof client.rpc !== 'function') throw new TypeError('Supabase-Client fehlt.');
    function validConflict(conflict) {
      return conflict && typeof conflict === 'object' && !Array.isArray(conflict) &&
        typeof conflict.id === 'string' && typeof conflict.kind === 'string' &&
        typeof conflict.label === 'string' && Array.isArray(conflict.key) &&
        ['base', 'local', 'remote'].every(side =>
          typeof conflict[`${side}Present`] === 'boolean' &&
          (!conflict[`${side}Present`] || Object.prototype.hasOwnProperty.call(conflict, `${side}Value`)));
    }
    async function call(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          !data.state || typeof data.state !== 'object' || Array.isArray(data.state) ||
          !Array.isArray(data.state.dishes) || !data.state.plans || typeof data.state.plans !== 'object' || Array.isArray(data.state.plans) ||
          !Array.isArray(data.conflicts) || !data.conflicts.every(validConflict) ||
          !Number.isSafeInteger(data.revision) || data.revision < 0) {
        throw new Error('Ungültige Antwort der Synchronisierung.');
      }
      return data;
    }
    function endpointVersion(request) {
      const version = request?.version === undefined ? 1 : request.version;
      if (![1, 2].includes(version)) throw new TypeError('Unbekannte Sync-Version.');
      return version;
    }
    function sync(request) {
      return call(`sync_household_v${endpointVersion(request)}`, {
        p_household_id: request.householdId, p_request_id: request.requestId,
        p_base: request.base, p_local: request.local,
      });
    }
    function resolve(request) {
      return call(`resolve_household_conflict_v${endpointVersion(request)}`, {
        p_household_id: request.householdId, p_request_id: request.requestId,
        p_conflict: conflictForServer(request.conflict), p_choice: request.choice,
      });
    }
    async function pull(householdId) {
      try {
        return await call('read_household_v2', { p_household_id: householdId });
      } catch (error) {
        // Older deployments can still use the transactional sync endpoint.
        if (error?.code === 'PGRST202') return null;
        throw error;
      }
    }
    return Object.freeze({ sync, resolve, pull });
  }
  return Object.freeze({ create, conflictForServer });
});
