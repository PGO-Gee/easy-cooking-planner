const test=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../recipe-import.js');

test('imports a social-media recipe without inventing a title or portions',()=>{
  const text=`Hey Foodies 💛
Die einfachsten Plätzchen überhaupt!

🛒 Zutaten für eine Backform (30 × 40 cm)
Für den Boden & die Streusel:
🌾 450 g Weizenmehl (Type 405)
🌰 150 g gemahlene blanchierte Mandeln
🍬 150 g Marzipanrohmasse
🧈 300 g kalte Butter
🍚 130 g Zucker
🌼 1 Pck. Vanillezucker
🧂 1 Prise Salz
🥚 1 Ei (Größe M)
Zusätzlich für die Streusel:
🌰 50 g gemahlene Mandeln
Für die Füllung:
🍓 400 g Erdbeerkonfitüre

👨‍🍳 Zubereitung
1️⃣ Marzipan fein raspeln und verkneten.
2️⃣ Zwei Drittel des Teiges in eine Backform geben.
3️⃣ Erdbeerkonfitüre verstreichen.
4️⃣ Mandeln unter den Teig kneten.
5️⃣ 20–25 Minuten goldbraun backen.
6️⃣ Vollständig auskühlen lassen.
✨ Mein Tipp: Luftdicht aufbewahren.`;
  const result=parse(text);assert.equal(result.name,'');assert.equal(result.servings,null);assert.equal(result.ingredients.length,10);assert.equal(result.steps.length,6);
  assert.deepEqual(result.ingredients[0],{name:'Weizenmehl',amount:450,unit:'g',note:'Für den Boden & die Streusel · Type 405'});
  assert.equal(result.ingredients[5].unit,'Pck.');assert.equal(result.ingredients[8].amount,50);assert(result.unassigned.some(x=>x.includes('Mein Tipp')));
});
test('preserves known portions, fractions, ranges and repeated ingredients',()=>{
  const result=parse('Rezept: Salat\nZutaten für 4 Portionen\n1/2 kg Tomaten\n1 1/2 EL Öl\n2–3 Zehen Knoblauch\nSalz\nSalz\nZubereitung\n1. Schneiden und\nvermengen.\n2. Servieren.');
  assert.equal(result.name,'Salat');assert.equal(result.servings,4);assert.equal(result.ingredients.length,5);
  assert.equal(result.ingredients[0].amount,0.5);assert.equal(result.ingredients[1].amount,1.5);assert.equal(result.ingredients[2].amount,'2–3');assert.equal(result.steps[0],'Schneiden und vermengen.');
});
test('rejects empty, oversized and too many steps without truncation',()=>{
  assert(parse(' ').error);assert(parse('a'.repeat(50001)).error);
  assert(parse('Zubereitung\n'+Array.from({length:101},(_,i)=>`${i+1}. Schritt`).join('\n')).errors.some(x=>x.includes('100')));
});

test('recognizes numbered ingredients and leaves unrelated content for review',()=>{
  const result=parse('Rezept: Suppe\nZutaten\n1. 2 Karotten\n2. 1 l Wasser\nZubereitung\n1. Karotten schneiden.\n\n2. Kochen.\nTipp: Kühl lagern.');
  assert.equal(result.ingredients.length,2);assert.equal(result.steps.length,2);assert(result.unassigned.some(line=>line.includes('Tipp')));
});
test('does not silently lose oversized ingredient lines or infer backing forms as portions',()=>{
  const ingredient='1 '+ 'x'.repeat(110), result=parse(`Zutaten für eine Backform (30 × 40 cm)\n${ingredient}\nZubereitung\n1. Mischen.`);
  assert.equal(result.servings,null);assert(result.unassigned.includes(ingredient));assert(result.unassigned.some(line=>line.includes('Backform')));
});
test('preserves exact durations and leaves ranges or out-of-bounds values for review',()=>{
  assert.equal(parse('Gesamtzeit: 30 Minuten\nZutaten\n1 Ei').time,30);
  assert.equal(parse('Gesamtzeit: 35 Minuten\nZutaten\n1 Ei').time,35);
  assert.equal(parse('Dauer: 1 Std. 5 Min.\nZutaten\n1 Ei').time,65);
  for(const line of ['Gesamtzeit: 25–35 Minuten','Gesamtzeit: 25 Stunden','Arbeitszeit: 15 Minuten']){
    const result=parse(line+'\nZutaten\n1 Ei');
    assert.equal(result.time,null,line);
    assert.deepEqual(result.unassigned,[line]);
  }
});

