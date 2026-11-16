(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sync-transport.js'));
  else root.WochentischSyncCoordinator = factory(root.WochentischSyncTransport);
})(typeof globalThis === 'object' ? globalThis : this, function (transportModule) {
  'use strict';

  // The UI drains its local write queue before snapshots and uses the write
  // barrier to preserve edits made during the IndexedDB transaction.
  function create({ store, api, userId, householdId, stateKey = 'app-state', newRequestId, toShared, beforeSnapshot = async () => {}, writeBarrier, readMemory, applyMemory, locks, requireLock, requireConditional, apiVersion = 2 }) {
    if (!store || !api || !userId || !householdId || typeof newRequestId !== 'function' || typeof toShared !== 'function') {
      throw new TypeError('Synchronisierung ist nicht vollständig eingerichtet.');
    }
    const suffix = `${userId}:${householdId}`;
    const keys = {
      state: stateKey,
      base: `wochentisch-cloud-base-${userId}-${householdId}`,
      backup: `wochentisch-cloud-backup-${userId}`,
      request: `sync-request:${suffix}`,
      pending: `sync-pending:${suffix}`,
      revision: `sync-revision:${suffix}`,
    };
    const put = (storeName, key, value) => ({ type: 'put', store: storeName, key, value: structuredClone(value) });
    const remove = (storeName, key) => ({ type: 'remove', store: storeName, key });
    function stable(value) {
      if (Array.isArray(value)) return value.map(stable);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
      return value;
    }
    const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
    function makeTransport(decision) { return transportModule.create({
      store, requestKey: keys.request, locks, requireLock, requireConditional,
      commitAcknowledgement: writeBarrier ? (request, acknowledgement, commit) =>
        writeBarrier.acknowledge(request.local, commit, acknowledgement.onCommit) : undefined,
      async createRequest() {
        await beforeSnapshot();
        const [state, base, pending] = await Promise.all([
          store.get('records', keys.state), store.get('records', keys.base), store.get('records', keys.pending),
        ]);
        if (!state || !base) throw new Error('Ein bestätigter Ausgangsstand und lokale Daten sind erforderlich.');
        if (decision) {
          const stored = await store.get('conflicts', decision.storageKey);
          if (!stored || !equal(stored, decision.conflict)) throw new Error('Der Konflikt wurde inzwischen geändert.');
          if (pending || !equal(toShared(state), toShared(base))) throw new Error('Bitte zuerst ausstehende Änderungen synchronisieren.');
          return { operation: 'resolve', version: stored.apiVersion || 1, householdId, requestId: newRequestId(), local: toShared(state), conflict: stored, storageKey: decision.storageKey, choice: decision.choice };
        }
        const sharedBase = pending?.base ? toShared(pending.base) : toShared(base);
        const local = toShared(state);
        const operation = api.pull && !pending && equal(sharedBase, local) ? 'pull' : 'sync';
        return { operation, version: apiVersion, householdId, requestId: newRequestId(), base: sharedBase, local };
      },
      async send(request) {
        // Keep an old persisted request intact. If the server rejects its legacy
        // plan writer after v3 activation, persist a separately identified v3
        // request before retrying the same intent against the new merge units.
        const upgradeKey = `sync-upgrade:${suffix}:${request.requestId}`;
        const priorUpgrade = apiVersion >= 3 && request.operation === 'sync' && (request.version || 1) < 3
          ? await store.get('records', upgradeKey) : null;
        if (priorUpgrade) return { ...await api.sync(priorUpgrade), apiVersion: 3, upgradeKey };
        try {
          if (request.operation === 'resolve') return await api.resolve(request);
          if (request.operation === 'pull' && api.pull) {
            const snapshot = await api.pull(request.householdId);
            if (snapshot) return snapshot;
          }
          return await api.sync(request);
        } catch (error) {
          if (apiVersion < 3 || request.operation !== 'sync' || (request.version || 1) >= 3 ||
              error?.code !== '22023' || !String(error.message).includes('Bitte die App aktualisieren')) throw error;
          const upgrade = { operation: 'sync', version: 3, householdId, requestId: newRequestId(), base: toShared(request.base), local: toShared(request.local) };
          await store.put('records', upgradeKey, upgrade);
          return { ...await api.sync(upgrade), apiVersion: 3, upgradeKey };
        }
      },
      async acknowledgementWrites(request, response) {
        await beforeSnapshot();
        const latest = await store.get('records', keys.state);
        if (!latest) throw new Error('Lokaler Zustand für die Sync-Bestätigung fehlt.');
        const hasLaterChanges = !equal(toShared(latest), toShared(request.local));
        const next = hasLaterChanges ? latest : { ...response.state, noteHidden: Boolean(latest.noteHidden) };
        const writes = [put('records', keys.state, next), put('records', keys.backup, next), put('records', keys.base, response.state), put('records', keys.revision, response.revision)];
        if (hasLaterChanges) writes.push(put('records', keys.pending, { base: request.local }));
        else writes.push(remove('records', keys.pending));
        if (response.upgradeKey) writes.push(remove('records', response.upgradeKey));
        const conditions = [{ store: 'records', key: keys.state, exists: true, value: latest }];
        if (request.operation === 'resolve') {
          const currentConflict = await store.get('conflicts', request.storageKey);
          if (!currentConflict || !equal(currentConflict, request.conflict)) throw new Error('Der Konflikt wurde inzwischen geändert.');
          conditions.push({ store: 'conflicts', key: request.storageKey, exists: true, value: currentConflict });
          writes.push(remove('conflicts', request.storageKey));
        }
        for (const conflict of response.conflicts) {
          const storageKey = `${suffix}:${conflict.id}`;
          const displayed = { ...conflict, apiVersion: response.apiVersion || request.version || 1, userId, householdId, storageKey };
          for (const side of ['base', 'local', 'remote']) {
            if (!conflict[`${side}Present`]) displayed[`${side}Value`] = undefined;
          }
          writes.push(put('conflicts', storageKey, displayed));
        }
        return { conditions, writes, onCommit: () => {
          if (readMemory && applyMemory && equal(readMemory(), latest)) applyMemory(structuredClone(next));
        } };
      },
    }); }
    const transport = makeTransport();
    async function resolve(conflict, choice) {
      if (!conflict?.storageKey || !['local', 'remote'].includes(choice)) throw new TypeError('Ungültige Konfliktentscheidung.');
      const existing = await store.get('records', keys.request);
      if (existing) {
        const result = await transport.flush();
        if (existing.operation === 'resolve' && existing.storageKey === conflict.storageKey && existing.choice === choice) return result;
      }
      return makeTransport({ conflict, storageKey: conflict.storageKey, choice }).flush();
    }
    return Object.freeze({ flush: transport.flush, resolve, keys: Object.freeze(keys) });
  }
  return Object.freeze({ create });
});
