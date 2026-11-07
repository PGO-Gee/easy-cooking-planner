const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual planner with a small in-memory week, without app boot or a network.
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const planner = source.slice(source.indexOf('function makePlan('), source.indexOf('function formatRange('));
function setup(dishes, days = [], pins = []) {
  const dates = Array.from({ length: 7 }, (_, i) => i);
  const state = { dishes, plans: { week: dates.map(i => (days[i] || []).slice()) }, pinnedMeals: { week: dates.map(i => (pins[i] || []).slice()) }, shoppingChecks: {}, hiddenShoppingItems: {}, pantryIngredients: {}, restDays: {} };
  const ctx = { state, rangeDates: () => dates, planForDate: i => state.plans.week[i], pinnedMealsForDate: i => state.pinnedMeals.week[i],
    keyFor: () => 'week', mondayFor: x => x, dayIndex: x => x, ensurePlanWeek: () => state.plans.week,
    ingredientMatches: (a,b) => a === b, manualItemKey: x => x, cleanHiddenShoppingItems: x => x || [], setRestDay: () => {}, save: () => {} };
  vm.createContext(ctx); vm.runInContext(planner, ctx);
  return ctx;
}
const cake = { id: 'cake', type: 'baking', ingredient: 'Apfel', ingredients: ['Mehl'] };
const soup = { id: 'soup', type: 'meal', ingredient: 'Gemüse', ingredients: ['Karotte'] };
const pasta = { id: 'pasta', ingredient: 'Pasta', ingredients: ['Nudeln'] };

test('baking is excluded from random and pantry-prioritized results', () => {
  const c = setup([cake, soup]);
  const generated = c.makePlan(0, ['Mehl']);
  assert.equal(generated.length, 7);
  assert.ok(generated.every(day => day.length === 1 && day[0] === 'soup'));
});

test('repeated mixing preserves baking order and pins while replacing meals', () => {
  const c = setup([cake, soup, pasta], [['cake', 'pasta', 'cake']], [[true, false, false]]);
  c.replaceRangePlan([]); c.replaceRangePlan([]);
  const day = c.state.plans.week[0];
  assert.equal(day.length, 3);
  assert.equal(day[0], 'cake'); assert.equal(day[2], 'cake');
  assert.notEqual(day[1], 'cake');
  assert.deepEqual(Array.from(c.state.pinnedMeals.week[0]), [true, false, false]);
});

test('a pinned meal blocks a new meal but pinned baking does not', () => {
  const c = setup([cake, soup, pasta], [['cake'], ['cake', 'soup', 'pasta']], [[true], [false, true, false]]);
  c.replaceRangePlan([]);
  assert.equal(c.state.plans.week[0][0], 'cake');
  assert.equal(c.state.plans.week[0].length, 2);
  assert.deepEqual(Array.from(c.state.plans.week[1]), ['cake', 'soup']);
  assert.deepEqual(Array.from(c.state.pinnedMeals.week[1]), [false, true]);
});

test('with only baking, the plan stays intact and reports empty meal slots', () => {
  const c = setup([cake], [['cake']], [[false]]);
  assert.equal(c.replaceRangePlan(['Mehl']), true);
  assert.deepEqual(Array.from(c.state.plans.week[0]), ['cake']);
  assert.equal(c.state.shoppingChecks.week?.Mehl, undefined);
});

test('meal planning keeps pantry prioritization and varies main ingredients', () => {
  const c = setup([soup, pasta, cake]);
  const generated = Array.from(c.makePlan(0, ['Karotte']), day => day[0]);
  assert.equal(generated[0], 'soup');
  for (let i = 1; i < generated.length; i++) assert.notEqual(generated[i], generated[i - 1]);
});