test('synthetic: section headings with inline ingredients and preparation',()=>{
  const r=parse('Rezept: Omelett\nZutaten: 2 Eier\n1 EL Milch\nSalz nach Geschmack\nZubereitung: Eier mit Milch verquirlen.\n2. In der Pfanne braten.');
  assert.equal(r.name,'Omelett');assert.equal(r.ingredients.length,3);assert.equal(r.ingredients[0].name,'Eier');
  assert.equal(r.steps.length,2);assert.match(r.steps[0],/Eier mit Milch verquirlen/);
});

test('synthetic: portion and duration metadata within a recipe are not ingredients',()=>{
  const r=parse('Rezept: Suppe\nZutaten\nPortionen: 4\nZubereitungszeit: 35 Minuten\n2 Karotten\n500 ml Wasser\nZubereitung\n1. Alles kochen.');
  assert.equal(r.servings,4);assert.deepEqual(r.ingredients.map(x=>x.name),['Karotten','Wasser']);
  assert.equal(r.time,35);
  assert.deepEqual(r.unassigned,[]);
});

test('synthetic: recipe without section headings and numbered directions',()=>{
  const r=parse('Rezept: Tomatensalat\n2 Tomaten\n1/2 Gurke\n2 EL Öl\n1. Tomaten und Gurke schneiden.\n2. Alles vermengen.');
  assert.deepEqual(r.ingredients.map(x=>x.name),['Tomaten','Gurke','Öl']);assert.equal(r.steps.length,2);
});

test('synthetic: bullet lists with unicode fractions and amount descriptions',()=>{
  const r=parse('Rezept: Pfannkuchen\nFür 2 Portionen\nZutaten:\n• ½ l Milch\n• 1,5 EL Zucker\n• 2–3 Eier\n• Salz nach Geschmack\nAnleitung:\n1) Alle Zutaten verrühren.\n2) In einer Pfanne ausbacken.');
  assert.equal(r.servings,2);assert.equal(r.ingredients.length,4);assert.equal(r.ingredients[0].amount,0.5);
  assert.equal(r.ingredients[1].amount,1.5);assert.equal(r.ingredients[2].amount,'2–3');assert.equal(r.steps.length,2);
});

test('synthetic: tips and source metadata remain unassigned, not recipe ingredients',()=>{
  const r=parse('Rezept: Ofengemüse\nZutaten\n400 g Kartoffeln\n200 g Karotten\nQuelle: Familienrezept\nZubereitung\n1. Gemüse schneiden.\n2. Im Ofen backen.\nTipp: Mit Joghurt servieren.');
  assert.deepEqual(r.ingredients.map(x=>x.name),['Kartoffeln','Karotten']);assert.equal(r.steps.length,2);
  assert(r.unassigned.some(x=>x.includes('Quelle:')));assert(r.unassigned.some(x=>x.includes('Tipp:')));
});

test('synthetic: ingredient groups and notes remain distinct',()=>{
  const r=parse('Rezept: Reis-Bowl\nZutaten\nFür den Reis:\n200 g Reis\nFür die Sauce:\n2 EL Joghurt (natur)\n1 EL Öl\nZubereitung\nReis kochen.\n\nSauce verrühren.');
  assert.equal(r.ingredients.length,3);assert.equal(r.ingredients[0].note,'Für den Reis');assert.equal(r.ingredients[1].note,'Für die Sauce · natur');assert.equal(r.steps.length,2);
});

