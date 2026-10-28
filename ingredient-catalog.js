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

  // Group meat cuts and preparations by animal. Broths and mixed/unspecified
  // products remain separate because they are not equivalent shopping items.
  addAliases('Rindfleisch', [
    'Rind', 'Rinderfilet', 'Rinder-Patty', 'Rinderpatty', 'Rinderhackfleisch',
    'Rinderhack', 'Rindergulasch', 'Rindersteak', 'Rinderbraten', 'Rinderrouladen',
    'Rindergeschnetzeltes', 'Rinderschulter', 'Rinderhüfte'
  ]);
  addAliases('Schweinefleisch', [
    'Schwein', 'Schweinefilet', 'Schweineschnitzel', 'Schweinebraten',
    'Schweinehackfleisch', 'Schweinehack', 'Schweinesteak', 'Schweinenacken',
    'Schweinenackensteak', 'Schweinebauch', 'Bacon', 'Speck', 'Kasseler', 'Prosciutto'
  ]);
  addAliases('Hähnchen', [
    'Huhn', 'Hühnchen', 'Hähnchenbrust', 'Hähnchenbrustfilet', 'Hähnchenfilet',
    'Hühnchenfilet', 'Hähnchenschenkel', 'Hähnchenkeule', 'Hähnchenflügel',
    'Hähnchenstreifen', 'Chicken', 'Chicken Nuggets'
  ]);
  addAliases('Pute', ['Putenbrust', 'Putenfilet', 'Putenschnitzel', 'Putenkeule', 'Putenhack']);
  addAliases('Ente', ['Entenbrust', 'Entenfilet', 'Entenschenkel']);

  addAliases('Reis', ['Basmatireis', 'Jasminreis', 'Risottoreis', 'Vollkornreis']);
  addAliases('Käse', [
    'Feta', 'Mozzarella', 'Parmesan', 'Gouda', 'Emmentaler', 'Cheddar',
    'Hirtenkäse', 'Halloumi', 'Ziegenkäse', 'Frischkäse',
    'Doppelrahmfrischkäse', 'Hüttenkäse', 'Mascarpone', 'Ricotta', 'Bergkäse',
    'Edamer', 'Butterkäse', 'Gorgonzola', 'Blauschimmelkäse', 'Burrata',
    'Pecorino', 'Grana Padano', 'Provolone', 'Ziegenfrischkäse'
  ]);

  function normalize(value) {
    const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (!name) return '';
    return aliases.get(aliasKey(name)) || name;
  }

  function key(value) {
    return normalize(value).toLocaleLowerCase('de-DE');
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
      const itemKey = key(rawName);
      const quantity = Number(rawQuantity);
      if (!itemKey || !Number.isFinite(quantity)) return result;
      result[itemKey] = (result[itemKey] || 0) + quantity;
      return result;
    }, {});
  }

  function normalizeChecks(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    return Object.entries(values).reduce((result, [rawName, checked]) => {
      const itemKey = key(rawName.replace(/^manual:/i, ''));
      if (itemKey && checked) result[itemKey] = true;
      return result;
    }, {});
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
      hiddenShoppingItems: normalizeWeekValues(value.hiddenShoppingItems, normalizeKeys),
      manualShoppingItems: normalizeWeekValues(value.manualShoppingItems, unique),
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
    'Salz','Pfeffer','Paprikapulver','Geräuchertes Paprikapulver','Currypulver','Kreuzkümmel','Kurkuma','Chiliflocken','Cayennepfeffer','Zimt','Muskatnuss','Oregano','Thymian','Rosmarin','Basilikum','Petersilie','Schnittlauch','Dill','Koriander','Minze','Lorbeerblätter','Italienische Kräuter','Kräuter der Provence','Currypaste','Vanillezucker','Zucker','Brauner Zucker','Puderzucker','Kakaopulver','Backkakao','Schokolade','Zartbitterschokolade','Mandeln','Walnüsse','Cashewkerne','Erdnüsse','Pinienkerne','Sonnenblumenkerne','Kürbiskerne','Sesam','Leinsamen','Chiasamen','Rosinen','Kokosraspeln'
  ]);

  window.WochentischIngredients = Object.freeze({
    normalize, key, unique, normalizeQuantities, normalizeChecks, normalizeKeys,
    normalizeStateIngredients
  });
  window.COMMON_INGREDIENTS = canonicalIngredients;
  window.COMMON_MAIN_INGREDIENTS = [...new Map([...canonicalIngredients, ...aliasNames].map(name => [aliasKey(name), name])).values()];
})();
