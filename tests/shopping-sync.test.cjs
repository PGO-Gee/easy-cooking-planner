const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the existing merge independently of the browser UI.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function mergeShoppingItems(');
const end = source.indexOf('function mergeShoppingChecks(', start);
assert.ok(start >= 0 && end > start, 'shopping merge must exist');
const context = { conflictRecord: (...args) => ({ args }) };
vm.runInNewContext(source.slice(start, end), context);
const merge = (base, local, remote) => {
  const conflicts = [];
  const week = '2026-10-26';
  const result = context.mergeShoppingItems({ [week]: base }, { [week]: local }, { [week]: remote }, conflicts);
  return { items: Array.from(result[week] || []), conflicts };
};

test('keeps a locally added item when the cloud still has the previous state', () => {
  assert.deepEqual(merge([], ['Milch'], []).items, ['Milch']);
});

test('combines independent additions from two devices', () => {
  assert.deepEqual(new Set(merge([], ['Milch'], ['Brot']).items), new Set(['Milch', 'Brot']));
});

test('retains a local deletion when the cloud item is unchanged', () => {
  assert.deepEqual(merge(['Milch'], [], ['Milch']).items, []);
});

test('collects planned ingredients and manual items before starting sync', () => {
  const itemsStart = source.indexOf('function localShoppingItems(');
  const itemsEnd = source.indexOf('async function reconcileCatalogImports(', itemsStart);
  const week = '2026-10-26';
  const sandbox = {
    rangeDates: () => [new Date(2026, 9, 26)],
    mondayFor: date => date,
    keyFor: () => week,
    dayIndex: () => 0,
    manualItemKey: name => name.toLowerCase(),
  };
  vm.runInNewContext(source.slice(itemsStart, itemsEnd), sandbox);
  const items = sandbox.localShoppingItems({
    dishes: [{ id: 'meal', ingredients: ['Milch'] }],
    plans: { [week]: [['meal']] },
    manualShoppingItems: { [week]: ['milch', 'Brot'] },
  });
  assert.deepEqual(Object.fromEntries(items), { milch: 'Milch', brot: 'Brot' });
});

test('keeps an item added while sync is persisting conflicts', async () => {
  const syncStart = source.indexOf('async function syncStateToCloud(');
  const syncEnd = source.indexOf('function scheduleCloudSync(', syncStart);
  assert.ok(syncStart >= 0 && syncEnd > syncStart);
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const sandbox = {
    structuredClone, Date,
    authScope: 0, cloudReady: true, currentHouseholdId: 'household', currentUserId: 'user', state: { items: [] },
    cloudBaseState: { items: [] }, unresolvedConflicts: [], appInitialized: false,
    document: { visibilityState: 'hidden' },
    prepareLocalIdsForCloud() {}, localShoppingItems: () => new Map(),
    getSyncCoordinator: () => ({ keys: { pending: 'pending' }, flush: async () => { started(); await gate; } }),
    syncWriteBarrier: { drain: async () => {} }, readCloudBase: async () => ({ items: [] }),
    loadOfflineQueues: async () => {}, window: { WochentischStore: { get: async () => null } }, save() {},
    reconcileCatalogImports: async () => {}, removeOrphanedCookingProgress: async () => {}, updateSyncStatus() {},
    hasCloudChanges: () => false, scheduleCloudSync() {}
  };
  vm.runInNewContext(source.slice(syncStart, syncEnd), sandbox);
  const sync = sandbox.syncStateToCloud();
  await waiting;
  sandbox.state.items.push('Milch');
  release();
  await sync;
  assert.deepEqual(Array.from(sandbox.state.items), ['Milch']);
});
