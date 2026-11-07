const test = require('node:test');
const assert = require('node:assert/strict');
const recipes = require('../recipe-model.js');

test('scales numeric ingredient amounts from two to four servings', () => {
  assert.equal(recipes.formatAmount(recipes.scaledAmount(150, 4, 2)), '300');
  assert.equal(recipes.formatAmount(recipes.scaledAmount('0,5', 4, 2)), '1');
});

test('scales four-serving amounts down to one without rounding fractions', () => {
  assert.equal(recipes.formatAmount(recipes.scaledAmount(2, 1, 4)), '0,5');
  assert.equal(recipes.formatAmount(recipes.scaledAmount(1, 1, 4)), '0,25');
});

test('accepts decimal commas and displays tiny positive amounts without zero', () => {
  assert.equal(recipes.parseAmount('0,125'), 0.125);
  assert.equal(recipes.formatAmount(recipes.scaledAmount(0.001, 1, 10)), '<0,001');
});

test('leaves free text and missing amounts unchanged', () => {
  assert.equal(recipes.scaledAmount('nach Geschmack', 4, 2), null);
  assert.equal(recipes.normalizeAmount('nach Geschmack'), 'nach Geschmack');
  assert.equal(recipes.normalizeAmount(''), null);
  assert.equal(recipes.parseAmount('0'), null);
});

test('recipe ingredient names provide the shopping projection while retaining their wording', () => {
  assert.deepEqual(recipes.shoppingIngredients({ ingredients: [
    { name: 'Parmesan', amount: 20 }, { name: 'Parmesan', amount: 5 }, { name: 'Zitrone', amount: null }
  ] }, ['alt']), ['Parmesan', 'Zitrone']);
  assert.deepEqual(recipes.shoppingIngredients(null, ['Kartoffeln']), ['Kartoffeln']);
});

test('recipe fingerprints change when recipe fields change', () => {
  const dish = { name: 'Suppe', recipe: { servings: 2, ingredients: [{ name: 'Linsen', amount: 100 }], steps: ['Kochen'] } };
  assert.equal(recipes.fingerprint(dish), recipes.fingerprint(structuredClone(dish)));
  assert.notEqual(recipes.fingerprint(dish), recipes.fingerprint({ ...dish, recipe: { ...dish.recipe, steps: ['Länger kochen'] } }));
  assert.notEqual(recipes.fingerprint({ ...dish, recipe: { servings: 2, ingredients: [], steps: ['Kochen'] } }), recipes.fingerprint({ ...dish, ingredients: ['Kartoffeln'], recipe: { servings: 2, ingredients: [], steps: ['Kochen'] } }));
});

test('older shopping-only ingredients appear in the unified editor without invented quantities', () => {
  assert.deepEqual(recipes.editableIngredients(null, ['Linsen', 'Karotten']), [
    { name: 'Linsen', amount: null, unit: '', note: '' },
    { name: 'Karotten', amount: null, unit: '', note: '' }
  ]);
  const recipe = { servings: 2, ingredients: [{ name: 'Mehl', amount: 200, unit: 'g' }], steps: [] };
  assert.deepEqual(recipes.editableIngredients(recipe, ['Alt']), [
    { name: 'Mehl', amount: 200, unit: 'g', note: '' }
  ]);
});


test('per-portion recipes scale to the selected serving count', () => {
  const recipe = recipes.normalizeRecipe({ servings: 1, ingredients: [{ name: 'Reis', amount: '75', unit: 'g' }], steps: [] });
  assert.equal(recipes.scaledAmount(recipe.ingredients[0].amount, 3, recipe.servings), 225);
});

test('existing ingredient notes and nonstandard units survive normalization', () => {
  const ingredient = { name: 'Tomaten', amount: 2, unit: 'Handvoll', note: 'halbiert' };
  assert.deepEqual(recipes.editableIngredients({ servings: 4, ingredients: [ingredient] }), [ingredient]);
});