test('synthetic: unsupported quantities are preserved instead of treated as a different amount',()=>{
  const r=parse('Rezept: Nusskuchen\nZutaten\n200–250 g Mehl\nca. 1/2 Tasse Milch\n1 Dose Tomaten (400 g)\nZubereitung\n1. Alles mischen.');
  assert.equal(r.ingredients[0].amount,'200–250');assert.equal(r.ingredients[1].amount,0.5);assert.equal(r.ingredients[2].note,'400 g');
});

test('synthetic: numbered instructions without punctuation are not ingredients',()=>{
  const r=parse('Rezept: Salat\n2 Tomaten\n1 Gurke\n1. Tomaten und Gurke schneiden\n2. Alles vermengen');
  assert.deepEqual(r.ingredients.map(x=>x.name),['Tomaten','Gurke']);assert.deepEqual(r.steps,['Tomaten und Gurke schneiden','Alles vermengen']);
});

test('unsupported amounts in inline ingredient lists keep the source line visible for correction',()=>{
  const line='Zutaten: 2 Eier, 2 x 200 g Mehl';const r=parse(`Rezept: Teig\n${line}\nZubereitung\n1. Alles verrühren.`);
  assert.equal(r.ingredients.length,0);assert(r.unassigned.includes(line));
});

test('imports the pasted Blini recipe with spelled-out amounts and spoken step numbers',()=>{
  const source=String.raw`"Blini.\
Zutaten: vier Stück Eier, 200 g Mehl, 500 g Milch, 50 g Zucker, 75 g Öl, eine Prise Salz.\
Zubereitung: alle Zutaten für mischen und mit dem Mixer kurz verrühren.\
Zweitens Öl in die Pfanne Pfanne geben"`;
  const plain=source.slice(1,-1).replace(/\\\n/g,'\n');
  for(const text of [source,plain]){
    const result=parse(text);
    assert.equal(result.name,'Blini');
    assert.equal(result.servings,null);
    assert.deepEqual(result.ingredients.map(({name,amount,unit})=>[name,amount,unit]),[
      ['Eier',4,'Stück'],['Mehl',200,'g'],['Milch',500,'g'],['Zucker',50,'g'],['Öl',75,'g'],['Salz',1,'Prise']
    ]);
    assert.deepEqual(result.steps,[
      'alle Zutaten für mischen und mit dem Mixer kurz verrühren.',
      'Öl in die Pfanne Pfanne geben'
    ]);
    assert.deepEqual(result.unassigned,[]);
    assert.deepEqual(result.errors,[]);
  }
});

test('ingredient section lists keep decimal commas, preparation notes and parenthetical commas',()=>{
  const {parseSection}=require('../recipe-import.js');
  const result=parseSection('1 Zwiebel, fein gehackt, 1,5 EL Öl (nativ, mild); zwei Karotten und eine Handvoll Petersilie.','ingredients');
  assert.deepEqual(result.ingredients,[
    {name:'Zwiebel',amount:1,unit:'',note:'fein gehackt'},
    {name:'Öl',amount:1.5,unit:'EL',note:'nativ, mild'},
    {name:'Karotten',amount:2,unit:'',note:''},
    {name:'Petersilie',amount:'eine Handvoll',unit:'',note:''}
  ]);
  assert.deepEqual(result.unassigned,[]);
});

test('recognizes Markdown headings, reversed quantities, bullets and German fractions',()=>{
  const result=parse([
    '### Kräuter-Dip',
    '**Zutaten für vier Personen:**',
    '– Quark: 250 g',
    '• Kräuter (2 EL)',
    '- Salz – ein halber TL',
    '✔ drei Viertel Becher Joghurt',
    'Salz, Pfeffer, Paprika',
    '**So geht’s:**',
    '• Alles mischen',
    '• Mit Salz abschmecken'
  ].join('\n'));
  assert.equal(result.name,'Kräuter-Dip');
  assert.equal(result.servings,4);
  assert.deepEqual(result.ingredients.map(({name,amount,unit})=>[name,amount,unit]),[
    ['Quark',250,'g'],['Kräuter',2,'EL'],['Salz',0.5,'TL'],['Joghurt',0.75,'Becher'],
    ['Salz',null,''],['Pfeffer',null,''],['Paprika',null,'']
  ]);
  assert.deepEqual(result.steps,['Alles mischen','Mit Salz abschmecken']);
  assert.deepEqual(result.unassigned,[]);
});

