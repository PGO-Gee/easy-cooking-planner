const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ingredient-catalog.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const ingredients = window.WochentischIngredients;

test('normalizes curated singular, spelling, and meat aliases', () => {
  assert.equal(ingredients.normalize('Zwiebel'), 'Zwiebeln');
  assert.equal(ingredients.normalize('  Rinder-Patty  '), 'Rindfleisch');
  assert.equal(ingredients.normalize('Rinderhackfleisch'), 'Rindfleisch');
  assert.equal(ingredients.normalize('Rinderrouladen'), 'Rindfleisch');
  assert.equal(ingredients.normalize('Rinderhack'), 'Rindfleisch');
  assert.equal(ingredients.normalize('Schweineschnitzel'), 'Schweinefleisch');
  assert.equal(ingredients.normalize('Hähnchenschenkel'), 'Hähnchen');
  assert.equal(ingredients.normalize('Hähnchenbrustfilet'), 'Hähnchen');
  assert.equal(ingredients.normalize('Putenbrust'), 'Pute');
  assert.equal(ingredients.normalize('Putenschnitzel'), 'Pute');
});

test('groups rice and cheese varieties while preserving distinct ingredients', () => {
  assert.equal(ingredients.normalize('Basmatireis'), 'Reis');
  assert.equal(ingredients.normalize('Jasminreis'), 'Reis');
  assert.equal(ingredients.normalize('Emmentaler'), 'Käse');
  assert.equal(ingredients.normalize('Mozzarella'), 'Käse');
  assert.equal(ingredients.normalize('Gorgonzola'), 'Käse');
  assert.equal(ingredients.normalize('Rinderbrühe'), 'Rinderbrühe');
  assert.equal(ingredients.normalize('Lachs'), 'Lachs');
  assert.equal(ingredients.normalize('Mehl aus dem Dorf'), 'Mehl aus dem Dorf');
});

test('deduplicates canonical arrays and sums quantities for merged names', () => {
  assert.deepEqual(Array.from(ingredients.unique(['Zwiebel', 'Zwiebeln', 'Rinderfilet', 'Rinderhackfleisch'])), ['Zwiebeln', 'Rindfleisch']);
  assert.deepEqual({ ...ingredients.normalizeQuantities({ zwiebel: 2, zwiebeln: 3, basmatireis: 1 }) }, { zwiebeln: 5, reis: 1 });
});

test('merges checked states and removes the legacy manual prefix', () => {
  assert.deepEqual({ ...ingredients.normalizeChecks({ 'manual:zwiebel': true, zwiebeln: false, 'rinderhackfleisch': false }) }, { zwiebeln: true });
});

test('normalizes a saved household state and is idempotent', () => {
  const legacyState = {
    dishes: [{ id: 'dish-1', ingredients: ['Zwiebel', 'Zwiebeln', 'Rinderfilet', 'Rinderhackfleisch', 'Rinderbrühe'] }],
    plans: { '2026-10-26': [[]] },
    pantryIngredients: { '2026-10-26': ['Basmatireis', 'Reis', 'Zwiebel'] },
    manualShoppingItems: { '2026-10-26': ['Mozzarella', 'Käse'] },
    hiddenShoppingItems: { '2026-10-26': ['Rinderfilet', 'Rindfleisch'] },
    shoppingChecks: { '2026-10-26': { 'manual:Zwiebel': true, Zwiebeln: true } },
    shoppingQuantities: { zwiebel: 2, zwiebeln: 3, basmatireis: 1, reis: 2 }
  };

  const migrated = ingredients.normalizeStateIngredients(legacyState);
  const migratedAgain = ingredients.normalizeStateIngredients(migrated);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.dishes[0].ingredients)), ['Zwiebeln', 'Rindfleisch', 'Rinderbrühe']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.pantryIngredients['2026-10-26'])), ['Reis', 'Zwiebeln']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.manualShoppingItems['2026-10-26'])), ['Käse']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.hiddenShoppingItems['2026-10-26'])), ['rindfleisch']);
  assert.deepEqual({ ...migrated.shoppingChecks['2026-10-26'] }, { zwiebeln: true });
  assert.deepEqual({ ...migrated.shoppingQuantities }, { zwiebeln: 5, reis: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(migratedAgain)), JSON.parse(JSON.stringify(migrated)));
});

test('suggestion catalog contains canonical names only', () => {
  const keys = Array.from(window.COMMON_INGREDIENTS, ingredients.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('zwiebeln'));
  assert.ok(keys.includes('rindfleisch'));
  assert.ok(keys.includes('reis'));
  assert.ok(keys.includes('käse'));
  assert.ok(!keys.includes('rinderhackfleisch'));
  assert.ok(!keys.includes('basmatireis'));
  assert.ok(!keys.includes('emmentaler'));
  const mainKeys = Array.from(window.COMMON_MAIN_INGREDIENTS, value => String(value).toLocaleLowerCase('de-DE'));
  assert.ok(mainKeys.includes('rinderfilet'));
});
