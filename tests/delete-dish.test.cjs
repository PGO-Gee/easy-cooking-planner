const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deleteRecipe(confirmed, id = 'a') {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = source.indexOf('function deleteDish(){');
  const end = source.indexOf("$('#add-dish-btn').addEventListener", start);
  assert.ok(start >= 0 && end > start);
  const state = {
    dishes: [{ id: 'a', name: 'Linsensuppe' }, { id: 'b', name: 'Salat' }],
    plans: { week: [['a', 'b', 'a'], ['b']] },
    pinnedMeals: { week: [[true, false, true], [true]] }
  };
  const calls = [];
  const context = {
    state,
    $: selector => selector === '#dish-id' ? { value: id } : { close: () => calls.push('close') },
    confirm: message => { calls.push(message); return confirmed; },
    removeCatalogImportForDish: value => calls.push(`import:${value}`),
    removeDishProgressForCurrentScope: value => calls.push(`progress:${value}`),
    save: () => calls.push('save'),
    renderDishes: () => calls.push('dishes'),
    renderCalendar: () => calls.push('calendar'),
    showToast: () => calls.push('toast')
  };
  vm.runInNewContext(`${source.slice(start, end)}\ndeleteDish()`, context);
  return { state, calls };
}

test('cancelling deletion leaves the recipe, plans and pins untouched', () => {
  const { state, calls } = deleteRecipe(false);
  assert.deepEqual(state.dishes.map(dish => dish.id), ['a', 'b']);
  assert.deepEqual(state.plans.week, [['a', 'b', 'a'], ['b']]);
  assert.deepEqual(state.pinnedMeals.week, [[true, false, true], [true]]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Linsensuppe.*Wochenplan/);
});

test('confirming deletion removes the recipe and its planned occurrences', () => {
  const { state, calls } = deleteRecipe(true);
  assert.deepEqual(Array.from(state.dishes, dish => dish.id), ['b']);
  assert.deepEqual(state.plans.week, [['b'], ['b']]);
  assert.deepEqual(state.pinnedMeals.week, [[false], [true]]);
  assert.deepEqual(calls.slice(1), ['import:a', 'progress:a', 'save', 'close', 'dishes', 'calendar', 'toast']);
});

test('a missing recipe does not prompt or change data', () => {
  const { state, calls } = deleteRecipe(true, 'missing');
  assert.equal(state.dishes.length, 2);
  assert.deepEqual(calls, []);
});
