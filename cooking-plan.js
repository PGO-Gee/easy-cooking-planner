(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./recipe-model.js'),require('./ingredient-catalog.js'));
  else root.WochentischCookingPlan=factory(root.WochentischRecipes,root.WochentischIngredients);
})(typeof globalThis==='object'?globalThis:this,function(recipes,catalog){
  'use strict';
  const clone=value=>structuredClone(value);
  const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
  function addDays(date,days){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function coordinates(date){const d=new Date(date+'T12:00:00'),day=(d.getDay()+6)%7;return {week:addDays(date,-day),day}}
  function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&addDays(value,0)===value}
  function settings(value={}){
    const integer=(v,fallback)=>Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=100?Number(v):fallback;
    return {configured:Boolean(value.configured),adults:integer(value.adults,2),children:integer(value.children,0),childFactor:positive(value.childFactor)&&Number(value.childFactor)<=5?Number(value.childFactor):0.5,
      mode:['self','household','custom'].includes(value.mode)?value.mode:'household',portions:positive(value.portions)&&Number(value.portions)<=100?Number(value.portions):2,days:Number.isInteger(Number(value.days))&&Number(value.days)>=1&&Number(value.days)<=7?Number(value.days):1};
  }
  function householdPortions(value){const s=settings(value);return s.adults+s.children*s.childFactor}
  function dailyPortions(value,dish){const s=settings(value);return s.mode==='self'?1:s.mode==='custom'?s.portions:s.configured?householdPortions(s):Number(dish?.recipe?.servings)||2}
  // Legacy day arrays remain a projection used by the existing calendar. IDs belong
  // to occurrences, not recipes; deterministic migration also agrees across devices.
  function normalizeEntries(state){
    const old=Object.values(state.cookingEntries||{}),used=new Set(),entries={};
    for(const [week,days] of Object.entries(state.plans||{}))for(let day=0;day<7;day++){
      const date=addDays(week,day);
      (days[day]||[]).forEach((dishId,position)=>{
        const prior=old.find(e=>!used.has(e.id)&&e.date===date&&e.dishId===dishId&&e.position===position)||old.find(e=>!used.has(e.id)&&e.date===date&&e.dishId===dishId);
        const dish=(state.dishes||[]).find(d=>d.id===dishId);if(!dish)return;
        const id=prior?.id||`legacy:${date}:${position}:${dishId}`;used.add(id);
        const restDates=[...new Set((prior?.restDates||[]).filter(d=>validDate(d)&&d>date&&d<=addDays(date,6)))].sort();
        entries[id]={id,dishId,date,position,portions:positive(prior?.portions)&&Number(prior.portions)<=100?Number(prior.portions):Number(dish.recipe?.servings)||2,restDates,pinned:Boolean(state.pinnedMeals?.[week]?.[day]?.[position])};
      });
    }
    return entries;
  }
  function entryAt(state,date,position){return Object.values(normalizeEntries(state)).find(e=>e.date===date&&e.position===position)}
  function restsAt(state,date){return Object.values(state.cookingEntries||{}).filter(e=>e.restDates.includes(date))}
  function total(entry){return entry.portions*(1+entry.restDates.length)}
  function project(state,entries){
    const next=clone(state),plans={},pins={},restDays=clone(state.restDays||{});
    for(const e of Object.values(state.cookingEntries||{}))for(const date of e.restDates){const {week,day}=coordinates(date);restDays[week]=(restDays[week]||[]).filter(d=>d!==day)}
    for(const week of Object.keys(state.plans||{})){plans[week]=Array.from({length:7},()=>[]);pins[week]=Array.from({length:7},()=>[])}
    const sorted=Object.values(entries).sort((a,b)=>a.date.localeCompare(b.date)||a.position-b.position||a.id.localeCompare(b.id));
    for(const e of sorted){const {week,day}=coordinates(e.date);plans[week]??=Array.from({length:7},()=>[]);pins[week]??=Array.from({length:7},()=>[]);e.position=plans[week][day].length;plans[week][day].push(e.dishId);pins[week][day].push(e.pinned);restDays[week]=(restDays[week]||[]).filter(d=>d!==day)}
    for(const e of sorted)for(const date of e.restDates){const {week,day}=coordinates(date);restDays[week]=[...new Set([...(restDays[week]||[]),day])].sort((a,b)=>a-b)}
    next.plans=plans;next.pinnedMeals=pins;next.restDays=Object.fromEntries(Object.entries(restDays).filter(([,days])=>days.length));next.cookingEntries=Object.fromEntries(sorted.map(e=>[e.id,e]));return next;
  }
  function occupied(entry){return [entry.date,...entry.restDates]}
  // Make space only through the collision chain. Entire blocks move together.
  function makeSpace(state,entries,start,count,exclude){
    let end=addDays(start,count-1),displacement=count,affected=new Set(),manual=new Set(),changed=true;
    const manualDates=[];for(const [week,days] of Object.entries(state.restDays||{}))for(const day of days){const date=addDays(week,day);if(!Object.values(state.cookingEntries||{}).some(e=>e.restDates.includes(date)))manualDates.push(date)}
    while(changed){changed=false;
      for(const e of Object.values(entries))if(e.id!==exclude&&!affected.has(e.id)&&occupied(e).some(d=>d>=start&&d<=end)){
        affected.add(e.id);if(e.date<start)displacement=Math.max(displacement,Math.round((new Date(start+'T12:00:00Z')-new Date(e.date+'T12:00:00Z'))/86400000)+count);changed=true;
      }
      for(const date of manualDates)if(date>=start&&date<=end&&!manual.has(date)){manual.add(date);changed=true}
      for(const id of affected){const last=occupied(entries[id]).sort().at(-1),nextEnd=addDays(last,displacement);if(nextEnd>end){end=nextEnd;changed=true}}
      for(const date of manual){const nextEnd=addDays(date,displacement);if(nextEnd>end){end=nextEnd;changed=true}}
    }
    const pinned=[...affected].map(id=>entries[id]).find(e=>e.pinned);if(pinned)throw new Error(`Am ${pinned.date} ist ein Gericht fixiert. Bitte zuerst die Fixierung oder den Plan anpassen.`);
    for(const id of affected){const e=entries[id];e.date=addDays(e.date,displacement);e.restDates=e.restDates.map(d=>addDays(d,displacement))}
    for(const date of manual){const c=coordinates(date);state.restDays[c.week]=state.restDays[c.week].filter(d=>d!==c.day)}
    for(const date of manual){const c=coordinates(addDays(date,displacement));state.restDays[c.week]=[...new Set([...(state.restDays[c.week]||[]),c.day])]}
  }
  function change(state,id,{portions,days,date}={}){
    const draft=clone(state),entries=normalizeEntries(draft),entry=entries[id];if(!entry)throw new Error('Der geplante Eintrag ist nicht mehr vorhanden.');
    const target=date||entry.date,newDays=days??(1+entry.restDates.length),newPortions=portions??entry.portions;
    if(!validDate(target)||!positive(newPortions)||Number(newPortions)>100||!Number.isInteger(newDays)||newDays<1||newDays>7)throw new Error('Bitte 0–100 Portionen (größer als 0) und 1–7 Tage angeben.');
    if(target!==entry.date){makeSpace(draft,entries,target,newDays,id)}
    const oldDates=new Set(entry.restDates),sameDates=target===entry.date&&newDays===1+entry.restDates.length;
    const restDates=sameDates?entry.restDates.slice():Array.from({length:newDays-1},(_,i)=>addDays(target,i+1));
    if(target===entry.date){const added=restDates.filter(d=>!oldDates.has(d));if(added.length){const start=added[0],end=restDates.at(-1),count=Math.round((new Date(end+'T12:00:00Z')-new Date(start+'T12:00:00Z'))/86400000)+1;makeSpace(draft,entries,start,count,id)}}
    entry.date=target;entry.portions=Number(newPortions);entry.restDates=restDates;
    return project(draft,entries);
  }
  function add(state,dishId,date,portions,days,id){
    const draft=clone(state),entries=normalizeEntries(draft);if(Object.hasOwn(entries,id))throw new Error('Dieser Eintrag ist bereits vorhanden.');
    const rest=restsAt(draft,date);if(rest.length)throw new Error('Bitte zuerst den zugehörigen Restetag entfernen.');
    entries[id]={id,dishId,date,position:Object.values(entries).filter(e=>e.date===date).length,portions:Number(portions),restDates:[],pinned:false};
    return change(project(draft,entries),id,{portions,days});
  }
  function manualRest(state,date){const draft=clone(state),entries=normalizeEntries(draft);makeSpace(draft,entries,date,1,null);const next=project(draft,entries),c=coordinates(date);next.restDays[c.week]=[...new Set([...(next.restDays[c.week]||[]),c.day])].sort((a,b)=>a-b);return next}
  function remove(state,id){const entries=normalizeEntries(state);delete entries[id];return project(state,entries)}
  function removeRest(state,id,date){const entries=normalizeEntries(state);if(entries[id])entries[id].restDates=entries[id].restDates.filter(d=>d!==date);return project(state,entries)}
  function unit(value){const raw=String(value||'').trim(),key=raw.toLocaleLowerCase('de-DE').replace(/\.$/,'');const units={g:['g',1],gramm:['g',1],kg:['g',1000],kilogramm:['g',1000],ml:['ml',1],milliliter:['ml',1],l:['ml',1000],liter:['ml',1000],stück:['Stück',1],st:['Stück',1],stk:['Stück',1],el:['EL',1],esslöffel:['EL',1],tl:['TL',1],teelöffel:['TL',1]};return units[key]||[raw,1]}
  function demand(meals,hidden={}){
    const result=new Map();
    for(const {dish,weekKey,entry} of meals){
      if(!dish)continue;
      const ingredients=recipes.editableIngredients(dish.recipe,dish.ingredients);
      for(const row of ingredients){const name=catalog.normalize(row.name),key=catalog.manualKey(name);if(!key||hidden[weekKey]?.includes(key))continue;
        if(!result.has(key))result.set(key,{name,dishes:new Set(),manual:false,weekKeys:new Set(),plannedQuantity:0,amounts:new Map(),unknown:new Set(),byWeek:new Map()});
        const item=result.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey);
        if(!item.byWeek.has(weekKey))item.byWeek.set(weekKey,new Map());
        const [u,factor]=unit(row.unit),scaled=recipes.scaledAmount(row.amount,entry?total(entry):dish.recipe?.servings,dish.recipe?.servings);
        if(scaled===null){item.unknown.add(`${dish.name}: ${row.amount??''} ${row.unit||''} ${row.note||'Menge unbekannt'}`.trim());continue}
        item.amounts.set(u,(item.amounts.get(u)||0)+scaled*factor);const amounts=item.byWeek.get(weekKey);amounts.set(u,(amounts.get(u)||0)+scaled*factor);
      }
    }
    return result;
  }
  function overrideKey(week,name,u){return JSON.stringify([week,catalog.manualKey(name),u])}
  return Object.freeze({addDays,coordinates,validDate,settings,householdPortions,dailyPortions,normalizeEntries,entryAt,restsAt,total,project,change,add,manualRest,remove,removeRest,unit,demand,overrideKey});
});
