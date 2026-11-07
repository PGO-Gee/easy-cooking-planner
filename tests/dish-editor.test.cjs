const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const recipes = require('../recipe-model.js');

// Exercise the same form-to-recipe conversion used by the editor with rows
// that may be offscreen in the mobile pager.
function readEditorValue(servings, ingredients, steps = []) {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = source.indexOf('function recipeEditorValue(){');
  const end = source.indexOf('// The creation wizard', start);
  assert.ok(start >= 0 && end > start);
  const rows = ingredients.map(item => ({
    querySelectorAll: () => Object.entries(item).map(([field, value]) => ({
      dataset: { recipeField: field }, value: String(value ?? '')
    }))
  }));
  const elements = {
    '#recipe-servings': { value: servings },
    '#recipe-ingredient-rows': { querySelectorAll: () => rows },
    '#recipe-step-rows': { querySelectorAll: () => steps.map(value => ({ value })) }
  };
  const context = { $: selector => elements[selector], window: { WochentischRecipes: recipes } };
  return vm.runInNewContext(`${source.slice(start, end)}\nrecipeEditorValue()`, context);
}

test('editing keeps the original serving base, legacy units, notes and all ingredient rows', () => {
  const value = readEditorValue('4', [
    { name: 'Tomaten', amount: '2', unit: 'Handvoll', note: 'halbiert' },
    { name: 'Reis', amount: '100', unit: 'g', note: '' }
  ], ['Kochen']);
  assert.deepEqual(JSON.parse(JSON.stringify(value)), {
    servings: 4,
    ingredients: [
      { name: 'Tomaten', amount: 2, unit: 'Handvoll', note: 'halbiert' },
      { name: 'Reis', amount: 100, unit: 'g', note: '' }
    ],
    steps: ['Kochen']
  });
});

test('editing does not invent a serving base when an old recipe has none', () => {
  assert.equal(readEditorValue('', [{ name: 'Reis', amount: '', unit: '', note: '' }]).servings, null);
});

test('an ingredient with a unit but no name is rejected', () => {
  assert.throws(() => readEditorValue('1', [{ name: '', amount: '', unit: 'g', note: '' }]), /Namen an/);
});
