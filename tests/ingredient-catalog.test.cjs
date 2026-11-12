const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ingredient-catalog.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const ingredients = window.WochentischIngredients;

test('pantry groups match fish fillets without changing ingredient or shopping names', () => {
  for (const [fish, fillet] of [['Lachs', 'Lachsfilet'], ['Kabeljau', 'Kabeljaufilet'], ['Seelachs', 'Seelachsfilet'], ['Thunfisch', 'Thunfischfilet'], ['Forelle', 'Forellenfilet']]) {
    for (const name of [fillet, `${fillet}s`, `  ${fillet.toUpperCase()}  `]) {
      assert.equal(ingredients.pantryKey(fish), ingredients.pantryKey(name));
      assert.equal(ingredients.pantryKey(name), ingredients.pantryKey(fish));
    }
    assert.equal(ingredients.normalize(fillet), fillet);
    assert.equal(ingredients.key(fillet), fillet.toLowerCase());
    assert.equal(ingredients.manualKey(fillet), fillet.toLowerCase());
  }
  assert.equal(ingredients.pantryKey('Forellen'), ingredients.pantryKey('Forelle'));
  assert.deepEqual(Array.from(ingredients.unique(['Lachs', 'Lachsfilet'])), ['Lachs', 'Lachsfilet']);
});

test('pantry matching keeps preparations, fish species and unknown ingredients distinct', () => {
  for (const other of ['Räucherlachs', 'Seelachs', 'Seelachsfilet', 'Fischfilet', 'Fischstäbchen', 'Lachsfilet mit Haut']) {
    assert.notEqual(ingredients.pantryKey('Lachs'), ingredients.pantryKey(other));
  }
  for (const name of ['Unbekannte Zutat', 'Lachsfilet mit Haut', 'Möhre', 'Rinderbrühe']) {
    assert.equal(ingredients.pantryKey(name), ingredients.key(name));
  }
  assert.equal(ingredients.pantryKey('  Unbekannte   Zutat '), ingredients.pantryKey('unbekannte zutat'));
});

test('normalizes true synonyms while preserving concrete products', () => {
  for (const [variant, canonical] of [
    ['Zwiebel', 'Zwiebeln'], ['Möhre', 'Karotten'], ['Heidelbeere', 'Blaubeeren'],
    ['Porree', 'Lauch'], ['Lauchzwiebeln', 'Frühlingszwiebeln'],
    ['Rinderhack', 'Rinderhackfleisch'], ['  Rinder-Patty  ', 'Rinderpatty'],
    ['Hühnchen', 'Hähnchen'], ['Hähnchenkeule', 'Hähnchenschenkel'],
    ['Sauerrahm', 'Saure Sahne'], ['Passata', 'Passierte Tomaten'],
    ['Lorbeerblatt', 'Lorbeerblätter'], ['Misopaste', 'Miso'], ['Tahin', 'Tahini'],
    ['Nudeln', 'Pasta'], ['Semmelbrösel', 'Paniermehl'], ['Sojasoße', 'Sojasauce']
  ]) assert.equal(ingredients.normalize(variant), canonical);
  for (const name of ['Rinderrouladen', 'Rinderfilet', 'Schweineschnitzel', 'Bacon', 'Prosciutto',
    'Hähnchenbrustfilet', 'Hähnchenschenkel', 'Chicken Nuggets', 'Putenbrust', 'Putenschnitzel',
    'Basmatireis', 'Jasminreis', 'Risottoreis', 'Mozzarella', 'Parmesan', 'Emmentaler', 'Gorgonzola',
    'Rinderbrühe', 'Lachs', 'Mehl aus dem Dorf']) assert.equal(ingredients.normalize(name), name);
});

test('pantry forms work across produce, meat, dairy, grains and seasonings', () => {
  for (const [a, b] of [
    ['Tomaten', 'Cherrytomaten'], ['Gurke', 'Salatgurken'], ['Paprika', 'Rote Paprika'],
    ['Spinat', 'TK-Blattspinat'], ['Champignons', 'Braune Champignons'], ['Mais', 'Dosenmais'],
    ['Brokkoli', 'Brokkoliröschen'], ['Knoblauch', 'Knoblauchzehen'], ['Zitrone', 'Bio-Zitronen'],
    ['Hähnchenbrust', 'Hähnchenbrustfilet'], ['Putenbrust', 'Putenfilets'],
    ['Frischkäse', 'Doppelrahmfrischkäse'], ['Quark', 'Magerquark'],
    ['Haferflocken', 'Zarte Haferflocken'], ['Weizenmehl', 'Weizenmehl Type 405'],
    ['Salz', 'Tafelsalz'], ['Pfeffer', 'Schwarze Pfefferkörner']
  ]) {
    assert.equal(ingredients.pantryMatches(a, b), true, `${a} / ${b}`);
    assert.equal(ingredients.pantryMatches(b, a), true, `${b} / ${a}`);
  }
});

