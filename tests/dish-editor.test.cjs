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

test('imported quantities retain an unknown or explicitly stated serving base', () => {
  const { parse } = require('../recipe-import.js');
  for (const [heading, expectedBase] of [['Zutaten für eine Backform', null], ['Zutaten für 4 Portionen', 4]]) {
    const draft = parse(`${heading}\n450 g Mehl\nZubereitung\n1. Mischen.`);
    const value = readEditorValue(draft.servings === null ? '' : String(draft.servings), draft.ingredients, draft.steps);
    assert.equal(value.servings, expectedBase);
    assert.equal(value.ingredients[0].amount, 450);
    assert.equal(recipes.scaledAmount(value.ingredients[0].amount, 2, value.servings), expectedBase ? 225 : null);
  }
});

test('cooking view displays imported quantities unchanged when portions are unknown', () => {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = source.indexOf('function appendRecipeIngredients(');
  const end = source.indexOf('function recipePortionControl(', start);
  assert.ok(start >= 0 && end > start);
  const node = () => ({ children: [], textContent: '', append(...items) { this.children.push(...items); } });
  const container = node();
  const context = { document: { createElement: node }, window: { WochentischRecipes: recipes }, container,
    dish: { recipe: { servings: null, ingredients: [{ name: 'Mehl', amount: 450, unit: 'g', note: '' }] } } };
  vm.runInNewContext(`${source.slice(start, end)}\nappendRecipeIngredients(container,dish,4)`, context);
  assert.match(container.children[0].textContent, /unverändert/);
  assert.equal(container.children[1].children[0].children[0].textContent, '450 g');
});
