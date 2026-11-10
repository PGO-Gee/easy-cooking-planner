const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual planner with a small in-memory week, without app boot or a network.
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const planner = source.slice(source.indexOf('function makePlan('), source.indexOf('function formatRange('));
const calendar = source.slice(source.indexOf('function mondayFor('), source.indexOf('function ensurePlanForDate('));
const start = new Date(2026, 10, 9);
const week = '2026-11-09';
function setup(dishes, days = [], pins = []) {
  const state = { dishes, plans: { [week]: Array.from({ length: 7 }, (_, i) => (days[i] || []).slice()) }, pinnedMeals: { [week]: Array.from({ length: 7 }, (_, i) => (pins[i] || []).slice()) }, shoppingChecks: {}, hiddenShoppingItems: {}, pantryIngredients: {}, restDays: {} };
  const ctx = { state, start, pinnedMealsForDate: date => state.pinnedMeals[ctx.keyFor(ctx.mondayFor(date))]?.[ctx.dayIndex(date)] || [],
    ingredientKey: x => ({kartoffel:'kartoffeln'}[x.toLowerCase()] || x.toLowerCase()), ingredientMatches: (a,b) => a === b, manualItemKey: x => x, cleanHiddenShoppingItems: x => x || [], setRestDay: () => {}, save: () => {} };
  vm.createContext(ctx);
  vm.runInContext(calendar + '\n' + planner + '\nrangeStart = () => new Date(start); Math.random = () => 0.999;', ctx);
  return ctx;
}
const cake = { id: 'cake', type: 'baking', ingredient: 'Apfel', ingredients: ['Mehl'] };
const soup = { id: 'soup', type: 'meal', ingredient: 'Gemüse', ingredients: ['Karotte'] };
const pasta = { id: 'pasta', ingredient: 'Pasta', ingredients: ['Nudeln'] };

test('baking is excluded from random and pantry-prioritized results', () => {
  const c = setup([cake, soup]);
  const generated = c.makePlan(start, ['Mehl']);
  assert.equal(generated.length, 7);
  assert.ok(generated.every(day => day.length === 1 && day[0] === 'soup'));
});

test('repeated mixing preserves baking order and pins while replacing meals', () => {
  const c = setup([cake, soup, pasta], [['cake', 'pasta', 'cake']], [[true, false, false]]);
  c.replaceRangePlan([]); c.replaceRangePlan([]);
  const day = c.state.plans[week][0];
  assert.equal(day.length, 3);
  assert.equal(day[0], 'cake'); assert.equal(day[2], 'cake');
  assert.notEqual(day[1], 'cake');
  assert.deepEqual(Array.from(c.state.pinnedMeals[week][0]), [true, false, false]);
});

test('a pinned meal blocks a new meal but pinned baking does not', () => {
  const c = setup([cake, soup, pasta], [['cake'], ['cake', 'soup', 'pasta']], [[true], [false, true, false]]);
  c.replaceRangePlan([]);
  assert.equal(c.state.plans[week][0][0], 'cake');
  assert.equal(c.state.plans[week][0].length, 2);
  assert.deepEqual(Array.from(c.state.plans[week][1]), ['cake', 'soup']);
  assert.deepEqual(Array.from(c.state.pinnedMeals[week][1]), [false, true]);
});

test('with only baking, the plan stays intact and reports empty meal slots', () => {
  const c = setup([cake], [['cake']], [[false]]);
  assert.equal(c.replaceRangePlan(['Mehl']), true);
  assert.deepEqual(Array.from(c.state.plans[week][0]), ['cake']);
  assert.equal(c.state.shoppingChecks[week]?.Mehl, undefined);
});

test('meal planning keeps pantry prioritization and avoids repeating dishes', () => {
  const c = setup([soup, pasta, cake]);
  const generated = Array.from(c.makePlan(start, ['Karotte']), day => day[0]);
  assert.ok(generated.includes('soup'));
  for (let i = 1; i < generated.length; i++) assert.notEqual(generated[i], generated[i - 1]);
});

test('shared potatoes are separated and fixed meals influence both sides', () => {
  const dishes = ['a','b','c'].map(id => ({id, ingredients:['Kartoffel', 'Salz']}));
  dishes.push(...['d','e','f','g'].map(id => ({id, ingredients:[id, 'Salz']})));
  const c = setup(dishes, [[], [], [], ['a']], [[], [], [], [true]]);
  c.replaceRangePlan([]);
  const ids = c.state.plans[week].map(day => day[0]);
  const positions = ids.map((id, i) => ['a','b','c'].includes(id) ? i : -1).filter(i => i >= 0);
  assert.equal(positions.length, 3);
  assert.ok(positions.every((position, i) => i === 0 || position - positions[i - 1] > 1));
});

test('Sunday meals affect the new Monday across the calendar week boundary', () => {
  const fish = {id: 'fish', ingredients: ['Kartoffel', 'Lachs']};
  const mash = {id: 'mash', ingredients: ['Kartoffeln']};
  const c = setup([mash, fish, soup, pasta]);
  c.state.plans['2026-11-02'] = [[], [], [], [], [], [], ['fish']];
  c.replaceRangePlan(['Kartoffeln']);
  assert.ok(['soup', 'pasta'].includes(c.state.plans[week][0][0]));
  assert.ok(c.state.plans[week].some(day => day.includes('mash')));
  assert.deepEqual(c.state.plans['2026-11-02'][6], ['fish']);
});

test('history scores the seventh day but skips older meals and baking', () => {
  const fish = {id: 'fish', ingredients: ['Lachs']};
  const bread = {id: 'bread', type: 'baking', ingredients: ['Lachs']};
  const c = setup([fish, soup, bread]);
  const pinnedDays = new Set([1, 2, 3, 4, 5, 6]);
  c.state.plans['2026-10-26'] = [[], [], [], [], [], [], ['fish']];
  c.state.plans['2026-11-02'] = [[], [], [], [], [], [], ['bread']];
  assert.equal(c.makePlan(start, [], pinnedDays)[0][0], 'fish');
  c.state.plans['2026-11-02'][0] = ['fish'];
  assert.equal(c.makePlan(start, [], pinnedDays)[0][0], 'soup');
});
