const assert = require('node:assert/strict');
const test = require('node:test');
const { create } = require('../sync-transport.js');

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(store, key) { return structuredClone(records.get(key)); },
    async put(store, key, value) { records.set(key, structuredClone(value)); },
    async writeBatch(operations) {
      const next = new Map(records);
      for (const operation of operations) {
        if (operation.type === 'put') next.set(operation.key, structuredClone(operation.value));
        else if (operation.type === 'remove') next.delete(operation.key);
        else throw Error('invalid operation');
      }
      records.clear(); for (const [key, value] of next) records.set(key, value);
    },
    async writeBatchIfUnchanged(conditions, operations) {
      for (const condition of conditions) {
        if (records.has(condition.key) !== condition.exists ||
            (condition.exists && !require('node:util').isDeepStrictEqual(records.get(condition.key), condition.value))) return false;
      }
      await this.writeBatch(operations);
      return true;
    },
  };
}

test('retries the same persisted request after a lost response and a restart', async () => {
  const store = memoryStore();
  const sent = [];
  let ids = 0;
  const options = {
    store, requestKey: 'user:household',
    createRequest: () => ({ requestId: String(++ids), target: { dishes: ['a'] } }),
    send: async request => { sent.push(request); if (sent.length === 1) throw Error('connection lost'); return { revision: 1 }; },
    acknowledgementWrites: async (request, response) => [{ type: 'put', store: 'records', key: 'base', value: response }],
  };
  await assert.rejects(create(options).flush(), /connection lost/);
  assert.equal(store.records.get(options.requestKey).requestId, '1');
  await create(options).flush();
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(ids, 1);
  assert.equal(store.records.has(options.requestKey), false);
  assert.deepEqual(store.records.get('base'), { revision: 1 });
});

test('does not transmit when saving the request fails', async () => {
  let sent = false;
  const transport = create({
    store: { get: async () => null, put: async () => { throw Error('storage failed'); } },
    requestKey: 'key', createRequest: () => ({ requestId: 'id' }),
    send: async () => { sent = true; }, acknowledgementWrites: async () => [],
  });
  await assert.rejects(transport.flush(), /storage failed/);
  assert.equal(sent, false);
});

test('coalesces concurrent flushes and preserves the request when acknowledgement fails', async () => {
  const store = memoryStore();
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const transport = create({
    store, requestKey: 'key', createRequest: () => ({ requestId: 'id' }),
    send: async () => { calls++; await gate; return {}; },
    acknowledgementWrites: async () => { throw Error('commit failed'); },
  });
  const first = transport.flush(), second = transport.flush();
  assert.equal(first, second);
  release();
  await assert.rejects(first, /commit failed/);
  assert.equal(calls, 1);
  assert.equal(store.records.get('key').requestId, 'id');
});

test('the request is a snapshot even when local data changes while sending', async () => {
  const store = memoryStore();
  const local = { dishes: ['a'] };
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const sending = new Promise(resolve => { started = resolve; });
  let received;
  const transport = create({
    store, requestKey: 'key', createRequest: () => ({ requestId: 'id', target: local }),
    send: async request => { received = request; started(); await gate; return {}; },
    acknowledgementWrites: async () => [{ type: 'put', store: 'records', key: 'base', value: {} }],
  });
  const pending = transport.flush();
  await sending;
  local.dishes.push('b');
  release();
  await pending;
  assert.deepEqual(received.target.dishes, ['a']);
  assert.equal(store.records.has('key'), false);
  assert.deepEqual(local.dishes, ['a', 'b']);
});

test('an aborted acknowledgement keeps the request and old base together', async () => {
  const store = memoryStore();
  await store.put('records', 'base', { revision: 1 });
  store.writeBatch = async () => { throw Error('transaction aborted'); };
  const transport = create({
    store, requestKey: 'request', createRequest: () => ({ requestId: 'id' }),
    send: async () => ({ revision: 2 }),
    acknowledgementWrites: async (request, response) => [{ type: 'put', store: 'records', key: 'base', value: response }],
  });
  await assert.rejects(transport.flush(), /transaction aborted/);
  assert.equal(store.records.get('request').requestId, 'id');
  assert.deepEqual(store.records.get('base'), { revision: 1 });
});

