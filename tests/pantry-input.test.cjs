const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const catalog = fs.readFileSync(require.resolve('../ingredient-catalog.js'), 'utf8');
const registration = source.split('\n').find(line => line.startsWith("$('#pantry-input').addEventListener('keydown'"));
const addIngredient = source.slice(source.indexOf('function addPantryIngredient('), source.indexOf('function openPantryPlanner('));

function setup(options, selected = []) {
  let handler;
  const input = {value: '', focus() {}};
  const ctx = {window: {}, pantryDraft: selected.slice(), availablePantryIngredients: () => options,
    renderPantryEditor() {}, submitted: false,
    $: selector => selector === '#pantry-input' ? {...input, addEventListener: (_, callback) => {handler = callback;}} : {requestSubmit: () => {ctx.submitted = true;}}};
  vm.createContext(ctx);
  vm.runInContext(catalog + '\n' + addIngredient + '\n' + registration, ctx);
  ctx.normalizeIngredient = ctx.window.WochentischIngredients.normalize;
  ctx.ingredientKey = ctx.window.WochentischIngredients.key;
  return {ctx, press(value, key = 'Enter') {let prevented = false; handler({key, currentTarget: {value}, preventDefault() {prevented = true;}}); return prevented;}};
}

test('Enter prefers an exact inventory suggestion over an earlier prefix match', () => {
  const {ctx, press} = setup(['Lachsfilet', 'Lachs']);
  assert.equal(press('  LACHS '), true);
  assert.deepEqual(Array.from(ctx.pantryDraft), ['Lachs']);
});

test('Enter does not replace an already selected exact ingredient with a fillet', () => {
  const {ctx, press} = setup(['Lachsfilet', 'Lachs'], ['Lachs']);
  press('Lachs');
  assert.deepEqual(Array.from(ctx.pantryDraft), ['Lachs']);
});

test('Enter keeps prefix suggestions and unknown input as fallbacks', () => {
  const {ctx, press} = setup(['Lachsfilet', 'Lachs']);
  press('Lachsfi');
  press('Eigene Zutat');
  assert.deepEqual(Array.from(ctx.pantryDraft), ['Lachsfilet', 'Eigene Zutat']);
});

test('empty Enter submits the planner while other keys leave the selection alone', () => {
  const {ctx, press} = setup(['Lachs']);
  assert.equal(press('Lachs', 'Escape'), false);
  assert.deepEqual(Array.from(ctx.pantryDraft), []);
  press('  ');
  assert.equal(ctx.submitted, true);
});

test('unused-pantry feedback uses the same product and category matching as planning', async () => {
  const submitRegistration = source.split('\n').find(line => line.startsWith("$('#pantry-form').addEventListener('submit'"));
  const matching = source.slice(source.indexOf('function ingredientKey('), source.indexOf('function availablePantryIngredients('));
  for (const [pantry, recipe, matched] of [['Lachs', 'Lachsfilet', true], ['Käse', 'Mozzarella', true], ['Parmesan', 'Mozzarella', false], ['Milch', 'Kokosmilch', false]]) {
    let submit;
    const messages = [];
    const ctx = {window: {}, state: {dishes: [{ingredients: [recipe]}]}, pantryDraft: [pantry],
      $: selector => selector === '#pantry-form' ? {addEventListener: (_, callback) => {submit = callback;}} : {close() {}},
      replaceRangePlan: () => false, renderCalendar: async () => true,
      showToast: message => messages.push(message)};
    vm.runInNewContext(catalog + '\n' + matching + '\n' + submitRegistration, ctx);
    await submit({preventDefault() {}});
    assert.equal(messages.length, 1);
    assert.equal(messages[0].includes('Keine passenden Gerichte für:'), !matched, `${pantry} / ${recipe}`);
  }
});
