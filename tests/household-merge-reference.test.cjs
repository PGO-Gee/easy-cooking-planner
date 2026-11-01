const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Record the current three-way merge behavior before moving it to the server.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const stable = source.slice(source.indexOf('function stableValue('), source.indexOf('function hasUncanonicalCloudIngredients('));
const merge = source.slice(source.indexOf('function mapValue('), source.indexOf('async function persistConflicts('));
const context = { structuredClone, shortDays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  cleanIngredients: value => value || [], cleanRestDays: value => value || [],
  cleanHiddenShoppingItems: value => value || [] };
vm.runInNewContext(stable + merge, context);
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ dishes: [], plans: {}, pinnedMeals: {}, pantryIngredients: {}, restDays: {}, shoppingChecks: {}, hiddenShoppingItems: {}, manualShoppingItems: {}, shoppingQuantities: {}, noteHidden: false });
const run = (base, local, remote) => plain(context.mergeHouseholdState(base, local, remote));
const dish = (id, name) => ({ id, name });

test('unchanged, one-sided and identical changes have no conflicts', () => {
  const base = empty(); base.dishes = [dish('a', 'Alt')];
  const changed = structuredClone(base); changed.dishes[0].name = 'Neu';
  for (const [local, remote] of [[base, base], [changed, base], [base, changed], [changed, changed]]) {
    const result = run(base, local, remote);
    assert.equal(result.conflicts.length, 0);
    assert.deepEqual(result.state.dishes, remote === base && local === base ? base.dishes : changed.dishes);
  }
});

test('independent dishes and quantities merge while competing edits retain both versions', () => {
  const base = empty(); base.dishes = [dish('a', 'Alt')];
  const local = structuredClone(base); local.dishes[0].name = 'Lokal'; local.dishes.push(dish('b', 'B')); local.shoppingQuantities.milch = '2';
  const remote = structuredClone(base); remote.dishes[0].name = 'Cloud'; remote.dishes.push(dish('c', 'C')); remote.shoppingQuantities.brot = '1';
  const result = run(base, local, remote);
  assert.deepEqual(result.state.dishes.map(item => item.name).sort(), ['B', 'C', 'Cloud']);
  assert.deepEqual(result.state.shoppingQuantities, { milch: '2', brot: '1' });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].localValue.name, 'Lokal');
  assert.equal(result.conflicts[0].remoteValue.name, 'Cloud');
});

test('deletion against an edit remains a conflict', () => {
  const base = empty(); base.dishes = [dish('a', 'Alt')];
  const local = structuredClone(base); local.dishes = [];
  const remote = structuredClone(base); remote.dishes[0].name = 'Cloud';
  const result = run(base, local, remote);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].baseValue.name, 'Alt');
  assert.equal(result.conflicts[0].remoteValue.name, 'Cloud');
  assert.equal(result.conflicts[0].localValue, undefined);
});

test('different planning days merge, while meals and pins on one day are one unit', () => {
  const base = empty(); const local = structuredClone(base); const remote = structuredClone(base);
  const days = () => Array.from({ length: 7 }, () => []);
  local.plans.week = days(); local.pinnedMeals.week = days(); local.plans.week[0] = ['a']; local.pinnedMeals.week[0] = [true];
  remote.plans.week = days(); remote.pinnedMeals.week = days(); remote.plans.week[1] = ['b'];
  let result = run(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.state.plans.week.slice(0, 2), [['a'], ['b']]);
  remote.plans.week[0] = ['c'];
  result = run(base, local, remote);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, 'plan-day');
  assert.deepEqual(result.conflicts[0].localValue, { meals: ['a'], pins: [true] });
});

test('shopping quantities conflict per key and preserve independent keys', () => {
  const base = empty(); base.shoppingQuantities = { milch: '1', brot: '1' };
  const local = structuredClone(base); local.shoppingQuantities = { milch: '2', brot: '1', ei: '6' };
  const remote = structuredClone(base); remote.shoppingQuantities = { milch: '3', brot: '2' };
  const result = run(base, local, remote);
  assert.deepEqual(result.state.shoppingQuantities, { milch: '3', brot: '2', ei: '6' });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, 'quantity');
  assert.deepEqual(result.conflicts[0].key, ['milch']);
  assert.equal(result.conflicts[0].baseValue, '1');
  assert.equal(result.conflicts[0].localValue, '2');
  assert.equal(result.conflicts[0].remoteValue, '3');
});

test('independent shopping checks, hidden items and manual additions merge', () => {
  const base = empty(); const local = structuredClone(base); const remote = structuredClone(base);
  local.shoppingChecks.week = { milch: true }; remote.shoppingChecks.week = { brot: true };
  local.hiddenShoppingItems.week = ['milch']; remote.hiddenShoppingItems.week = ['brot'];
  local.manualShoppingItems.week = ['Milch']; remote.manualShoppingItems.week = ['Brot'];
  const result = run(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.state.shoppingChecks.week, { milch: true, brot: true });
  assert.deepEqual(result.state.hiddenShoppingItems.week, ['brot', 'milch']);
  assert.deepEqual(result.state.manualShoppingItems.week.sort(), ['Brot', 'Milch']);
});
