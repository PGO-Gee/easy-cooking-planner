const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const test = require('node:test');
const { create } = require('../sync-coordinator.js');
const { create: createBarrier } = require('../sync-write-barrier.js');

function memoryStore() {
  const records = new Map();
  const id = (store, key) => `${store}:${key}`;
  return {
    records,
    async get(store, key) { return structuredClone(records.get(id(store, key))); },
    async put(store, key, value) { records.set(id(store, key), structuredClone(value)); },
    async writeBatch(writes) {
      for (const write of writes) {
        const key = id(write.store, write.key);
        if (write.type === 'put') records.set(key, structuredClone(write.value)); else records.delete(key);
      }
    },
    async writeBatchIfUnchanged(conditions, writes) {
      for (const condition of conditions) {
        const key = id(condition.store, condition.key);
        if (records.has(key) !== condition.exists || (condition.exists && !isDeepStrictEqual(records.get(key), condition.value))) return false;
      }
      for (const write of writes) {
        const key = id(write.store, write.key);
        if (write.type === 'put') records.set(key, structuredClone(write.value)); else records.delete(key);
      }
      return true;
    },
  };
}
const toShared = state => ({ dishes: structuredClone(state.dishes), plans: structuredClone(state.plans) });
const state = (names, noteHidden = false) => ({ dishes: names, plans: {}, noteHidden });

test('preserves edits made during a request and sends them against the submitted state after restart', async () => {
  const store = memoryStore();
  let release, started, id = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const sending = new Promise(resolve => { started = resolve; });
  const sent = [];
  const options = {
    store, userId: 'u', householdId: 'h', newRequestId: () => `r${++id}`, toShared,
    api: { sync: async request => {
      sent.push(structuredClone(request));
      if (sent.length === 1) { started(); await gate; return { state: toShared(state(['local', 'cloud'])), revision: 1, conflicts: [] }; }
      return { state: toShared(state(['local', 'later', 'cloud'])), revision: 2, conflicts: [] };
    } },
  };
  const first = create(options);
  await store.put('records', first.keys.base, toShared(state([])));
  await store.put('records', first.keys.state, state(['local'], true));
  const running = first.flush();
  await sending;
  await store.put('records', first.keys.state, state(['local', 'later'], true));
  release();
  await running;
  assert.deepEqual(await store.get('records', first.keys.state), state(['local', 'later'], true));
  assert.deepEqual(await store.get('records', first.keys.backup), state(['local', 'later'], true));
  assert.deepEqual(await store.get('records', first.keys.base), toShared(state(['local', 'cloud'])));
  assert.deepEqual(await store.get('records', first.keys.pending), { base: toShared(state(['local'])) });
  const restarted = create(options);
  await restarted.flush();
  assert.deepEqual(sent[1].base, toShared(state(['local'])));
  assert.deepEqual(sent[1].local, toShared(state(['local', 'later'])));
  assert.deepEqual(await store.get('records', first.keys.state), state(['local', 'later', 'cloud'], true));
  assert.deepEqual(await store.get('records', first.keys.backup), state(['local', 'later', 'cloud'], true));
  assert.equal(await store.get('records', first.keys.pending), undefined);
});

test('an in-memory edit during the IndexedDB commit is saved with the submitted base', async () => {
  const store = memoryStore();
  let memory = state(['local']), release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const originalCommit = store.writeBatchIfUnchanged.bind(store);
  store.writeBatchIfUnchanged = async (conditions, writes) => { started(); await gate; return originalCommit(conditions, writes); };
  const barrier = createBarrier({ store, stateKey: 'app-state', backupKey: 'wochentisch-cloud-backup-u', pendingKey: 'sync-pending:u:h' });
  const coordinator = create({ store, userId: 'u', householdId: 'h', toShared, newRequestId: () => 'r',
    beforeSnapshot: () => barrier.drain(), writeBarrier: barrier,
    readMemory: () => memory, applyMemory: value => { memory = value; },
    api: { sync: async () => ({ state: toShared(state(['local', 'cloud'])), revision: 1, conflicts: [] }) } });
  await store.put('records', coordinator.keys.base, toShared(state([])));
  await store.put('records', coordinator.keys.state, memory);
  const sync = coordinator.flush();
  await entered;
  memory = state(['local', 'later']);
  const saved = barrier.save(memory);
  release();
  await Promise.all([sync, saved]);
  assert.deepEqual(memory, state(['local', 'later']));
  assert.deepEqual(await store.get('records', coordinator.keys.state), memory);
  assert.deepEqual(await store.get('records', coordinator.keys.pending), { base: toShared(state(['local'])) });
});

