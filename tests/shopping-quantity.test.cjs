const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function plannedShoppingItems(');
const end = source.indexOf('function renderShoppingListContent(', start);
assert.ok(start >= 0 && end > start);

const context = {
  normalizeIngredient: name => name.trim(),
  manualItemKey: name => name.toLocaleLowerCase('de-DE'),
};
vm.runInNewContext(source.slice(start, end), context);

const weekKey = '2026-11-09';
const curry = { dish: { name: 'Curry', ingredients: ['Hühnchen', 'Reis'] }, weekKey };
const wrap = { dish: { name: 'Wrap', ingredients: ['Hühnchen'] }, weekKey };

test('combines chicken from two planned meals into one item with quantity two', () => {
  const items = context.plannedShoppingItems([curry, wrap], {});
  assert.equal(items.size, 2);
  assert.equal(items.get('hühnchen').plannedQuantity, 2);
  assert.deepEqual([...items.get('hühnchen').dishes], ['Curry', 'Wrap']);
  assert.equal(items.get('reis').plannedQuantity, 1);
});

test('counts each occurrence of the same planned dish once', () => {
  const meal = { dish: { name: 'Curry', ingredients: ['Hühnchen', 'hühnchen'] }, weekKey };
  const items = context.plannedShoppingItems([meal, meal], {});
  assert.equal(items.get('hühnchen').plannedQuantity, 2);
});

test('only counts visible demand when the range spans two calendar weeks', () => {
  const nextWeek = { ...wrap, weekKey: '2026-11-16' };
  const items = context.plannedShoppingItems([curry, nextWeek], { [weekKey]: ['hühnchen'] });
  assert.equal(items.get('hühnchen').plannedQuantity, 1);
});
