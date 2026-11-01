const assert = require('node:assert/strict');
const test = require('node:test');
const { create } = require('../sync-write-barrier.js');

test('a save during acknowledgement retains its state and submitted base atomically', async () => {
  const records = new Map();
  const batches = [];
  const store = { writeBatch: async writes => { batches.push(structuredClone(writes)); for (const write of writes) records.set(write.key, write.value); } };
  const barrier = create({ store, stateKey: 'state', backupKey: 'backup', pendingKey: 'pending' });
  let release, started, adopted = false;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const commit = barrier.acknowledge({ dishes: ['submitted'] }, async () => { started(); await gate; return true; }, () => { adopted = true; });
  await entered;
  const save = barrier.save({ dishes: ['new edit'] });
  release();
  await Promise.all([commit, save]);
  assert.equal(adopted, true);
  assert.deepEqual(records.get('state'), { dishes: ['new edit'] });
  assert.deepEqual(records.get('backup'), { dishes: ['new edit'] });
  assert.deepEqual(records.get('pending'), { base: { dishes: ['submitted'] } });
  assert.equal(batches.length, 1);
});

test('ordinary saves do not create a pending base and commit errors do not block later saves', async () => {
  const batches = [];
  const barrier = create({ store: { writeBatch: async writes => batches.push(writes) }, stateKey: 'state', backupKey: 'backup', pendingKey: 'pending' });
  await assert.rejects(barrier.acknowledge({}, async () => { throw Error('storage'); }), /storage/);
  await barrier.save({ value: 1 });
  assert.deepEqual(batches[0].map(write => write.key), ['state', 'backup']);
});
