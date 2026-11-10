const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('const shoppingCheckUndoDuration');
const end = source.indexOf('let shoppingHistoryLoad=', start);
assert.ok(start >= 0 && end > start);

function setup() {
  const calls = [];
  let now = 1000;
  let toast;
  const context = {
    Date: { now: () => now },
    authScope: 1,
    currentHouseholdId: 'home',
    state: {
      shoppingChecks: { firstWeek: { milch: true }, secondWeek: { milch: true, brot: true } },
      hiddenShoppingItems: {},
      shoppingQuantities: {},
    },
    $: () => ({ classList: { contains: () => false } }),
    shoppingItemChecked: (week, key) => context.state.shoppingChecks[week]?.[key] === true,
    showToast(text, options) { toast = { text, ...options }; },
    save: () => calls.push('save'),
    renderShoppingList: () => calls.push('render'),
  };
  vm.runInNewContext(source.slice(start, end), context);
  context.offerShoppingCheckUndo({
    key: 'milch', name: 'Milch', changedWeeks: ['secondWeek'], quantity: 3, scope: 1, householdId: 'home',
  });
  return {
    context, calls,
    toast: () => toast,
    advance: ms => { now += ms; },
  };
}

test('undo restores only the newly checked weeks and the previous quantity', () => {
  const { context, toast, calls } = setup();
  toast().onAction();
  assert.deepEqual(context.state.shoppingChecks, { firstWeek: { milch: true }, secondWeek: { brot: true } });
  assert.equal(context.state.shoppingQuantities.milch, 3);
  assert.deepEqual(calls, ['save', 'render']);
});

test('undo keeps newer quantities and rejects expired or stale actions', () => {
  const updated = setup();
  updated.context.state.shoppingQuantities.milch = 5;
  updated.toast().onAction();
  assert.equal(updated.context.state.shoppingQuantities.milch, 5);

  const expired = setup();
  expired.advance(10001);
  expired.toast().onAction();
  assert.deepEqual(expired.calls, []);

  const stale = setup();
  stale.context.currentHouseholdId = 'other';
  stale.toast().onAction();
  assert.deepEqual(stale.calls, []);
});