test('recovers a compact recipe without line breaks and keeps measured and bare ingredients',()=>{
  const result=parse('Blini Zutaten: 4 Eier, Milch: 500 g, Mehl 200 g, Salz und Pfeffer Zubereitung: 1) Teig mischen 2) In der Pfanne ausbacken.');
  assert.equal(result.name,'Blini');
  assert.deepEqual(result.ingredients.map(item=>[item.name,item.amount]),[
    ['Eier',4],['Milch',500],['Mehl',200],['Salz',null],['Pfeffer',null]
  ]);
  assert.deepEqual(result.steps,['Teig mischen','In der Pfanne ausbacken.']);
  assert.deepEqual(result.unassigned,[]);
});

test('finds marked sections on one line and keeps unclassified inline details in the source',()=>{
  const source='Blini. **Zutaten für 4 Personen:** 4 Eier, 2 × 200 g Mehl. **Zubereitung:** Erstens verrühren Zweitens backen.';
  const result=parse(source);
  assert.equal(result.name,'Blini');
  assert.equal(result.servings,4);
  assert.deepEqual(result.steps,['verrühren','backen.']);
  assert.deepEqual(result.unassigned,[source]);
});

test('recognizes parenthesized portions and a trailing tip in a single physical line',()=>{
  const source='Bratkartoffeln. Zutaten (2 Personen): 400 g Kartoffeln; Salz, Pfeffer und Muskat. Anleitung: Kartoffeln braten. Tipp: Mit Petersilie servieren.';
  const result=parse(source);
  assert.equal(result.name,'Bratkartoffeln');
  assert.equal(result.servings,2);
  assert.deepEqual(result.ingredients.map(item=>item.name),['Kartoffeln','Salz','Pfeffer','Muskat']);
  assert.deepEqual(result.steps,['Kartoffeln braten.']);
  assert.deepEqual(result.unassigned,[source]);
});

test('infers a title and instructions in a recipe with no section headings',()=>{
  const result=parse('Karottenpüree\n(für zwei Personen)\n250 g Karotten\n1 EL Butter\nKarotten weich kochen.\nDanach mit Butter pürieren.');
  assert.equal(result.name,'Karottenpüree');
  assert.equal(result.servings,2);
  assert.deepEqual(result.ingredients.map(item=>item.name),['Karotten','Butter']);
  assert.deepEqual(result.steps,['Karotten weich kochen.','Danach mit Butter pürieren.']);
  assert.deepEqual(result.unassigned,[]);
});

test('reads labelled ingredient tables in Markdown and tab-separated text',()=>{
  for(const table of [
    '| Menge | Einheit | Zutat | Hinweis |\n| ----- | ------- | ----- | ------- |\n| ½ | l | Milch | kalt |\n| 30 | g | Stärke | |',
    'Zutat\tMenge\tHinweis\nMilch\t½ l\tkalt\nStärke\t30 g\t'
  ]){
    const result=parse('Schoko-Pudding\nZutaten\n'+table+'\nZubereitung\nZunächst Milch erhitzen. Danach Stärke einrühren.');
    assert.equal(result.name,'Schoko-Pudding');
    assert.deepEqual(result.ingredients,[
      {name:'Milch',amount:0.5,unit:'l',note:'kalt'},
      {name:'Stärke',amount:30,unit:'g',note:''}
    ]);
    assert.deepEqual(result.steps,['Zunächst Milch erhitzen.','Danach Stärke einrühren.']);
    assert.deepEqual(result.unassigned,[]);
  }
});

test('preserves free-text ingredient notes and does not read a cooking instruction as a serving count',()=>{
  const result=parse([
    'Zutaten:',
    'Sauce: 1 Dose Tomaten (400 g, 240 g Abtropfgewicht), 2 EL Öl, zum Braten.',
    'So wird’s gemacht:',
    'Tomaten erhitzen.',
    'Auf zwei Portionen verteilen.',
    'Guten Appetit!'
  ].join('\n'));
  assert.equal(result.servings,null);
  assert.deepEqual(result.ingredients,[
    {name:'Tomaten',amount:1,unit:'Dose',note:'Sauce · 400 g, 240 g Abtropfgewicht'},
    {name:'Öl',amount:2,unit:'EL',note:'Sauce · zum Braten'}
  ]);
  assert.deepEqual(result.steps,['Tomaten erhitzen.','Auf zwei Portionen verteilen.']);
  assert.deepEqual(result.unassigned,['Guten Appetit!']);
});

