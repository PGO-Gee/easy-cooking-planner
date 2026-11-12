// Curated German ingredient vocabulary and exact aliases. Unknown ingredients
// remain available as entered; only explicitly listed variants are combined.
(() => {
  function aliasKey(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('de-DE')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/[-\s]+/g, ' ');
  }

  const aliases = new Map();
  const aliasNames = new Set();
  function addAliases(canonical, variants) {
    [canonical, ...variants].forEach(name => {aliases.set(aliasKey(name), canonical);aliasNames.add(name)});
  }

  // Countable foods use a shopper-friendly plural; mass nouns use the singular.
  addAliases('Äpfel', ['Apfel']);
  addAliases('Aprikosen', ['Aprikose']);
  addAliases('Avocados', ['Avocado']);
  addAliases('Bananen', ['Banane']);
  addAliases('Birnen', ['Birne']);
  addAliases('Datteln', ['Dattel']);
  addAliases('Blaubeeren', ['Blaubeere']);
  addAliases('Brombeeren', ['Brombeere']);
  addAliases('Erdbeeren', ['Erdbeere']);
  addAliases('Feigen', ['Feige']);
  addAliases('Granatäpfel', ['Granatapfel']);
  addAliases('Himbeeren', ['Himbeere']);
  addAliases('Johannisbeeren', ['Johannisbeere']);
  addAliases('Kirschen', ['Kirsche']);
  addAliases('Kiwis', ['Kiwi']);
  addAliases('Mandarinen', ['Mandarine']);
  addAliases('Mangos', ['Mango']);
  addAliases('Melonen', ['Melone']);
  addAliases('Orangen', ['Orange']);
  addAliases('Pfirsiche', ['Pfirsich']);
  addAliases('Pflaumen', ['Pflaume']);
  addAliases('Weintrauben', ['Weintraube']);
  addAliases('Auberginen', ['Aubergine']);
  addAliases('Gurken', ['Gurke']);
  addAliases('Karotten', ['Karotte', 'Möhre', 'Möhren']);
  addAliases('Kartoffeln', ['Kartoffel']);
  addAliases('Kürbisse', ['Kürbis']);
  addAliases('Erbsen', ['Erbse']);
  addAliases('Frühlingszwiebeln', ['Frühlingszwiebel']);
  addAliases('Grüne Bohnen', ['Grüne Bohne']);
  addAliases('Mungobohnensprossen', ['Mungobohnensprosse']);
  addAliases('Pastinaken', ['Pastinake']);
  addAliases('Rettiche', ['Rettich']);
  addAliases('Rote Bete', ['Rote Beten']);
  addAliases('Schalotten', ['Schalotte']);
  addAliases('Süßkartoffeln', ['Süßkartoffel']);
  addAliases('Tomaten', ['Tomate']);
  addAliases('Zucchini', ['Zucchino']);
  addAliases('Zwiebeln', ['Zwiebel']);
  addAliases('Chilischoten', ['Chilischote']);
  addAliases('Kichererbsen', ['Kichererbse']);
  addAliases('Linsen', ['Linse']);
  addAliases('Rote Linsen', ['Rote Linse']);
  addAliases('Berglinsen', ['Berglinse']);
  addAliases('Kidneybohnen', ['Kidneybohne']);
  addAliases('Weiße Bohnen', ['Weiße Bohne']);
  addAliases('Schwarze Bohnen', ['Schwarze Bohne']);
  addAliases('Champignons', ['Champignon']);
  addAliases('Austernpilze', ['Austernpilz']);
  addAliases('Eier', ['Ei']);
  addAliases('Baguettes', ['Baguette']);
  addAliases('Brötchen', ['Brötchen']);
  addAliases('Tortilla-Wraps', ['Tortilla-Wrap']);
  addAliases('Forellen', ['Forelle']);
  addAliases('Garnelen', ['Garnele']);
  addAliases('Sardellen', ['Sardelle']);
  addAliases('Mandeln', ['Mandel']);
  addAliases('Walnüsse', ['Walnuss']);
  addAliases('Cashewkerne', ['Cashewkern']);
  addAliases('Erdnüsse', ['Erdnuss']);
  addAliases('Pinienkerne', ['Pinienkern']);
  addAliases('Sonnenblumenkerne', ['Sonnenblumenkern']);
  addAliases('Kürbiskerne', ['Kürbiskern']);
  addAliases('Rosinen', ['Rosine']);
  addAliases('Borlotti-Bohnen', ['Borlotti Bohnen']);
  addAliases('Zitronen', ['Zitrone']);
  addAliases('Limetten', ['Limette']);

  // Only names for the same product are storage aliases. Cuts, rice varieties
  // and cheese varieties retain their own names; pantry matching is separate.
  [
    ['Blaubeeren', 'Heidelbeere', 'Heidelbeeren'],
    ['Frühlingszwiebeln', 'Lauchzwiebel', 'Lauchzwiebeln'],
    ['Lauch', 'Porree'], ['Rote Bete', 'Rote Beete'],
    ['Chilischoten', 'Chili', 'Chilis'], ['Rucola', 'Rauke'],
    ['Weißkohl', 'Weisskohl', 'Weißkraut'], ['Wirsing', 'Wirsingkohl'],
    ['Pak Choi', 'Pak-Choi', 'Pakchoi'],
    ['Shiitake', 'Shiitakepilz', 'Shiitakepilze', 'Shiitake-Pilze'],
    ['Garnelen', 'Shrimp', 'Shrimps'], ['Sardellen', 'Anchovis'],
    ['Rindfleisch', 'Rind'], ['Schweinefleisch', 'Schwein'],
    ['Lammfleisch', 'Lamm'], ['Hähnchen', 'Huhn', 'Hühnchen', 'Chicken'],
    ['Hähnchenbrust', 'Hähnchenbrüste', 'Hühnchenbrust'],
    ['Hähnchenbrustfilet', 'Hähnchenbrustfilets', 'Hühnchenbrustfilet'],
    ['Hähnchenschenkel', 'Hähnchenkeule', 'Hähnchenkeulen'],
    ['Hähnchenflügel', 'Hähnchenflügeln'],
    ['Rinderhackfleisch', 'Rinderhack'], ['Schweinehackfleisch', 'Schweinehack'],
    ['Rinderpatty', 'Rinder-Patty', 'Rinderpatties'],
    ['Putenhackfleisch', 'Putenhack'],
    ['Putenbrust', 'Putenbrüste'], ['Putenschnitzel', 'Putenschnitzeln'],
    ['Entenschenkel', 'Entenkeule', 'Entenkeulen'],
    ['Sahne', 'Schlagsahne', 'Schlagrahm', 'Rahm'],
    ['Saure Sahne', 'Sauerrahm'], ['Naturjoghurt', 'Joghurt', 'Naturjogurt', 'Jogurt'],
    ['Crème fraîche', 'Creme fraiche'], ['Crème légère', 'Creme legere'],
    ['Hüttenkäse', 'Körniger Frischkäse'],
    ['Paniermehl', 'Semmelbrösel', 'Semmelmehl'],
    ['Pasta', 'Nudeln', 'Nudel', 'Teigwaren'], ['Spaghetti', 'Spagetti'],
    ['Langkornreis', 'Langkorn-Reis'], ['Vollkornreis', 'Naturreis'],
    ['Tortilla-Wraps', 'Wrap', 'Wraps', 'Tortillawraps'],
    ['Weißbrot', 'Weissbrot'], ['Toastbrot', 'Toast'],
    ['Bratwurst', 'Bratwürste'],
    ['Burgerbrötchen', 'Burgerbun', 'Burgerbuns'],
    ['Lorbeerblätter', 'Lorbeerblatt'], ['Muskatnuss', 'Muskat'],
    ['Sojasauce', 'Sojasoße'], ['Fischsauce', 'Fischsoße'],
    ['Miso', 'Misopaste', 'Miso-Paste'], ['Tahini', 'Tahin', 'Sesampaste'],
    ['Mayonnaise', 'Mayo'],
    ['Gehackte Tomaten', 'Stückige Tomaten', 'Tomatenstücke'],
    ['Passierte Tomaten', 'Passata', 'Tomatenpassata'],
    ['Kokosraspeln', 'Kokosraspel'], ['Haferflocken', 'Haferflocke'],
    ['Chiliflocken', 'Chiliflocke'], ['Chilipulver', 'Chili-Pulver'],
    ['Zimt', 'Zimtpulver'], ['Puderzucker', 'Staubzucker'],
    ['Backkakao', 'Ungesüßtes Kakaopulver']
  ].forEach(([canonical, ...variants]) => addAliases(canonical, variants));

  function normalize(value) {
    const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (!name) return '';
    return aliases.get(aliasKey(name)) || name;
  }

  function key(value) {
    return normalize(value).toLocaleLowerCase('de-DE');
  }

  // Close product forms can match without rewriting recipe/shopping names.
  const pantryGroups = new Map();
  const pantryNames = new Set();
  [
    ['Lachs', 'Lachsfilet', 'Lachsfilets'],
    ['Kabeljau', 'Kabeljaufilet', 'Kabeljaufilets'],
    ['Seelachs', 'Seelachsfilet', 'Seelachsfilets'],
    ['Thunfisch', 'Thunfischfilet', 'Thunfischfilets'],
    ['Forellen', 'Forellenfilet', 'Forellenfilets'],
    ['Hähnchenbrust', 'Hähnchenbrustfilet', 'Hähnchenfilet', 'Hähnchenfilets', 'Hühnchenfilet'],
    ['Putenbrust', 'Putenbrustfilet', 'Putenfilet', 'Putenfilets'],
    ['Entenbrust', 'Entenbrustfilet', 'Entenfilet', 'Entenfilets'],
    ['Rinderfilet', 'Rinderfilets'], ['Schweinefilet', 'Schweinefilets'],
    ['Lammfilet', 'Lammfilets'], ['Schweineschnitzel', 'Schweineschnitzeln'],
    ['Hähnchenstreifen', 'Hähnchengeschnetzeltes'],
    ['Rindergeschnetzeltes', 'Rindfleischstreifen'],
    ['Tomaten', 'Kirschtomaten', 'Kirschtomate', 'Cherrytomaten', 'Cocktailtomaten', 'Rispentomaten', 'Fleischtomaten'],
    ['Paprika', 'Paprikaschote', 'Paprikaschoten', 'Rote Paprika', 'Gelbe Paprika', 'Grüne Paprika', 'Spitzpaprika'],
    ['Gurken', 'Salatgurke', 'Salatgurken'],
    ['Kartoffeln', 'Speisekartoffeln'],
    ['Karotten', 'TK-Karotten'],
    ['Grüne Bohnen', 'TK-Bohnen', 'TK-Grüne Bohnen'],
    ['Erdbeeren', 'TK-Erdbeeren'], ['Himbeeren', 'TK-Himbeeren'],
    ['Blaubeeren', 'TK-Blaubeeren', 'TK-Heidelbeeren'],
    ['Blattspinat', 'Spinat', 'Babyspinat', 'TK-Spinat', 'TK-Blattspinat'],
    ['Erbsen', 'TK-Erbsen', 'Tiefkühlerbsen'],
    ['Brokkoli', 'Brokkoliröschen', 'TK-Brokkoli'],
    ['Blumenkohl', 'Blumenkohlröschen', 'TK-Blumenkohl'],
    ['Champignons', 'Weiße Champignons', 'Braune Champignons'],
    ['Mais', 'Dosenmais', 'Zuckermais'],
    ['Knoblauch', 'Knoblauchzehe', 'Knoblauchzehen'],
    ['Ingwer', 'Ingwerwurzel'],
    ['Zitronen', 'Bio-Zitrone', 'Bio-Zitronen'],
    ['Limetten', 'Bio-Limette', 'Bio-Limetten'],
    ['Haferflocken', 'Zarte Haferflocken', 'Kernige Haferflocken'],
    ['Frischkäse', 'Doppelrahmfrischkäse', 'Naturfrischkäse'],
    ['Quark', 'Speisequark', 'Magerquark'],
    ['Weizenmehl', 'Mehl Type 405', 'Weizenmehl Type 405', 'Weizenmehl Type 550'],
    ['Dinkelmehl', 'Dinkelmehl Type 630'],
    ['Backkakao', 'Kakaopulver'],
    ['Salz', 'Tafelsalz', 'Speisesalz'],
    ['Pfeffer', 'Schwarzer Pfeffer', 'Schwarze Pfefferkörner']
  ].forEach(([canonical, ...variants]) => {
    [canonical, ...variants].forEach(name => {
      pantryGroups.set(key(name), key(canonical));
      pantryNames.add(name);
    });
  });

  function pantryKey(value) {
    const ingredientKey = key(value);
    return pantryGroups.get(ingredientKey) || ingredientKey;
  }

  // A general ingredient can match its explicitly listed varieties, but two
  // different varieties never match merely because they share a category.
  const pantryCategories = new Map();
  [
    ['Käse', 'Feta', 'Mozzarella', 'Parmesan', 'Gouda', 'Emmentaler', 'Cheddar',
      'Hirtenkäse', 'Halloumi', 'Ziegenkäse', 'Frischkäse', 'Hüttenkäse',
      'Mascarpone', 'Ricotta', 'Bergkäse', 'Edamer', 'Butterkäse', 'Gorgonzola',
      'Blauschimmelkäse', 'Burrata', 'Pecorino', 'Grana Padano', 'Provolone', 'Ziegenfrischkäse', 'Hartkäse'],
    ['Hartkäse', 'Parmesan', 'Pecorino', 'Grana Padano', 'Bergkäse'],
    ['Mehl', 'Weizenmehl', 'Dinkelmehl', 'Vollkornmehl'],
    ['Öl', 'Rapsöl', 'Olivenöl', 'Sesamöl', 'Kokosöl', 'Sonnenblumenöl'],
    ['Kürbisse', 'Hokkaido', 'Hokkaidokürbis', 'Butternut', 'Butternutkürbis'],
    ['Currypaste', 'Rote Currypaste', 'Grüne Currypaste', 'Gelbe Currypaste'],
    ['Tomaten aus der Dose', 'Gehackte Tomaten', 'Geschälte Tomaten'],
    ['Linsen', 'Rote Linsen', 'Berglinsen', 'Tellerlinsen', 'Belugalinsen'],
    ['Reis', 'Basmatireis', 'Jasminreis', 'Langkornreis', 'Risottoreis', 'Vollkornreis'],
    ['Pasta', 'Spaghetti', 'Penne', 'Fusilli', 'Bandnudeln', 'Makkaroni', 'Kritharaki', 'Suppennudeln'],
    ['Rindfleisch', 'Rinderfilet', 'Rinderpatty', 'Rinderhackfleisch', 'Rindergulasch',
      'Rindersteak', 'Rinderbraten', 'Rinderrouladen', 'Rindergeschnetzeltes', 'Rinderschulter', 'Rinderhüfte'],
    ['Schweinefleisch', 'Schweinefilet', 'Schweineschnitzel', 'Schweinebraten',
      'Schweinehackfleisch', 'Schweinesteak', 'Schweinenacken', 'Schweinenackensteak', 'Schweinebauch'],
    ['Hähnchen', 'Hähnchenbrust', 'Hähnchenschenkel', 'Hähnchenflügel', 'Hähnchenstreifen'],
    ['Pute', 'Putenbrust', 'Putenschnitzel', 'Putenkeule', 'Putenhackfleisch'],
    ['Ente', 'Entenbrust', 'Entenschenkel'],
    ['Lammfleisch', 'Lammfilet', 'Lammkeule', 'Lammkotelett', 'Lammkoteletts', 'Lammhackfleisch']
  ].forEach(([category, ...variants]) => {
    pantryCategories.set(pantryKey(category), new Set(variants.map(pantryKey)));
    [category, ...variants].forEach(name => pantryNames.add(name));
  });

  function pantryMatches(available, required) {
    const a = pantryKey(available), b = pantryKey(required);
    return Boolean(a && b && (a === b || pantryCategories.get(a)?.has(b) || pantryCategories.get(b)?.has(a)));
  }

  function manualName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function manualKey(value) {
    return manualName(value).toLocaleLowerCase('de-DE');
  }

  function unique(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).reduce((result, value) => {
      const name = normalize(value);
      const itemKey = key(name);
      if (name && itemKey && !seen.has(itemKey)) {
        seen.add(itemKey);
        result.push(name);
      }
      return result;
    }, []);
  }

  function normalizeQuantities(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    return Object.entries(values).reduce((result, [rawName, rawQuantity]) => {
      const itemKey = manualKey(rawName);
      const quantity = Number(rawQuantity);
      if (!itemKey || !Number.isFinite(quantity)) return result;
      result[itemKey] = (result[itemKey] || 0) + quantity;
      return result;
    }, Object.create(null));
  }

  function normalizeChecks(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    return Object.entries(values).reduce((result, [rawName, checked]) => {
      const itemKey = manualKey(rawName.replace(/^manual:/i, ''));
      if (itemKey && checked) result[itemKey] = true;
      return result;
    }, Object.create(null));
  }

  function normalizeKeys(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(key).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'de-DE'));
  }

  function normalizeWeekValues(values, normalize) {
    return Object.fromEntries(Object.entries(values && typeof values === 'object' ? values : {})
      .map(([week, value]) => [week, normalize(value)]));
  }

  function normalizeStateIngredients(value) {
    if (!value || typeof value !== 'object') return value;
    return {
      ...value,
      dishes: (Array.isArray(value.dishes) ? value.dishes : [])
        .filter(dish => dish && typeof dish === 'object')
        .map(dish => ({ ...dish, ingredients: unique(dish.ingredients) })),
      pantryIngredients: normalizeWeekValues(value.pantryIngredients, unique),
      shoppingChecks: normalizeWeekValues(value.shoppingChecks, normalizeChecks),
      hiddenShoppingItems: normalizeWeekValues(value.hiddenShoppingItems, values => [...new Set((Array.isArray(values) ? values : []).map(manualKey).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de-DE'))),
      manualShoppingItems: normalizeWeekValues(value.manualShoppingItems, values => {
        const seen = new Set();
        return (Array.isArray(values) ? values : []).reduce((result, raw) => {
          const name = manualName(raw), itemKey = manualKey(name);
          if (name && !seen.has(itemKey)) { seen.add(itemKey); result.push(name); }
          return result;
        }, []);
      }),
      shoppingQuantities: normalizeQuantities(value.shoppingQuantities || {})
    };
  }

  const canonicalIngredients = unique([
    'Äpfel','Aprikosen','Avocados','Bananen','Birnen','Blaubeeren','Brombeeren','Datteln','Erdbeeren','Feigen','Granatäpfel','Himbeeren','Johannisbeeren','Kirschen','Kiwis','Mandarinen','Mangos','Melonen','Orangen','Pfirsiche','Pflaumen','Weintrauben','Zitronen','Limetten',
    'Auberginen','Blumenkohl','Blattspinat','Brokkoli','Chicorée','Chinakohl','Erbsen','Fenchel','Frühlingszwiebeln','Grünkohl','Grüne Bohnen','Gurken','Karotten','Kartoffeln','Knollensellerie','Kohlrabi','Kürbisse','Lauch','Mais','Mangold','Mungobohnensprossen','Pak Choi','Paprika','Pastinaken','Pommes','Radieschen','Rettiche','Rosenkohl','Rotkohl','Rucola','Rote Bete','Schalotten','Spargel','Spitzkohl','Staudensellerie','Süßkartoffeln','Tomaten','Weißkohl','Wirsing','Zucchini','Zwiebeln','Knoblauch','Ingwer','Chilischoten',
    'Champignons','Austernpilze','Shiitake','Linsen','Rote Linsen','Berglinsen','Kichererbsen','Kidneybohnen','Weiße Bohnen','Schwarze Bohnen','Borlotti-Bohnen','Tofu','Räuchertofu','Tempeh','Seitan',
    'Rindfleisch','Schweinefleisch','Hähnchen','Pute','Ente','Lammfleisch','Bacon','Speck','Schinken','Salami','Bratwurst','Wiener Würstchen','Kasseler',
    'Lachs','Thunfisch','Kabeljau','Seelachs','Forellen','Garnelen','Räucherlachs','Fischfilet','Sardellen','Fischstäbchen',
    'Eier','Milch','Butter','Sahne','Schlagsahne','Crème fraîche','Schmand','Saure Sahne','Crème légère','Käse','Naturjoghurt','Griechischer Joghurt','Quark','Magerquark','Sahneersatz',
    'Weizenmehl','Dinkelmehl','Vollkornmehl','Speisestärke','Backpulver','Natron','Trockenhefe','Frische Hefe','Paniermehl','Panko','Haferflocken','Weißbrot','Toastbrot','Baguettes','Brötchen','Tortilla-Wraps','Blätterteig','Pizzateig','Filoteig','Lasagneplatten','Semmelbrösel','Semmelknödel',
    'Reis','Couscous','Bulgur','Quinoa','Hirse','Polenta','Hafer','Graupen','Spaghetti','Penne','Fusilli','Bandnudeln','Makkaroni','Gnocchi','Mie-Nudeln','Reisnudeln','Glasnudeln','Ramen-Nudeln','Soba-Nudeln','Udon-Nudeln',
    'Rapsöl','Olivenöl','Sesamöl','Kokosöl','Sonnenblumenöl','Essig','Balsamico','Apfelessig','Sojasauce','Tamari','Fischsauce','Worcestersauce','Tomatenmark','Passierte Tomaten','Gehackte Tomaten','Tomaten aus der Dose','Kokosmilch','Gemüsebrühe','Hühnerbrühe','Rinderbrühe','Senf','Mayonnaise','Ketchup','Pesto','Tahini','Erdnussbutter','Ahornsirup','Honig','Marmelade','Gemüsefond','Miso','Apfelmus',
    'Salz','Pfeffer','Paprikapulver','Geräuchertes Paprikapulver','Currypulver','Kreuzkümmel','Kurkuma','Chiliflocken','Cayennepfeffer','Zimt','Muskatnuss','Oregano','Thymian','Rosmarin','Basilikum','Petersilie','Schnittlauch','Dill','Koriander','Minze','Lorbeerblätter','Italienische Kräuter','Kräuter der Provence','Currypaste','Vanillezucker','Zucker','Brauner Zucker','Puderzucker','Kakaopulver','Backkakao','Schokolade','Zartbitterschokolade','Mandeln','Walnüsse','Cashewkerne','Erdnüsse','Pinienkerne','Sonnenblumenkerne','Kürbiskerne','Sesam','Leinsamen','Chiasamen','Rosinen','Kokosraspeln',
    ...aliasNames, ...pantryNames
  ]);

  window.WochentischIngredients = Object.freeze({
    normalize, key, pantryKey, pantryMatches, unique, normalizeQuantities, normalizeChecks, normalizeKeys,
    normalizeStateIngredients, manualName, manualKey
  });
  window.COMMON_INGREDIENTS = canonicalIngredients;
  window.COMMON_MAIN_INGREDIENTS = [...new Map([...canonicalIngredients, ...aliasNames].map(name => [aliasKey(name), name])).values()];
})();
