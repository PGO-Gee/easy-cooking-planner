const assert = require('node:assert/strict');
const test = require('node:test');
const { create, conflictForServer } = require('../sync-api.js');

const response = () => ({ state: { dishes: [], plans: {} }, conflicts: [], revision: 1 });

test('sync sends the persisted request unchanged to the versioned RPC', async () => {
  const calls = [];
  const api = create({ rpc: async (name, args) => { calls.push({ name, args }); return { data: response(), error: null }; } });
  const base = { dishes: [], plans: {} }, local = { dishes: [{ id: 'a' }], plans: {} };
  await api.sync({ householdId: 'household', requestId: 'request', base, local });
  assert.deepEqual(calls, [{ name: 'sync_household_v1', args: { p_household_id: 'household', p_request_id: 'request', p_base: base, p_local: local } }]);
});

test('resolve sends the expected cloud version and choice to the versioned RPC', async () => {
  let call;
  const api = create({ rpc: async (name, args) => { call = { name, args }; return { data: response(), error: null }; } });
  const conflict = { id: 'dish:["a"]', kind: 'dish', key: ['a'], label: 'A', basePresent: false, baseValue: null, localPresent: true, localValue: { name: 'Lokal' }, remotePresent: true, remoteValue: { name: 'Cloud' } };
  await api.resolve({ householdId: 'h', requestId: 'r', conflict, choice: 'local' });
  assert.deepEqual(call, { name: 'resolve_household_conflict_v1', args: { p_household_id: 'h', p_request_id: 'r', p_conflict: conflict, p_choice: 'local' } });
});

test('converts legacy conflicts and distinguishes deletion from a present null', () => {
  assert.deepEqual(conflictForServer({ id: 'old-id', kind: 'shopping-check', key: ['week', 'milk'], label: 'Milk', baseValue: true, localValue: false, remoteValue: true }), {
    kind: 'shopping-check', key: ['week', 'milk'], label: 'Milk', basePresent: true, baseValue: true,
    localPresent: false, localValue: null, remotePresent: true, remoteValue: true,
  });
  assert.equal(conflictForServer({ kind: 'dish', key: ['a'], localValue: null }).localPresent, true);
  assert.throws(() => conflictForServer({ kind: 'dish', key: ['a'], basePresent: false, localPresent: true, remotePresent: false }), /Konfliktfassung fehlt/);
});

test('errors and invalid responses fail before acknowledgement', async () => {
  const serverError = new Error('network');
  await assert.rejects(create({ rpc: async () => ({ error: serverError }) }).sync({}), error => error === serverError);
  for (const data of [null, {}, { ...response(), revision: -1 }, { ...response(), conflicts: null }, { ...response(), state: {} }, { ...response(), conflicts: [{}] }]) {
    await assert.rejects(create({ rpc: async () => ({ data }) }).sync({}), /Ungültige Antwort/);
  }
});