test('keeps conflicting metadata and ambiguous quantities for review',()=>{
  const source=[
    'Für 2 Personen',
    'Portionen: vier',
    'Gesamtzeit: 35 Minuten',
    'Dauer: 45 Minuten',
    'Zutaten',
    '1.000 g Mehl',
    '0 g Öl',
    '• −100 g Zucker',
    '⅜ l Milch'
  ];
  const result=parse(source.join('\n'));
  assert.equal(result.servings,null);
  assert.equal(result.time,null);
  assert.deepEqual(result.ingredients,[{name:'Milch',amount:0.375,unit:'l',note:''}]);
  assert.deepEqual(result.unassigned,[...source.slice(0,4),...source.slice(5,8)]);
  const timed=parse('Gesamtzeit: 45 min\nZubereitungszeit: 20 min\nBackzeit: 25 min\nZutaten: 2 Eier');
  assert.equal(timed.time,45);
  assert.deepEqual(timed.unassigned,['Zubereitungszeit: 20 min','Backzeit: 25 min']);
});

test('synthetic: trailing taste instructions do not become part of the shopping ingredient',()=>{
  const r=parse('Rezept: Sauce\nZutaten\nSalz nach Geschmack\n1 Prise Pfeffer nach Belieben\nZubereitung\n1. Verrühren.');
  assert.equal(r.ingredients[0].name,'Salz');assert.equal(r.ingredients[0].amount,'nach Geschmack');
  assert.equal(r.ingredients[1].name,'Pfeffer');assert.equal(r.ingredients[1].note,'nach Belieben');
});

test('synthetic: ranges and package multiplication are never misread as a single quantity',()=>{
  const r=parse('Rezept: Tomatensuppe\nZutaten\n2 bis 3 Tomaten\n2 x 400 g Tomaten aus der Dose\nZubereitung\n1. Erhitzen.');
  assert.equal(r.ingredients[0].amount,'2 bis 3');assert.equal(r.ingredients[0].name,'Tomaten');
  assert.equal(r.ingredients.length,1);assert(r.unassigned.some(line=>line.includes('2 x 400')));
});

test('synthetic: portion ranges and decimals are never mistaken for a precise serving base',()=>{
  for(const line of ['Zutaten für 2–4 Portionen','Zutaten für 2 bis 4 Portionen','Zutaten für 2,5 Portionen','Zutaten für 1/2 Portion']){
    const r=parse(`${line}\n200 g Reis\nZubereitung\n1. Kochen.`);
    assert.equal(r.servings,null,line);assert(r.unassigned.includes(line),line);
  }
});

test('synthetic: negative quantities must not turn into positive quantities',()=>{
  for(const line of ['-100 g Mehl','−100 g Mehl']){
    const r=parse(`Zutaten\n${line}\nZubereitung\n1. Mischen.`);
    assert.equal(r.ingredients.length,0,line);assert(r.unassigned.includes(line),line);
  }
  assert.equal(parse('Zutaten\n- 100 g Mehl\nZubereitung\n1. Mischen.').ingredients[0].amount,100);
});

test('synthetic: packaging information between quantity and ingredient stays attached',()=>{
  const r=parse('Rezept: Suppe\nZutaten\n1 Dose (400 g) Tomaten\nZubereitung\n1. Erhitzen.');
  assert.deepEqual(r.ingredients[0],{name:'Tomaten',amount:1,unit:'Dose',note:'400 g'});
});

test('synthetic: preparation notes after a comma stay separate from ingredient names',()=>{
  const r=parse('Rezept: Pfanne\nZutaten\n1 Zwiebel, fein gehackt\n2 Karotten, gewürfelt\nZubereitung\n1. Anbraten.');
  assert.deepEqual(r.ingredients.map(x=>[x.name,x.note]),[['Zwiebel','fein gehackt'],['Karotten','gewürfelt']]);
});