test('general pantry categories match varieties without equating different varieties', () => {
  for (const [category, variety] of [
    ['Käse', 'Mozzarella'], ['Käse', 'Parmesan'], ['Hartkäse', 'Parmesan'],
    ['Reis', 'Basmatireis'], ['Reis', 'Risottoreis'], ['Pasta', 'Penne'], ['Nudeln', 'Spaghetti'],
    ['Rind', 'Rinderfilet'], ['Schwein', 'Schweineschnitzel'], ['Hähnchen', 'Hähnchenbrustfilet'],
    ['Pute', 'Putenfilets'], ['Ente', 'Entenfilet'], ['Lamm', 'Lammfilets'],
    ['Mehl', 'Dinkelmehl'], ['Öl', 'Olivenöl'], ['Kürbis', 'Hokkaido'], ['Linsen', 'Rote Linsen']
  ]) {
    assert.equal(ingredients.pantryMatches(category, variety), true, `${category} / ${variety}`);
    assert.equal(ingredients.pantryMatches(variety, category), true, `${variety} / ${category}`);
  }
  for (const [a, b] of [
    ['Parmesan', 'Mozzarella'], ['Feta', 'Hirtenkäse'], ['Hartkäse', 'Mozzarella'],
    ['Basmatireis', 'Risottoreis'], ['Spaghetti', 'Penne'], ['Rinderfilet', 'Rinderhackfleisch'],
    ['Schweinefleisch', 'Bacon'], ['Schweinefleisch', 'Prosciutto'], ['Hähnchen', 'Chicken Nuggets'],
    ['Hähnchenbrust', 'Hähnchenschenkel'], ['Milch', 'Kokosmilch'], ['Tofu', 'Räuchertofu'],
    ['Tomaten', 'Tomatenmark'], ['Tomaten', 'Passierte Tomaten'], ['Tomaten', 'Gehackte Tomaten'],
    ['Gurken', 'Gewürzgurken'], ['Spinat', 'Rahmspinat'], ['Kartoffeln', 'Pommes'],
    ['Weizenmehl', 'Dinkelmehl'], ['Frische Hefe', 'Trockenhefe'], ['Zucker', 'Puderzucker'],
    ['Rote Linsen', 'Berglinsen'], ['Olivenöl', 'Sesamöl'], ['Pasta', 'Reisnudeln'],
    ['Sahne', 'Saure Sahne'], ['Zitronen', 'Zitronensaft'], ['Petersilie', 'Getrocknete Petersilie']
  ]) {
    assert.equal(ingredients.pantryMatches(a, b), false, `${a} / ${b}`);
    assert.equal(ingredients.pantryMatches(b, a), false, `${b} / ${a}`);
  }
  assert.equal(ingredients.pantryMatches('', ''), false);
  assert.equal(ingredients.pantryMatches(null, 'Lachs'), false);
  assert.equal(ingredients.pantryMatches('  Eigene   Zutat ', 'eigene zutat'), true);
  assert.equal(ingredients.pantryMatches('Eigene Zutat', 'Eigene Zutaten'), false);
});

test('deduplicates recipe ingredients and preserves exact shopping items', () => {
  assert.deepEqual(Array.from(ingredients.unique(['Zwiebel', 'Zwiebeln', 'Rinderfilet', 'Rinderhackfleisch'])), ['Zwiebeln', 'Rinderfilet', 'Rinderhackfleisch']);
  assert.deepEqual({ ...ingredients.normalizeQuantities({ zwiebel: 2, zwiebeln: 3, basmatireis: 1 }) }, { zwiebel: 2, zwiebeln: 3, basmatireis: 1 });
});

test('removes the legacy manual prefix and preserves exact checked items', () => {
  assert.deepEqual({ ...ingredients.normalizeChecks({ 'manual:zwiebel': true, zwiebeln: false, 'rinderhackfleisch': false }) }, { zwiebel: true });
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
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.dishes[0].ingredients)), ['Zwiebeln', 'Rinderfilet', 'Rinderhackfleisch', 'Rinderbrühe']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.pantryIngredients['2026-10-26'])), ['Basmatireis', 'Reis', 'Zwiebeln']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.manualShoppingItems['2026-10-26'])), ['Mozzarella', 'Käse']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.hiddenShoppingItems['2026-10-26'])), ['rinderfilet', 'rindfleisch']);
  assert.deepEqual({ ...migrated.shoppingChecks['2026-10-26'] }, { zwiebel: true, zwiebeln: true });
  assert.deepEqual({ ...migrated.shoppingQuantities }, { zwiebel: 2, zwiebeln: 3, basmatireis: 1, reis: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(migratedAgain)), JSON.parse(JSON.stringify(migrated)));
});

test('suggestion catalog contains canonical names only', () => {
  const keys = Array.from(window.COMMON_INGREDIENTS, ingredients.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('zwiebeln'));
  assert.ok(keys.includes('rindfleisch'));
  assert.ok(keys.includes('reis'));
  assert.ok(keys.includes('käse'));
  assert.ok(keys.includes('rinderhackfleisch'));
  assert.ok(keys.includes('basmatireis'));
  assert.ok(keys.includes('emmentaler'));
  const mainKeys = Array.from(window.COMMON_MAIN_INGREDIENTS, value => String(value).toLocaleLowerCase('de-DE'));
  assert.ok(mainKeys.includes('rinderfilet'));
  assert.ok(keys.includes('parmesan'));
  assert.ok(keys.includes('mozzarella'));
  assert.ok(keys.includes('lachsfilet'));
  for (const name of window.COMMON_INGREDIENTS) {
    assert.equal(ingredients.normalize(ingredients.normalize(name)), ingredients.normalize(name), name);
    assert.equal(ingredients.pantryMatches(name, name), true, name);
  }
});

test('treats inherited object names as ordinary shopping keys', () => {
  const quantities = ingredients.normalizeQuantities(JSON.parse('{"__proto__":2,"constructor":3}'));
  const checks = ingredients.normalizeChecks(JSON.parse('{"__proto__":true,"constructor":true}'));
  assert.deepEqual({ ...quantities }, { ['__proto__']: 2, constructor: 3 });
  assert.deepEqual({ ...checks }, { ['__proto__']: true, constructor: true });
});
