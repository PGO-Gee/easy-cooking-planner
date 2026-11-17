// Curated German ingredient vocabulary and exact aliases. Unknown ingredients
// remain available as entered; only explicitly listed variants are combined.
((root) => {
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

  // Explicit number variants only: never stem arbitrary product names.
  [
    ['Kirschtomaten', 'Kirschtomate'], ['Cherrytomaten', 'Cherrytomate'],
    ['Cocktailtomaten', 'Cocktailtomate'], ['Rispentomaten', 'Rispentomate'],
    ['Fleischtomaten', 'Fleischtomate'], ['Salatgurken', 'Salatgurke'],
    ['Gewürzgurken', 'Gewürzgurke'], ['Speisekartoffeln', 'Speisekartoffel'],
    ['Paprika', 'Paprikas', 'Paprikaschote', 'Paprikaschoten'],
    ['Spitzpaprika', 'Spitzpaprikas'], ['Knoblauchzehen', 'Knoblauchzehe'],
    ['Bio-Zitronen', 'Bio-Zitrone'], ['Bio-Limetten', 'Bio-Limette'],
    ['Tellerlinsen', 'Tellerlinse'], ['Belugalinsen', 'Belugalinse'],
    ['Borlotti-Bohnen', 'Borlotti-Bohne'], ['Oliven', 'Olive'],
    ['Haselnüsse', 'Haselnuss'], ['Pistazien', 'Pistazie'],
    ['Lasagneplatten', 'Lasagneplatte'], ['Bandnudeln', 'Bandnudel'],
    ['Suppennudeln', 'Suppennudel'], ['Reisnudeln', 'Reisnudel'],
    ['Glasnudeln', 'Glasnudel'], ['Muskatnuss', 'Muskatnüsse'],
    ['Lachsfilet', 'Lachsfilets'], ['Kabeljaufilet', 'Kabeljaufilets'],
    ['Seelachsfilet', 'Seelachsfilets'], ['Thunfischfilet', 'Thunfischfilets'],
    ['Forellenfilet', 'Forellenfilets'], ['Fischfilet', 'Fischfilets'],
    ['Hähnchenfilet', 'Hähnchenfilets'], ['Putenfilet', 'Putenfilets'],
    ['Putenbrustfilet', 'Putenbrustfilets'], ['Entenfilet', 'Entenfilets'],
    ['Entenbrust', 'Entenbrüste'], ['Entenbrustfilet', 'Entenbrustfilets'],
    ['Rinderfilet', 'Rinderfilets'], ['Schweinefilet', 'Schweinefilets'],
    ['Lammfilet', 'Lammfilets'], ['Schweineschnitzel', 'Schweineschnitzeln'],
    ['Rindersteak', 'Rindersteaks'], ['Schweinesteak', 'Schweinesteaks'],
    ['Schweinenackensteak', 'Schweinenackensteaks'], ['Rinderrouladen', 'Rinderroulade'],
    ['Putenkeule', 'Putenkeulen'], ['Lammkeule', 'Lammkeulen'], ['Lammkotelett', 'Lammkoteletts']
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
    return normalize(value);
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

  const shoppingUnits = new Map(Object.entries({
    g: 'g', gr: 'g', gramm: 'g', kg: 'kg', kilogramm: 'kg', mg: 'mg', milligramm: 'mg',
    ml: 'ml', milliliter: 'ml', cl: 'cl', dl: 'dl', l: 'l', liter: 'l',
    st: 'Stück', stk: 'Stück', stck: 'Stück', stück: 'Stück', stueck: 'Stück', stücke: 'Stück',
    pack: 'Pack.', pkg: 'Pack.', pck: 'Pack.', packung: 'Pack.', packungen: 'Pack.',
    dose: 'Dose', dosen: 'Dose', fl: 'Fl.', flasche: 'Fl.', flaschen: 'Fl.',
    becher: 'Becher', glas: 'Glas', gläser: 'Glas', bund: 'Bund',
    el: 'EL', esslöffel: 'EL', tl: 'TL', teelöffel: 'TL'
  }));

  function shoppingUnit(value) {
    return shoppingUnits.get(String(value ?? '').trim().toLocaleLowerCase('de-DE').replace(/\.$/, '')) || '';
  }

  const shoppingCategories = Object.freeze([
    'Gemüse', 'Obst', 'Brot & Backwaren', 'Fleisch & Fisch', 'Kühlregal',
    'Tiefkühl', 'Getränke', 'Vorrat', 'Drogerie & Haushalt', 'Tierbedarf', 'Sonstiges'
  ]);

  // Processing and product forms take precedence over their raw ingredients.
  const shoppingCategoryRules = [
    ['Tierbedarf', /hundefutter|katzenfutter|tierfutter|katzenstreu|hundeleckerli|vogelfutter|aquarienfutter/],
    ['Drogerie & Haushalt', /spülmittel|waschmittel|weichspüler|shampoo|seife|reiniger|toilettenpapier|küchenroll|taschentuch|taschentücher|müllbeutel|müllsack|schwamm|zahnpasta|zahnbürst|windel|duschgel|backpapier|alufolie|frischhaltefolie|dosenöffner/],
    ['Tiefkühl', /tiefkühl|gefroren|(?:^|\s)tk[-\s]|pommes|fischstäbchen|schlemmer[-\s]?filet|rahmspinat|pelmeni|(?:^|\s)speiseeis/],
    ['Vorrat', /tomaten(?:mark|soße|sauce|püree)|(?:passierte|gehackte|geschälte|getrocknete|stückige) tomaten|dosen|konserve|\b(?:dose|konserve)\b|eingelegt|gewürzgurk|sauerkraut|kokosmilch|kondensmilch|apfelmus|marmelade|erdnussbutter|nussmus|gemüsechips|kartoffelchips|zwiebelpulver|knoblauchpulver|paprikapulver|chilipulver|zuckermais|gemüsebrühe|gemüsefond/],
    ['Vorrat', /essig|balsamico|(?:^|[-\s])öl\b|(?:oliven|sesam|kokos|raps|sonnenblumen|pflanzen|erdnuss|lein)öl|sauce|soße|brühe|fond\b|honig|sirup|suppe im glas|pesto|ketchup|mayonnaise|senf|tahini|tamari|miso|gewürz|pfeffer|salz|kurkuma|kümmel|zimt|muskat|currypulver|currypaste|chiliflocken|oregano|thymian|rosmarin|lorbeer|majoran|italienische kräuter|kräuter der provence|(?:getrocknet|gerebelt).*(?:kräuter|basilikum|dill|petersilie)|schokolade|kakao|(?:vanille|puder|rohr|brauner )?zucker\b|rosinen|kokosraspel|getrocknet|im eigenen saft|in (?:oliven)?öl/],
    ['Getränke', /saftschorle|saft\b|limonade|getränk|sprudel|(?:^|[-\s])(?:wasser|cola|bier|wein|sekt|prosecco)\b|(?:mineral|trink|tonic|kokos)wasser|(?:apfel|rot|weiß|weiss|glüh)wein\b|eistee|alkoholfrei/],
    ['Kühlregal', /milch|haferdrink|sojadrink|mandeldrink|sahne|obers|schmand|jogh?urt|skyr|kefir|quark|kaese|käse|mozzarella|feta|gouda|emmentaler|edamer|gorgonzola|burrata|pecorino|grana padano|provolone|parmesan|cheddar|halloumi|ricotta|mascarpone|cr[eè]me[-\s]*(?:fra[iî]che|l[ée]g[èe]re)|(?:^|[-\s])(?:ei|eier)\b|bioeier|freilandeier|butter(?!nut)|margarine|frische hefe|tofu|tempeh|seitan|gnocchi|spätzle|blätterteig|pizzateig|filoteig/],
    ['Fleisch & Fisch', /hähn|hühn|chicken|suppenhuhn|fleisch(?!tomat)|rinder|schwein|lamm|pute|(?:^|\s)ente|würst|wurst|salami|bacon|speck|schinken|kasseler|prosciutto|fisch|lachs|kabeljau|forelle|garnel|shrimp|sardell|hering|makrele|dorade|muschel|krabbe/],
    ['Vorrat', /mehl|stärke|backpulver|natron|trockenhefe|panko|semme[l]brösel|haferflocken|müsli|granola|(?:^|[-\s])hafer\b|reis|nudel|spaghetti|pasta|kritharaki|penne|fusilli|makkaroni|lasagneplatten|couscous|buchweizen|bulgur|quinoa|hirse|polenta|graupen|linse|kichererbse|(?:kidney|weiße |schwarze |borlotti[-\s]?)bohne|oliven|kapern|pistaz|mandel|nuss|nüsse|kerne|sesam|leinsamen|chiasamen|kaffee|(?:^|[-\s])tee\b|(?:kräuter|kamillen|pfefferminz|früchte|schwarz|grün)tee|keks|cracker/],
    ['Brot & Backwaren', /brot|brötchen|baguette|toast|wrap|croissant|brezel|laugen|ciabatta|pita|tortilla|semmel/],
    ['Obst', /apfel|äpfel|aprikos|banan|birne|beere|dattel|feige|granatapfel|kirsche(?!n?tomat)|kiwi|mandarin|mango(?!ld)|melon|orange|pfirsich|pflaum|traube|zitrone|limette|ananas|nektarin|papaya|(?:^|\s)obst/],
    ['Gemüse', /tomat|paprika|karott|möhre|brokkoli|zucchini|gurke|salat|gemüse|zwiebel|sellerie|lauch|kohl|spinat|pilz|champignon|kartoffel|knoblauch|avocado|aubergin|chicor[ée]|erbse|fenchel|bohne|kürbis|hokkaido|butternut|mais|mangold|pak[-\s]?choi|pastinak|radies|rettich|rucola|rote be[et]|schalott|spargel|wirsing|ingwer|chili|shiitake|basilikum|petersilie|schnittlauch|koriander|minze|dill/]
  ];

  function shoppingCategory(name) {
    const value = normalize(name).toLocaleLowerCase('de-DE');
    return shoppingCategoryRules.find(([, pattern]) => pattern.test(value))?.[0] || 'Sonstiges';
  }

  function normalizeQuantities(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
    return Object.entries(values).reduce((result, [rawName, rawQuantity]) => {
      const itemKey = manualKey(rawName);
      if (!itemKey) return result;
      const previous = result[itemKey];
      if (rawQuantity && typeof rawQuantity === 'object') {
        const { amount } = rawQuantity;
        const unit = shoppingUnit(rawQuantity.unit);
        if (unit && Number.isFinite(amount) && amount > 0) {
          const total = previous?.unit === unit ? previous.amount + amount : amount;
          if (Number.isFinite(total)) result[itemKey] = { amount: total, unit };
        }
      } else {
        const quantity = Number(rawQuantity);
        if (Number.isFinite(quantity) && typeof previous !== 'object') result[itemKey] = (previous || 0) + quantity;
      }
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
        .map(dish => ({ ...dish, ingredients: unique(dish.ingredients),
          ...(dish.recipe && Array.isArray(dish.recipe.ingredients) ? {recipe: {...dish.recipe,
            ingredients: dish.recipe.ingredients.map(item => item && typeof item === 'object' ? {...item, name: normalize(item.name)} : item)
          }} : {}) })),
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

  const api = Object.freeze({
    normalize, key, pantryKey, pantryMatches, unique, normalizeQuantities, normalizeChecks, normalizeKeys,
    normalizeStateIngredients, manualName, manualKey, shoppingUnit, shoppingCategory, shoppingCategories
  });
  root.WochentischIngredients = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.COMMON_INGREDIENTS = canonicalIngredients;
  root.COMMON_MAIN_INGREDIENTS = canonicalIngredients.slice();
})(typeof window === 'object' ? window : {});