test('serializes transports sharing a request key across tabs', async () => {
  const store = memoryStore();
  let tail = Promise.resolve(), release, started, active = 0, maxActive = 0, ids = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const firstStarted = new Promise(resolve => { started = resolve; });
  const locks = { request(name, options, callback) {
    assert.equal(name, 'wochentisch-sync:user:household');
    assert.equal(options.mode, 'exclusive');
    const next = tail.then(callback);
    tail = next.catch(() => {});
    return next;
  } };
  const options = {
    store, locks, requestKey: 'user:household',
    createRequest: () => ({ requestId: String(++ids) }),
    send: async () => { active++; maxActive = Math.max(maxActive, active); if (ids === 1) { started(); await gate; } active--; return {}; },
    acknowledgementWrites: async () => [{ type: 'put', store: 'records', key: 'base', value: {} }],
  };
  const first = create(options).flush();
  await firstStarted;
  const second = create(options).flush();
  release();
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.equal(ids, 2);
});

test('does not transmit when cross-tab locking is required but unavailable', async () => {
  const store = memoryStore();
  let sent = false;
  const transport = create({
    store, locks: null, requireLock: true, requestKey: 'household',
    createRequest: () => ({ requestId: 'id' }),
    send: async () => { sent = true; }, acknowledgementWrites: async () => [],
  });
  await assert.rejects(transport.flush(), /Sperrfunktion/);
  assert.equal(sent, false);
  assert.equal(store.records.size, 0);
});

test('rebuilds acknowledgement if local state changes before the atomic commit', async () => {
  const store = memoryStore();
  await store.put('records', 'app-state', { edits: ['before'] });
  const writeIfUnchanged = store.writeBatchIfUnchanged.bind(store);
  let first = true, preparations = 0;
  store.writeBatchIfUnchanged = async (conditions, operations) => {
    if (first) { first = false; await store.put('records', 'app-state', { edits: ['before', 'during'] }); }
    return writeIfUnchanged(conditions, operations);
  };
  const transport = create({
    store, requestKey: 'request', createRequest: () => ({ requestId: 'id' }),
    send: async () => ({ revision: 1 }),
    acknowledgementWrites: async () => {
      preparations++;
      const latest = await store.get('records', 'app-state');
      return {
        conditions: [{ store: 'records', key: 'app-state', exists: true, value: latest }],
        writes: [{ type: 'put', store: 'records', key: 'app-state', value: latest }, { type: 'put', store: 'records', key: 'base', value: { revision: 1 } }],
      };
    },
  });
  await transport.flush();
  assert.equal(preparations, 2);
  assert.deepEqual(store.records.get('app-state').edits, ['before', 'during']);
  assert.deepEqual(store.records.get('base'), { revision: 1 });
  assert.equal(store.records.has('request'), false);
});

test('keeps the request if the app state continues changing during acknowledgement', async () => {
  const store = memoryStore();
  store.writeBatchIfUnchanged = async () => false;
  const transport = create({
    store, requestKey: 'request', createRequest: () => ({ requestId: 'id' }), send: async () => ({}),
    acknowledgementWrites: async () => ({ conditions: [{ store: 'records', key: 'state', exists: false }], writes: [{ type: 'put', store: 'records', key: 'base', value: {} }] }),
  });
  await assert.rejects(transport.flush(), /ändern sich weiterhin/);
  assert.equal(store.records.get('request').requestId, 'id');
});

test('replays an unchanged conflict decision after a lost response', async () => {
  const store = memoryStore();
  let created = 0, sent = 0, original;
  const options = {
    store, requestKey: 'resolution',
    createRequest: () => ({ requestId: `decision-${++created}`, choice: 'local', conflict: { id: 'dish-a', remoteValue: { name: 'Cloud' } } }),
    send: async request => {
      if (++sent === 1) { original = structuredClone(request); throw Error('connection lost'); }
      assert.deepEqual(request, original);
      return { revision: 3 };
    },
    acknowledgementWrites: async () => ({
      conditions: [{ store: 'records', key: 'state', exists: false }],
      writes: [{ type: 'put', store: 'records', key: 'revision', value: 3 }],
    }),
  };
  await assert.rejects(create(options).flush(), /connection lost/);
  await create(options).flush();
  assert.equal(created, 1);
  assert.equal(store.records.has('resolution'), false);
  assert.equal(store.records.get('revision'), 3);
});
