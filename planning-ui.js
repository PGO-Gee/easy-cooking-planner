let cookingRangeUndo=null;
function householdPlanningDefaults(){return {...window.WochentischCookingPlan.settings(state.planningSettings),mode:'household',days:1}}
function renderPlanningDefault(container){
  const settings=householdPlanningDefaults(),summary=document.createElement('p');summary.className='planning-preview';
  summary.textContent=settings.configured?`Für deinen Haushalt · ${window.WochentischRecipes.formatAmount(window.WochentischCookingPlan.householdPortions(settings))} Portionen · 1 Gericht pro Tag`:'1 Gericht pro Tag · Bis du deinen Haushalt im Profil einträgst, gilt die jeweilige Rezeptmenge.';
  container.replaceChildren(summary);
}
function openPlannedMeal(meal){
  const day=Number(meal.closest('.day-content')?.dataset.day),position=Number(meal.dataset.mealIndex);
  meal.focus({preventScroll:true});uiSelectedDay=day;uiSelectedMeal=position;renderWeekPreview();openCookingEntryOptions(rangeDates()[day],position);
}
/* Planning controls share the existing dialogs and stylesheets. */
function normalizeQuantityOverrides(value){return Object.fromEntries(Object.entries(value||{}).filter(([key,amount])=>{try{const parts=JSON.parse(key);return parts.length===3&&window.WochentischCookingPlan.validDate(parts[0])&&typeof parts[1]==='string'&&typeof parts[2]==='string'&&Number.isFinite(amount)&&amount>0}catch{return false}}))}
function renderPlanningFields(container,value){
  const model=window.WochentischCookingPlan,settings=model.settings(value);container.replaceChildren();
  const title=document.createElement('h3');title.textContent='Kochmenge';
  const fields=document.createElement('div');fields.className='planning-fields';
  const label=document.createElement('label');label.textContent='Für wen?';const mode=document.createElement('select');mode.dataset.planning='mode';
  mode.add(new Option('Nur für mich · 1 Portion','self'));mode.add(new Option(settings.configured?`Haushalt · ${window.WochentischRecipes.formatAmount(model.householdPortions(settings))} Portionen`:'Wie im Rezept','household'));mode.add(new Option('Eigene Portionszahl','custom'));mode.value=settings.mode;label.append(mode);
  const custom=document.createElement('label');custom.textContent='Portionen pro Tag';const portions=document.createElement('input');portions.type='number';portions.min='0.1';portions.max='100';portions.step='any';portions.inputMode='decimal';portions.dataset.planning='portions';portions.value=settings.portions;custom.append(portions);
  const duration=document.createElement('label');duration.textContent='Tage pro Gericht';const days=document.createElement('select');days.dataset.planning='days';for(let n=1;n<=7;n++)days.add(new Option(`${n} ${n===1?'Tag':'Tage'}`,n));days.value=settings.days;duration.append(days);
  const preview=document.createElement('p');preview.className='planning-preview';preview.setAttribute('role','status');
  const double=document.createElement('button');double.type='button';double.className='text-button';double.textContent='Für zwei Tage kochen';double.onclick=()=>{days.value='2';update()};
  const update=()=>{custom.hidden=mode.value!=='custom';portions.required=!custom.hidden;const p=model.dailyPortions({...settings,mode:mode.value,portions:portions.value}),d=Number(days.value);preview.textContent=!settings.configured&&mode.value==='household'?`Rezeptmenge × ${d} ${d===1?'Tag':'Tage'}`:`${window.WochentischRecipes.formatAmount(p)} × ${d} ${d===1?'Tag':'Tage'} = ${window.WochentischRecipes.formatAmount(p*d)} Portionen`;};
  fields.append(label,custom,duration);container.append(title,fields,double,preview);container.oninput=update;container.onchange=update;update();
}
function readPlanningFields(container){
  const model=window.WochentischCookingPlan,settings=model.settings(state.planningSettings),mode=container.querySelector('[data-planning="mode"]').value,raw=container.querySelector('[data-planning="portions"]'),portions=Number(raw.value),days=Number(container.querySelector('[data-planning="days"]').value);
  if(mode==='custom'&&(!raw.checkValidity()||portions<=0))throw new Error('Bitte eine Portionszahl größer als 0 und höchstens 100 eingeben.');
  if(mode==='household'&&settings.configured&&model.householdPortions(settings)<=0)throw new Error('Bitte zuerst mindestens eine essende Person im Haushalt eintragen.');
  return {...settings,mode,portions:mode==='custom'?portions:settings.portions,days};
}
function cookingPlanSnapshot(value){
  // Cloud snapshots include empty shopping weeks and fully padded pin arrays.
  // Compare and restore the actual calendar contents, not those storage details.
  const plans={},pinnedMeals={};
  for(const [week,days] of Object.entries(value.plans||{})){
    const meals=Array.from({length:7},(_,day)=>(days[day]||[]).slice());
    if(!meals.some(day=>day.length))continue;
    plans[week]=meals;pinnedMeals[week]=meals.map((day,index)=>day.map((_,position)=>Boolean(value.pinnedMeals?.[week]?.[index]?.[position])));
  }
  const restDays=Object.fromEntries(Object.entries(value.restDays||{}).map(([week,days])=>[week,[...new Set(days)].sort((a,b)=>a-b)]).filter(([,days])=>days.length));
  return structuredClone({plans,pinnedMeals,restDays,cookingEntries:value.cookingEntries||{}});
}
function commitCookingChange(create,message){
  const before=cookingPlanSnapshot(state);
  try{state=create();state.cookingEntries=window.WochentischCookingPlan.normalizeEntries(state);save();renderCalendar();const after=cookingPlanSnapshot(state);showToast(message,{actionLabel:'Rückgängig',duration:10000,onAction:()=>{if(!sameValue(after,cookingPlanSnapshot(state))){showToast('Der Plan wurde inzwischen geändert. Rückgängig ist nicht mehr möglich.');return}Object.assign(state,before);save();renderCalendar()}});return true}catch(error){showToast(error.message);return false}
}
function plannedServingsForMeal(meal){const date=rangeDates()[Number(meal.closest('.day-content')?.dataset.day)],entry=date&&window.WochentischCookingPlan.entryAt(state,keyFor(date),Number(meal.dataset.mealIndex));return entry?window.WochentischCookingPlan.total(entry):null}
function plannedEntryLabel(date,position){const model=window.WochentischCookingPlan,entry=model.entryAt(state,keyFor(date),position);return entry?`${window.WochentischRecipes.formatAmount(model.total(entry))} Portionen${entry.restDates.length?` · für ${1+entry.restDates.length} Tage`:''}`:'Portionen unbekannt'}
function openCookingEntryOptions(date,position,{editQuantity=false}={}){
  const model=window.WochentischCookingPlan,entry=model.entryAt(state,keyFor(date),position);if(!entry)return;
  const dish=state.dishes.find(d=>d.id===entry.dishId);if(!dish)return;
  const dialog=uiDialog('cooking-entry-dialog',dish.name);dialog.querySelector('h2').textContent=dish.name;dialog.querySelectorAll(':scope > :not(.dialog-head)').forEach(el=>el.remove());dialog.querySelector('.quantity-back')?.remove();
  const dateLabel=document.createElement('p');dateLabel.textContent=formatChooserDate(date);dialog.append(dateLabel,uiButton('Rezept ansehen',()=>{dialog.close();void openRecipe(dish.id,{from:'week',servings:model.total(entry)})},{icon:'dishes',className:'primary-button'}));
  const form=document.createElement('form'),options=document.createElement('div');form.id='cooking-entry-quantity';form.hidden=!editQuantity;const quantityButton=uiButton('Kochmenge ändern',()=>setQuantityEditing(true));quantityButton.prepend(uiIcon('cooking'));quantityButton.setAttribute('aria-expanded',String(editQuantity));quantityButton.setAttribute('aria-controls',form.id);dialog.append(quantityButton);options.className='planning-options';renderPlanningFields(options,{...state.planningSettings,mode:'custom',portions:entry.portions,days:1+entry.restDates.length});
  const fields=options.querySelector('.planning-fields'),portionField=options.querySelector('[data-planning="portions"]').parentElement;
  const advanced=document.createElement('details');advanced.className='quantity-more-options';const summary=document.createElement('summary');summary.textContent='Weitere Einstellungen';advanced.append(summary);
  [...fields.children].filter(field=>field!==portionField).forEach(field=>advanced.append(field));advanced.append(options.querySelector('.text-button'));fields.replaceChildren(portionField,advanced);
  const head=dialog.querySelector('.dialog-head'),back=uiButton('Zurück',()=>setQuantityEditing(false),{icon:'back',className:'quantity-back text-button'});head.prepend(back);
  function setQuantityEditing(editing){
    form.hidden=!editing;dialog.classList.toggle('is-editing-quantity',editing);back.hidden=!editing;
    quantityButton.setAttribute('aria-expanded',String(editing));dialog.querySelector('h2').textContent=editing?'Kochmenge ändern':dish.name;
    dateLabel.textContent=editing?dish.name:formatChooserDate(date);dialog.scrollTop=0;
    if(dialog.open)(editing?back:quantityButton).focus({preventScroll:true});
  }
  setQuantityEditing(editQuantity);
  if(dish.type==='baking'){options.querySelector('[data-planning="days"]').value='1';options.querySelector('[data-planning="days"]').disabled=true;options.querySelector('.text-button').hidden=true;options.dispatchEvent(new Event('change'))}
  const hint=document.createElement('p');hint.textContent='Zusätzliche Restetage verschieben belegte Folgetage. Fixierte Gerichte bleiben geschützt.';
  const error=document.createElement('p');error.setAttribute('role','alert');
  const submit=document.createElement('button');submit.className='primary-button';submit.textContent='Kochmenge speichern';submit.type='submit';advanced.append(hint);form.append(options,error,submit);form.onsubmit=event=>{event.preventDefault();try{const chosen=readPlanningFields(options);if(commitCookingChange(()=>model.change(state,entry.id,{portions:model.dailyPortions(chosen,dish),days:chosen.days}),'Kochmenge angepasst.'))dialog.close()}catch(e){error.textContent=e.message}};dialog.append(form);appendCookingEntryActions(dialog,date,position,dish.id);dialog.showModal();
}
function openLinkedRest(date){
  const model=window.WochentischCookingPlan,entries=model.restsAt(state,keyFor(date));if(!entries.length){chooseDish(rangeDates().findIndex(d=>keyFor(d)===keyFor(date)));return}
  const dialog=uiDialog('linked-rest-dialog','Reste');dialog.querySelectorAll(':scope > :not(.dialog-head)').forEach(el=>el.remove());
  for(const entry of entries){dialog.append(uiButton('Rezept ansehen',()=>{dialog.close();void openRecipe(entry.dishId,{from:'week',servings:model.total(entry)})}),uiButton('Diesen Restetag entfernen',()=>{if(commitCookingChange(()=>model.removeRest(state,entry.id,keyFor(date)),'Restetag entfernt und Kochmenge angepasst.'))dialog.close()},{className:'text-button'}))}dialog.showModal();
}
function replaceCookingRange(pantry){
  const model=window.WochentischCookingPlan,options=householdPlanningDefaults(),dates=rangeDates(),keys=dates.map(keyFor),before=cookingPlanSnapshot(state),oldSettings=structuredClone(state.planningSettings);
  let draft=structuredClone(state);draft.cookingEntries=model.normalizeEntries(draft);
  const entries=structuredClone(draft.cookingEntries),protectedDays=new Set(),pinnedIds=new Set();
  for(const e of Object.values(entries)){const dish=draft.dishes.find(d=>d.id===e.dishId);if(e.pinned||e.date<keys[0]||dish?.type==='baking'){
    if(e.pinned&&dish?.type!=='baking')pinnedIds.add(e.dishId);
    if(dish?.type!=='baking')for(const date of [e.date,...e.restDates])if(keys.includes(date))protectedDays.add(keys.indexOf(date));
  }else if(keys.includes(e.date))delete entries[e.id]}
  // A full remix replaces independent rest markers in the requested range,
  // just as it replaces unpinned dishes. Linked rests of retained blocks are
  // rebuilt by project(), including incoming and pinned cooking blocks.
  draft.restDays=Object.fromEntries(Object.entries(draft.restDays||{}).map(([week,days])=>[week,days.filter(day=>!keys.includes(model.addDays(week,day)))]).filter(([,days])=>days.length));
  draft=model.project(draft,entries);
  const starts=[],blocked=new Set(protectedDays);for(let i=0;i<7;){if(blocked.has(i)){i++;continue}let duration=options.days;for(let n=1;n<duration;n++){
    const key=model.addDays(keys[i],n),inside=keys.indexOf(key),outsideProtected=Object.values(entries).some(e=>e.pinned&&[e.date,...e.restDates].includes(key));
    if((inside>=0&&protectedDays.has(inside))||outsideProtected){duration=n;break}
  }starts.push({index:i,days:duration});for(let n=1;n<duration&&i+n<7;n++)blocked.add(i+n);i+=duration}
  const plans=dates.map(d=>planForDate(d)),fixed=plans.map((day,i)=>day.filter((id,j)=>pinnedMealsForDate(dates[i])[j]).map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));
  const generated=makePlan(dates[0],pantry,blocked,pinnedIds,fixed,plans);let empty=false;
  for(const slot of starts){const dish=state.dishes.find(d=>d.id===generated[slot.index]?.[0]);if(!dish){empty=true;continue}draft=model.add(draft,dish.id,keys[slot.index],model.dailyPortions(options,dish),slot.days,newId())}
  draft.planningSettings=options;draft.pantryIngredients??={};draft.shoppingChecks??={};draft.hiddenShoppingItems??={};
  for(const week of new Set(dates.map(d=>keyFor(mondayFor(d))))){draft.pantryIngredients[week]=pantry.slice();const affected=new Set();for(const e of [...Object.values(state.cookingEntries||{}),...Object.values(draft.cookingEntries)])if(model.coordinates(e.date).week===week&&keys.includes(e.date)){const dish=state.dishes.find(d=>d.id===e.dishId);for(const ingredient of dish?.ingredients||[])affected.add(manualItemKey(ingredient))}
    const checks=draft.shoppingChecks[week]||{};for(const key of affected)delete checks[key];draft.hiddenShoppingItems[week]=(draft.hiddenShoppingItems[week]||[]).filter(key=>!affected.has(key));
    for(const e of Object.values(draft.cookingEntries))if(model.coordinates(e.date).week===week&&keys.includes(e.date)){const dish=state.dishes.find(d=>d.id===e.dishId);for(const ingredient of dish?.ingredients||[])if(pantry.some(p=>ingredientMatches(p,ingredient)))checks[manualItemKey(ingredient)]=true}draft.shoppingChecks[week]=checks;
  }
  state=draft;save();cookingRangeUndo={before,after:cookingPlanSnapshot(state),oldSettings,options};return empty;
}
function shoppingAmountLabel(amount,unit){
  const number=window.WochentischRecipes.formatAmount(amount);
  const suffix=unit==='Stück'?'Stk.':unit;
  return suffix?`${number} ${suffix}`:number;
}
function shoppingRecipeQuantity(item,filtered){
  const model=window.WochentischCookingPlan,fields=document.createElement('div');
  fields.className='shopping-recipe-quantity';
  const labels=[],controls=[];
  for(const [unit,calculated] of item.amounts||[]){
    const group=document.createElement('fieldset'),legend=document.createElement('legend');
    legend.textContent=`Berechneter Bedarf: ${shoppingAmountLabel(calculated,unit)}`;
    group.append(legend);
    let displayed=0;
    const weeksWithAmount=[...item.byWeek].filter(([,amounts])=>amounts.has(unit));
    for(const [week,amounts] of weeksWithAmount){
      const key=model.overrideKey(week,item.name,unit),amount=amounts.get(unit);
      const override=filtered?undefined:state.quantityOverrides?.[key];
      displayed+=override??amount;
      if(filtered)continue;
      const label=document.createElement('label'),input=document.createElement('input');
      label.textContent=weeksWithAmount.length>1?`Menge für die Woche ab ${week.split('-').reverse().join('.')}`:'Menge';
      input.type='number';
      input.required=true;
      input.min='0';
      input.step='any';
      input.inputMode='decimal';
      input.defaultValue=override??amount;
      input.addEventListener('input',()=>input.setCustomValidity(Number(input.value)<=0?'Gib eine Menge größer als 0 ein.':''));
      label.append(input);
      group.append(label);
      controls.push({input,key,amount});
      if(override!==undefined){
        const reset=document.createElement('button');
        reset.type='button';
        reset.className='text-button';
        reset.textContent='Berechnete Menge verwenden';
        reset.addEventListener('click',()=>{
          input.value=amount;
          input.setCustomValidity('');
          input.focus({preventScroll:true});
        });
        group.append(reset);
      }
    }
    labels.push(shoppingAmountLabel(displayed,unit));
    fields.append(group);
  }
  if(filtered&&labels.length){
    const hint=document.createElement('p');
    hint.textContent='Mengen lassen sich in der Gesamtübersicht bearbeiten.';
    fields.append(hint);
  }
  if(item.unknown?.size){
    const unknown=document.createElement('p');
    unknown.className='shopping-unknown-amount';
    unknown.textContent=`Bedarf ohne berechenbare Menge: ${[...item.unknown].join('; ')}`;
    fields.append(unknown);
  }
  return {
    label:labels.join(' + '),fields,editable:controls.length>0,
    apply(){
      for(const {input,key,amount} of controls){
        const value=Number(input.value);
        if(value===Number(input.defaultValue))continue;
        state.quantityOverrides??={};
        if(value===amount)delete state.quantityOverrides[key];
        else state.quantityOverrides[key]=value;
      }
    }
  };
}
function initializePlanningUI(){
  const form=$('#household-portions-form'),model=window.WochentischCookingPlan;
  const load=()=>{const s=model.settings(state.planningSettings);$('#household-adults').value=s.adults;$('#household-children').value=s.children;$('#household-child-factor').value=s.childFactor;preview()};
  const preview=()=>{$('#household-portions-preview').textContent=`${window.WochentischRecipes.formatAmount(Number($('#household-adults').value)+Number($('#household-children').value)*Number($('#household-child-factor').value))} Portionen pro Tag`};form.addEventListener('input',preview);
  new MutationObserver(()=>{if($('#household-dialog').open)load()}).observe($('#household-dialog'),{attributes:true,attributeFilter:['open']});
  form.addEventListener('submit',event=>{event.preventDefault();const settings={...model.settings(state.planningSettings),configured:true,adults:Number($('#household-adults').value),children:Number($('#household-children').value),childFactor:Number($('#household-child-factor').value)};if(model.householdPortions(settings)<=0||model.householdPortions(settings)>100){showToast('Bitte einen Haushalt mit mehr als 0 und höchstens 100 Portionen angeben.');return}state.planningSettings=settings;save();showToast('Haushaltsgröße gespeichert. Bestehende Pläne bleiben erhalten.')});load();
}

function showCookingPlanToast(message,options={}){
 const undo=cookingRangeUndo;cookingRangeUndo=null;if(!undo){showToast(message,options);return}
 showToast(message,{...options,actionLabel:'Rückgängig',duration:10000,onAction:()=>{if(!sameValue(undo.after,cookingPlanSnapshot(state))){showToast('Der Plan wurde inzwischen geändert.');return}Object.assign(state,undo.before);if(sameValue(state.planningSettings,undo.options))state.planningSettings=undo.oldSettings;save();renderCalendar()}});
}