test('synthetic: numbered preparation with quantities is not a numbered ingredient',()=>{
  const r=parse('Rezept: Kakao\n200 ml Milch\n20 g Schokolade\n1. 20 g Schokolade schmelzen\n2. Milch dazugeben und umrühren');
  assert.deepEqual(r.ingredients.map(x=>x.name),['Milch','Schokolade']);assert.equal(r.steps.length,2);
});

test('synthetic: numbering immediately after a preparation heading is removed once',()=>{
  const r=parse('Rezept: Teig\nZutaten: 2 Eier\nZubereitung: 1. Eier verquirlen.\n2. Braten.');
  assert.deepEqual(r.steps,['Eier verquirlen.','Braten.']);
});

test('synthetic: baking tin and yield details in ingredient headings remain visible',()=>{
  for(const line of ['Zutaten für eine Springform (26 cm)','Zutaten für 12 Stück','Zutaten für den Teig']){
    const r=parse(`${line}\n200 g Mehl\nZubereitung\n1. Mischen.`);
    assert.equal(r.servings,null,line);assert(r.unassigned.includes(line),line);assert.equal(r.ingredients[0].name,'Mehl');
  }
});

test('synthetic: social-media footer is not appended to cooking steps',()=>{
  const r=parse('Rezept: Suppe\nZutaten\n200 g Karotten\nZubereitung\n1. Karotten kochen.\n\n#lecker #selbstgemacht\nhttps://example.test/rezept\n@kochprofil');
  assert.deepEqual(r.steps,['Karotten kochen.']);assert(r.unassigned.some(line=>line.includes('#lecker')));assert(r.unassigned.some(line=>line.includes('example.test')));assert(r.unassigned.includes('@kochprofil'));
});

test('synthetic: text with ingredient heading and explicit portions keeps correct quantities',()=>{
  const r=parse('Nudelsalat\r\nZutaten für 4 Portionen:\r\n- 250g Nudeln\r\n- ½ Gurke\r\n- 1,5 EL Olivenöl\r\nZubereitung:\r\n1. Nudeln kochen.\r\n2. Alles vermischen.');
  assert.equal(r.name,'Nudelsalat');assert.equal(r.servings,4);assert.deepEqual(r.ingredients.map(x=>x.amount),[250,0.5,1.5]);assert.equal(r.steps.length,2);
});

test('synthetic: a standalone ambiguous serving range is not imported as an ingredient',()=>{
  const line='2–4 Portionen';const r=parse(`Rezept: Suppe\nZutaten\n${line}\n200 g Karotten\nZubereitung\n1. Kochen.`);
  assert.equal(r.servings,null);assert.deepEqual(r.ingredients.map(item=>item.name),['Karotten']);assert(r.unassigned.includes(line));
});

test('synthetic: unknown unit-like words never access inherited object properties',()=>{
  const r=parse('Zutaten\n2 constructor Nudeln\nZubereitung\n1. Kochen.');
  assert.equal(r.ingredients[0].unit,'');assert.equal(r.ingredients[0].name,'constructor Nudeln');
});

test('synthetic: excessive instructions remain visible instead of being truncated',()=>{
  const step='A'.repeat(1201);const r=parse(`Rezept: Test\nZutaten\n1 Ei\nZubereitung\n1. ${step}`);
  assert(r.errors.some(message=>message.includes('1.200')));assert.equal(r.steps[0],step);
});

test('synthetic: unusual group notes are preserved when they exceed the field limit',()=>{
  const line='1 Ei (ein Hinweis, der absichtlich länger als hundert Zeichen ist und deshalb nicht in das vorhandene kurze Hinweisfeld hineinpasst)';
  const r=parse(`Zutaten\n${line}\nZubereitung\n1. Rühren.`);
  assert.equal(r.ingredients.length,0);assert(r.unassigned.includes(line));
});

