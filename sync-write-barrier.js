(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WochentischSyncWriteBarrier = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // App saves and acknowledgement commits must share this queue. Saves made
  // while a commit is in progress retain the submitted base in the same
  // transaction as the new local state.
  function create({ store, stateKey, backupKey, pendingKey }) {
    let tail = Promise.resolve(), activeBase;
    function enqueue(action) {
      const next = tail.catch(() => {}).then(action);
      tail = next;
      return next;
    }
    function save(value) {
      const snapshot = structuredClone(value);
      const base = activeBase === undefined ? undefined : structuredClone(activeBase);
      return enqueue(() => {
        const writes = [
          { type: 'put', store: 'records', key: stateKey, value: snapshot },
          { type: 'put', store: 'records', key: backupKey, value: snapshot },
        ];
        if (base !== undefined) writes.push({ type: 'put', store: 'records', key: pendingKey, value: { base } });
        return store.writeBatch(writes);
      });
    }
    function acknowledge(base, commit, adopt) {
      if (activeBase !== undefined) throw new Error('Eine Sync-Bestätigung läuft bereits.');
      activeBase = structuredClone(base);
      return enqueue(async () => {
        try {
          const result = await commit();
          // Runs before the next queued save and before another browser event.
          if (result && adopt) adopt();
          return result;
        } finally { activeBase = undefined; }
      });
    }
    return Object.freeze({ save, acknowledge, drain: () => tail });
  }
  return Object.freeze({ create });
});