test('failed network call keeps the same request through restart', async () => {
  const store = memoryStore();
  let ids = 0, calls = 0, firstRequest;
  const options = { store, userId: 'u', householdId: 'h', newRequestId: () => `r${++ids}`, toShared,
    api: { sync: async request => {
      calls++;
      if (calls === 1) { firstRequest = structuredClone(request); throw Error('offline'); }
      assert.deepEqual(request, firstRequest);
      return { state: request.local, revision: 1, conflicts: [] };
    } },
  };
  const coordinator = create(options);
  await store.put('records', coordinator.keys.base, toShared(state([])));
  await store.put('records', coordinator.keys.state, state(['local']));
  await assert.rejects(coordinator.flush(), /offline/);
  await create(options).flush();
  assert.equal(ids, 1);
  assert.equal(await store.get('records', coordinator.keys.request), undefined);
});

test('a missing base never starts an upload', async () => {
  const store = memoryStore();
  let sent = false;
  const coordinator = create({ store, userId: 'u', householdId: 'h', toShared, newRequestId: () => 'r', api: { sync: async () => { sent = true; } } });
  await store.put('records', coordinator.keys.state, state(['local']));
  await assert.rejects(coordinator.flush(), /Ausgangsstand/);
  assert.equal(sent, false);
});

test('stores a server deletion in the form expected by the existing conflict display', async () => {
  const store = memoryStore();
  const conflict = { id: 'dish:["a"]', kind: 'dish', key: ['a'], label: 'A', basePresent: true, baseValue: { id: 'a' }, localPresent: false, localValue: null, remotePresent: true, remoteValue: { id: 'a' } };
  const coordinator = create({ store, userId: 'u', householdId: 'h', toShared, newRequestId: () => 'r',
    api: { sync: async () => ({ state: toShared(state([])), revision: 0, conflicts: [conflict] }) } });
  await store.put('records', coordinator.keys.base, toShared(state([])));
  await store.put('records', coordinator.keys.state, state([]));
  await coordinator.flush();
  const stored = await store.get('conflicts', 'u:h:dish:["a"]');
  assert.equal(stored.localValue, undefined);
  assert.equal(stored.localPresent, false);
  assert.deepEqual(stored.remoteValue, { id: 'a' });
});

test('retries a conflict decision after a lost response and removes it only after acknowledgement', async () => {
  const store = memoryStore();
  let attempts = 0, first;
  const conflict = { id: 'dish:["a"]', kind: 'dish', key: ['a'], label: 'A', storageKey: 'u:h:dish:["a"]', localValue: { id: 'a' }, remoteValue: { id: 'b' } };
  const coordinator = create({ store, userId: 'u', householdId: 'h', toShared, newRequestId: () => 'id',
    api: { resolve: async request => {
      if (++attempts === 1) { first = structuredClone(request); throw Error('offline'); }
      assert.deepEqual(request, first);
      return { state: toShared(state(['chosen'])), revision: 1, conflicts: [] };
    } } });
  await store.put('records', coordinator.keys.base, toShared(state([])));
  await store.put('records', coordinator.keys.state, state([]));
  await store.put('conflicts', conflict.storageKey, conflict);
  await assert.rejects(coordinator.resolve(conflict, 'local'), /offline/);
  assert.deepEqual(await store.get('conflicts', conflict.storageKey), conflict);
  await coordinator.flush();
  assert.equal(await store.get('conflicts', conflict.storageKey), undefined);
  assert.deepEqual(await store.get('records', coordinator.keys.state), state(['chosen']));
});
