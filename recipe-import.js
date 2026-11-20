(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.WochentischRecipeImport=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const MAX_SOURCE=50000;
  const units={
    g:'g',gramm:'g',gr:'g',kg:'kg',kilogramm:'kg',mg:'mg',ml:'ml',milliliter:'ml',cl:'cl',dl:'dl',l:'l',liter:'l',
    el:'EL',essl:'EL',esslöffel:'EL',essloeffel:'EL',tl:'TL',teel:'TL',teelöffel:'TL',teeloeffel:'TL',
    pr:'Prise',prise:'Prise',prisen:'Prise',msp:'Msp.',messerspitze:'Msp.',messerspitzen:'Msp.',
    st:'Stück',stück:'Stück',stücke:'Stück',stueck:'Stück',stk:'Stück',
    dose:'Dose',dosen:'Dose',bund:'Bund',bunde:'Bund',pck:'Pck.',pckg:'Pck.',pkg:'Pck.',päckchen:'Päckchen',
    packung:'Packung',packungen:'Packung',becher:'Becher',glas:'Glas',gläser:'Glas',flasche:'Flasche',flaschen:'Flasche',
    zehe:'Zehe',zehen:'Zehen',scheibe:'Scheibe',scheiben:'Scheiben',tasse:'Tasse',tassen:'Tassen',
    tropfen:'Tropfen',schuss:'Schuss',spritzer:'Spritzer',stange:'Stange',stangen:'Stange',
    zweig:'Zweig',zweige:'Zweig',blatt:'Blatt',blätter:'Blatt',handvoll:'Handvoll'
  };
  const fractionMap={'½':0.5,'¼':0.25,'¾':0.75,'⅓':1/3,'⅔':2/3,'⅕':1/5,'⅖':2/5,'⅗':3/5,'⅘':4/5,'⅙':1/6,'⅚':5/6,'⅛':1/8,'⅜':3/8,'⅝':5/8,'⅞':7/8};
  const numberWords={
    ein:1,eine:1,einen:1,zwei:2,drei:3,vier:4,fünf:5,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,
    elf:11,zwölf:12,zwoelf:12,dreizehn:13,vierzehn:14,fünfzehn:15,fuenfzehn:15,sechzehn:16,
    siebzehn:17,achtzehn:18,neunzehn:19,zwanzig:20,anderthalb:1.5,eineinhalb:1.5,zweieinhalb:2.5
  };
  const fractionChars=Object.keys(fractionMap).join('');
  const digits=`(?:\\d+[.,]\\d+|(?:\\d+\\s+)?\\d+\\s*[\\/⁄]\\s*\\d+|\\d*\\s*[${fractionChars}]|\\d+)`;
  const words=`(?:(?:ein(?:e|en)?\\s+)?halb(?:er|en|e|es)?|(?:ein\\s+)?viertel|drei\\s+viertel|(?:ein\\s+)?drittel|zwei\\s+drittel|${Object.keys(numberWords).join('|')})(?![\\p{L}])`;
  const quantityToken=`(?:${digits}|${words})`;
  const amountPattern=new RegExp(`^(${quantityToken})(?:\\s*(?:[-–—−]|\\bbis\\b)\\s*(${quantityToken}))?(?=\\s|[\\p{L}(]|$)\\s*`,'iu');
  const approximateAmount=/^(?:ca\.\s*|(?:ca|circa|etwa|ungefähr|rund)\s+)/i;
  const vagueAmount=/^(etwas|nach geschmack|eine? handvoll)\s+/i;
  const bullet=/^(?:[•▪◦‣∙●·✓✔☐☑]\s*|[-*+–—]\s+|[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)+/u;
  const numbered=/^(?:\d+\s*[.)](?=\s|\p{L}|$)\s*|\d\uFE0F?\u20E3\s*|schritt\s+\d+\s*[:.)–-]?\s*)/iu;
  const spokenStep=/(?:erstens|zweitens|drittens|viertens|fünftens|fuenftens|sechstens|siebtens|achtens|neuntens|zehntens)[,.:]?\s+/iu;
  const spokenPrefix=new RegExp(`^${spokenStep.source}`,'iu');
  const nextSpokenStep=new RegExp(`\\s+(?=${spokenStep.source})`,'iu');
  const stepPrefix=new RegExp(`^(?:${numbered.source.slice(1)}|${spokenStep.source})`,'iu');
  const cookingAction=/\b(?:schneiden|hacken|vermengen|vermischen|verrühren|verruehren|mischen|rühren|ruehren|verquirlen|kochen|köcheln|braten|backen|ausbacken|erhitzen|anbraten|zugeben|hinzufügen|hinzufuegen|abschmecken|servieren|verteilen|garen|waschen|schälen|schaelen|kneten|vorheizen|geben|dazugeben|ausrollen|abkühlen|abkuehlen|schmelzen|umrühren|umruehren|würzen|wuerzen|abtropfen|abgießen|abgiessen|(?:ziehen|ruhen|stehen) lassen)\b/i;
  const sequence=/^(?:zuerst|zunächst|anschließend|anschliessend|danach|zum schluss|abschließend|abschliessend)\b/i;
  const ingredientNote=/^(?:zum\s|zur\s|nach\s|optional\b|ersatzweise\b|bei bedarf\b|(?:fein |grob |frisch )?(?:gehackt|gewürfelt|geschnitten|gerieben|geschält|gepresst|abgetropft|zerkleinert|halbiert|geviertelt|passiert|geschmolzen|gemahlen|gesiebt)\b|(?:natur|mild|schwarz|weiß|weiss|kalt|warm|zimmerwarm|ungesalzen)[.]?$)/i;
  const anotherMeasurement=/\s\d+(?:[.,]\d+)?\s*(?:mg|g|kg|ml|cl|dl|l|el|tl)\.?\s+\p{L}/iu;
  const bareIngredient=/^(?:\p{Lu}[\p{L}-]*(?:\s+\p{Lu}[\p{L}-]*)*|[\p{L}-]+)[.]?$/u;

  function stripBullet(value){return value.trim().replace(bullet,'').trim()}
  function cleanLine(value){return stripBullet(value.replace(/[\u00a0\u2009\u202f]/g,' '))}
  function parseNumber(value){
    const text=value.toLowerCase().trim().replace(/\s+/g,' ');
    const wordFraction={'viertel':0.25,'ein viertel':0.25,'drei viertel':0.75,'drittel':1/3,'ein drittel':1/3,'zwei drittel':2/3};
    if(Object.hasOwn(numberWords,text))return numberWords[text];
    if(Object.hasOwn(wordFraction,text))return wordFraction[text];
    if(/(?:^| )halb(?:er|en|e|es)?$/.test(text))return 0.5;
    const fraction=text.match(/^(?:(\d+) )?(\d+)\s*[\/⁄]\s*(\d+)$/);
    if(fraction)return Number(fraction[1]||0)+Number(fraction[2])/Number(fraction[3]);
    if(Object.hasOwn(fractionMap,text.at(-1)))return Number(text.slice(0,-1))+fractionMap[text.at(-1)];
    // A dot with three following digits can mean either a decimal point or a thousands separator.
    return /^[1-9]\d{0,2}\.\d{3}$/.test(text)?NaN:Number(text.replace(',','.'));
  }
  function readQuantity(value){
    const text=value.replace(approximateAmount,'');
    const vague=text.match(vagueAmount);
    if(vague)return {amount:vague[1],unit:'',rest:text.slice(vague[0].length)};
    const match=text.match(amountPattern);
    if(!match)return null;

    const lower=parseNumber(match[1]),upper=match[2]&&parseNumber(match[2]);
    const valid=n=>Number.isFinite(n)&&n>0&&n<=1e9;
    const amount=valid(lower)&&(!match[2]||valid(upper))?(match[2]?match[0].trim():lower):null;
    return {amount,...readUnit(text.slice(match[0].length))};
  }

  function readUnit(text){
    const unitMatch=text.match(/^([\p{L}]+)\.?(?=\s|\(|$)\s*/u);
    const key=unitMatch?.[1].toLowerCase();
    return Object.hasOwn(units,key)?{unit:units[key],rest:text.slice(unitMatch[0].length)}:{unit:'',rest:text};
  }

  function reversedIngredient(text){
    const separated=text.match(/^(.+?)(?:\s*:\s*|\s+[–—-]\s+)(\S.*)$/u);
    const parenthetical=text.match(/^(.+?)\s*\(([^()]*)\)$/u);
    const suffix=text.match(/^(.+?)\s+(\d.*)$/u);
    const match=separated||parenthetical||suffix;
    if(!match)return null;
    const quantity=readQuantity(match[2]);
    if(!quantity||quantity.rest||(!separated&&!quantity.unit))return null;
    return {...quantity,rest:match[1].trim()};
  }

  function parseIngredient(line,group,allowBare){
    let text=cleanLine(line);
    const start=text.replace(approximateAmount,'');
    if(!text||/^[-−]\s*\d|^\d+\s*[x×]\s*\d/i.test(start))return null;
    const quantity=readQuantity(text)||reversedIngredient(text);
    if(quantity?.amount===null||(!quantity&&!allowBare))return null;
    let amount=quantity?.amount??null;
    const {unit,rest}=quantity||readUnit(text);
    text=(quantity||rest?rest:text).trim();
    if(/^(?:[x×]|mal)\s*\d/i.test(text))return null;

    const notes=group?[group]:[];
    const prefix=text.match(/^\(([^()]*)\)\s+(\S.*)$/);
    if(prefix){notes.push(prefix[1].trim());text=prefix[2]}
    const taste=text.match(/[,;]?\s+(nach Geschmack|nach Belieben)$/i);
    if(taste){
      text=text.slice(0,taste.index).trim();
      if(amount===null)amount=taste[1];else notes.push(taste[1]);
    }
    const qualifier=text.match(/(?:[,;]\s*|\s+(?=zum\s|zur\s))([^,;]+)$/i);
    if(qualifier&&ingredientNote.test(qualifier[1])){
      notes.push(qualifier[1]);text=text.slice(0,qualifier.index).trim();
    }
    const aside=text.match(/\s*\(([^()]*)\)$/);
    if(aside){notes.push(aside[1].trim());text=text.slice(0,aside.index).trim()}

    const note=notes.filter(Boolean).join(' · ');
    if(!/^(?:\p{L}|\d+[-%])/u.test(text)||/[.!?]$|[,;]\s*(?:ca\.?\s*)?\d|[:|]/i.test(text)||anotherMeasurement.test(text)||
        /^(?:für|zusätzlich|zubereitung|zutaten|tipp|hinweis)\b/i.test(text)||
        text.length>100||note.length>100||String(amount??'').length>40)return null;
    return {name:text,amount,unit:rest?unit:'',note};
  }

  function parseIngredientList(line,group,allowBare,explicit=false){
    line=cleanLine(line);
    const parts=[];
    let start=0,depth=0;
    for(const token of line.matchAll(/[(),;|•]|\s+und\s+/gi)){
      const separator=token[0],index=token.index,end=index+separator.length;
      if(separator==='('){depth++;continue}
      if(separator===')'){if(--depth<0)return [];continue}
      if(depth!==0||(separator===','&&/\d/.test(line.charAt(index-1))&&/\d/.test(line.charAt(end))))continue;

      const next=line.slice(end).trimStart();
      if(!next)continue;
      const candidate=next.split(/,(?!\d)|[;|•]|\s+und\s+/i,1)[0].trim();
      if(ingredientNote.test(candidate))continue;
      const measured=readQuantity(next)||reversedIngredient(candidate)||/^[-−]\s*\d/.test(next.replace(approximateAmount,''));
      const delimited=allowBare&&/^[;|•]$/.test(separator);
      const bare=allowBare&&bareIngredient.test(candidate)&&(separator===','||
        (/^\s+und\s+$/i.test(separator)&&bareIngredient.test(line.slice(start,index).trim())));
      if(!measured&&!delimited&&!bare)continue;
      parts.push(line.slice(start,index));
      start=end;
    }
    if(depth!==0)return [];
    parts.push(line.slice(start));
    const items=parts.map(part=>{
      let text=part.trim().replace(/[,;]$/,'').trimEnd();
      if(explicit||parts.length>1||readQuantity(text))text=text.replace(/(?<!\.)\.$/,'');
      return parseIngredient(text,group,allowBare);
    });
    return items.every(Boolean)?items:[];
  }
  const ingredientLabels='zutatenliste|zutaten|einkaufsliste|das\\s+brauchst\\s+du|du\\s+brauchst|ingredients';
  const stepLabels="zubereitungsschritte|zubereitung|anleitung|so\\s+(?:geht(?:’|'|\\s)?s|wird[’']s\\s+gemacht)|zubereiten|schritt\\s+für\\s+schritt|instructions|directions|preparation";
  const ingredientHeading=new RegExp(`^(?:${ingredientLabels})(?=$|\\s|:|\\(|[.!?–—-])`,'i');
  const stepHeading=new RegExp(`^(?:${stepLabels})(?:\\s*(?::|[–—-])\\s*(.*)|\\s*[.!?]?)$`,'i');
  const inlineHeading=new RegExp(`(?:^|[\\s;|•\\\\])((?:\\*\\*|__)?(?:(?:${ingredientLabels})(?:\\s+(?:für\\s+[^:|;]{1,50}|\\([^)]{1,50}\\)))?|${stepLabels}|tipp|hinweis|nährwerte|quelle)(?:\\*\\*|__)?\\s*:(?:\\*\\*|__)?)`,'gi');
  const timeLabel=/^(gesamtzeit|zeitaufwand|dauer|(?:gesamte?\s+)?zeit|zubereitungszeit|vorbereitungszeit|kochzeit|backzeit|ruhezeit|arbeitszeit)\b\s*:?\s*/i;
  const footer=/^(?:(?:(?:mein\s+)?(?:tipps?|hinweise?|anmerkungen?|aufbewahrung|nährwerte|naehrwerte|nutrition)|guten appetit)\b|(?:quelle|autor|video|bewertung)\s*:|https?:\/\/|www\.|@[\p{L}\p{N}_.]+(?:\s|$)|#[\p{L}\p{N}_]+(?:\s|$))/iu;
  const ingredientGroup=/^(?:(?:zusätzlich\s+)?für\s+(?:den|die|das|dem|der)\b[^:]*|teig|füllung|belag|topping|guss|glasur|dressing|sauce|soße|marinade)\s*:\s*(.*)$/i;
  const completeSentence=/(?<!\b(?:ca|min|std|evtl|bzw|z\s?\.?\s?b|d\s?\.?\s?h))\.$|[!?]$/i;
  const inlineStep=new RegExp(`([.!?;])\\s+(?=(?:${stepPrefix.source.slice(1)}|${sequence.source.slice(1)}))`,'giu');

  function formattedLine(value){
    return cleanLine(value.replace(/^\s*#{1,6}\s+/,'').replace(/：/g,':'))
      .replace(/^(?:\*\*([^*]+)\*\*|__([^_]+)__)/,(_,stars,underscores)=>stars||underscores);
  }

  function ingredientHeader(line){
    const label=line.match(ingredientHeading);
    if(!label)return null;
    const rest=line.slice(label[0].length).trim();
    if(!rest||/^[.!?]$/.test(rest))return {details:'',inline:''};
    if(/^[:–—-]/.test(rest))return {details:'',inline:rest.slice(1).trim()};
    if(!/^(?:für\b|\()/i.test(rest))return null;
    const [details,...inline]=rest.split(':');
    return {details:details.trim(),inline:inline.join(':').trim()};
  }

  function splitRecipeLine(line){
    const headings=[...line.matchAll(inlineHeading)];
    const parts=[];
    let start=0;
    for(const [position,match] of headings.entries()){
      const index=match.index+match[0].length-match[1].length;
      const before=line.slice(start,index).trim();
      if(!before)continue;
      const heading=formattedLine(match[1]);
      const isIngredient=ingredientHeading.test(heading),isStep=stepHeading.test(heading);
      const preceding=formattedLine(before);
      if((isIngredient||isStep)&&stepHeading.test(preceding))continue;
      const hasNextStep=isIngredient&&stepHeading.test(formattedLine(headings[position+1]?.[1]||''));
      const nextSection=isStep&&ingredientHeader(preceding);
      if(/[.!?;|•\\]$/.test(before)||(isIngredient&&hasNextStep&&possibleTitle(before))||
          (nextSection&&!/\b(?:für die|zur|vor der)\s*$/i.test(before))){
        parts.push(before.replace(/\s*[;|•\\]$/,''));
        start=index;
      }
    }
    return [...parts,line.slice(start)];
  }

  function splitSteps(line){
    const parts=line.replace(inlineStep,'$1\n').split('\n');
    return parts.flatMap(part=>{
      if(spokenPrefix.test(part))return part.split(nextSpokenStep);
      const first=part.match(/^(?:schritt\s+)?(\d{1,3})[.)]\s*/i);
      if(!first)return [part];
      const steps=[];
      let start=0,next=Number(first[1])+1;
      for(const match of part.matchAll(/\s+(\d{1,3})[.)]\s+(?=\p{Lu})/gu)){
        if(Number(match[1])!==next)continue;
        steps.push(part.slice(start,match.index));
        start=match.index+match[0].search(/\d/);
        next++;
      }
      return [...steps,part.slice(start)];
    });
  }

  const tableColumns={zutat:'name',zutaten:'name',ingredient:'name',menge:'amount',amount:'amount',quantity:'amount',einheit:'unit',unit:'unit',hinweis:'note',anmerkung:'note',bemerkung:'note',notiz:'note',note:'note'};
  function tableCells(line){
    return /[|\t]/.test(line)?line.replace(/^ *\||\| *$/g,'').split(/[|\t]/).map(cell=>cell.trim()):[];
  }
  function readTableIngredient(cells,columns,group){
    if(cells.length!==columns.length)return null;
    const {name,amount,unit,note}=Object.fromEntries(columns.map((key,i)=>[key,cells[i]]));
    if(!name||(!amount&&unit))return null;
    const quantity=amount&&readQuantity([amount,unit].filter(Boolean).join(' '));
    if(amount&&(!quantity||quantity.amount===null||quantity.rest||(unit&&!quantity.unit)))return null;
    const item=parseIngredient(name,group,true);
    if(!item||item.amount!==null)return null;
    if(quantity){item.amount=quantity.amount;item.unit=quantity.unit}
    item.note=[item.note,note].filter(Boolean).join(' · ');
    return item.note.length<=100?item:null;
  }

  function possibleTitle(line){
    const title=line.trim().replace(/\.$/,'');
    if(title.length<=80&&/^(?:\p{L}|\d+-\p{L})/u.test(title)&&!/[.!?:|]/.test(title)&&
        !/^(?:hey|hallo|willkommen|für\b)|\b(?:foodies|portionen?|personen|zutaten|dauer|backform)\b/i.test(title)&&
        !cookingAction.test(title))return title;
    return '';
  }

  function servingCount(line){
    const text=line.trim().replace(/[.:]$/,'').replace(/^\((.*)\)$/,'$1').trim();
    const byCount=text.match(/^(?:(?:rezept\s+)?für\s+|ergibt\s+|menge\s*:\s*)?(.+?)\s+(?:portion(?:en)?|personen?|esser)$/i);
    const byLabel=text.match(/^(?:portion(?:en)?|personen?)\s*(?::\s*|\s+)(.+)$/i);
    const value=(byCount||byLabel)?.[1];
    if(!value||(!byLabel&&!amountPattern.test(value.replace(approximateAmount,''))&&!/^[-−]?\d/.test(value)))return null;
    const count=/^\d{1,3}$/.test(value)?Number(value):numberWords[value.toLowerCase()];
    return Number.isInteger(count)&&count>=1&&count<=100?count:0;
  }

  function duration(value){
    const text=value.replace(approximateAmount,'');
    const hours=text.match(/^(\d+)\s*(?:h|std\.?|stunden?)(?:\s*(\d+)\s*(?:min\.?|minuten?)?)?$/i);
    const minutes=text.match(/^(\d+)\s*(?:min\.?|minuten?)$/i);
    const rest=Number(hours?.[2]||0);
    const total=hours&&rest<60?60*Number(hours[1])+rest:Number(minutes?.[1]);
    return total>=1&&total<=1440?total:null;
  }

  function applyMetadata(entries,used,preferred=entries){
    const values=new Set(preferred.map(entry=>entry.value));
    if(values.size!==1)return null;
    const [value]=values;
    for(const entry of entries)if(entry.value===value&&entry.markUsed!==false)used.add(entry.index);
    return value;
  }

  function isInstruction(line){
    return cookingAction.test(line)&&!/\b(?:zum|zur)\s+\S+[.!]?$/i.test(line);
  }

  function parseRecipe(text,initialMode=''){
    const source=String(text??'');
    if(!source.trim())return {error:'Bitte füge zuerst einen Rezepttext ein.'};
    if(source.length>MAX_SOURCE)return {error:'Der Text ist zu lang. Bitte kürze ihn auf höchstens 50.000 Zeichen.'};
    const normalized=source.replace(/\r\n?|[\u2028\u2029]/g,'\n');
    const rawLines=normalized.split('\n');
    const lines=normalized.replace(/^(\s*)["„“]([\s\S]*)["“”](\s*)$/,'$1$2$3').split('\n').flatMap((line,row)=>{
      if(row<rawLines.length-1)line=line.replace(/\\[ \t]*$/,'');
      return splitRecipeLine(line.replace(/：/g,':')).map(raw=>({row,raw,original:raw.trim()}));
    });
    const used=new Set(),servingEntries=[],durationEntries=[],ingredients=[],steps=[];
    let mode=initialMode,group='',stepText='',name='',titleCandidate,table;

    function flushStep(){
      if(stepText)steps.push(stepText);
      stepText='';
    }
    function addSteps(line,newStep=false){
      if(newStep||stepPrefix.test(line)||sequence.test(line)||
          (completeSentence.test(stepText)&&/^[\p{Lu}\d]/u.test(line)&&!/^(?:und|oder|sowie|mit)\b/i.test(line)))flushStep();
      const parts=splitSteps(line);
      for(const [position,part] of parts.entries()){
        if(position)flushStep();
        const text=part.replace(stepPrefix,'').trim();
        if(text)stepText=stepText?stepText+' '+text:text;
      }
      return Boolean(stepText);
    }
    function beginIngredients(){
      flushStep();
      if(!name&&titleCandidate){name=titleCandidate.name;used.add(titleCandidate.index)}
      mode='ingredients';
    }

    for(const [i,{raw,original}] of lines.entries()){
      if(!original){if(mode==='steps')flushStep();continue}
      const line=formattedLine(original);
      if(!line)continue;

      const header=ingredientHeader(line);
      if(header){
        beginIngredients();
        group='';table=null;
        const count=servingCount(header.details);
        const items=header.inline?parseIngredientList(header.inline,group,true,true):[];
        ingredients.push(...items);
        if((!header.inline||items.length)&&!header.details)used.add(i);
        if(count)servingEntries.push({index:i,value:count,markUsed:!header.inline||items.length>0});
        continue;
      }
      const preparation=line.match(stepHeading);
      if(preparation){
        flushStep();mode='steps';
        if(!preparation[1]||addSteps(preparation[1]))used.add(i);
        continue;
      }
      if(footer.test(line)){flushStep();mode='other';continue}

      const title=line.match(/^(?:rezept(?:name)?|titel|recipe)\s*:\s*(.+)$/i);
      if(title||(!mode&&!name&&/^#{1,6}\s/.test(original))){
        const candidate=(title?.[1]||line).trim();
        if(!name&&candidate.length<=80){name=candidate;used.add(i)}
        continue;
      }
      const count=servingCount(line);
      if(count!==null){
        if(count)servingEntries.push({index:i,value:count});
        continue;
      }
      const timeMatch=line.match(timeLabel);
      if(timeMatch){
        const label=timeMatch[1].toLowerCase(),value=duration(line.slice(timeMatch[0].length));
        if(value&&!/^(?:vorbereitungs|koch|back|ruhe|arbeits)zeit$/.test(label))
          durationEntries.push({index:i,value,primary:label!=='zubereitungszeit'});
        continue;
      }

      if(mode==='other')continue;
      if(mode!=='steps'){
        const cells=tableCells(raw);
        const columns=cells.map(cell=>Object.hasOwn(tableColumns,cell.toLowerCase())&&tableColumns[cell.toLowerCase()]);
        if(columns.includes('name')&&columns.includes('amount')&&columns.every(Boolean)&&new Set(columns).size===columns.length){
          beginIngredients();table=columns;used.add(i);continue;
        }
        if(table&&cells.length){
          if(cells.every(cell=>/^:?-{3,}:?$/.test(cell))){used.add(i);continue}
          const item=readTableIngredient(cells,table,group);
          if(item){ingredients.push(item);used.add(i)}
          continue;
        }
        table=null;
      }
      const markedLine=stepPrefix.test(original)?original:line;
      const marker=markedLine.match(stepPrefix);
      const stepLine=marker?markedLine.slice(marker[0].length).trim():line;
      const instruction=isInstruction(stepLine);
      const explicitStep=marker&&(!numbered.test(markedLine)||/^schritt\b/i.test(markedLine)||instruction);
      const standaloneStep=instruction&&(/[.!?]$/.test(line)||sequence.test(line));
      if(mode==='steps'||(marker&&mode!=='ingredients')||(mode==='ingredients'&&(explicitStep||standaloneStep))){
        mode='steps';
        if(addSteps(markedLine,bullet.test(original)))used.add(i);
        continue;
      }

      const subgroup=mode==='ingredients'&&line.match(ingredientGroup);
      if(subgroup&&!reversedIngredient(line)){
        group=line.slice(0,line.indexOf(':')).trim();
        const items=subgroup[1]?parseIngredientList(subgroup[1],group,true,true):[];
        if(!subgroup[1]||items.length){ingredients.push(...items);used.add(i)}
        continue;
      }
      const items=parseIngredientList(stepLine,group,mode==='ingredients');
      if(items.length){
        beginIngredients();ingredients.push(...items);used.add(i);
      }else if(!mode){
        const candidate=possibleTitle(line);
        titleCandidate=candidate?{name:candidate,index:i}:null;
      }
    }

    flushStep();
    const servings=applyMetadata(servingEntries,used);
    const primaryTimes=durationEntries.filter(entry=>entry.primary);
    const time=applyMetadata(durationEntries,used,primaryTimes.length?primaryTimes:durationEntries);
    const unassignedRows=new Set(lines.filter((line,index)=>line.original&&!used.has(index)).map(line=>line.row));
    const unassigned=rawLines.filter((_,row)=>unassignedRows.has(row));
    const errors=[];
    if(steps.length>100)errors.push('Es wurden mehr als 100 Zubereitungsschritte erkannt.');
    if(steps.some(step=>step.length>1200))errors.push('Ein Zubereitungsschritt ist länger als 1.200 Zeichen.');
    if(!ingredients.length&&!steps.length&&!name)errors.push('Es konnten keine Rezeptangaben sicher erkannt werden. Ergänze Überschriften wie „Zutaten“ und „Zubereitung“.');
    return {name,servings,time,ingredients,steps,unassigned,errors};
  }
  function parse(text){return parseRecipe(text)}
  function parseSection(source,section){
    const text=String(source??'');if(!text.trim())return {error:'Bitte füge zuerst einen Text ein.'};
    if(text.length>MAX_SOURCE)return {error:'Der Text ist zu lang. Bitte kürze ihn auf höchstens 50.000 Zeichen.'};
    if(section==='ingredients'||section==='preparation'){
      const result=parseRecipe(text,section==='ingredients'?'ingredients':'steps');
      if(result.error)return result;if(result.errors?.length)return {...result,error:result.errors.join(' ')};
      const items=section==='ingredients'?result.ingredients:result.steps;
      if(!items.length)return {...result,error:section==='ingredients'?'Keine Zutaten erkannt. Bitte prüfe den Text.':'Keine Zubereitungsschritte erkannt. Bitte prüfe den Text.'};
      const other=section==='ingredients'?Boolean(result.steps.length||result.name||result.time):Boolean(result.ingredients.length||result.name||result.servings||result.time);
      if(other)result.unassigned=[...result.unassigned,text];
      return result;
    }
    if(section!=='nutrition')return {error:'Dieser Bereich kann nicht importiert werden.'};
    if(/(?:pro|je|\/)\s*100\s*(?:g|gramm|ml)\b/i.test(text))return {error:'Angaben pro 100 g oder 100 ml können nicht als Werte pro Portion übernommen werden.'};
    const values={},nutritionLines={},unassigned=[],lines=text.replace(/\r\n?/g,'\n').split(/\n|[|;]|,\s+(?=\d)/);
    const names={kcal:'kcal',kalorien:'kcal',energie:'kcal',eiweiß:'protein',eiweiss:'protein',protein:'protein',fett:'fat',kohlenhydrate:'carbs'};
    const word='(?:kalorien|energie|kcal|eiweiß|eiweiss|protein|fett|kohlenhydrate)',number='(\\d+(?:[.,]\\d+)?)';
    const byName=new RegExp(`^(${word})(?:\\s*\\((kcal|g)\\))?\\s*:?\\s*${number}\\s*(kcal|g)?\\s*$`,'i');
    const byNumber=new RegExp(`^${number}\\s*(kcal|g)\\s+(${word})\\s*$`,'i');
    lines.forEach(raw=>{let line=cleanLine(raw);if(!line)return;if(/^(?:nährwerte|naehrwerte)(?:\s+pro\s+portion)?\s*:?$/i.test(line)||/^pro\s+portion\s*:?$/i.test(line))return;line=line.replace(/^(?:(?:nährwerte|naehrwerte)\s+)?pro\s+portion\s*:\s*/i,'');
      let match=line.match(byName),name,value,unit;if(match){name=match[1];value=match[3];unit=match[2]||match[4]||''}else if((match=line.match(byNumber))){value=match[1];unit=match[2];name=match[3]}else if((match=line.match(/^(\d+(?:[.,]\d+)?)\s*kcal$/i))){name='kcal';value=match[1];unit='kcal'}else{unassigned.push(raw);return}
      const key=names[name.toLocaleLowerCase('de-DE')],numeric=Number(value.replace(',','.'));if(!key||!Number.isFinite(numeric)||numeric<0||(unit&&unit.toLowerCase()!==(key==='kcal'?'kcal':'g'))||Object.prototype.hasOwnProperty.call(values,key)){unassigned.push(raw);return}values[key]=numeric;nutritionLines[key]=raw;
    });
    if(!Object.keys(values).length)return {error:'Keine Nährwerte pro Portion erkannt. Bitte prüfe den Text.',unassigned};
    return {nutrition:values,nutritionLines,unassigned};
  }
  function mergeSection(section,current,result){
    if(section==='ingredients'){
      const existing=(current.ingredients||[]).filter(item=>Object.values(item).some(value=>String(value??'').trim()));
      const oldBase=Number(current.servings)||null,newBase=result.servings||null;
      if(existing.length&&oldBase&&newBase&&oldBase!==newBase)return {error:`Die vorhandenen Mengen gelten für ${oldBase} Portionen, der neue Text für ${newBase}. Bitte gleiche zuerst die Basis-Portionen an.`};
      return {ingredients:[...existing,...result.ingredients],servings:existing.length?(oldBase&&newBase?oldBase:null):newBase};
    }
    if(section==='preparation'){
      const steps=[...(current.steps||[]).filter(step=>String(step).trim()),...result.steps];
      if(steps.length>100)return {error:'Insgesamt sind höchstens 100 Zubereitungsschritte möglich.'};
      return {steps};
    }
    if(section==='nutrition'){
      const values={...current.nutrition},skipped=[];for(const [key,value] of Object.entries(result.nutrition)){if(values[key]!==''&&values[key]!==undefined&&values[key]!==null){if(Number(values[key])!==value)skipped.push(key)}else values[key]=value}
      return {nutrition:values,skipped};
    }
    return {error:'Dieser Bereich kann nicht importiert werden.'};
  }
  return Object.freeze({parse,parseSection,mergeSection,MAX_SOURCE});
});
