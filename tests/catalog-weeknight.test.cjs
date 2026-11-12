const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const rows = require('../supabase/catalog-weeknight-recipes.json');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'supabase/catalog-weeknight-additions.sql'), 'utf8');
const ingredientContext = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'ingredient-catalog.js'), 'utf8'), ingredientContext);
const key = name => name.trim().toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu, '');

test('new catalogue meals have complete recipes, consistent shopping lists and unique names', () => {
  assert.equal(rows.length, 13);
  assert.equal(new Set(rows.map(r => r.normalized_name)).size, 13);
  assert.ok(!rows.some(r => r.normalized_name === 'buchweizeneintopf'), 'retain the existing buckwheat stew');
  for (const row of rows) {
    assert.equal(row.normalized_name, key(row.name));
    assert.equal(row.recipe_type, 'meal');
    assert.equal(row.recipe.servings, 2);
    assert.ok(row.cooking_time_minutes > 0 && row.cooking_time_minutes <= 360);
    assert.ok(row.recipe.steps.length >= 3);
    assert.ok(row.recipe.steps.every(s => s.length > 20 && s.length <= 1200));
    assert.ok(row.recipe.ingredients.every(i => i.name && (i.amount === null || i.amount > 0)));
    assert.deepEqual(row.ingredients, Array.from(ingredientContext.window.WochentischIngredients.unique(row.recipe.ingredients.map(i => i.name))));
    assert.deepEqual(Object.keys(row.nutrition).sort(), ['carbs','fat','kcal','protein']);
    assert.ok(Object.values(row.nutrition).every(n => Number.isFinite(n) && n > 0));
    const n = row.nutrition;
    assert.ok(Math.abs(n.kcal - (4 * n.protein + 9 * n.fat + 4 * n.carbs)) < n.kcal * 0.15, row.name);
  }
});

test('data seed matches the source JSON and preserves existing entries on repeated execution', () => {
  const payload = JSON.parse(seed.split('$catalog$')[1]);
  assert.deepEqual(payload, rows.map(({photo, ...row}) => row));
  assert.match(seed, /on conflict \(normalized_name\) do nothing/);
  const insertColumns = seed.match(/insert into public\.catalog_dishes\s*\(([^)]+)\)/)[1];
  assert.ok(!insertColumns.includes('normalized_name'), 'Postgres generates the normalized name');
});

test('every new catalogue meal renders its real detail image and thumbnail', () => {
  const context = {document:{createElement:() => ({})}};
  vm.runInNewContext(source.slice(source.indexOf('function catalogDishNameKey('), source.indexOf('// Native dialogs')), context);
  const start = source.indexOf('function recipePhoto(');
  vm.runInNewContext(source.slice(start, source.indexOf('\nfunction recipeThumbnail(', start)), context);
  for (const row of rows) {
    for (const thumbnail of [false, true]) {
      const photo = context.recipePhoto({...row, id:'catalog-id'}, {catalog:true, thumbnail});
      assert.ok(photo, row.name);
      const file = `images/recipes/${row.photo}${thumbnail ? '-thumb' : ''}.jpg`;
      assert.equal(photo.src, `./${file}?v=2`);
      const buffer = fs.readFileSync(path.join(root, file));
      assert.equal(buffer.readUInt16BE(0), 0xffd8, `${file} must be a JPEG`);
      assert.ok(buffer.length < (thumbnail ? 25000 : 300000), `${file} is too large`);
      assert.equal(photo.width, thumbnail ? 168 : 960);
      assert.equal(photo.height, thumbnail ? 126 : 720);
    }
    assert.ok(context.recipePhoto({...row, catalogSourceId:'catalog-id'}), 'adopted recipes also get photos');
  }
  assert.ok(context.recipePhoto({name:'Buchweizen Eintopf', id:'existing'}, {catalog:true}));
});
