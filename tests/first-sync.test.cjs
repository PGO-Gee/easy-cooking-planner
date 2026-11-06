const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('async function connectToCloud()');
const end = source.indexOf('function startOfflineApp(', start);
assert.ok(start >= 0 && end > start);

async function connect(choice, { failCommit = false, changedCloud = false, previousHousehold = '' } = {}) {
  const local = { dishes: [{ id: 'local' }], noteHidden: true };
  const cloud = { dishes: [{ id: 'cloud' }], noteHidden: false };
  const effects = { reads: 0, saves: 0, scheduled: 0, status: '' };
  const sandbox = {
    state: structuredClone(local), currentUserId: 'user', currentHouseholdId: '',
    authScope: 0, loadingCloudState: false, hasLocalState: true, cookingHouseholdScopeId: previousHousehold,
    cloudReady: false, cloudBaseState: null, cloudConnectPromise: undefined,
    authClient: {}, unresolvedConflicts: [], offlineMode: false, appInitialized: false,
    offlineStoreReady: true, offlineStoreWriteQueue: Promise.resolve(),
    window: { WochentischStore: { writeBatch: async () => { effects.saves++; if (failCommit) throw Error('storage failed'); } } },
    cloudBaseStorageKey: () => 'base', cloudBackupKey: () => 'backup', appStateKey: () => 'app-state:user', structuredClone,
    document: { visibilityState: 'hidden' }, localStorage: { setItem() {} },
    getCurrentHousehold: async () => 'household', loadOfflineQueues: async () => {},
    rememberCookingHouseholdScope() {}, removeOrphanedCookingProgress: async () => {},
    localShoppingItems: () => new Map(), readCloudBase: async () => null,
    readStateFromCloud: async () => { effects.reads++; const value = structuredClone(cloud); if (changedCloud && effects.reads > 1) value.dishes.push({ id: 'new' }); return { state: value, hasCloudData: true }; },
    emptyState: () => ({ dishes: [] }), hasCloudChanges: (a, b) => JSON.stringify(a.dishes) !== JSON.stringify(b.dishes),
    sameValue: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    chooseFirstSync: async () => choice, closeFirstSync() {}, reconcileCatalogImports: async () => {},
    saveCloudBase: async () => { effects.saves++; }, save() {}, saveCloudBackup() {},
    updateConflictCloudAction() {}, cloudMigrationKey: () => 'migration',
    updateSyncStatus: message => { effects.status = message; },
    hasUncanonicalCloudIngredients: () => false,
    scheduleCloudSync: () => { effects.scheduled++; }, subscribeToHouseholdChanges() {},
    console: { warn() {} },
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  await sandbox.connectToCloud();
  return { sandbox, effects };
}

test('deferring first sync keeps local state and does not upload or establish a base', async () => {
  const { sandbox, effects } = await connect('later');
  assert.equal(sandbox.state.dishes[0].id, 'local');
  assert.equal(sandbox.cloudReady, false);
  assert.equal(effects.saves, 0);
  assert.equal(effects.scheduled, 0);
  assert.match(effects.status, /ausstehend/);
});

test('choosing cloud refreshes it after the decision and keeps local UI preference', async () => {
  const { sandbox, effects } = await connect('cloud');
  assert.equal(sandbox.state.dishes[0].id, 'cloud');
  assert.equal(sandbox.state.noteHidden, true);
  assert.equal(effects.reads, 2);
  assert.equal(effects.scheduled, 0);
});

test('choosing local keeps local state and schedules transfer against the refreshed cloud', async () => {
  const { sandbox, effects } = await connect('local');
  assert.equal(sandbox.state.dishes[0].id, 'local');
  assert.equal(sandbox.cloudBaseState.dishes[0].id, 'cloud');
  assert.equal(effects.reads, 2);
  assert.equal(effects.scheduled, 1);
});

test('a failed first-sync commit leaves local state in place and does not schedule upload', async () => {
  const { sandbox, effects } = await connect('cloud', { failCommit: true });
  assert.equal(sandbox.state.dishes[0].id, 'local');
  assert.equal(sandbox.cloudReady, false);
  assert.equal(effects.scheduled, 0);
});

test('a changed household state prevents an outdated local takeover', async () => {
  const { sandbox, effects } = await connect('local', { changedCloud: true });
  assert.equal(sandbox.state.dishes[0].id, 'local');
  assert.equal(sandbox.cloudReady, false);
  assert.equal(effects.saves, 0);
  assert.equal(effects.scheduled, 0);
  assert.match(effects.status, /hat sich während der Auswahl geändert/);
});

test('switching households never offers the previous household state for upload', async () => {
  const { sandbox, effects } = await connect('local', { previousHousehold: 'old-household' });
  assert.equal(sandbox.state.dishes[0].id, 'cloud');
  assert.equal(sandbox.cloudReady, true);
  assert.equal(effects.reads, 1);
  assert.equal(effects.scheduled, 0);
});
