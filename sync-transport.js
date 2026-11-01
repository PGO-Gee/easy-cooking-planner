(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WochentischSyncTransport = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // The caller builds writes for the acknowledged state. The transport commits
  // those writes and removes the request together in one IndexedDB transaction.
  function create({ store, requestKey, createRequest, send, acknowledgementWrites, commitAcknowledgement, locks = globalThis.navigator?.locks, requireLock = typeof window === 'object', requireConditional = typeof window === 'object' }) {
    let running = null;
    async function run() {
      let request = await store.get('records', requestKey);
      if (!request) {
        request = structuredClone(await createRequest());
        if (!request || !request.requestId) throw new Error('Sync-Anfrage ohne Request-ID.');
        // The request must reach durable storage before the network call.
        await store.put('records', requestKey, request);
      }
      const response = await send(structuredClone(request));
      // Build conditional writes again after a concurrent local save. The
      // callback must be side-effect free: only a successful batch is final.
      for (let attempt = 0; attempt < 8; attempt++) {
        const acknowledgement = await acknowledgementWrites(structuredClone(request), response);
        const writes = Array.isArray(acknowledgement) ? acknowledgement : acknowledgement?.writes;
        if (!Array.isArray(writes) || !writes.length || writes.some(write => write.store === 'records' && write.key === requestKey)) {
          throw new Error('Ungültige Bestätigung der Sync-Anfrage.');
        }
        const operations = [...writes, { type: 'remove', store: 'records', key: requestKey }];
        if (Array.isArray(acknowledgement)) {
          if (requireConditional) throw new Error('Sync-Bestätigung benötigt Speicherbedingungen.');
          await store.writeBatch(operations);
          return response;
        }
        if (!Array.isArray(acknowledgement?.conditions) || !acknowledgement.conditions.length ||
            typeof store.writeBatchIfUnchanged !== 'function') {
          throw new Error('Ungültige Speicherbedingungen der Sync-Bestätigung.');
        }
        const conditions = [...acknowledgement.conditions, { store: 'records', key: requestKey, exists: true, value: request }];
        const commit = () => store.writeBatchIfUnchanged(conditions, operations);
        const applied = commitAcknowledgement
          ? await commitAcknowledgement(request, acknowledgement, commit)
          : await commit();
        if (applied) return response;
      }
      throw new Error('Lokale Daten ändern sich weiterhin. Der Abgleich wird erneut versucht.');
    }
    function flush() {
      if (running) return running;
      if (requireLock && (!locks || typeof locks.request !== 'function')) {
        return Promise.reject(new Error('Synchronisierung benötigt die Sperrfunktion dieses Browsers. Lokale Änderungen bleiben gespeichert.'));
      }
      // IndexedDB is shared between tabs. When Web Locks are available, keep
      // request creation, sending and acknowledgement in the same exclusive
      // section across all tabs using this household request key.
      const execute = locks && typeof locks.request === 'function'
        ? () => locks.request(`wochentisch-sync:${requestKey}`, { mode: 'exclusive' }, run)
        : run;
      running = Promise.resolve().then(execute).finally(() => { running = null; });
      return running;
    }
    return Object.freeze({ flush });
  }
  return Object.freeze({ create });
});
