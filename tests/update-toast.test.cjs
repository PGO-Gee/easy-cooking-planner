const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const toastStart = source.indexOf('function showToast(');
const toastEnd = source.indexOf('\n', toastStart);
const updateListeners = source.split('\n').filter(line => line.startsWith("window.addEventListener('wochentisch:update-"));
assert.ok(toastStart >= 0 && updateListeners.length === 2);

function setup() {
  const handlers = {};
  const toast = {
    children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    replaceChildren() { this.children = []; },
    append(child) { this.children.push(child); },
  };
  const calls = [];
  const context = {
    authScope: 0, currentHouseholdId: '', toastTimer: null,
    $: () => toast,
    document: { createElement: () => ({ addEventListener(type, callback) { this[type] = callback; } }) },
    window: { addEventListener(type, callback) { handlers[type] = callback; }, activateWochentischUpdate: worker => calls.push(worker) },
    setTimeout: () => 1, clearTimeout() {},
  };
  vm.runInNewContext(source.slice(toastStart, toastEnd) + '\n' + updateListeners.join('\n'), context);
  return { context, handlers, toast, calls };
}

for (const eventName of ['wochentisch:update-ready', 'wochentisch:update-blocked']) {
  test(`${eventName} remains actionable when the account or household loads`, () => {
    const { context, handlers, toast, calls } = setup();
    const worker = {};
    handlers[eventName]({ detail: worker });
    context.authScope++;
    context.currentHouseholdId = 'household';
    toast.children[1].click();
    assert.deepEqual(calls, [worker]);
  });
}

test('ordinary toast actions remain blocked after a household change', () => {
  const { context, toast, calls } = setup();
  context.showToast('Test', { actionLabel: 'Rückgängig', onAction: () => calls.push('undo') });
  context.currentHouseholdId = 'another-household';
  toast.children[1].click();
  assert.deepEqual(calls, []);
});
