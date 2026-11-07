(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.WochentischRecipeImport=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const MAX_SOURCE=50000;
  const units={g:'g',gramm:'g',gr:'g',kg:'kg',kilogramm:'kg',ml:'ml',milliliter:'ml',l:'l',liter:'l',el:'EL',esslöffel:'EL',essloeffel:'EL',tl:'TL',teelöffel:'TL',teeloeffel:'TL',prise:'Prise',prisen:'Prise',stück:'Stück',stueck:'Stück',stk:'Stück',dose:'Dose',dosen:'Dose',bund:'Bund',pck:'Pck.',pckg:'Pck.',päckchen:'Päckchen',packung:'Packung',packungen:'Packung',becher:'Becher',zehe:'Zehe',zehen:'Zehen',scheibe:'Scheibe',scheiben:'Scheiben',tasse:'Tasse',tassen:'Tassen'};
  const fractionMap={'½':0.5,'¼':0.25,'¾':0.75,'⅓':1/3,'⅔':2/3,'⅛':0.125};
  const number='(?:\\d+[.,]\\d+|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*[½¼¾⅓⅔⅛]|[½¼¾⅓⅔⅛]|\\d+)';
  const amountPattern=new RegExp('^('+number+'(?:\\s*(?:[-–—]|bis)\\s*'+number+')?)(?=\\s|[a-zA-ZäöüÄÖÜ]|$)\\s*','iu');
  const numbered=/^\s*(?:(\d+)\s*[.)](?:\s+|$)|(\d)\uFE0F?\u20E3\s*|(?:schritt\s+)(\d+)\s*[:.)-]?\s*)/iu;
  function stripBullet(value){return value.replace(/^\s*(?:[-*•▪◦‣]+\s*|[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)+/u,'').trim()}
  function cleanLine(value){return stripBullet(value.replace(/\u00a0/g,' ').trim())}
  function parseNumber(value){
    const text=value.trim();if(/[-–—]|\bbis\b/i.test(text))return text;
    const mixed=text.match(/^(\d+)\s+(\d+)\/(\d+)$/);if(mixed)return Number(mixed[3])?Number(mixed[1])+Number(mixed[2])/Number(mixed[3]):text;
    const fraction=text.match(/^(\d+)\/(\d+)$/);if(fraction)return Number(fraction[2])?Number(fraction[1])/Number(fraction[2]):text;
    const unicode=text.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])$/);if(unicode)return Number(unicode[1]||0)+fractionMap[unicode[2]];
    const n=Number(text.replace(',','.'));return Number.isFinite(n)&&n>0?n:text;
  }
  function parseIngredient(line,group,allowBare){
    if(/^\s*(?:[\p{Extended_Pictographic}\uFE0F\u200D]+\s*)*[-−]\d/u.test(line))return null;
    let text=cleanLine(line).replace(/^(?:ca\.?|etwa)\s+/i,'');if(!text||/^\d+\s*[x×]\s*\d/i.test(text))return null;
    let amount=null,unit='';const match=text.match(amountPattern);
    if(match){amount=parseNumber(match[1]);text=text.slice(match[0].length).trim()}
    else if(/^(?:etwas|nach geschmack|eine? handvoll)\b/i.test(text)){const m=text.match(/^(etwas|nach geschmack|eine? handvoll)\s+/i);if(m){amount=m[1];text=text.slice(m[0].length)}}
    const unitMatch=text.match(/^([\p{L}]+)\.?\s+/u);if(unitMatch&&Object.prototype.hasOwnProperty.call(units,unitMatch[1].toLocaleLowerCase('de-DE'))){unit=units[unitMatch[1].toLocaleLowerCase('de-DE')];text=text.slice(unitMatch[0].length).trim()}
    if(!text||(!match&&amount===null&&!allowBare))return null;
    if(/[.!?]\s*$/.test(text)||/[,;]\s*(?:ca\.?\s*)?\d/.test(text)||text.includes(':')||text.length>100||/^(?:für|zusätzlich|zubereitung|zutaten|tipp|hinweis)\b/i.test(text))return null;
    let note=group||'';const prefix=text.match(/^\(([^()]*)\)\s+(\S.*)$/);if(prefix){note=[note,prefix[1].trim()].filter(Boolean).join(' · ');text=prefix[2]}const prepared=text.match(/,\s*((?:(?:fein|grob|frisch)\s+)?(?:gehackt|gewürfelt|geschnitten|gerieben|geschält|gepresst|abgetropft|zerkleinert|halbiert|geviertelt|passiert|geschmolzen))$/i);if(prepared){text=text.slice(0,prepared.index).trim();note=[note,prepared[1]].filter(Boolean).join(' · ')}const taste=text.match(/[,;]?\s+(nach Geschmack|nach Belieben)$/i);if(taste){text=text.slice(0,taste.index).trim();if(amount===null)amount=taste[1];else note=[note,taste[1]].filter(Boolean).join(' · ')}const parenthetical=text.match(/\s*\(([^()]*)\)\s*$/);if(parenthetical){const extra=parenthetical[1].trim();text=text.slice(0,parenthetical.index).trim();note=[note,extra].filter(Boolean).join(' · ')}
    if(!text||note.length>100||String(amount??'').length>40||unit.length>24)return null;
    return {name:text,amount,unit,note};
  }
  function parse(text){
    const source=String(text??'');if(!source.trim())return {error:'Bitte füge zuerst einen Rezepttext ein.'};if(source.length>MAX_SOURCE)return {error:'Der Text ist zu lang. Bitte kürze ihn auf höchstens 50.000 Zeichen.'};
    const lines=source.replace(/\r\n?/g,'\n').split('\n'),used=new Set(),ingredients=[],steps=[];let mode='',group='',stepIndexes=[],stepText='',name='',servings=null,time=null,ingredientHeader=-1;
    function flushStep(){if(stepText){steps.push(stepText.trim());stepIndexes.forEach(index=>used.add(index));stepText='';stepIndexes=[]}}
    for(let i=0;i<lines.length;i++){
      const original=lines[i].trim();if(!original){if(mode==='steps')flushStep();continue}
      const line=cleanLine(original);if(!line)continue;
      const num=original.match(numbered)||line.match(numbered);
      if(/^(?:mein\s+)?(?:tipp|hinweis|anmerkung|aufbewahrung|nährwerte|naehrwerte)\b/i.test(line)){flushStep();mode='other';continue}
      const ambiguousServings=/(?:\d+\s*(?:[-–—]|bis|\/)\s*\d+|\d+[.,]\d+)\s*portion(?:en)?\b/i.test(line);
      const ingredientHead=/^(?:zutaten|einkaufsliste)\b/i.test(line);
      const stepHead=/^(?:zubereitung|anleitung|zubereitungsschritte|so geht(?:’|'|\s)?s|zubereiten)\b/i.test(line);
      if(ingredientHead){flushStep();mode='ingredients';group='';ingredientHeader=i;if(!ambiguousServings&&/^(?:zutaten|einkaufsliste)(?:\s+für\s+\d{1,3}\s*portion(?:en)?)?\s*(?::\s*.*)?$/i.test(line))used.add(i)}
      else if(stepHead){flushStep();mode='steps';const inline=line.match(/^[^:]+:\s*(\S.*)$/);if(inline){stepText=inline[1].replace(numbered,'').trim();stepIndexes=[i]}else if(/^[^:]+:\s*$/.test(line)||/^(?:zubereitung|anleitung|zubereitungsschritte|so geht(?:’|'|\s)?s|zubereiten)\s*$/i.test(line)){used.add(i)}continue}
      const servingMatch=line.match(/\b(?:für\s*)?(\d{1,3})\s*portion(?:en)?\b/i)||line.match(/\bportion(?:en)?\s*(?::|für)?\s*(\d{1,3})\b/i);
      if(!ambiguousServings&&servingMatch&&Number(servingMatch[1])>=1&&Number(servingMatch[1])<=100){servings=Number(servingMatch[1]);if(/^(?:für\s*)?\d{1,3}\s*portion(?:en)?\s*$/i.test(line)||/^portion(?:en)?\s*(?::|für)?\s*\d{1,3}\s*$/i.test(line))used.add(i)}
      const timeMatch=line.match(/^(?:gesamtzeit|zubereitungszeit|zeitaufwand|dauer)\s*:?\s*(\d+)\s*(?:min(?:uten?)?\.?)(?:\s*)$/i);
      if(timeMatch&&[15,30,45,60,90,120].includes(Number(timeMatch[1]))){time=Number(timeMatch[1]);used.add(i);continue}
      if(ambiguousServings&&!ingredientHead)continue;
      if(/^(?:gesamtzeit|zubereitungszeit|zeitaufwand|dauer|portion(?:en)?|quelle)\s*:/i.test(line)||/^(?:für\s*)?\d{1,3}\s*portion(?:en)?\s*$/i.test(line))continue;
      const title=line.match(/^(?:rezept(?:name)?|titel)\s*:\s*(.+)$/i)||original.match(/^\s*#{1,2}\s+(.+)$/);
      if(title&&!name){if(title[1].trim().length<=80){name=title[1].trim();used.add(i)}continue}
      if(/^(?:https?:\/\/|www\.|@[\p{L}\p{N}_.]+(?:\s|$)|#[\p{L}\p{N}_]+(?:\s|$))/iu.test(line)){flushStep();mode='other';continue}
      if(ingredientHead){const inline=line.match(/^[^:]+:\s*(\S.*)$/);if(inline){const item=parseIngredient(inline[1],group,true);if(item)ingredients.push(item);else used.delete(i)}continue;}
      if(num&&mode==='ingredients'){const remainder=(original.match(numbered)?original.replace(numbered,''):line.replace(numbered,'')).trim();const instruction=/^schritt\s+\d/i.test(line)||/\b(?:schneiden|hacken|vermengen|verrühren|verruehren|mischen|rühren|ruehren|kochen|braten|backen|erhitzen|anbraten|zugeben|hinzufügen|hinzufuegen|abschmecken|servieren|verteilen|garen|waschen|schälen|schaelen|kneten|vorheizen|geben|dazugeben|ausrollen|abkühlen|abkuehlen|schmelzen|umrühren|umruehren|würzen|wuerzen|abtropfen|abgießen|abgiessen)\b/i.test(remainder);const item=instruction?null:parseIngredient(remainder,group,true);if(item){ingredients.push(item);used.add(i);continue}}
      if(num){flushStep();mode='steps';stepText=(original.match(numbered)?original.replace(numbered,''):line.replace(numbered,'')).trim();stepIndexes=[i];continue}
      if(mode==='ingredients'){
        if(/^(?:für\s+(?:den|die|das|dem|der)|zusätzlich\s+für)\b/i.test(line)&&/:\s*$/.test(line)){group=line.replace(/:\s*$/,'');used.add(i);continue}
        const item=parseIngredient(original,group,true);if(item){ingredients.push(item);used.add(i)}continue;
      }
      if(mode==='steps'){
        if(!stepText){stepText=line;stepIndexes=[i]}else{stepText+=' '+line;stepIndexes.push(i)}continue;
      }
      if(mode!=='other'){
        const item=parseIngredient(original,'',false);if(item){ingredients.push(item);used.add(i);mode='ingredients'}
      }
    }
    flushStep();
    if(!name&&ingredientHeader>0){const index=ingredientHeader-1,candidate=cleanLine(lines[index]||'');if(candidate&&candidate.length<=80&&!/[.!?:]/.test(candidate)&&!/(?:hey|hallo|foodies|portion|zutaten|zeit|dauer|für\s+eine?\s+backform)/i.test(candidate)){name=candidate;used.add(index)}}
    const unassigned=lines.filter((line,index)=>line.trim()&&!used.has(index));
    const errors=[];if(steps.length>100)errors.push('Es wurden mehr als 100 Zubereitungsschritte erkannt.');if(steps.some(step=>step.length>1200))errors.push('Ein Zubereitungsschritt ist länger als 1.200 Zeichen.');
    if(!ingredients.length&&!steps.length&&!name)errors.push('Es konnten keine Rezeptangaben sicher erkannt werden. Ergänze Überschriften wie „Zutaten“ und „Zubereitung“.');
    return {name,servings,time,ingredients,steps,unassigned,errors};
  }
  function parseSection(source,section){
    const text=String(source??'');if(!text.trim())return {error:'Bitte füge zuerst einen Text ein.'};
    if(text.length>MAX_SOURCE)return {error:'Der Text ist zu lang. Bitte kürze ihn auf höchstens 50.000 Zeichen.'};
    if(section==='ingredients'||section==='preparation'){
      const result=parse(`${section==='ingredients'?'Zutaten':'Zubereitung'}\n${text}`);
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
