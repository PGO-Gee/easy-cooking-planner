const emojiMap={'Hühnchen':'🍗','Rind':'🥘','Fisch':'🐟','Schwein':'🥓','Wurst':'🌭','Vegetarisch':'🥦','Pasta':'🍝','Ei':'🍳'};
const shortDays=['MO','DI','MI','DO','FR','SA','SO'];
const timeBlocks=[15,30,45,60,90,120];
const $=s=>document.querySelector(s);
const supabaseConfig=window.WOCHENTISCH_SUPABASE;
const authClient=window.supabase?.createClient&&supabaseConfig?.url&&supabaseConfig?.publishableKey
  ?window.supabase.createClient(supabaseConfig.url,supabaseConfig.publishableKey)
  :null;
let state=loadState(); let weekOffset=0; let toastTimer;let pantryDraft=[];let dishIngredientDraft=[];let mealDragState=null;
let appInitialized=false;
let appInitializationPromise;
let currentUserId='';
let currentHouseholdId='';
let interactiveLoginPending=false;
const lastViewStorageKey='wochentisch-last-view';
const offlineSessionStorageKey='wochentisch-last-signed-in-user';
let cloudReady=false;
let cloudBaseState=null;
let cloudConnectPromise;
let realtimeChannel=null;
let cloudSyncTimer;
let cloudSyncInProgress=false;
let cloudSyncRequested=false;
let cloudSyncNotificationRequested=false;
let loadingCloudState=false;
let offlineMode=false;
let explicitSignOutPending=false;
let renderedCalendarSnapshot=null;
let renderedDishesSnapshot=null;
let renderedShoppingSnapshot=null;
// Native dialogs usually lock page scrolling, but iOS Safari can still move the
// document during touch gestures. Keep the page position fixed while any dialog is open.
let dialogScrollLockCount=0;
let dialogScrollY=0;
function syncVisualViewport(){
  const viewport=window.visualViewport;
  if(!viewport)return;
  document.documentElement.style.setProperty('--visual-viewport-height',`${viewport.height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top',`${viewport.offsetTop}px`);
}
syncVisualViewport();
window.visualViewport?.addEventListener('resize',syncVisualViewport);
window.visualViewport?.addEventListener('scroll',syncVisualViewport);
function lockPageScroll(){
  dialogScrollLockCount++;
  if(dialogScrollLockCount!==1)return;
  dialogScrollY=window.scrollY;
  document.body.classList.add('has-open-dialog');
  document.body.style.top=`-${dialogScrollY}px`;
}
function unlockPageScroll(){
  dialogScrollLockCount=Math.max(0,dialogScrollLockCount-1);
  if(dialogScrollLockCount)return;
  document.body.classList.remove('has-open-dialog');
  document.body.style.removeProperty('top');
  window.scrollTo(0,dialogScrollY);
}
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('close',unlockPageScroll);
  dialog.addEventListener('focusin',event=>{
    if(!event.target.matches('input,select,textarea'))return;
    if(dialog.id==='pantry-dialog')return;
    if(event.target.id==='dish-ingredient-input'||event.target.id==='dish-ingredient'){
      const field=event.target.closest('.dish-ingredient-suggest');
      const reveal=()=>{
        field.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
      };
      let completed=false;
      const onViewportResize=()=>{
        if(completed)return;
        completed=true;
        setTimeout(()=>requestAnimationFrame(reveal),120);
        window.visualViewport?.removeEventListener('resize',onViewportResize);
      };
      window.visualViewport?.addEventListener('resize',onViewportResize);
      setTimeout(()=>{if(!completed){completed=true;reveal();window.visualViewport?.removeEventListener('resize',onViewportResize)}},500);
      return;
    }
    requestAnimationFrame(()=>event.target.scrollIntoView({block:'center',inline:'nearest'}));
  });
  const showModal=dialog.showModal.bind(dialog);
  dialog.showModal=()=>{lockPageScroll();showModal()};
});
function showAuthError(message){const error=$('#auth-error');error.textContent=message;error.hidden=!message}
function updateSyncStatus(message){const status=$('#sync-status');if(!status)return;status.textContent=message;status.hidden=!message}
function cloudMigrationKey(){return currentUserId?`wochentisch-cloud-migrated-${currentUserId}`:''}
function localStateOwnerKey(){return 'wochentisch-local-owner'}
function cloudBackupKey(){return currentUserId?`wochentisch-cloud-backup-${currentUserId}`:''}
function canUseLocalState(){const owner=localStorage.getItem(localStateOwnerKey());return !owner||owner===currentUserId}
function savedView(){try{const view=localStorage.getItem(lastViewStorageKey);return ['home','week','dishes','shopping'].includes(view)?view:'week'}catch(error){return 'week'}}
function viewForSession(showHome=false){const mobile=window.matchMedia('(max-width: 700px)').matches;if(showHome&&mobile)return'home';const view=savedView();return view==='home'&&!mobile?'week':view}
function starterState(){return{dishes:[],plans:{},pinnedMeals:{},restDays:{},pantryIngredients:{},noteHidden:state.noteHidden,shoppingChecks:{},manualShoppingItems:{},shoppingQuantities:state.shoppingQuantities||{}}}
function saveCloudBackup(){if(currentUserId&&canUseLocalState()&&state.dishes.length)localStorage.setItem(cloudBackupKey(),JSON.stringify(state))}
function readCloudBackup(){try{const backup=JSON.parse(localStorage.getItem(cloudBackupKey()));return backup?.dishes?.length?backup:null}catch(error){return null}}
function cleanIngredients(ingredients){return Array.isArray(ingredients)?ingredients.filter(item=>typeof item==='string').map(normalizeIngredient).filter(Boolean):[]}
function cleanRestDays(days){return [...new Set((Array.isArray(days)?days:[]).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<7))].sort((a,b)=>a-b)}
function cleanNutrition(nutrition){return nutrition&&typeof nutrition==='object'&&!Array.isArray(nutrition)?nutrition:null}
function cloudError(message){console.error(message);updateSyncStatus('Keine Verbindung – Änderungen bleiben auf diesem Gerät gespeichert.');if(appInitialized&&document.visibilityState==='visible')showToast('Änderung wird lokal gespeichert und später synchronisiert.')}
function householdError(message){const error=$('#household-error');error.textContent=message;error.hidden=!message}
function ensureUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)}
function newId(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`}
function prepareLocalIdsForCloud(){
  const idMap=new Map();
  state.dishes.forEach(dish=>{if(!ensureUuid(dish.id)){const id=newId();idMap.set(dish.id,id);dish.id=id}});
  if(idMap.size)Object.values(state.plans).forEach(days=>days.forEach(day=>{
    for(let index=0;index<day.length;index++)day[index]=idMap.get(day[index])||day[index];
  }));
}
async function getCurrentHousehold(){
  const {data,error}=await authClient.rpc('ensure_my_household');
  if(error)throw error;
  if(!data)throw new Error('Für dieses Konto konnte kein Haushalt angelegt werden.');
  return data;
}
async function readStateFromCloud(){
  const [dishesResult,plansResult]=await Promise.all([
    authClient.from('dishes').select('*').eq('household_id',currentHouseholdId).order('created_at'),
    authClient.from('weekly_plans').select('id, household_id, week_start, pantry_ingredients, rest_days, shopping_quantities, updated_at').eq('household_id',currentHouseholdId).order('week_start')
  ]);
  if(dishesResult.error)throw dishesResult.error;
  if(plansResult.error)throw plansResult.error;
  const plans=plansResult.data||[],planIds=plans.map(plan=>plan.id);
  let meals=[],shoppingItems=[],shoppingChecks=[];
  if(planIds.length){
    const [mealsResult,itemsResult,checksResult]=await Promise.all([
      authClient.from('planned_meals').select('*').in('weekly_plan_id',planIds).order('position'),
      authClient.from('shopping_items').select('*').in('weekly_plan_id',planIds),
      authClient.from('shopping_item_checks').select('*').in('weekly_plan_id',planIds)
    ]);
    if(mealsResult.error)throw mealsResult.error;
    if(itemsResult.error)throw itemsResult.error;
    if(checksResult.error)throw checksResult.error;
    meals=mealsResult.data||[];shoppingItems=itemsResult.data||[];shoppingChecks=checksResult.data||[];
  }
  const dishRows=dishesResult.data||[];
  const nextState={dishes:dishRows.map(dish=>({
    id:dish.id,name:dish.name,ingredient:dish.ingredient,time:dish.cooking_time_minutes,
    emoji:dish.emoji,ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)
  })),plans:{},pinnedMeals:{},restDays:{},noteHidden:state.noteHidden,shoppingChecks:{},manualShoppingItems:{},shoppingQuantities:{}};
  nextState.pantryIngredients={};
  const weekByPlanId=new Map();
  plans.forEach(plan=>{nextState.plans[plan.week_start]=Array.from({length:7},()=>[]);nextState.pinnedMeals[plan.week_start]=Array.from({length:7},()=>[]);nextState.restDays[plan.week_start]=cleanRestDays(plan.rest_days);nextState.pantryIngredients[plan.week_start]=cleanIngredients(plan.pantry_ingredients);Object.assign(nextState.shoppingQuantities,plan.shopping_quantities||{});weekByPlanId.set(plan.id,plan.week_start)});
  meals.forEach(meal=>{const week=weekByPlanId.get(meal.weekly_plan_id);if(week&&nextState.plans[week][meal.day_of_week]){nextState.plans[week][meal.day_of_week][meal.position]=meal.dish_id;nextState.pinnedMeals[week][meal.day_of_week][meal.position]=Boolean(meal.is_pinned)}});
  Object.entries(nextState.plans).forEach(([week,days])=>days.forEach((day,index)=>{const entries=day.map((id,position)=>({id,pinned:Boolean(nextState.pinnedMeals[week][index][position])})).filter(item=>item.id);days[index]=entries.map(item=>item.id);nextState.pinnedMeals[week][index]=entries.map(item=>item.pinned)}));
  shoppingItems.forEach(item=>{const week=weekByPlanId.get(item.weekly_plan_id);if(week)(nextState.manualShoppingItems[week]??=[]).push(item.name)});
  shoppingChecks.forEach(item=>{const week=weekByPlanId.get(item.weekly_plan_id);if(week)(nextState.shoppingChecks[week]??={})[item.item_key]=true});
  return {
    state:nextState,
    hasCloudData:Boolean(dishRows.length||plans.length),
    planIds:Object.fromEntries(plans.map(plan=>[plan.week_start,plan.id])),
    planRows:plans,
    dishRows,
    mealRows:meals,
    shoppingItemRows:shoppingItems,
    shoppingCheckRows:shoppingChecks
  };
}
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
  return value;
}
function sameValue(first,second){return JSON.stringify(stableValue(first))===JSON.stringify(stableValue(second))}
function mapValue(map,key){return Object.prototype.hasOwnProperty.call(map||{},key)?map[key]:undefined}
function chooseMergedValue(baseValue,localValue,remoteValue,label,conflicts){
  const localChanged=!sameValue(localValue,baseValue),remoteChanged=!sameValue(remoteValue,baseValue);
  if(!localChanged)return remoteValue;
  if(remoteChanged&&!sameValue(localValue,remoteValue)){conflicts.push(label);return remoteValue}
  return localValue;
}
function mergeKeyedArrays(baseItems=[],localItems=[],remoteItems=[],keyOf=item=>item.id,label='Eintrag',conflicts=[]){
  const toMap=items=>new Map((items||[]).map(item=>[keyOf(item),item])),base=toMap(baseItems),local=toMap(localItems),remote=toMap(remoteItems),result=[];
  const keys=new Set([...remote.keys(),...local.keys(),...base.keys()]);
  keys.forEach(key=>{const value=chooseMergedValue(base.get(key),local.get(key),remote.get(key),`${label}:${key}`,conflicts);if(value!==undefined)result.push(value)});
  return result;
}
function mergeKeyedObjects(baseObject={},localObject={},remoteObject={},label,conflicts,normalize=value=>value){
  const result={},keys=new Set([...Object.keys(baseObject||{}),...Object.keys(localObject||{}),...Object.keys(remoteObject||{})]);
  keys.forEach(key=>{const value=chooseMergedValue(normalize(mapValue(baseObject,key)),normalize(mapValue(localObject,key)),normalize(mapValue(remoteObject,key)),`${label}:${key}`,conflicts);if(value!==undefined)result[key]=value});
  return result;
}
function mergeShoppingItems(baseItems={},localItems={},remoteItems={},conflicts){
  const result={},weeks=new Set([...Object.keys(baseItems||{}),...Object.keys(localItems||{}),...Object.keys(remoteItems||{})]);
  const asMap=items=>new Map((items||[]).map(name=>[name.toLocaleLowerCase('de-DE'),name]));
  weeks.forEach(week=>{
    const base=asMap(baseItems[week]),local=asMap(localItems[week]),remote=asMap(remoteItems[week]),names=new Set([...base.keys(),...local.keys(),...remote.keys()]),merged=[];
    names.forEach(key=>{
      const baseHas=base.has(key),localHas=local.has(key),remoteHas=remote.has(key);
      let keep=remoteHas;
      if(localHas!==baseHas){
        if(remoteHas!==baseHas&&localHas!==remoteHas){conflicts.push(`Einkaufsartikel:${week}:${key}`)}
        else keep=localHas;
      }
      if(keep)merged.push(remote.get(key)||local.get(key)||base.get(key));
    });
    if(merged.length)result[week]=merged;
  });
  return result;
}
function mergeShoppingChecks(baseChecks={},localChecks={},remoteChecks={},conflicts){
  const result={},weeks=new Set([...Object.keys(baseChecks||{}),...Object.keys(localChecks||{}),...Object.keys(remoteChecks||{})]);
  weeks.forEach(week=>{
    const base=baseChecks[week]||{},local=localChecks[week]||{},remote=remoteChecks[week]||{},keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]),merged={};
    keys.forEach(key=>{
      const baseValue=Boolean(base[key]),localValue=Boolean(local[key]),remoteValue=Boolean(remote[key]);
      const value=chooseMergedValue(baseValue,localValue,remoteValue,`Einkaufsstatus:${week}:${key}`,conflicts);
      if(value)merged[key]=true;
    });
    if(Object.keys(merged).length)result[week]=merged;
  });
  return result;
}
function planDay(stateValue,week,day){
  if(!Object.prototype.hasOwnProperty.call(stateValue.plans||{},week))return undefined;
  const meals=(stateValue.plans?.[week]?.[day]||[]).slice(),pins=(stateValue.pinnedMeals?.[week]?.[day]||[]).slice(0,meals.length).map(Boolean);
  while(pins.length<meals.length)pins.push(false);
  return {meals,pins};
}
function mergePlanDays(baseState,localState,remoteState,conflicts){
  const plans={},pinnedMeals={},weeks=new Set([
    ...Object.keys(baseState.plans||{}),...Object.keys(localState.plans||{}),...Object.keys(remoteState.plans||{}),
    ...Object.keys(baseState.pantryIngredients||{}),...Object.keys(localState.pantryIngredients||{}),...Object.keys(remoteState.pantryIngredients||{}),
    ...Object.keys(baseState.restDays||{}),...Object.keys(localState.restDays||{}),...Object.keys(remoteState.restDays||{})
  ]);
  weeks.forEach(week=>{
    const days=Array.from({length:7},()=>[]),pins=Array.from({length:7},()=>[]);
    let hasPlan=false;
    for(let day=0;day<7;day++){
      const merged=chooseMergedValue(planDay(baseState,week,day),planDay(localState,week,day),planDay(remoteState,week,day),`Wochenplan:${week}:${day}`,conflicts);
      if(merged!==undefined){hasPlan=true;days[day]=merged.meals;pins[day]=merged.pins}
    }
    if(hasPlan){plans[week]=days;pinnedMeals[week]=pins}
  });
  return {plans,pinnedMeals};
}
function mergeHouseholdState(baseState,localState,remoteState){
  const base=baseState||remoteState,conflicts=[],planData=mergePlanDays(base,localState,remoteState,conflicts);
  return {
    state:{
      dishes:mergeKeyedArrays(base.dishes,localState.dishes,remoteState.dishes,item=>item.id,'Gericht',conflicts),
      ...planData,
      pantryIngredients:mergeKeyedObjects(base.pantryIngredients,localState.pantryIngredients,remoteState.pantryIngredients,'Vorrat',conflicts,items=>items===undefined?undefined:cleanIngredients(items)),
      restDays:mergeKeyedObjects(base.restDays,localState.restDays,remoteState.restDays,'Resteabend',conflicts,days=>days===undefined?undefined:cleanRestDays(days)),
      shoppingChecks:mergeShoppingChecks(base.shoppingChecks,localState.shoppingChecks,remoteState.shoppingChecks,conflicts),
      manualShoppingItems:mergeShoppingItems(base.manualShoppingItems,localState.manualShoppingItems,remoteState.manualShoppingItems,conflicts),
      shoppingQuantities:mergeKeyedObjects(base.shoppingQuantities,localState.shoppingQuantities,remoteState.shoppingQuantities,'Menge',conflicts),
      noteHidden:localState.noteHidden
    },
    conflicts
  };
}
function cloudComparable(value){
  const shoppingChecks=Object.fromEntries(Object.entries(value.shoppingChecks||{}).map(([week,checks])=>[
    week,Object.fromEntries(Object.entries(checks||{}).filter(([,checked])=>Boolean(checked)))
  ]).filter(([,checks])=>Object.keys(checks).length));
  const manualShoppingItems=Object.fromEntries(Object.entries(value.manualShoppingItems||{}).map(([week,items])=>[
    week,[...new Map((items||[]).map(name=>[manualItemKey(name),normalizeIngredient(name)])).values()].sort((a,b)=>a.localeCompare(b,'de-DE'))
  ]).filter(([,items])=>items.length));
  return {
    dishes:(value.dishes||[]).map(dish=>({
      id:dish.id,name:dish.name,ingredient:dish.ingredient||'',time:Number(dish.time)||30,
      emoji:dish.emoji||emojiMap[dish.ingredient]||'🍽️',ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)
    })).sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    plans:value.plans||{},pinnedMeals:value.pinnedMeals||{},pantryIngredients:value.pantryIngredients||{},restDays:value.restDays||{},
    shoppingChecks,
    manualShoppingItems,
    shoppingQuantities:value.shoppingQuantities||{}
  };
}
function hasCloudChanges(first,second){return !sameValue(cloudComparable(first),cloudComparable(second))}
function cloudBaseStorageKey(){return currentUserId&&currentHouseholdId?`wochentisch-cloud-base-${currentUserId}-${currentHouseholdId}`:''}
function readCloudBase(){try{const key=cloudBaseStorageKey(),value=key?JSON.parse(localStorage.getItem(key)):null;return value&&Array.isArray(value.dishes)&&value.plans?value:null}catch(error){return null}}
function saveCloudBase(value){const key=cloudBaseStorageKey();if(key&&value)localStorage.setItem(key,JSON.stringify(value))}
function manualItemKey(name){return normalizeIngredient(name).toLocaleLowerCase('de-DE')}
function dayEntry(day,pins,position){return position<(day||[]).length?{dish_id:day[position],is_pinned:Boolean(pins?.[position])}:null}
function dishRow(dish){return {id:dish.id,household_id:currentHouseholdId,name:dish.name,ingredient:dish.ingredient||'',cooking_time_minutes:Number(dish.time)||30,emoji:dish.emoji||'🍽️',ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)}}
async function writeMergedStateToCloud(remote,target,metadata,conflicts){
  const remoteDishes=new Map((metadata.dishRows||[]).map(row=>[row.id,row])),targetDishes=new Map((target.dishes||[]).map(dish=>[dish.id,dish]));
  for(const [id,dish] of targetDishes){
    const current=remoteDishes.get(id),cloudDish=remote.dishes.find(item=>item.id===id);
    if(cloudDish&&sameValue(cloudDish,dish))continue;
    if(current){
      const {data,error}=await authClient.from('dishes').update(dishRow(dish)).eq('id',id).eq('household_id',currentHouseholdId).eq('updated_at',current.updated_at).select('id');
      if(error)throw error;
      if(!data?.length)conflicts.push(`Gericht:${dish.name}`);
    }else{
      const {error}=await authClient.from('dishes').insert(dishRow(dish));
      if(error&&error.code!=='23505')throw error;
    }
  }

  const targetWeeks=Object.keys(target.plans||{});
  for(const week of targetWeeks){
    if(Object.prototype.hasOwnProperty.call(remote.plans||{},week))continue;
    const {error}=await authClient.from('weekly_plans').upsert({household_id:currentHouseholdId,week_start:week},{onConflict:'household_id,week_start',ignoreDuplicates:true});
    if(error)throw error;
  }
  const {data:planRows,error:planError}=await authClient.from('weekly_plans').select('id, household_id, week_start, pantry_ingredients, rest_days, shopping_quantities, updated_at').eq('household_id',currentHouseholdId);
  if(planError)throw planError;
  const planByWeek=new Map((planRows||[]).map(plan=>[plan.week_start,plan]));
  for(const week of targetWeeks){
    const plan=planByWeek.get(week);if(!plan)continue;
    const updates={},remotePantry=remote.pantryIngredients?.[week]||[],targetPantry=target.pantryIngredients?.[week]||[];
    const remoteRest=remote.restDays?.[week]||[],targetRest=target.restDays?.[week]||[];
    if(!sameValue(remotePantry,cleanIngredients(targetPantry)))updates.pantry_ingredients=cleanIngredients(targetPantry);
    if(!sameValue(remoteRest,cleanRestDays(targetRest)))updates.rest_days=cleanRestDays(targetRest);
    if(!Object.keys(updates).length)continue;
    const {data,error}=await authClient.from('weekly_plans').update(updates).eq('id',plan.id).eq('updated_at',plan.updated_at).select('id');
    if(error)throw error;
    if(!data?.length)conflicts.push(`Wochenplan:${week}`);
  }

  const quantityUpdates={},quantityRemovals=[];
  const quantityKeys=new Set([...Object.keys(remote.shoppingQuantities||{}),...Object.keys(target.shoppingQuantities||{})]);
  quantityKeys.forEach(key=>{
    const before=mapValue(remote.shoppingQuantities,key),after=mapValue(target.shoppingQuantities,key);
    if(sameValue(before,after))return;
    if(after===undefined)quantityRemovals.push(key);else quantityUpdates[key]=after;
  });
  if(Object.keys(quantityUpdates).length||quantityRemovals.length){
    const {error}=await authClient.rpc('merge_shopping_quantities',{p_household_id:currentHouseholdId,p_quantity_updates:quantityUpdates,p_keys_to_remove:quantityRemovals});
    if(error)throw error;
  }

  const remoteMealRows=metadata.mealRows||[],planIdByWeek=new Map([...planByWeek.entries()].map(([week,plan])=>[week,plan.id]));
  for(const week of targetWeeks){
    const planId=planIdByWeek.get(week);if(!planId)continue;
    const remoteDays=remote.plans?.[week]||[],targetDays=target.plans?.[week]||[];
    const remotePins=remote.pinnedMeals?.[week]||[],targetPins=target.pinnedMeals?.[week]||[];
    for(let day=0;day<7;day++){
      if(sameValue(planDay(remote,week,day),planDay(target,week,day)))continue;
      const existing=remoteMealRows.filter(row=>row.weekly_plan_id===planId&&Number(row.day_of_week)===day);
      const existingByPosition=new Map(existing.map(row=>[Number(row.position),row]));
      const maxPosition=Math.max(remoteDays[day]?.length||0,targetDays[day]?.length||0,...existing.map(row=>Number(row.position)+1),0);
      const changedPositions=[];
      for(let position=0;position<maxPosition;position++){
        if(!sameValue(dayEntry(remoteDays[day],remotePins[day],position),dayEntry(targetDays[day],targetPins[day],position)))changedPositions.push(position);
      }
      const deletedPositions=new Set(),blockedPositions=new Set();
      for(const position of changedPositions){
        const row=existingByPosition.get(position);if(!row){deletedPositions.add(position);continue;}
        let query=authClient.from('planned_meals').delete().eq('id',row.id).eq('weekly_plan_id',planId).eq('day_of_week',day).eq('position',position).eq('dish_id',row.dish_id).eq('is_pinned',Boolean(row.is_pinned));
        const {data,error}=await query.select('id');
        if(error)throw error;
        if(data?.length)deletedPositions.add(position);else{blockedPositions.add(position);conflicts.push(`Wochenplan:${week}:${day}`)}
      }
      const mealRows=[];
      for(const position of changedPositions){
        if(blockedPositions.has(position)||!deletedPositions.has(position))continue;
        const entry=dayEntry(targetDays[day],targetPins[day],position);if(!entry)continue;
        mealRows.push({weekly_plan_id:planId,day_of_week:day,position,dish_id:entry.dish_id,is_pinned:entry.is_pinned});
      }
      if(mealRows.length){
        const {error}=await authClient.from('planned_meals').upsert(mealRows,{onConflict:'weekly_plan_id,day_of_week,position',ignoreDuplicates:true});
        if(error)throw error;
      }
    }
  }

  const weekForPlan=new Map((planRows||[]).map(plan=>[plan.id,plan.week_start]));
  const manualRows=metadata.shoppingItemRows||[];
  for(const week of targetWeeks){
    const planId=planIdByWeek.get(week);if(!planId)continue;
    const existing=new Map(manualRows.filter(row=>weekForPlan.get(row.weekly_plan_id)===week).map(row=>[row.normalized_name,row]));
    const desired=new Map((target.manualShoppingItems?.[week]||[]).map(name=>[manualItemKey(name),name]));
    for(const [key,name] of desired){
      if(existing.has(key))continue;
      const {error}=await authClient.from('shopping_items').upsert({weekly_plan_id:planId,name,normalized_name:key},{onConflict:'weekly_plan_id,normalized_name',ignoreDuplicates:true});
      if(error)throw error;
    }
    for(const [key,row] of existing){
      if(desired.has(key))continue;
      const {error}=await authClient.from('shopping_items').delete().eq('id',row.id);
      if(error)throw error;
    }
  }
  const checkRows=metadata.shoppingCheckRows||[];
  for(const week of targetWeeks){
    const planId=planIdByWeek.get(week);if(!planId)continue;
    const desired=target.shoppingChecks?.[week]||{},existing=checkRows.filter(row=>weekForPlan.get(row.weekly_plan_id)===week);
    const existingByKey=new Map(existing.map(row=>[row.item_key,row]));
    for(const [key,checked] of Object.entries(desired)){
      if(!checked||existingByKey.has(key))continue;
      const {error}=await authClient.from('shopping_item_checks').upsert({weekly_plan_id:planId,item_key:key},{onConflict:'weekly_plan_id,item_key',ignoreDuplicates:true});
      if(error)throw error;
    }
    for(const [key,row] of existingByKey){
      if(desired[key])continue;
      const {error}=await authClient.from('shopping_item_checks').delete().eq('weekly_plan_id',planId).eq('item_key',key).eq('checked_at',row.checked_at);
      if(error)throw error;
    }
  }

  const dishIdsToDelete=[];
  for(const [id,dish] of new Map((remote.dishes||[]).map(dish=>[dish.id,dish]))){
    if(targetDishes.has(id))continue;
    const stillPlanned=Object.values(target.plans||{}).some(days=>days.some(day=>day.includes(id)));
    if(stillPlanned){conflicts.push(`Gericht:${dish.name}`);continue;}
    const row=remoteDishes.get(id);if(row)dishIdsToDelete.push(row);
  }
  for(const row of dishIdsToDelete){
    const {error}=await authClient.from('dishes').delete().eq('id',row.id).eq('household_id',currentHouseholdId).eq('updated_at',row.updated_at);
    if(error)throw error;
  }
}
function localShoppingItems(value){
  const items=new Map(),days=rangeDates();
  days.forEach(date=>{
    const week=keyFor(mondayFor(date)),day=dayIndex(date);
    (value.plans?.[week]?.[day]||[]).forEach(id=>{
      const dish=(value.dishes||[]).find(item=>item.id===id);
      (dish?.ingredients||[]).forEach(name=>{const normalized=manualItemKey(name);if(normalized&&!items.has(normalized))items.set(normalized,name)});
    });
    (value.manualShoppingItems?.[week]||[]).forEach(name=>{const normalized=manualItemKey(name);if(normalized&&!items.has(normalized))items.set(normalized,name)});
  });
  return items;
}
async function syncStateToCloud({notify=false}={}){
  if(!cloudReady||!currentHouseholdId)return;
  prepareLocalIdsForCloud();
  const before=structuredClone(state),beforeShopping=localShoppingItems(before),remote=await readStateFromCloud(),base=cloudBaseState||remote.state;
  const latestLocal=structuredClone(state);
  const merged=mergeHouseholdState(base,latestLocal,remote.state);
  state=merged.state;
  const syncTarget=structuredClone(state);
  cloudBaseState=remote.state;saveCloudBase(cloudBaseState);save({sync:false});
  await writeMergedStateToCloud(remote.state,syncTarget,remote,merged.conflicts);
  const refreshed=await readStateFromCloud(),stateAtRefresh=structuredClone(state);
  const afterSync=mergeHouseholdState(syncTarget,stateAtRefresh,refreshed.state);
  state=afterSync.state;cloudBaseState=refreshed.state;saveCloudBase(cloudBaseState);save({sync:false});
  if(appInitialized){
    $('#bottom-note').classList.toggle('hidden',state.noteHidden);
    updateCounts();refreshVisibleView();
  }
  const conflictCount=merged.conflicts.length+afterSync.conflicts.length;
  if(conflictCount&&document.visibilityState==='visible')showToast('Eine gleichzeitige Änderung wurde übernommen. Bitte prüfe den betroffenen Plan.');
  if(notify&&document.visibilityState==='visible'){
    const afterShopping=localShoppingItems(state),added=[...afterShopping.entries()].filter(([key])=>!beforeShopping.has(key)).map(([,name])=>name);
    if(added.length===1)showToast(`${added[0]} wurde auf den Einkaufszettel gesetzt.`);
    else if(added.length>1)showToast(`${added[0]} und ${added.length-1} weitere Artikel wurden ergänzt.`);
  }
  updateSyncStatus('');
  if(hasCloudChanges(cloudBaseState,state))scheduleCloudSync();
}
function scheduleCloudSync({notify=false}={}){
  if(!cloudReady||loadingCloudState||!navigator.onLine)return;
  cloudSyncNotificationRequested=cloudSyncNotificationRequested||notify;clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>{cloudSyncRequested=true;flushCloudSync()},notify?500:350);
}
async function flushCloudSync(){
  if(cloudSyncInProgress||!cloudSyncRequested)return;
  cloudSyncInProgress=true;
  try{
    while(cloudSyncRequested){
      cloudSyncRequested=false;
      const notify=cloudSyncNotificationRequested;cloudSyncNotificationRequested=false;
      await syncStateToCloud({notify});
    }
  }catch(error){cloudError(error)}
  finally{cloudSyncInProgress=false}
}
function renderCachedApp({showHome=false}={}){
  $('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;
  if(state.noteHidden)$('#bottom-note').classList.add('hidden');
  updateCounts();renderCalendar();setView(viewForSession(showHome));
  appInitialized=true;
}
function stopRealtimeChannel(){
  if(!realtimeChannel||!authClient)return;
  authClient.removeChannel(realtimeChannel);realtimeChannel=null;
}
function subscribeToHouseholdChanges(){
  if(!authClient||!currentHouseholdId||!cloudReady)return;
  stopRealtimeChannel();
  const channel=authClient.channel(`household-sync:${currentHouseholdId}`);
  ['dishes','weekly_plans','planned_meals','shopping_items','shopping_item_checks'].forEach(table=>{
    channel.on('postgres_changes',{event:'*',schema:'public',table},()=>scheduleCloudSync({notify:true}));
  });
  realtimeChannel=channel;
  channel.subscribe(status=>{
    if(status==='SUBSCRIBED')scheduleCloudSync({notify:true});
    else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')updateSyncStatus('Live-Sync pausiert – beim Öffnen wird die Liste aktualisiert.');
  });
}
async function connectToCloud(){
  if(cloudReady||!currentUserId||!authClient)return;
  if(cloudConnectPromise)return cloudConnectPromise;
  cloudConnectPromise=(async()=>{
    try{
      currentHouseholdId=await getCurrentHousehold();
      const beforeShopping=localShoppingItems(state),cloud=await readStateFromCloud(),previousBase=readCloudBase();
      if(previousBase){
        const merged=mergeHouseholdState(previousBase,state,cloud.state);
        state=merged.state;
        if(merged.conflicts.length)showToast('Eine gleichzeitige Änderung wurde übernommen. Bitte prüfe den betroffenen Plan.');
      }else if(cloud.hasCloudData)state=cloud.state;
      else state=starterState();
      cloudBaseState=cloud.state;saveCloudBase(cloudBaseState);
      cloudReady=true;offlineMode=false;
      const migrationKey=cloudMigrationKey();if(!cloud.hasCloudData)localStorage.setItem(migrationKey,'true');
      save({sync:false});saveCloudBackup();
      updateSyncStatus('');
      if(hasCloudChanges(cloudBaseState,state))scheduleCloudSync();
      if(appInitialized){$('#bottom-note').classList.toggle('hidden',state.noteHidden);updateCounts();refreshVisibleView()}
      if(previousBase&&document.visibilityState==='visible'){
        const added=[...localShoppingItems(state).entries()].filter(([key])=>!beforeShopping.has(key)).map(([,name])=>name);
        if(added.length===1)showToast(`${added[0]} wurde auf den Einkaufszettel gesetzt.`);
        else if(added.length>1)showToast(`${added[0]} und ${added.length-1} weitere Artikel wurden ergänzt.`);
      }
      subscribeToHouseholdChanges();
    }catch(error){
      cloudReady=false;offlineMode=true;
      console.warn('Cloud-Synchronisierung vorübergehend nicht verfügbar:',error);
      updateSyncStatus('Keine Verbindung – die gespeicherte Einkaufsliste bleibt verfügbar.');
    }
  })().finally(()=>{cloudConnectPromise=undefined});
  return cloudConnectPromise;
}
function startOfflineApp(){
  const rememberedUser=localStorage.getItem(offlineSessionStorageKey),owner=localStorage.getItem(localStateOwnerKey());
  if(!rememberedUser||(owner&&owner!==rememberedUser))return false;
  currentUserId=rememberedUser;currentHouseholdId='';cloudReady=false;offlineMode=true;
  if(!appInitialized)renderCachedApp();
  else{$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false}
  updateSyncStatus(navigator.onLine?'Anmeldung wird erneuert – Änderungen bleiben lokal gespeichert.':'Offline – zuletzt gespeicherte Einkaufsliste verfügbar.');
  return true;
}
async function resumeCloudSession(){
  if(!authClient||!currentUserId)return;
  try{
    const {data,error}=await authClient.auth.getSession();
    if(data?.session){
      currentUserId=data.session.user.id;localStorage.setItem(offlineSessionStorageKey,currentUserId);offlineMode=false;
      if(!appInitialized)renderCachedApp();
      await connectToCloud();
    }else if(error)updateSyncStatus('Anmeldung wird erneuert – gespeicherte Liste ist lokal verfügbar.');
    else updateSyncStatus('Zum Synchronisieren ist eine erneute Anmeldung nötig.');
  }catch(error){updateSyncStatus('Keine Verbindung – Änderungen bleiben lokal gespeichert.')}
}
async function revealApp({showHome=false}={}){
  if(!appInitialized)renderCachedApp({showHome});
  offlineMode=false;
  if(navigator.onLine)updateSyncStatus('');
  return connectToCloud();
}
async function loadHouseholdMembers(){
  const list=$('#household-members');list.innerHTML='<p class="household-loading">Wird geladen …</p>';
  const {data,error}=await authClient.rpc('list_my_household_members');
  if(error)throw error;
  list.replaceChildren();
  (data||[]).forEach(member=>{
    const row=document.createElement('div');row.className='household-member-row';
    const email=document.createElement('span');email.textContent=member.email||'Mitglied';
    const role=document.createElement('small');role.textContent=member.role==='owner'?'Verwaltung':'Mitglied';
    row.append(email,role);list.append(row);
  });
  if(!data?.length)list.innerHTML='<p class="household-loading">Noch keine Mitglieder gefunden.</p>';
}
$('#household-open').addEventListener('click',async()=>{
  householdError('');$('#household-code-result').hidden=true;$('#household-code').textContent='';
  $('#household-dialog').showModal();
  try{await loadHouseholdMembers()}catch(error){console.error(error);householdError('Mitglieder konnten gerade nicht geladen werden.')}
});
$('#household-close').addEventListener('click',()=>$('#household-dialog').close());
$('#create-household-code').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;householdError('');
  try{
    const {data,error}=await authClient.rpc('create_household_join_code');
    if(error)throw error;
    $('#household-code').textContent=data;$('#household-code-result').hidden=false;
  }catch(error){console.error(error);householdError('Der Beitrittscode konnte nicht erstellt werden. Bitte später erneut versuchen.')}
  finally{button.disabled=false}
});
$('#household-join-code').addEventListener('input',event=>{event.currentTarget.value=event.currentTarget.value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,'')});
$('#household-join-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]');
  const code=$('#household-join-code').value.trim();button.disabled=true;householdError('');
  try{
    const {data,error}=await authClient.rpc('join_household_with_code',{join_code:code});
    if(error)throw error;
    if(!data)throw new Error('Household was not returned');
    stopRealtimeChannel();currentHouseholdId=data;cloudReady=false;cloudBaseState=null;loadingCloudState=true;
    clearTimeout(cloudSyncTimer);cloudSyncRequested=false;
    $('#household-dialog').close();
    const cloud=await readStateFromCloud();state=cloud.state;cloudBaseState=cloud.state;saveCloudBase(cloudBaseState);cloudReady=true;
    save({sync:false});
    loadingCloudState=false;weekOffset=0;renderCalendar();
    subscribeToHouseholdChanges();
    showToast('Du bist dem Haushalt beigetreten.');
  }catch(error){
    loadingCloudState=false;console.error(error);
    householdError(/Invalid or expired join code/i.test(error.message)?'Der Code ist ungültig, abgelaufen oder wurde bereits verwendet.':'Beitritt fehlgeschlagen. Bitte prüfe den Code und versuche es erneut.');
  }finally{button.disabled=false}
});
function showLogin(){
  $('#startup-gate').hidden=true;
  $('.app-shell').hidden=true;
  $('#auth-gate').hidden=false;
  updateSyncStatus('');
}
$('#password-sign-in').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!authClient){showAuthError('Die Anmeldung konnte nicht geladen werden. Bitte Seite neu laden.');return}
  const button=$('#password-sign-in-button');
  const email=$('#auth-email').value.trim();
  const password=$('#auth-password').value;
  interactiveLoginPending=true;
  button.disabled=true;showAuthError('');
  try{
    const {error}=await authClient.auth.signInWithPassword({
      email,
      password
    });
    if(error){interactiveLoginPending=false;showAuthError('E-Mail-Adresse oder Passwort sind nicht korrekt.');button.disabled=false}
  }catch(error){interactiveLoginPending=false;showAuthError('Anmeldung fehlgeschlagen. Bitte prüfe deine Internetverbindung.');button.disabled=false}
});
$('#sign-out').addEventListener('click',async()=>{
  explicitSignOutPending=true;
  const {error}=await authClient.auth.signOut();
  if(error){explicitSignOutPending=false;showToast(`Abmelden fehlgeschlagen: ${error.message}`);return}
  localStorage.removeItem(offlineSessionStorageKey);explicitSignOutPending=false;
  currentUserId='';currentHouseholdId='';cloudReady=false;cloudBaseState=null;appInitialized=false;appInitializationPromise=undefined;
  stopRealtimeChannel();showLogin();
});
if(authClient){
  authClient.auth.onAuthStateChange((event,session)=>{
    if(session){
      const userId=session.user.id,previousUserId=currentUserId,owner=localStorage.getItem(localStateOwnerKey());
      if((previousUserId&&previousUserId!==userId)||(owner&&owner!==userId)){
        cloudReady=false;currentHouseholdId='';cloudBaseState=null;stopRealtimeChannel();
        currentUserId=userId;state=readCloudBackup()||emptyState();appInitialized=false;appInitializationPromise=undefined;
      }else currentUserId=userId;
      localStorage.setItem(offlineSessionStorageKey,currentUserId);offlineMode=false;
      const showHome=event==='SIGNED_IN'&&interactiveLoginPending;interactiveLoginPending=false;
      if(appInitialized){if(!cloudReady)connectToCloud()}else revealApp({showHome});
    }else{
      stopRealtimeChannel();currentHouseholdId='';cloudReady=false;cloudBaseState=null;interactiveLoginPending=false;
      if(explicitSignOutPending){currentUserId='';showLogin();return}
      if(startOfflineApp())return;
      currentUserId='';appInitialized=false;appInitializationPromise=undefined;showLogin();
    }
  });
  authClient.auth.getSession().then(({data,error})=>{
    if(data?.session){
      const userId=data.session.user.id,owner=localStorage.getItem(localStateOwnerKey());
      if(owner&&owner!==userId){currentUserId=userId;state=readCloudBackup()||emptyState();appInitialized=false}
      currentUserId=userId;localStorage.setItem(offlineSessionStorageKey,userId);revealApp();
    }else if(startOfflineApp()){}
    else if(error){showLogin();showAuthError('Anmeldestatus konnte nicht geprüft werden. Bitte verbinde dich mit dem Internet und versuche es erneut.')}
    else showLogin();
  }).catch(()=>{if(!startOfflineApp()){showLogin();showAuthError('Supabase ist gerade nicht erreichbar. Bitte später erneut versuchen.')}});
}else{
  showLogin();
  showAuthError('Supabase-Konfiguration fehlt. Bitte Projekt-URL und Publishable Key prüfen.');
}
window.addEventListener('online',()=>{if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode)resumeCloudSession()});
window.addEventListener('offline',()=>{if(appInitialized)updateSyncStatus('Offline – Änderungen bleiben lokal gespeichert.')});
window.addEventListener('pageshow',()=>{if(!appInitialized)return;if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode&&navigator.onLine)resumeCloudSession()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||!appInitialized)return;if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode&&navigator.onLine)resumeCloudSession()});
function emptyState(){return{dishes:[],plans:{},pinnedMeals:{},restDays:{},pantryIngredients:{},noteHidden:false,shoppingChecks:{},manualShoppingItems:{},shoppingQuantities:{}}}
function loadState(){try{const s=JSON.parse(localStorage.getItem('wochentisch-v1'));if(s&&Array.isArray(s.dishes)&&s.plans){s.pantryIngredients??={};s.pinnedMeals??={};s.restDays??={};s.shoppingQuantities??={};s.shoppingChecks??={};s.manualShoppingItems??={};return s}}catch(e){}return emptyState()}
function save({sync=true}={}){localStorage.setItem('wochentisch-v1',JSON.stringify(state));if(currentUserId){localStorage.setItem(localStateOwnerKey(),currentUserId);saveCloudBackup()}updateCounts();if(sync)scheduleCloudSync()}
function updateCounts(){$('#dish-count').textContent=state.dishes.length;$('#dish-heading-count').textContent=state.dishes.length}
function mondayFor(date=new Date()){const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function rangeStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+weekOffset*7);return d}
function rangeDates(){const start=rangeStart();return Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return date})}
function keyFor(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dayIndex(date){return (date.getDay()+6)%7}
function getPlanForDate(date){const start=mondayFor(date),key=keyFor(start);if(!state.plans[key]){state.plans[key]=makePlan(start);save()}return state.plans[key]}
function pinnedMealsForDate(date){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date);state.pinnedMeals??={};state.pinnedMeals[weekKey]??=Array.from({length:7},()=>[]);state.pinnedMeals[weekKey][index]??=[];const pins=state.pinnedMeals[weekKey][index],plan=state.plans[weekKey]?.[index]||[];while(pins.length<plan.length)pins.push(false);if(pins.length>plan.length)pins.splice(plan.length);return pins}
function restDaysForWeek(weekKey){state.restDays??={};const days=cleanRestDays(state.restDays[weekKey]);if(Object.prototype.hasOwnProperty.call(state.restDays,weekKey))state.restDays[weekKey]=days;return days}
function isRestDay(date){return restDaysForWeek(keyFor(mondayFor(date))).includes(dayIndex(date))}
function setRestDay(date,isRest){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),days=new Set(restDaysForWeek(weekKey));if(isRest)days.add(index);else days.delete(index);if(days.size)state.restDays[weekKey]=[...days].sort((a,b)=>a-b);else delete state.restDays[weekKey]}
function replaceDayPlan(date,{meals,pins,isRest}){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),plan=getPlanForDate(date);plan[index]=meals.slice();state.pinnedMeals??={};state.pinnedMeals[weekKey]??=Array.from({length:7},()=>[]);state.pinnedMeals[weekKey][index]=pins.slice(0,meals.length);while(state.pinnedMeals[weekKey][index].length<meals.length)state.pinnedMeals[weekKey][index].push(false);setRestDay(date,isRest)}
function planDaysInRange(){return rangeDates().map(date=>({date,weekKey:keyFor(mondayFor(date)),day:getPlanForDate(date)[dayIndex(date)],isRest:isRestDay(date)}))}
function calendarStateForRange(value){
  return rangeDates().map(date=>{
    const week=keyFor(mondayFor(date)),day=dayIndex(date),mealIds=value.plans?.[week]?.[day]||[],pins=value.pinnedMeals?.[week]?.[day]||[];
    return{
      date:keyFor(date),
      isRest:(value.restDays?.[week]||[]).includes(day),
      meals:mealIds.map((id,index)=>{
        const dish=(value.dishes||[]).find(item=>item.id===id);
        return{id,pinned:Boolean(pins[index]),dish:dish?{
          name:dish.name,ingredient:dish.ingredient||'Lieblingsgericht',time:dish.time||25,
          emoji:dish.emoji||emojiMap[dish.ingredient]||'🍽️',nutrition:nutritionText(dish.nutrition)
        }:null};
      })
    };
  });
}
function dishesStateForView(value){return cloudComparable(value).dishes}
function shoppingStateForView(value){return cloudComparable(value)}
function refreshVisibleView(){
  const view=savedView();
  if(view==='week'&&!sameValue(renderedCalendarSnapshot,calendarStateForRange(state)))renderCalendar();
  else if(view==='dishes'&&!sameValue(renderedDishesSnapshot,dishesStateForView(state)))renderDishes();
  else if(view==='shopping'&&!sameValue(renderedShoppingSnapshot,shoppingStateForView(state)))renderShoppingList();
}
function snapshotPlanDays(dates){return{days:dates.map(date=>({date:new Date(date),meals:getPlanForDate(date)[dayIndex(date)].slice(),pins:pinnedMealsForDate(date).slice(),isRest:isRestDay(date)})),restDays:structuredClone(state.restDays||{})}}
function restorePlanDays(snapshot){snapshot.days.forEach(day=>replaceDayPlan(day.date,day));state.restDays=structuredClone(snapshot.restDays)}
function markRestDay(dayOffset){
  const dates=rangeDates(),index=Number(dayOffset);
  if(!Number.isInteger(index)||index<0||index>=dates.length)return;
  const snapshot=snapshotPlanDays(dates),selected=snapshot.days[index];
  if(selected.isRest)return;
  if(selected.meals.length){
    for(let day=dates.length-1;day>index;day--)replaceDayPlan(dates[day],snapshot.days[day-1]);
    replaceDayPlan(dates[index],{meals:[],pins:[],isRest:true});
  }else setRestDay(dates[index],true);
  save();renderCalendar();
  if(!selected.meals.length){showToast('Als Resteabend markiert.',{actionLabel:'Rückgängig',duration:6500,onAction:()=>{restorePlanDays(snapshot);save();renderCalendar();showToast('Plan wiederhergestellt.')}});return}
  const dropped=snapshot.days[snapshot.days.length-1].meals.map(id=>state.dishes.find(dish=>dish.id===id)?.name).filter(Boolean);
  const droppedMessage=dropped.length?`${dropped.join(', ')} ${dropped.length===1?'fällt':'fallen'} am letzten Tag aus dem Plan.`:'Der letzte Tag fällt aus dem Plan.';
  showToast(`Plan um einen Tag verschoben. ${droppedMessage}`,{actionLabel:'Rückgängig',duration:6500,onAction:()=>{restorePlanDays(snapshot);save();renderCalendar();showToast('Plan wiederhergestellt.')}});
}
function ingredientKey(value){return normalizeIngredient(value).toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')}
function ingredientMatches(a,b){const forms=value=>{const key=ingredientKey(value),result=new Set([key]);if(/en$/.test(key))result.add(key.slice(0,-2));if(/n$/.test(key)||/e$/.test(key))result.add(key.slice(0,-1));return result};const first=forms(a),second=forms(b);return [...first].some(value=>value&&second.has(value))}
function availablePantryIngredients(){const values=new Map();[...(window.COMMON_INGREDIENTS||[]),...state.dishes.flatMap(dish=>dish.ingredients||[])].forEach(raw=>{const name=normalizeIngredient(raw),key=ingredientKey(name);if(name&&key&&!values.has(key))values.set(key,name)});return [...values.values()].sort((a,b)=>a.localeCompare(b,'de-DE'))}
function renderDishIngredientChips(){const chips=$('#dish-ingredient-chips');chips.replaceChildren();if(!dishIngredientDraft.length){const empty=document.createElement('p');empty.className='pantry-empty-selection';empty.textContent='Noch keine Zutaten ausgewählt.';chips.append(empty)}dishIngredientDraft.forEach(name=>{const chip=document.createElement('span');chip.className='pantry-chip';const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.type='button';remove.className='pantry-chip-remove';remove.setAttribute('aria-label',`${name} entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{dishIngredientDraft=dishIngredientDraft.filter(item=>ingredientKey(item)!==ingredientKey(name));$('#dish-ingredients').value=dishIngredientDraft.join(', ');renderDishIngredientChips();renderDishIngredientSuggestions()});chip.append(icon,label,remove);chips.append(chip)});$('#dish-ingredients').value=dishIngredientDraft.join(', ')}
function addDishIngredient(value){const name=normalizeIngredient(value);if(!name)return;if(!dishIngredientDraft.some(item=>ingredientKey(item)===ingredientKey(name)))dishIngredientDraft.push(name);$('#dish-ingredient-input').value='';renderDishIngredientChips();renderDishIngredientSuggestions();$('#dish-ingredient-input').focus({preventScroll:true})}
function renderDishIngredientSuggestions(){const input=$('#dish-ingredient-input'),list=$('#dish-ingredient-suggestions'),query=ingredientKey(input.value),selected=new Set(dishIngredientDraft.map(ingredientKey));const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)&&!selected.has(ingredientKey(name))).slice(0,60):[];renderIngredientOptions(list,matches,name=>addDishIngredient(name));input.setAttribute('aria-expanded',String(matches.length>0))}
function renderMainIngredientSuggestions(){const input=$('#dish-ingredient'),list=$('#dish-main-ingredient-suggestions'),query=ingredientKey(input.value);const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)).slice(0,8):[];renderIngredientOptions(list,matches,name=>{input.value=name;list.hidden=true;input.setAttribute('aria-expanded','false')});input.setAttribute('aria-expanded',String(matches.length>0))}
function renderIngredientOptions(list,matches,onSelect){list.replaceChildren();matches.forEach(name=>{const option=document.createElement('button');option.type='button';option.className='pantry-suggestion';option.role='option';option.setAttribute('aria-selected','false');const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;option.append(icon,label);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>onSelect(name));list.append(option)});list.hidden=!matches.length}
function addPantryIngredient(value){const name=normalizeIngredient(value);if(!name)return;const key=ingredientKey(name);if(!pantryDraft.some(item=>ingredientKey(item)===key))pantryDraft.push(name);$('#pantry-input').value='';renderPantryEditor();$('#pantry-input').focus()}
function openPantryPlanner(){const key=keyFor(mondayFor(rangeStart())),dialog=$('#pantry-dialog'),input=$('#pantry-input');pantryDraft=(state.pantryIngredients?.[key]||[]).slice();input.value='';try{if(!dialog.open)dialog.showModal();renderPantryEditor();requestAnimationFrame(()=>input.focus({preventScroll:true}))}catch(error){console.error('Wochenplan-Dialog konnte nicht geöffnet werden:',error);showToast('Der Wochenplan-Dialog konnte gerade nicht geöffnet werden. Bitte erneut versuchen.')}}
function renderPantryEditor(){const selected=$('#pantry-selected'),input=$('#pantry-input'),list=$('#pantry-suggestions'),query=ingredientKey(input.value);selected.replaceChildren();$('#pantry-selected-count').textContent=pantryDraft.length;$('#pantry-empty-selection').hidden=pantryDraft.length>0;pantryDraft.forEach(name=>{const chip=document.createElement('span');chip.className='pantry-chip';const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.type='button';remove.className='pantry-chip-remove';remove.setAttribute('aria-label',`${name} entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{pantryDraft=pantryDraft.filter(item=>ingredientKey(item)!==ingredientKey(name));renderPantryEditor()});chip.append(icon,label,remove);selected.append(chip)});const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)&&!pantryDraft.some(item=>ingredientKey(item)===ingredientKey(name))).slice(0,8):[];list.replaceChildren();matches.forEach(name=>{const option=document.createElement('button');option.type='button';option.className='pantry-suggestion';option.role='option';option.setAttribute('aria-selected','false');const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;option.append(icon,label);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>addPantryIngredient(name));list.append(option)});list.hidden=!matches.length;input.setAttribute('aria-expanded',String(matches.length>0));input.removeAttribute('aria-activedescendant')}
function makePlan(start,pantry=[],pinnedDays=new Set(),pinnedDishIds=new Set()){const dishes=state.dishes.filter(dish=>!pinnedDishIds.has(dish.id)),pool=shuffle(dishes.slice()),plan=[],prioritized=[],used=new Set();for(const item of pantry){const candidates=shuffle(pool.filter(d=>!used.has(d.id)&&(d.ingredients||[]).some(i=>ingredientMatches(item,i))));const dish=candidates[0];if(dish){prioritized.push(dish);used.add(dish.id)}}prioritized.forEach(d=>{const index=pool.findIndex(item=>item.id===d.id);if(index>=0)pool.splice(index,1)});pool.unshift(...prioritized);let last='',plannedDays=0;for(let i=0;i<7;i++){if(pinnedDays.has(i)){plan.push([]);continue}let idx=plannedDays<prioritized.length?0:pool.findIndex(d=>d.ingredient!==last);if(idx<0)idx=0;const dish=pool.splice(idx,1)[0];plan.push(dish?[dish.id]:[]);last=dish?.ingredient||'';plannedDays++;if(!pool.length)pool.push(...shuffle(dishes.slice()))}return plan}
function pantryShoppingKeys(plan,pantry){const dishes=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));return [...new Set(dishes.flatMap(d=>(d.ingredients||[]).filter(i=>pantry.some(item=>ingredientMatches(item,i))).map(i=>normalizeIngredient(i).toLocaleLowerCase('de-DE'))))]}
function replaceRangePlan(pantry){const dates=rangeDates(),plans=dates.map(date=>getPlanForDate(date)[dayIndex(date)]),pinFlags=dates.map(date=>pinnedMealsForDate(date).slice()),pinnedDays=new Set(),pinnedDishIds=new Set();pinFlags.forEach((flags,index)=>{if(flags.some(Boolean)){pinnedDays.add(index);plans[index].forEach((id,mealIndex)=>{if(flags[mealIndex])pinnedDishIds.add(id)})}});const generated=makePlan(dates[0],pantry,pinnedDays,pinnedDishIds),weekKeys=[...new Set(dates.map(date=>keyFor(mondayFor(date))))];state.shoppingChecks??={};state.pantryIngredients??={};weekKeys.forEach(weekKey=>{state.shoppingChecks[weekKey]??={};pantryShoppingKeys(state.plans[weekKey]||[],state.pantryIngredients?.[weekKey]||[]).forEach(key=>delete state.shoppingChecks[weekKey][key]);state.pantryIngredients[weekKey]=pantry.slice()});dates.forEach((date,index)=>{const weekKey=keyFor(mondayFor(date)),dayIndexValue=dayIndex(date),plan=getPlanForDate(date);if(pinnedDays.has(index)){const preserved=plans[index].filter((id,mealIndex)=>pinFlags[index][mealIndex]);plan[dayIndexValue]=preserved;state.pinnedMeals[weekKey][dayIndexValue]=preserved.map(()=>true)}else{plan[dayIndexValue]=generated[index];state.pinnedMeals[weekKey][dayIndexValue]=generated[index].map(()=>false)}setRestDay(date,false)});weekKeys.forEach(weekKey=>{const days=dates.filter(date=>keyFor(mondayFor(date))===weekKey).map(date=>getPlanForDate(date)[dayIndex(date)]);pantryShoppingKeys(days,pantry).forEach(key=>{state.shoppingChecks[weekKey][key]=true})});save()}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function formatRange(start){const end=new Date(start);end.setDate(end.getDate()+6);const opts={day:'numeric',month:'short'};const monthA=start.toLocaleDateString('de-DE',{month:'long'}),monthB=end.toLocaleDateString('de-DE',{month:'long'});return monthA===monthB?`${start.getDate()}. – ${end.getDate()}. ${monthA} ${end.getFullYear()}`:`${start.toLocaleDateString('de-DE',opts)} – ${end.toLocaleDateString('de-DE',opts)} ${end.getFullYear()}`}
function nutritionText(n){return n?`~${n.kcal} kcal · E ${n.protein} g · F ${n.fat} g · KH ${n.carbs} g / Portion`:''}
function clearMealDropPreview(drag){
  if(!drag)return;
  drag?.previewElements?.forEach(meal=>meal.classList.remove('drop-shifted'));
  drag?.previewContent?.style.removeProperty('--meal-drop-shift');
  drag.previewElements=null;drag.previewContent=null;drag.previewVisibleIndex=null;
}
function clearMealDragVisuals(drag,{keepGhost=false}={}){
  if(drag?.scrollFrame)cancelAnimationFrame(drag.scrollFrame);
  if(drag?.touchTimer)clearTimeout(drag.touchTimer);
  if(!keepGhost)drag?.ghost?.remove();
  drag?.meal?.classList.remove('is-dragging');
  drag?.meal?.removeAttribute('aria-grabbed');
  clearMealDropPreview(drag);
  const calendar=$('#calendar');
  calendar.querySelectorAll('.meal-card.drop-shifted,.add-meal.drop-shifted').forEach(meal=>meal.classList.remove('drop-shifted'));
  calendar.querySelectorAll('.day-content').forEach(content=>content.style.removeProperty('--meal-drop-shift'));
}
function cancelMealDrag(){
  const drag=mealDragState;
  if(!drag)return;
  if(drag.pointerId!==null){try{drag.meal.releasePointerCapture(drag.pointerId)}catch(error){}}
  clearMealDragVisuals(drag);mealDragState=null;
}
function createMealDragGhost(drag){
  drag.dragging=true;drag.meal.classList.add('is-dragging');drag.meal.setAttribute('aria-grabbed','true');
  const rect=drag.meal.getBoundingClientRect(),style=getComputedStyle(drag.meal);
  drag.grabOffsetX=drag.startX-rect.left;drag.grabOffsetY=drag.startY-rect.top;
  drag.ghost=drag.meal.cloneNode(true);drag.ghost.classList.remove('is-dragging');drag.ghost.classList.add('meal-drag-ghost');drag.ghost.setAttribute('aria-hidden','true');drag.ghost.querySelectorAll('button').forEach(button=>button.remove());drag.ghost.style.width=`${rect.width}px`;drag.ghost.style.height=`${rect.height}px`;drag.ghost.style.paddingTop=style.paddingTop;drag.ghost.style.background=style.background;drag.ghost.style.left=`${drag.clientX-drag.grabOffsetX}px`;drag.ghost.style.top=`${drag.clientY-drag.grabOffsetY}px`;drag.ghost.style.transformOrigin=`${drag.grabOffsetX}px ${drag.grabOffsetY}px`;document.body.append(drag.ghost);requestAnimationFrame(()=>drag.ghost?.classList.add('is-held'));
}
function updateMealDragPosition(drag,clientX,clientY){
  drag.clientX=clientX;drag.clientY=clientY;
  if(drag.ghost){drag.ghost.style.left=`${clientX-drag.grabOffsetX}px`;drag.ghost.style.top=`${clientY-drag.grabOffsetY}px`}
  updateMealDropTarget(clientX,clientY);
}
function updateMealDropTarget(clientX,clientY){
  const drag=mealDragState,calendar=$('#calendar');
  if(!drag)return;
  const hit=document.elementFromPoint(clientX,clientY),content=hit?.closest('.day-content');
  if(!content||!calendar.contains(content)){clearMealDropPreview(drag);drag.targetDay=null;return}
  const meals=[...content.querySelectorAll('.meal-card:not(.is-dragging)')],hovered=hit.closest('.meal-card');
  let visibleInsertIndex=meals.length;
  if(hovered&&meals.includes(hovered)){
    const rect=hovered.getBoundingClientRect(),index=meals.indexOf(hovered),after=clientY>=rect.top+rect.height/2;
    visibleInsertIndex=index+(after?1:0);
  }else{
    const nextIndex=meals.findIndex(meal=>clientY<meal.getBoundingClientRect().top+meal.getBoundingClientRect().height/2);
    if(nextIndex>=0)visibleInsertIndex=nextIndex;
  }
  drag.targetDay=Number(content.dataset.day);
  drag.insertIndex=visibleInsertIndex+(drag.targetDay===drag.sourceDay&&drag.mealIndex<=visibleInsertIndex?1:0);
  if(drag.previewContent===content&&drag.previewVisibleIndex===visibleInsertIndex)return;
  clearMealDropPreview(drag);
  const gap=parseFloat(getComputedStyle(content).rowGap)||8;
  content.style.setProperty('--meal-drop-shift',`${drag.meal.getBoundingClientRect().height+gap}px`);
  const addButton=content.querySelector('.add-meal');
  drag.previewElements=new Set([...meals.slice(visibleInsertIndex),addButton].filter(Boolean));
  drag.previewElements.forEach(meal=>meal.classList.add('drop-shifted'));
  drag.previewContent=content;drag.previewVisibleIndex=visibleInsertIndex;
}
function autoScrollMealDrag(){
  const drag=mealDragState;
  if(!drag?.dragging)return;
  const edge=72,maximum=14,y=drag.clientY;
  let speed=0;
  if(y<edge)speed=-Math.ceil(maximum*(edge-y)/edge);
  else if(y>window.innerHeight-edge)speed=Math.ceil(maximum*(y-(window.innerHeight-edge))/edge);
  if(speed)window.scrollBy(0,speed);
  updateMealDropTarget(drag.clientX,drag.clientY);
  drag.scrollFrame=requestAnimationFrame(autoScrollMealDrag);
}
function startMealPointerDrag(event){
  const meal=event.target.closest?.('.meal-card');
  if(!meal||mealDragState||event.target.closest?.('.meal-remove,.meal-pin')||event.pointerType==='touch'||event.pointerType==='mouse'&&event.button!==0)return;
  const content=meal.closest('.day-content');
  if(!content)return;
  event.preventDefault();
  mealDragState={pointerId:event.pointerId,meal,mealIndex:Number(meal.dataset.mealIndex),dishId:meal.dataset.dishId,sourceDay:Number(content.dataset.day),targetDay:null,insertIndex:0,startX:event.clientX,startY:event.clientY,clientX:event.clientX,clientY:event.clientY,dragging:false,ghost:null,scrollFrame:0};
  try{meal.setPointerCapture(event.pointerId)}catch(error){}
}
function moveMealPointerDrag(event){
  const drag=mealDragState;
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(!drag.dragging){
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<8)return;
    createMealDragGhost(drag);drag.scrollFrame=requestAnimationFrame(autoScrollMealDrag);
  }
  event.preventDefault();updateMealDragPosition(drag,event.clientX,event.clientY);
}
function startMealTouchDrag(event){
  // iOS may suspend a home-screen app before touchend arrives. Drop an old
  // gesture before processing the next tap so it cannot consume that tap.
  if(mealDragState)cancelMealDrag();
  if(event.touches.length!==1||event.target.closest?.('.meal-remove,.meal-pin,.add-meal,.day-rest-action'))return;
  const meal=event.target.closest?.('.meal-card'),content=meal?.closest('.day-content');
  if(!meal||!content)return;
  const touch=event.touches[0],drag={pointerId:null,touchGesture:true,meal,mealIndex:Number(meal.dataset.mealIndex),dishId:meal.dataset.dishId,sourceDay:Number(content.dataset.day),targetDay:null,insertIndex:0,startX:touch.clientX,startY:touch.clientY,clientX:touch.clientX,clientY:touch.clientY,dragging:false,ghost:null,scrollFrame:0,touchTimer:0};
  mealDragState=drag;
  drag.touchTimer=setTimeout(()=>{
    if(mealDragState!==drag)return;
    createMealDragGhost(drag);drag.scrollFrame=requestAnimationFrame(autoScrollMealDrag);
  },320);
}
function moveMealTouchDrag(event){
  const drag=mealDragState;
  if(!drag?.touchGesture)return;
  if(event.touches.length!==1){cancelMealTouchDrag();return}
  const touch=event.touches[0];drag.clientX=touch.clientX;drag.clientY=touch.clientY;
  if(!drag.dragging){
    if(Math.hypot(touch.clientX-drag.startX,touch.clientY-drag.startY)>10){clearMealDragVisuals(drag);mealDragState=null}
    return;
  }
  if(event.cancelable)event.preventDefault();
  updateMealDragPosition(drag,touch.clientX,touch.clientY);
}
function moveMealToDropTarget(drag){
  if(drag.targetDay===null)return null;
  const dates=rangeDates(),sourceDate=dates[drag.sourceDay],destinationDate=dates[drag.targetDay];
  if(!sourceDate||!destinationDate)return null;
  const sourcePlan=getPlanForDate(sourceDate)[dayIndex(sourceDate)],destinationPlan=getPlanForDate(destinationDate)[dayIndex(destinationDate)],sourcePins=pinnedMealsForDate(sourceDate),destinationPins=pinnedMealsForDate(destinationDate);
  let sourceIndex=drag.mealIndex;
  if(sourcePlan[sourceIndex]!==drag.dishId)sourceIndex=sourcePlan.indexOf(drag.dishId);
  if(sourceIndex<0)return null;
  let insertIndex=Math.max(0,Math.min(drag.insertIndex,destinationPlan.length));
  if(sourcePlan===destinationPlan&&sourceIndex<insertIndex)insertIndex--;
  if(sourcePlan===destinationPlan&&sourceIndex===insertIndex)return null;
  const [dishId]=sourcePlan.splice(sourceIndex,1),[isPinned]=sourcePins.splice(sourceIndex,1),finalIndex=Math.max(0,Math.min(insertIndex,destinationPlan.length));
  destinationPlan.splice(finalIndex,0,dishId);destinationPins.splice(finalIndex,0,isPinned);
  setRestDay(destinationDate,false);
  return {date:destinationDate,day:drag.targetDay,mealIndex:finalIndex,dishId};
}
function animateMealDrop(ghost,destination){
  if(!ghost)return;
  const target=$(`#calendar .day-content[data-day="${destination.day}"] .meal-card[data-meal-index="${destination.mealIndex}"]`);
  if(!target||window.matchMedia('(prefers-reduced-motion: reduce)').matches){ghost.remove();return}
  const rect=target.getBoundingClientRect();
  ghost.classList.add('is-landing');
  requestAnimationFrame(()=>{ghost.style.left=`${rect.left}px`;ghost.style.top=`${rect.top}px`});
  setTimeout(()=>{ghost.classList.add('is-settling');setTimeout(()=>ghost.remove(),100)},250);
}
function finishMealDrop(drag,cancelled=false){
  if(drag.dragging&&!cancelled)updateMealDropTarget(drag.clientX,drag.clientY);
  const destination=drag.dragging&&!cancelled?moveMealToDropTarget(drag):null,dish=state.dishes.find(item=>item.id===drag.dishId);
  clearMealDragVisuals(drag,{keepGhost:Boolean(destination)});mealDragState=null;
  if(destination){save();renderCalendar({droppedMeal:destination});animateMealDrop(drag.ghost,destination);const weekday=destination.date.toLocaleDateString('de-DE',{weekday:'long'});showToast(`${dish?.name||'Gericht'} auf ${weekday[0].toLocaleUpperCase('de-DE')}${weekday.slice(1)} verschoben.`)}
}
function finishMealPointerDrag(event,cancelled=false){
  const drag=mealDragState;
  if(!drag||drag.pointerId===null||event.pointerId!==drag.pointerId)return;
  drag.clientX=event.clientX;drag.clientY=event.clientY;
  if(drag.dragging&&drag.ghost){drag.ghost.style.left=`${event.clientX-drag.grabOffsetX}px`;drag.ghost.style.top=`${event.clientY-drag.grabOffsetY}px`}
  finishMealDrop(drag,cancelled);
}
function finishMealTouchDrag(event,cancelled=false){
  const drag=mealDragState;
  if(!drag?.touchGesture)return;
  const touch=event.changedTouches?.[0];
  if(touch){drag.clientX=touch.clientX;drag.clientY=touch.clientY;if(drag.dragging&&drag.ghost){drag.ghost.style.left=`${touch.clientX-drag.grabOffsetX}px`;drag.ghost.style.top=`${touch.clientY-drag.grabOffsetY}px`}}
  finishMealDrop(drag,cancelled);
}
function cancelMealTouchDrag(){
  const drag=mealDragState;
  if(!drag?.touchGesture)return;
  cancelMealDrag();
}
function renderCalendarContent({shuffleAnimation=false,droppedMeal=null}={}){
  const start=rangeStart(),days=planDaysInRange(),planned=days.reduce((n,item)=>n+item.day.length,0);
  $('#week-date').textContent=formatRange(start);$('#heading-period').textContent=`· ${start.toLocaleDateString('de-DE',{month:'long',year:'numeric'})}`;$('#nav-count').textContent=planned;$('#plan-meta').textContent=`${planned} ${planned===1?'Kochidee':'Kochideen'} geplant`;
  const today=keyFor(new Date()),grid=$('#calendar');grid.innerHTML='';
  days.forEach(({date,day,isRest},i)=>{
    const isToday=keyFor(date)===today,card=document.createElement('article');card.className='day-card'+(isToday?' today':'')+(isRest?' is-rest-day':'')+(shuffleAnimation?' shuffle-in':'');
    if(shuffleAnimation)card.style.setProperty('--shuffle-index',i);
    card.innerHTML=`<div class="day-head"><div><div class="day-name">${shortDays[dayIndex(date)]}</div><div class="day-num">${date.getDate()} <span style="font:400 10px var(--sans);color:#a0a79e">${date.toLocaleDateString('de-DE',{month:'short'})}</span></div></div>${isToday?'<span class="today-pill">Heute</span>':''}</div><div class="day-content" data-day="${i}"></div>`;
    const content=card.querySelector('.day-content'),pinned=pinnedMealsForDate(date);
    if(isRest){
      const restCard=document.createElement('div');restCard.className='rest-day-tile';restCard.innerHTML='<span class="rest-day-icon" aria-hidden="true">🥡</span><span class="rest-day-copy"><strong>Reste</strong><small></small></span>';
      restCard.querySelector('.rest-day-copy small').textContent=isToday?'Heute bleibt die Küche kalt.':'Kein Kochen geplant.';content.append(restCard);
    }
    day.forEach((id,j)=>{
      const dish=state.dishes.find(item=>item.id===id);if(!dish)return;
      const isPinned=Boolean(pinned[j]),wasDropped=droppedMeal?.day===i&&droppedMeal.mealIndex===j,meal=document.createElement('div');meal.className='meal-card'+(isPinned?' is-pinned':'')+(wasDropped?' just-dropped':'');meal.dataset.mealIndex=j;meal.dataset.dishId=id;
      meal.innerHTML=`<div class="meal-actions"><button type="button" class="meal-pin" aria-label="${isPinned?'Gericht nicht mehr fixieren':'Gericht fixieren'}" aria-pressed="${isPinned}"><svg class="meal-pin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 2H8v2l1 1v5.17L5.59 14.6A2 2 0 0 0 7 18h4v4h2v-4h4a2 2 0 0 0 1.41-3.4L15 10.17V5l1-1V2z"/></svg></button><button type="button" class="meal-remove" aria-label="Gericht entfernen">×</button></div><div class="meal-title"><span class="meal-icon"></span><div class="meal-name"></div></div><div class="meal-meta"><span>◷ ${dish.time||25} min</span><span class="dot">·</span><span>${dish.ingredient||'Lieblingsgericht'}</span></div><div class="meal-nutrition"></div>`;
      meal.querySelector('.meal-icon').textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';meal.querySelector('.meal-name').textContent=dish.name;meal.querySelector('.meal-nutrition').textContent=nutritionText(dish.nutrition);meal.querySelector('.meal-nutrition').hidden=!dish.nutrition;
      meal.querySelector('.meal-pin').addEventListener('click',event=>{event.stopPropagation();cancelMealDrag();pinned[j]=!pinned[j];save();renderCalendar()});
      meal.querySelector('.meal-remove').addEventListener('click',event=>{event.stopPropagation();cancelMealDrag();day.splice(j,1);pinned.splice(j,1);save();renderCalendar()});content.append(meal);
    });
    if(!isRest){const restAction=document.createElement('button');restAction.type='button';restAction.className='day-rest-action';restAction.innerHTML='<span class="day-rest-action-icon" aria-hidden="true">🥡</span><span>Reste</span>';restAction.setAttribute('aria-label',`Resteabend für ${date.toLocaleDateString('de-DE',{weekday:'long'})} markieren${day.length?', den Plan um einen Tag verschieben':''}`);restAction.title=day.length?'Resteabend eintragen und den Folgeplan weiterschieben':'Als Resteabend markieren';restAction.addEventListener('click',()=>markRestDay(i));content.append(restAction)}
    const add=document.createElement('button');add.type='button';add.className='add-meal';add.textContent=isRest?'＋ Gericht statt Reste eintragen':'＋ Gericht eintragen';add.addEventListener('click',()=>{cancelMealDrag();chooseDish(i)});content.append(add);grid.append(card);
  });
  save({sync:false});$('#bottom-note').classList.toggle('hidden',state.noteHidden);updateShoppingNavCount();
}
function renderCalendar(options){renderCalendarContent(options);renderedCalendarSnapshot=calendarStateForRange(state)}
const mealCalendar=$('#calendar');
mealCalendar.addEventListener('pointerdown',startMealPointerDrag);
mealCalendar.addEventListener('pointerup',finishMealPointerDrag);
mealCalendar.addEventListener('pointercancel',event=>finishMealPointerDrag(event,true));
mealCalendar.addEventListener('touchstart',startMealTouchDrag,{passive:true});
mealCalendar.addEventListener('touchmove',moveMealTouchDrag,{passive:false});
mealCalendar.addEventListener('touchend',finishMealTouchDrag);
mealCalendar.addEventListener('touchcancel',event=>finishMealTouchDrag(event,true));
mealCalendar.addEventListener('contextmenu',event=>{if(event.target.closest?.('.meal-card'))event.preventDefault()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelMealDrag()});
window.addEventListener('pagehide',cancelMealDrag);
window.addEventListener('pointermove',moveMealPointerDrag,{passive:false});
window.addEventListener('pointerup',finishMealPointerDrag);
window.addEventListener('pointercancel',event=>finishMealPointerDrag(event,true));
function renderDishesContent(){const q=$('#search-dishes').value.trim().toLowerCase(),list=$('#dish-list');list.innerHTML='';const dishes=state.dishes.filter(d=>d.name.toLowerCase().includes(q)||String(d.ingredient||'').toLowerCase().includes(q)||(d.ingredients||[]).some(i=>i.toLowerCase().includes(q)));if(!dishes.length){list.innerHTML='<div class="empty-state"><b>Keine Gerichte gefunden.</b>Ändere die Suche oder füge ein Gericht hinzu.</div>';return}dishes.forEach(d=>{const row=document.createElement('div');row.className='dish-row';row.innerHTML=`<div class="dish-icon">${d.emoji||emojiMap[d.ingredient]||'🍽️'}</div><div class="dish-copy"><b></b><small>◷ ${d.time||25} Min. <span style="padding:0 5px;color:#d0d5cc">·</span> ${d.ingredient||'Ohne Angabe'}</small><small class="dish-nutrition"></small><small class="dish-ingredients-preview"></small></div><span class="dish-tag">${d.ingredient||'Ohne Kategorie'}</span><button class="row-edit" aria-label="Bearbeiten">···</button>`;row.querySelector('.dish-copy b').textContent=d.name;row.querySelector('.dish-nutrition').textContent=nutritionText(d.nutrition);row.querySelector('.dish-nutrition').hidden=!d.nutrition;row.querySelector('.dish-ingredients-preview').textContent=(d.ingredients||[]).join(' · ')||'Noch keine Zutaten';row.querySelector('.row-edit').addEventListener('click',()=>openDish(d.id));row.addEventListener('dblclick',()=>openDish(d.id));list.append(row)})}
function renderDishes(){renderDishesContent();renderedDishesSnapshot=dishesStateForView(state)}
function showToast(text,{actionLabel='',onAction=null,duration=2600}={}){const t=$('#toast'),message=document.createElement('span');t.replaceChildren();t.classList.toggle('has-action',Boolean(actionLabel&&onAction));message.className='toast-message';message.textContent=text;t.append(message);if(actionLabel&&onAction){const action=document.createElement('button');action.type='button';action.className='toast-action';action.textContent=actionLabel;action.addEventListener('click',()=>{clearTimeout(toastTimer);t.classList.remove('show','has-action');onAction()});t.append(action)}t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show','has-action'),duration)}
function openDish(id=''){const d=state.dishes.find(x=>x.id===id),minutes=Number(d?.time)||30;let timeIndex=0;for(let i=1;i<timeBlocks.length;i++){if(Math.abs(timeBlocks[i]-minutes)<Math.abs(timeBlocks[timeIndex]-minutes))timeIndex=i}$('#dish-id').value=id;$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-name').value=d?.name||'';$('#dish-ingredient').value=d?.ingredient||'';$('#dish-main-ingredient-suggestions').hidden=true;dishIngredientDraft=(d?.ingredients||[]).slice();$('#dish-ingredient-input').value='';renderDishIngredientChips();renderDishIngredientSuggestions();$('#dish-time').value=timeIndex;$('#dish-time-output').textContent=`${timeBlocks[timeIndex]} Min.`;$('#dialog-title').textContent=d?'Gericht bearbeiten':'Gericht hinzufügen';$('#delete-dish').hidden=!d;$('#dish-dialog').showModal();setTimeout(()=>$('#dish-name').focus(),30)}
function normalizeIngredient(value){return value.trim().replace(/\s+/g,' ')}
function dishFingerprint(name,ingredient,ingredients){const normalizedName=name.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');const normalizedIngredients=[...new Set((ingredients||[]).map(normalizeIngredient).filter(Boolean).map(value=>value.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'')).filter(Boolean))].sort();return `${normalizedName}|${String(ingredient||'').toLocaleLowerCase('de-DE').trim()}|${normalizedIngredients.join(',')}`}
function ingredientIcon(name){const value=name.toLocaleLowerCase('de-DE');if(/saft|limonade|cola|wasser|sprudel|bier|wein|getränk/.test(value))return /bier/.test(value)?'🍺':/wein/.test(value)?'🍷':/wasser|sprudel/.test(value)?'💧':'🥤';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|zahnpasta/.test(value))return '🧴';if(/toilettenpapier|küchenrolle|taschentuch/.test(value))return '🧻';if(/hundefutter|katzenfutter|tierfutter|katzenstreu/.test(value))return '🐾';const icons=[[/paprika/,'🫑'],[/salat|kopfsalat|eisberg/,'🥬'],[/karotte|möhre/,'🥕'],[/brokkoli/,'🥦'],[/tomat/,'🍅'],[/gurke|zucchini/,'🥒'],[/zwiebel|lauch/,'🧅'],[/sellerie|spinat|kohl/,'🥬'],[/pilz|champignon/,'🍄'],[/knoblauch/,'🧄'],[/avocado/,'🥑'],[/kartoffel|pommes/,'🥔'],[/apfel/,'🍎'],[/birne/,'🍐'],[/banane/,'🍌'],[/orange/,'🍊'],[/zitrone|limette/,'🍋'],[/erdbeer/,'🍓'],[/himbeer|beere|blaubeer/,'🫐'],[/traube/,'🍇'],[/mango/,'🥭'],[/kaffee/,'☕'],[/tee/,'🫖'],[/wasser|sprudel/,'💧'],[/saft|limonade|cola|getränk/,'🥤'],[/bier/,'🍺'],[/wein/,'🍷'],[/reis|nudel|spaghetti|pasta/,'🍝'],[/prosciutto|speck/,'🥓'],[/wurst|würstchen/,'🌭'],[/hühnchen|hähnchen|chicken/,'🍗'],[/hackfleisch|fleisch|rind|schwein/,'🥩'],[/fisch|lachs|filet/,'🐟'],[/käse|mozzarella/,'🧀'],[/milch/,'🥛'],[/joghurt|schmand|soße|sauce/,'🥣'],[/brot|brötchen|baguette|toast|wrap|teig/,'🥖'],[/ei$|eier/,'🥚'],[/öl|olivenöl/,'🫒'],[/mehl|getreide/,'🌾'],[/honig/,'🍯'],[/dose|konserve/,'🥫'],[/gewürz|salz|pfeffer/,'🧂'],[/zucker|bonbon|schokolade/,'🍬'],[/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel/,'🧴'],[/toilettenpapier|küchenrolle|taschentuch/,'🧻'],[/müllbeutel|müllsack/,'🗑️'],[/hundefutter|katzenfutter|tierfutter|katzenstreu/,'🐾']];return icons.find(([pattern])=>pattern.test(value))?.[1]||'🛒'}
function ingredientCategory(name){const value=name.toLocaleLowerCase('de-DE');if(/orangensaft|apfelsaft|saft|limonade|cola|wasser|sprudel|bier|wein|getränk/.test(value))return 'Getränke';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|toilettenpapier|küchenrolle|taschentuch|müllbeutel|müllsack|schwamm|zahnpasta|windel/.test(value))return 'Drogerie & Haushalt';if(/hundefutter|katzenfutter|tierfutter|katzenstreu/.test(value))return 'Tierbedarf';if(/tomatensoße|tomatensauce|passierte tomaten/.test(value))return 'Vorrat';if(/apfel|birne|banane|orange|zitrone|limette|beere|erdbeer|himbeer|blaubeer|traube|mango|obst/.test(value))return 'Obst';if(/tomat|paprika|karotte|möhre|brokkoli|zucchini|gurke|salat|gemüse|zwiebel|sellerie|lauch|kohl|spinat|pilz|champignon|kartoffel|knoblauch|avocado/.test(value))return 'Gemüse';if(/brot|brötchen|baguette|toast|wrap|pizzateig|teig/.test(value))return 'Brot & Backwaren';if(/hühnchen|hähnchen|chicken|fleisch|hackfleisch|rind|schwein|würstchen|wurst|prosciutto|speck|fisch|lachs|filet/.test(value))return 'Fleisch & Fisch';if(/milch|käse|mozzarella|joghurt|schmand|quark|sahne|butter|ei$|eier/.test(value))return 'Kühlregal';if(/pommes|tiefkühl|tk-|gefroren/.test(value))return 'Tiefkühl';if(/wasser|sprudel|saft|limonade|cola|getränk|bier|wein/.test(value))return 'Getränke';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|toilettenpapier|küchenrolle|taschentuch|müllbeutel|müllsack|schwamm|zahnpasta/.test(value))return 'Drogerie & Haushalt';if(/reis|nudel|spaghetti|pasta|mehl|öl|essig|dose|konserve|passierte tomaten|tomatensoße|tomatensauce|gewürz|salz|zucker|brühe|kaffee|tee|müsli|haferflocken|honig|schokolade/.test(value))return 'Vorrat';return 'Sonstiges'}
function updateShoppingNavCount(){
  const days=planDaysInRange(),weekKeys=[...new Set(days.map(item=>item.weekKey))],selected=days.flatMap(({weekKey,day})=>day.map(id=>({dish:state.dishes.find(d=>d.id===id),weekKey})).filter(item=>item.dish)),items=new Map();
  state.shoppingChecks??={};state.manualShoppingItems??={};
  selected.forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(!name)return;const key=name.toLocaleLowerCase('de-DE');if(!items.has(key))items.set(key,{name,dishes:new Set(),weekKeys:new Set()});const item=items.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey)}));
  [...new Set(weekKeys.flatMap(weekKey=>state.manualShoppingItems[weekKey]||[]))].forEach(name=>{const key=name.toLocaleLowerCase('de-DE');if(!items.has(key))items.set(key,{name,dishes:new Set(),weekKeys:new Set()});const item=items.get(key);selected.filter(({dish})=>(dish.ingredients||[]).some(raw=>normalizeIngredient(raw).toLocaleLowerCase('de-DE')===key)).forEach(({dish})=>item.dishes.add(dish.name));weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>itemName.toLocaleLowerCase('de-DE')===key)).forEach(weekKey=>item.weekKeys.add(weekKey))});
  const openCount=[...items.values()].filter(item=>{const key=item.name.toLocaleLowerCase('de-DE'),checkKey=item.dishes.size?key:`manual:${key}`,relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;return !relevantWeeks.every(weekKey=>Boolean(state.shoppingChecks[weekKey]?.[checkKey]))}).length;
  $('#shopping-nav-count').textContent=openCount;
  $('#shopping-nav-count').parentElement.setAttribute('aria-label',`Einkaufszettel, ${openCount} offene Artikel`);
}
function renderShoppingListContent(){
  const start=rangeStart(),days=planDaysInRange(),weekKeys=[...new Set(days.map(item=>item.weekKey))],selected=days.flatMap(({weekKey,day})=>day.map(id=>({dish:state.dishes.find(d=>d.id===id),weekKey})).filter(item=>item.dish));
  state.shoppingChecks??={};state.manualShoppingItems??={};
  const filterSelect=$('#shopping-meal-filter'),previousFilter=filterSelect.value,mealNames=[...new Set(selected.map(item=>item.dish.name))].sort((a,b)=>a.localeCompare(b,'de')),manualItems=[...new Set(weekKeys.flatMap(weekKey=>state.manualShoppingItems[weekKey]||[]))];
  $('#shopping-period').textContent=formatRange(start);filterSelect.replaceChildren(new Option('Alle Mahlzeiten',''));
  if(mealNames.length){const dishesGroup=document.createElement('optgroup');dishesGroup.label='Gerichte';mealNames.forEach(name=>dishesGroup.append(new Option(name,name)));filterSelect.append(dishesGroup)}
  if(manualItems.length){const manualGroup=document.createElement('optgroup');manualGroup.label='Manuelle Eingaben';manualGroup.append(new Option('Keinem Gericht zugeordnet','__manual__'));filterSelect.append(manualGroup)}
  filterSelect.value=mealNames.includes(previousFilter)||previousFilter==='__manual__'&&manualItems.length?previousFilter:'';
  const activeFilter=filterSelect.value,visible=activeFilter==='__manual__'?[]:activeFilter?selected.filter(({dish})=>dish.name===activeFilter):selected,counts=new Map();
  $('#shopping-overview').classList.toggle('hidden',!activeFilter);
  visible.forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(name){const key=name.toLocaleLowerCase('de-DE');if(!counts.has(key))counts.set(key,{name,dishes:new Set(),manual:false,weekKeys:new Set()});const item=counts.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey)}}));
  if(!activeFilter||activeFilter==='__manual__')manualItems.forEach(name=>{const key=name.toLocaleLowerCase('de-DE'),relatedDishes=new Set(selected.filter(({dish})=>(dish.ingredients||[]).some(raw=>normalizeIngredient(raw).toLocaleLowerCase('de-DE')===key)).map(({dish})=>dish.name));if(!counts.has(key))counts.set(key,{name,dishes:relatedDishes,manual:true,weekKeys:new Set()});const item=counts.get(key);item.manual=true;weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>itemName.toLocaleLowerCase('de-DE')===key)).forEach(weekKey=>item.weekKeys.add(weekKey))});
  const open=$('#shopping-open'),done=$('#shopping-done'),empty=$('#shopping-empty');open.replaceChildren();done.replaceChildren();empty.classList.toggle('hidden',counts.size>0);empty.textContent=activeFilter==='__manual__'?'Noch keine manuellen Artikel hinzugefügt.':activeFilter?'Für dieses Gericht sind keine Zutaten eingetragen.':selected.length?'Für die geplanten Gerichte sind keine Zutaten eingetragen.':'Für diese 7 Tage sind keine Gerichte geplant. Du kannst unten eigene Artikel hinzufügen.';
  const categoryOrder=['Gemüse','Obst','Brot & Backwaren','Fleisch & Fisch','Kühlregal','Tiefkühl','Getränke','Vorrat','Drogerie & Haushalt','Tierbedarf','Sonstiges'],grouped=new Map();
  for(const item of counts.values()){const category=ingredientCategory(item.name);if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(item)}
  for(const category of categoryOrder){const items=grouped.get(category);if(!items?.length)continue;for(const container of [open,done]){const categoryItems=items.filter(item=>{const key=item.name.toLocaleLowerCase('de-DE'),checkKey=item.dishes.size?key:`manual:${key}`,relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;return relevantWeeks.every(weekKey=>Boolean(state.shoppingChecks[weekKey]?.[checkKey]))===(container===done)});if(!categoryItems.length)continue;const heading=document.createElement('h3');heading.className='shopping-category-title';heading.textContent=category;container.append(heading);
    for(const item of categoryItems.sort((a,b)=>a.name.localeCompare(b.name,'de'))){const {name,dishes,manual,weekKeys:itemWeekKeys}=item,key=name.toLocaleLowerCase('de-DE'),checked=container===done,checkKey=dishes.size?key:`manual:${key}`,relevantWeeks=itemWeekKeys.size?[...itemWeekKeys]:weekKeys,shell=document.createElement('div'),tile=document.createElement('button');shell.className='shopping-tile-shell';tile.type='button';tile.className=`shopping-tile${checked?' is-checked':''}`;tile.setAttribute('aria-pressed',String(checked));tile.dataset.ingredient=key;tile.innerHTML=`<span class="shopping-tile-icon" aria-hidden="true">${ingredientIcon(name)}</span><span class="shopping-tile-copy"><strong></strong><small></small></span>${checked?'<span class="shopping-tile-status" aria-label="Eingekauft">✓</span>':''}`;tile.querySelector('strong').textContent=name;tile.querySelector('small').textContent=dishes.size?[...dishes].join(', ')+(manual?' · Manuelle Eingabe':''):'Keinem Gericht zugeordnet';
      tile.addEventListener('click',()=>{const checking=!checked;tile.classList.add(checking?'is-completing':'is-unchecking');setTimeout(()=>{relevantWeeks.forEach(weekKey=>{state.shoppingChecks[weekKey]??={};if(checking)state.shoppingChecks[weekKey][checkKey]=true;else delete state.shoppingChecks[weekKey][checkKey];if(!Object.keys(state.shoppingChecks[weekKey]).length)delete state.shoppingChecks[weekKey]});save();renderShoppingList();const target=[...document.querySelectorAll(`#shopping-${checking?'done':'open'} .shopping-tile`)].find(candidate=>candidate.dataset.ingredient===key);target?.classList.add(checking?'just-checked':'just-unchecked')},180)});
      shell.append(tile);const quantity=document.createElement('div');quantity.className='shopping-quantity';quantity.setAttribute('aria-label',`Menge für ${name}`);const currentQuantity=Math.max(1,Number(state.shoppingQuantities?.[key])||1);const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label',`${name}: Menge verringern`);minus.disabled=currentQuantity<=1;const amount=document.createElement('output');amount.textContent=currentQuantity;amount.setAttribute('aria-live','polite');const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label',`${name}: Menge erhöhen`);[minus,plus].forEach(button=>button.addEventListener('click',()=>{const next=Math.max(1,currentQuantity+(button===plus?1:-1));state.shoppingQuantities??={};state.shoppingQuantities[key]=next;save();renderShoppingList()}));quantity.append(minus,amount,plus);shell.append(quantity);if(manual){const remove=document.createElement('button');remove.type='button';remove.className='shopping-tile-remove';remove.setAttribute('aria-label',`${name} aus dem Einkaufszettel entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{relevantWeeks.forEach(weekKey=>{const remaining=(state.manualShoppingItems[weekKey]||[]).filter(itemName=>itemName.toLocaleLowerCase('de-DE')!==key);if(remaining.length)state.manualShoppingItems[weekKey]=remaining;else delete state.manualShoppingItems[weekKey];if(!dishes.size)delete state.shoppingChecks[weekKey]?.[checkKey];if(!Object.keys(state.shoppingChecks[weekKey]||{}).length)delete state.shoppingChecks[weekKey]});save();renderShoppingList()});shell.append(remove)}container.append(shell)
    }
  }}
  $('#shopping-open-count').textContent=`(${open.querySelectorAll('.shopping-tile').length})`;$('#shopping-done-count').textContent=`(${done.querySelectorAll('.shopping-tile').length})`;updateShoppingNavCount();save({sync:false})
}
function renderShoppingList(){renderShoppingListContent();renderedShoppingSnapshot=shoppingStateForView(state)}
function openShoppingList(){setView('shopping');renderShoppingList()}
function chooseDish(day){
  const targetDate=rangeDates()[day],list=$('#choose-dish-list'),search=$('#choose-dish-search');
  list.replaceChildren();search.value='';
  if(!state.dishes.length){
    const message=document.createElement('p');message.className='empty-state';message.textContent='Noch keine Gerichte vorhanden.';
    const add=document.createElement('button');add.type='button';add.className='primary-button';add.textContent='Gericht hinzufügen';
    add.addEventListener('click',()=>{$('#choose-dialog').close();openDish()});list.append(message,add);search.hidden=true;
  }else{
    search.hidden=false;
    const dishes=[...state.dishes].sort((a,b)=>a.name.localeCompare(b.name,'de-DE',{sensitivity:'base'})),entries=[];
    dishes.forEach(d=>{
      const button=document.createElement('button');button.type='button';button.className='choose-item';
      const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=d.emoji||emojiMap[d.ingredient]||'🍽️';
      const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=d.name;
      const details=document.createElement('small');details.textContent=`${d.time||25} Min. · ${d.ingredient||'Ohne Kategorie'}`;
      copy.append(name,details);button.append(icon,copy);
      button.addEventListener('click',()=>{getPlanForDate(targetDate)[dayIndex(targetDate)].push(d.id);pinnedMealsForDate(targetDate).push(false);setRestDay(targetDate,false);save();$('#choose-dialog').close();renderCalendar()});
      entries.push({dish:d,button});
    });
    const empty=document.createElement('p');empty.className='empty-state choose-no-results';empty.hidden=true;empty.textContent='Keine passenden Gerichte gefunden.';
    list.append(...entries.map(entry=>entry.button),empty);
    const filter=()=>{const query=search.value.trim().toLocaleLowerCase('de-DE');let visible=0;for(const {dish,button} of entries){const haystack=[dish.name,dish.ingredient,...(dish.ingredients||[])].join(' ').toLocaleLowerCase('de-DE'),match=haystack.includes(query);button.hidden=!match;if(match)visible++}empty.hidden=visible>0};
    search.oninput=filter;
  }
  const dialog=$('#choose-dialog');if(!dialog.open)dialog.showModal();
}
function showCatalogFeedback(text){const feedback=$('#catalog-feedback');feedback.textContent=text;feedback.hidden=false}
async function adoptCatalogDishes(dishes){const existingNames=new Set(state.dishes.map(d=>d.name.toLocaleLowerCase('de-DE'))),pending=dishes.filter(d=>!existingNames.has(d.name.toLocaleLowerCase('de-DE')));if(!pending.length){showCatalogFeedback('Alle Standardgerichte sind bereits übernommen.');return}const button=$('#catalog-add-all');button.disabled=true;button.textContent='Wird übernommen …';let added=0;try{for(const dish of pending){const {error}=await authClient.rpc('add_catalog_dish_to_household',{catalog_id:dish.id});if(error)throw error;added++}const cloud=await readStateFromCloud();state=cloud.state;save({sync:false});renderDishes();renderCalendar();showCatalogFeedback(`${added} ${added===1?'Gericht':'Gerichte'} übernommen.`);openCatalog()}catch(error){console.error('Standardgerichte konnten nicht vollständig übernommen werden:',error);showCatalogFeedback(`${added} übernommen, danach Fehler: ${error.message||'Unbekannter Fehler'}`);button.disabled=false;button.textContent='Alles übernehmen'}}
async function openCatalog(){const dialog=$('#catalog-dialog'),list=$('#catalog-list'),search=$('#catalog-search');$('#catalog-feedback').hidden=true;search.value='';list.innerHTML='<p class="empty-state">Standardkatalog wird geladen …</p>';if(!dialog.open)dialog.showModal();try{if(!authClient)throw new Error('Supabase ist nicht initialisiert.');const {data,error}=await authClient.from('catalog_dishes').select('*');if(error)throw error;const dishes=(data||[]).sort((a,b)=>(a.name||'').localeCompare(b.name||'','de-DE',{sensitivity:'base'}));list.replaceChildren();const ownNames=new Set(state.dishes.map(d=>d.name.toLocaleLowerCase('de-DE'))),addAll=$('#catalog-add-all'),available=dishes.filter(d=>!ownNames.has(d.name.toLocaleLowerCase('de-DE'))).length;addAll.disabled=!available;addAll.textContent=available?'Alles übernehmen':'Alles bereits übernommen';addAll.onclick=()=>adoptCatalogDishes(dishes);const entries=[];dishes.forEach(d=>{const button=document.createElement('button');button.type='button';button.className='choose-item';const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=d.emoji||emojiMap[d.ingredient]||'🍽️';const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=d.name;const details=document.createElement('small');details.textContent=ownNames.has(d.name.toLocaleLowerCase('de-DE'))?'Bereits hinzugefügt':`${d.ingredient||'Ohne Kategorie'} · ${d.cooking_time_minutes||30} Min.`;copy.append(name,details);button.append(icon,copy);button.disabled=ownNames.has(d.name.toLocaleLowerCase('de-DE'));button.addEventListener('click',async()=>{button.disabled=true;try{const result=await authClient.rpc('add_catalog_dish_to_household',{catalog_id:d.id});if(result.error)throw result.error;const cloud=await readStateFromCloud();state=cloud.state;save({sync:false});renderDishes();renderCalendar();details.textContent='Bereits hinzugefügt';showCatalogFeedback(`${d.name} wurde hinzugefügt.`)}catch(error){console.error('Kataloggericht konnte nicht übernommen werden:',error);showCatalogFeedback(`${d.name} konnte nicht übernommen werden: ${error.message||'Unbekannter Datenbankfehler'}`);button.disabled=false}});entries.push({dish:d,button})});const empty=document.createElement('p');empty.className='empty-state catalog-no-results';empty.hidden=true;empty.textContent='Keine passenden Gerichte gefunden.';list.append(...entries.map(entry=>entry.button),empty);const filterCatalog=()=>{const query=search.value.trim().toLocaleLowerCase('de-DE');let visible=0;for(const {dish,button} of entries){const match=dish.name.toLocaleLowerCase('de-DE').includes(query);button.hidden=!match;if(match)visible++}empty.hidden=visible>0||!entries.length};filterCatalog();if(!dishes.length){list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Der Standardkatalog ist noch leer.';list.append(message)}}catch(error){console.error('Standardkatalog konnte nicht geladen werden:',error);list.innerHTML='';const message=document.createElement('p');message.className='empty-state';message.textContent=`Standardkatalog konnte nicht geladen werden: ${error.message||'Unbekannter Fehler'}`;list.append(message)}}
function setView(view,{render=true}={}){const views={home:'#home-view',week:'#week-view',dishes:'#dishes-view',shopping:'#shopping-view'};if(!views[view]||(view==='home'&&!window.matchMedia('(max-width: 700px)').matches))view='week';try{localStorage.setItem(lastViewStorageKey,view)}catch(error){}Object.entries(views).forEach(([name,selector])=>$(selector).classList.toggle('hidden',name!==view));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const labels={week:'Wochenplan',dishes:'Meine Gerichte',shopping:'Einkaufszettel'};$('#crumb-view').textContent=labels[view]||'';$('#crumb-view').hidden=view==='home';$('#crumb-separator').hidden=view==='home';if(render&&view==='dishes')renderDishes();if(render&&view==='shopping')renderShoppingList()}
function closeMobileMenu(){$('#sidebar').classList.remove('mobile-open');$('#menu-backdrop').hidden=true;$('#menu-toggle').setAttribute('aria-expanded','false');$('#menu-toggle').setAttribute('aria-label','Menü öffnen')}
function toggleMobileMenu(){const open=$('#sidebar').classList.toggle('mobile-open');$('#menu-backdrop').hidden=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));$('#menu-toggle').setAttribute('aria-label',open?'Menü schließen':'Menü öffnen')}
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');let themeOverride=null;
function updateThemeButton(){const button=$('#theme-toggle');const label=themeOverride?'Systemmodus verwenden':systemTheme.matches?'Hellmodus testen':'Dunkelmodus testen';button.textContent=themeOverride?'↻':systemTheme.matches?'☀':'☾';button.setAttribute('aria-label',label);button.title=label}
function applyTheme(){const link=$('#theme-stylesheet');link.media=themeOverride?(themeOverride==='dark'?'all':'not all'):'(prefers-color-scheme: dark)';updateThemeButton()}
function toggleTheme(){themeOverride=themeOverride?null:systemTheme.matches?'light':'dark';applyTheme()}
$('#theme-toggle').addEventListener('click',toggleTheme);systemTheme.addEventListener('change',()=>{if(!themeOverride)updateThemeButton()});applyTheme();$('#menu-toggle').addEventListener('click',toggleMobileMenu);$('#menu-backdrop').addEventListener('click',closeMobileMenu);document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view);closeMobileMenu()}));document.querySelectorAll('[data-home-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.homeView)));$('#home-breadcrumb').addEventListener('click',()=>setView(window.matchMedia('(max-width: 700px)').matches?'home':'week'));window.matchMedia('(max-width: 700px)').addEventListener('change',event=>{if(!event.matches&&$('#home-view').classList.contains('hidden')===false)setView('week')});$('#shopping-btn').addEventListener('click',openShoppingList);$('#shopping-back').addEventListener('click',()=>setView('week'));$('#shopping-print').addEventListener('click',()=>window.print());$('#week-print').addEventListener('click',()=>{document.body.classList.add('print-week');window.print()});window.addEventListener('afterprint',()=>document.body.classList.remove('print-week'));$('#shopping-meal-filter').addEventListener('change',renderShoppingList);$('#shopping-add-form').addEventListener('submit',e=>{e.preventDefault();const name=normalizeIngredient($('#shopping-item-input').value);if(!name)return;const weekKey=keyFor(mondayFor(rangeStart())),visibleWeekKeys=[...new Set(rangeDates().map(date=>keyFor(mondayFor(date))))];state.manualShoppingItems??={};state.manualShoppingItems[weekKey]??=[];const duplicate=visibleWeekKeys.some(key=>(state.manualShoppingItems[key]||[]).some(item=>item.toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE')));if(duplicate){showToast('Dieser Artikel steht bereits auf dem Einkaufszettel.');return}state.manualShoppingItems[weekKey].push(name);save();$('#shopping-item-input').value='';$('#shopping-meal-filter').value='';renderShoppingList();$('#shopping-item-input').focus()});$('#shopping-overview').addEventListener('click',()=>{$('#shopping-meal-filter').value='';renderShoppingList()});
$('#prev-week').addEventListener('click',()=>{weekOffset--;renderCalendar()});$('#next-week').addEventListener('click',()=>{weekOffset++;renderCalendar()});$('#today-btn').addEventListener('click',()=>{weekOffset=0;renderCalendar()});
$('#dish-ingredient-input').addEventListener('input',renderDishIngredientSuggestions);$('#dish-ingredient-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const value=normalizeIngredient(event.currentTarget.value);if(value)addDishIngredient(value)});
$('#dish-ingredient').addEventListener('input',renderMainIngredientSuggestions);$('#dish-ingredient').addEventListener('keydown',event=>{if(event.key==='Enter'&& !$('#dish-main-ingredient-suggestions').hidden){event.preventDefault();$('#dish-main-ingredient-suggestions').querySelector('.pantry-suggestion')?.click()}});
$('#dish-time').addEventListener('input',event=>{$('#dish-time-output').textContent=`${timeBlocks[Number(event.currentTarget.value)]||30} Min.`});
$('#mix-btn').addEventListener('click',openPantryPlanner);
$('#pantry-close').addEventListener('click',()=>$('#pantry-dialog').close());
$('#pantry-cancel').addEventListener('click',()=>$('#pantry-dialog').close());
$('#pantry-input').addEventListener('input',renderPantryEditor);
$('#pantry-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const value=normalizeIngredient(event.currentTarget.value);if(!value){$('#pantry-form').requestSubmit();return}const suggestion=availablePantryIngredients().find(name=>ingredientKey(name).startsWith(ingredientKey(value))&&!pantryDraft.some(item=>ingredientKey(item)===ingredientKey(name)));addPantryIngredient(suggestion||value)});
$('#pantry-form').addEventListener('submit',event=>{event.preventDefault();const pantry=pantryDraft.slice(),unmatched=pantry.filter(item=>!state.dishes.some(d=>(d.ingredients||[]).some(i=>ingredientMatches(item,i))));replaceRangePlan(pantry);$('#pantry-dialog').close();renderCalendar({shuffleAnimation:true});showToast(unmatched.length?`7 Tage gemischt. Keine passenden Gerichte für: ${unmatched.join(', ')}`:'Deine nächsten 7 Tage wurden neu gemischt.')});
$('#add-dish-btn').addEventListener('click',()=>openDish());$('#starter-add').addEventListener('click',()=>openDish());$('#search-dishes').addEventListener('input',renderDishes);$('#close-dish-dialog').addEventListener('click',()=>$('#dish-dialog').close());$('#cancel-dialog').addEventListener('click',()=>$('#dish-dialog').close());$('#delete-dish').addEventListener('click',()=>{const id=$('#dish-id').value;if(!id)return;state.dishes=state.dishes.filter(d=>d.id!==id);Object.entries(state.plans).forEach(([week,days])=>days.forEach((day,dayIndexValue)=>{const pins=state.pinnedMeals?.[week]?.[dayIndexValue]||[];for(let i=day.length-1;i>=0;i--)if(day[i]===id){day.splice(i,1);pins.splice(i,1)}}));save();$('#dish-dialog').close();renderDishes();renderCalendar();showToast('Gericht gelöscht.')});$('#dish-form').addEventListener('submit',e=>{e.preventDefault();const pendingIngredient=$('#dish-ingredient-input').value.trim();if(pendingIngredient)addDishIngredient(pendingIngredient);const id=$('#dish-id').value,name=$('#dish-name').value.trim(),ingredient=$('#dish-ingredient').value.trim(),time=timeBlocks[Number($('#dish-time').value)]||30,ingredients=dishIngredientDraft.slice();if(!name)return;const duplicate=state.dishes.find(d=>d.id!==id&&(d.name.trim().toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE')||dishFingerprint(d.name,d.ingredient,d.ingredients)===dishFingerprint(name,ingredient,ingredients)));if(duplicate){const error=$('#dish-form-error');error.textContent=`Ähnliches Gericht existiert bereits: ${duplicate.name}`;error.hidden=false;return}const existing=state.dishes.find(d=>d.id===id);if(existing)Object.assign(existing,{name,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️'});else state.dishes.push({id:crypto.randomUUID?.()||`d${Date.now()}`,name,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️'});save();$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-dialog').close();renderDishes();renderCalendar();showToast(existing?'Gericht aktualisiert.':'Gericht hinzugefügt.')});
$('#catalog-btn').addEventListener('click',openCatalog);$('#close-catalog').addEventListener('click',event=>{event.preventDefault();const dialog=$('#catalog-dialog');if(dialog.open)dialog.close()});$('#catalog-search').addEventListener('input',event=>{const query=event.currentTarget.value.trim().toLocaleLowerCase('de-DE'),list=$('#catalog-list'),buttons=[...list.querySelectorAll('.choose-item')];let visible=0;buttons.forEach(button=>{const match=button.querySelector('b').textContent.toLocaleLowerCase('de-DE').includes(query);button.hidden=!match;if(match)visible++});const empty=list.querySelector('.catalog-no-results');if(empty)empty.hidden=visible>0||buttons.length===0});$('#catalog-dialog').addEventListener('click',event=>{if(event.target===$('#catalog-dialog'))$('#catalog-dialog').close()});
$('#close-chooser').addEventListener('click',()=>{const dialog=$('#choose-dialog');if(dialog.open)dialog.close()});$('#choose-dialog').addEventListener('click',event=>{if(event.target===$('#choose-dialog'))$('#choose-dialog').close()});
if(state.noteHidden)$('#bottom-note').classList.add('hidden');updateCounts();renderCalendar();

