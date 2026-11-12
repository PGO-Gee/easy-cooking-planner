const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual planner with a small in-memory week, without app boot or a network.
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const catalog = fs.readFileSync(require.resolve('../ingredient-catalog.js'), 'utf8');
const matching = source.slice(source.indexOf('function ingredientKey('), source.indexOf('function availablePantryIngredients('));
const planner = source.slice(source.indexOf('function makePlan('), source.indexOf('function formatRange('));
const calendar = source.slice(source.indexOf('function mondayFor('), source.indexOf('function ensurePlanForDate('));
const start = new Date(2026, 10, 9);
const week = '2026-11-09';
function setup(dishes, days = [], pins = []) {
  const state = { dishes, plans: { [week]: Array.from({ length: 7 }, (_, i) => (days[i] || []).slice()) }, pinnedMeals: { [week]: Array.from({ length: 7 }, (_, i) => (pins[i] || []).slice()) }, shoppingChecks: {}, hiddenShoppingItems: {}, pantryIngredients: {}, restDays: {} };
  const ctx = { state, start, window: {}, pinnedMealsForDate: date => state.pinnedMeals[ctx.keyFor(ctx.mondayFor(date))]?.[ctx.dayIndex(date)] || [],
    manualItemKey: x => ctx.window.WochentischIngredients.manualKey(x), cleanHiddenShoppingItems: x => x || [], setRestDay: () => {}, save: () => {} };
  vm.createContext(ctx);
  vm.runInContext(catalog + '\n' + matching + '\n' + calendar + '\n' + planner + '\nrangeStart = () => new Date(start); Math.random = () => 0.999;', ctx);
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

test('pantry salmon requires a fillet recipe with more candidates than available slots', () => {
  const dishes = Array.from({length: 8}, (_, i) => ({id: `other-${i}`, ingredients: [`other-${i}`]}));
  dishes.push({id: 'salmon', ingredients: ['Lachsfilet']});
  const c = setup(dishes);
  const pinnedDays = new Set([1, 2, 3, 4, 5, 6]);
  assert.equal(c.makePlan(start, [], pinnedDays)[0][0], 'other-0');
  assert.equal(c.makePlan(start, ['Lachs'], pinnedDays)[0][0], 'salmon');
});

test('pantry salmon checks exact fillet shopping keys while preserving recipe names', () => {
  const dishes = [{id: 'salmon', ingredients: ['Lachsfilet']}, {id: 'smoked', ingredients: ['Räucherlachs']}, {id: 'pollock', ingredients: ['Seelachsfilet']}];
  const c = setup(dishes);
  c.replaceRangePlan(['Lachs']);
  assert.deepEqual(Array.from(c.state.dishes[0].ingredients), ['Lachsfilet']);
  assert.deepEqual({...c.state.shoppingChecks[week]}, {lachsfilet: true});
  c.replaceRangePlan([]);
  assert.equal(c.state.shoppingChecks[week]?.lachsfilet, undefined);
});

test('a specific cheese prioritizes its own recipe and never checks another cheese', () => {
  const dishes = [{id: 'mozzarella', ingredients: ['Mozzarella']}, {id: 'parmesan', ingredients: ['Parmesan']}];
  const c = setup(dishes);
  const pinnedDays = new Set([1, 2, 3, 4, 5, 6]);
  assert.equal(c.makePlan(start, ['Parmesan'], pinnedDays)[0][0], 'parmesan');
  c.replaceRangePlan(['Parmesan']);
  assert.deepEqual({...c.state.shoppingChecks[week]}, {parmesan: true});
  c.replaceRangePlan(['Käse']);
  assert.deepEqual({...c.state.shoppingChecks[week]}, {parmesan: true, mozzarella: true});
});

test('normalizing existing dishes recovers precise names from full recipes only', () => {
  const c = setup([]);
  c.window.WochentischRecipes = require('../recipe-model.js');
  c.cleanIngredients = c.window.WochentischIngredients.unique;
  c.cleanNutrition = value => value;
  vm.runInContext(source.slice(source.indexOf('function normalizeState('), source.indexOf('async function initializeOfflineData(')), c);
  const original = {plans: {}, dishes: [
    {id: 'recipe', ingredients: ['Käse', 'Reis', 'Rindfleisch'], recipe: {ingredients: [{name: 'Mozzarella'}, {name: 'Basmatireis'}, {name: 'Rinderfilet'}]}},
    {id: 'legacy', ingredients: ['Käse', 'Reis', 'Rindfleisch']}
  ]};
  const normalized = c.normalizeState(original);
  assert.deepEqual(Array.from(normalized.dishes[0].ingredients), ['Mozzarella', 'Basmatireis', 'Rinderfilet']);
  assert.deepEqual(Array.from(normalized.dishes[1].ingredients), ['Käse', 'Reis', 'Rindfleisch']);
  assert.deepEqual(JSON.parse(JSON.stringify(c.normalizeState(normalized))), JSON.parse(JSON.stringify(normalized)));
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

test('remixing prefers unused recipes and moves returning recipes to different days', () => {
  const dishes = Array.from({length:10}, (_, i) => ({id:`dish-${i}`, ingredients:[`ingredient-${i}`]}));
  const current = dishes.slice(0,7).map(dish => [dish.id]);
  const c = setup(dishes, current);
  c.replaceRangePlan([]);
  const generated = c.state.plans[week].map(day => day[0]);
  assert.ok(dishes.slice(7).every(dish => generated.includes(dish.id)));
  assert.ok(generated.every((id, day) => id !== current[day][0]));
});
