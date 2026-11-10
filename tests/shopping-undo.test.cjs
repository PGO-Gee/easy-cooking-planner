const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('const shoppingCheckUndoDuration');
const end = source.indexOf('let shoppingHistoryLoad=', start);
assert.ok(start >= 0 && end > start);

function setup(permission = 'granted') {
  const elements = new Map();
  const listeners = new Map();
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
    navigator: { maxTouchPoints: 5 },
    window: {
      isSecureContext: true,
      DeviceMotionEvent: { requestPermission: async () => permission },
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: type => listeners.delete(type),
    },
    document: { hidden: false, querySelector: () => elements.get('#shopping-undo-dialog').open },
    $(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        classList: { contains: () => false },
        setAttribute(name, value) { this[name] = value; },
        addEventListener(type, listener) { this[type] = listener; },
        showModal() { this.open = true; },
        close() { this.open = false; this.closeListener(); },
      });
      return elements.get(selector);
    },
    shoppingItemChecked: (week, key) => context.state.shoppingChecks[week]?.[key] === true,
    showToast(text, options) { toast = { text, ...options }; },
    save: () => calls.push('save'),
    renderShoppingList: () => calls.push('render'),
  };
  // Keep the stub's close method separate from its close event listener.
  const dialog = context.$('#shopping-undo-dialog');
  dialog.addEventListener = (type, listener) => { dialog.closeListener = listener; };
  vm.runInNewContext(source.slice(start, end), context);
  context.offerShoppingCheckUndo({
    key: 'milch', name: 'Milch', changedWeeks: ['secondWeek'], quantity: 3, scope: 1, householdId: 'home',
  });
  return {
    context, dialog, calls, listeners,
    toast: () => toast,
    advance: ms => { now += ms; },
    motion: x => listeners.get('devicemotion')?.({ acceleration: { x, y: 0, z: 0 } }),
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

test('opposite impulses ask for confirmation and can be disabled', async () => {
  const { context, dialog, calls, motion, listeners, advance } = setup();
  const toggle = context.$('#shopping-shake-toggle');
  await toggle.click();
  motion(15);
  motion(16);
  assert.equal(dialog.open, undefined);
  motion(-15);
  assert.equal(dialog.open, true);
  assert.deepEqual(calls, []);
  context.$('#shopping-undo-cancel').click();
  assert.equal(dialog.open, false);
  assert.deepEqual(calls, []);

  motion(15);
  motion(-15);
  advance(11000);
  context.$('#shopping-undo-confirm').click();
  assert.equal(dialog.open, false);
  assert.deepEqual(calls, ['save', 'render']);
  await toggle.click();
  assert.equal(listeners.has('devicemotion'), false);
});

test('denying sensor permission leaves the toggle off and the shopping state intact', async () => {
  const { context, listeners, calls } = setup('denied');
  const toggle = context.$('#shopping-shake-toggle');
  await toggle.click();
  assert.equal(toggle.disabled, false);
  assert.equal(listeners.has('devicemotion'), false);
  assert.deepEqual(calls, []);
});