test('section import recognizes standalone ingredient lists without headings',()=>{
  const r=require('../recipe-import.js').parseSection('250 g Reis\n2 Tomaten\nSalz nach Geschmack','ingredients');
  assert.deepEqual(r.ingredients.map(item=>item.name),['Reis','Tomaten','Salz']);assert.equal(r.servings,null);
});
test('section import recognizes separate unnumbered or numbered preparation',()=>{
  const r=require('../recipe-import.js').parseSection('Reis kochen.\n\n2. Tomaten schneiden.','preparation');
  assert.deepEqual(r.steps,['Reis kochen.','Tomaten schneiden.']);
});
test('section import reports empty and nonmatching input',()=>{
  const parser=require('../recipe-import.js');assert(parser.parseSection('','ingredients').error);assert(parser.parseSection('https://example.test','preparation').error);assert(parser.parseSection('Zutaten\n','ingredients').error);
});
test('section nutrition import only reads per-portion values and retains unrecognized text',()=>{
  const parser=require('../recipe-import.js'),r=parser.parseSection('Nährwerte pro Portion:\nEnergie: 430 kcal\nEiweiß: 22,5 g\n15 g Fett\nKohlenhydrate: 45 g\nBallaststoffe: 4 g','nutrition');
  assert.deepEqual(r.nutrition,{kcal:430,protein:22.5,fat:15,carbs:45});assert(r.unassigned.some(x=>x.includes('Ballaststoffe')));
  assert(parser.parseSection('pro 100 g\n450 kcal\nFett: 5 g','nutrition').error);
  assert(parser.parseSection('Kalorien: -2 kcal','nutrition').error);
});

test('section imports append ingredients without changing unrelated values and preserve safe serving bases',()=>{
  const parser=require('../recipe-import.js'),r=parser.parseSection('200 g Reis\n100 g Gemüse','ingredients');
  const first=parser.mergeSection('ingredients',{ingredients:[{name:'',amount:'',unit:'',note:''}],servings:1},r);
  assert.equal(first.ingredients.length,2);assert.equal(first.servings,null);
  const conflict=parser.mergeSection('ingredients',{ingredients:[{name:'Ei',amount:1}],servings:2},{...r,servings:4});assert(conflict.error);
  const combined=parser.mergeSection('ingredients',{ingredients:[{name:'Ei',amount:1}],servings:2},{...r,servings:2});assert.equal(combined.ingredients.length,3);assert.equal(combined.servings,2);
  const uncertain=parser.mergeSection('ingredients',{ingredients:[{name:'Ei',amount:1}],servings:2},r);assert.equal(uncertain.servings,null);
});
test('section imports append steps with limit and preserve previously entered nutrition',()=>{
  const {mergeSection}=require('../recipe-import.js');assert.deepEqual(mergeSection('preparation',{steps:['Bestehend']},{steps:['Neu']}).steps,['Bestehend','Neu']);
  assert(mergeSection('preparation',{steps:Array(100).fill('alt')},{steps:['neu']}).error);
  assert.deepEqual(mergeSection('nutrition',{nutrition:{kcal:'400',fat:''}},{nutrition:{kcal:500,fat:12}}),{nutrition:{kcal:'400',fat:12},skipped:['kcal']});
});

test('nutrition conflicts identify only source lines that were not applied',()=>{
  const parser=require('../recipe-import.js'),r=parser.parseSection('Energie: 500 kcal\nKohlenhydrate: 45 g','nutrition');
  const merged=parser.mergeSection('nutrition',{nutrition:{kcal:'430',carbs:''}},r);
  assert.deepEqual(merged.skipped.map(key=>r.nutritionLines[key]),['Energie: 500 kcal']);assert.equal(merged.nutrition.carbs,45);
});

test('section nutrition import accepts several per-portion values on one line',()=>{
  const r=require('../recipe-import.js').parseSection('Pro Portion: 430 kcal | Eiweiß: 22,5 g | Fett: 12 g; Kohlenhydrate: 45 g','nutrition');
  assert.deepEqual(r.nutrition,{kcal:430,protein:22.5,fat:12,carbs:45});assert.deepEqual(r.unassigned,[]);
});
