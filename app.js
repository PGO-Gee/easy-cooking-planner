const emojiMap={'Hühnchen':'🍗','Rind':'🥘','Fisch':'🐟','Schwein':'🥓','Wurst':'🌭','Vegetarisch':'🥦','Pasta':'🍝','Ei':'🍳'};
const shortDays=['MO','DI','MI','DO','FR','SA','SO'];
const timeBlocks=[15,30,45,60,90,120];
const $=s=>document.querySelector(s);
const supabaseConfig=window.WOCHENTISCH_SUPABASE;
const supabaseScriptUrl='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
let authClient=null;
let authClientReadyPromise=Promise.resolve(null);
let state=loadState(); let weekOffset=0; let toastTimer;let pantryDraft=[];let dishIngredientDraft=[];let mealDragState=null;let mealActionPointerState=null;let suppressedMealActionClick=null;let pendingShoppingClearUndo=null;let shoppingDoneExpanded=false;
let unresolvedConflicts=[];
let pendingCatalogImports=[];
let offlineStoreReady=false;
let offlineStoreWriteQueue=Promise.resolve();
let appInitialized=false;
let appInitializationPromise;
let currentUserId='';
let currentHouseholdId='';
let interactiveLoginPending=false;
const lastViewStorageKey='wochentisch-last-view';
const sidebarCollapsedStorageKey='wochentisch-sidebar-collapsed';
const compactNavigationQuery=window.matchMedia('(max-width: 700px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
const offlineSessionStorageKey='wochentisch-last-signed-in-user';
let cloudReady=false;
let cloudBaseState=null;
let cloudConnectPromise;
let realtimeChannel=null;
let cloudSyncTimer;
let cloudSyncInProgress=false;
let cloudSyncRequested=false;
let cloudSyncNotificationRequested=false;
let cloudSyncPromise=null;
let pullRefreshGesture=null;
let loadingCloudState=false;
let offlineMode=false;
let explicitSignOutPending=false;
let signInPromptActive=false;
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
function updateSyncStatus(message,{reauthRequired=false,storageError=false}={}){const status=$('#sync-status');if(!status)return;const hasConflicts=unresolvedConflicts.length>0;$('#sync-status-message').textContent=message||(hasConflicts?`${unresolvedConflicts.length} Änderung${unresolvedConflicts.length===1?'':'en'} muss${unresolvedConflicts.length===1?'':'en'} geprüft werden.`:'');$('#sync-status-login').hidden=!reauthRequired;$('#sync-status-conflicts').hidden=!hasConflicts;status.hidden=!(message||hasConflicts);status.classList.toggle('is-storage-error',storageError)}
function cloudMigrationKey(){return currentUserId?`wochentisch-cloud-migrated-${currentUserId}`:''}
function localStateOwnerKey(){return 'wochentisch-local-owner'}
function cloudBackupKey(){return currentUserId?`wochentisch-cloud-backup-${currentUserId}`:''}
function canUseLocalState(){let owner='';try{owner=localStorage.getItem(localStateOwnerKey())||''}catch(error){}return !owner||owner===currentUserId}
function savedView(){try{const view=localStorage.getItem(lastViewStorageKey);return ['home','week','dishes','shopping'].includes(view)?view:'week'}catch(error){return 'week'}}
function viewForSession(showHome=false){const mobile=window.matchMedia('(max-width: 700px)').matches;if(showHome&&mobile)return'home';const view=savedView();return view==='home'&&!mobile?'week':view}
function starterState(){return{dishes:[],plans:{},pinnedMeals:{},restDays:{},pantryIngredients:{},noteHidden:state.noteHidden,shoppingChecks:{},hiddenShoppingItems:{},manualShoppingItems:{},shoppingQuantities:state.shoppingQuantities||{}}}
function enqueueOfflineStoreWrite(store,key,value){
  if(!window.WochentischStore)return Promise.resolve();
  const snapshot=structuredClone(value);
  offlineStoreWriteQueue=offlineStoreWriteQueue.catch(()=>{}).then(()=>window.WochentischStore.put(store,key,snapshot));
  offlineStoreWriteQueue.catch(error=>{console.warn('Lokale Offline-Daten konnten nicht gespeichert werden:',error);updateSyncStatus('Lokaler Speicher ist gerade nicht verfügbar. Lass die App geöffnet und versuche es erneut.',{storageError:true})});
  return offlineStoreWriteQueue;
}
function safeLocalStorageSet(key,value){try{localStorage.setItem(key,value);return true}catch(error){return false}}
function saveCloudBackup(){if(!currentUserId||!canUseLocalState())return;const snapshot=structuredClone(state),key=cloudBackupKey();if(offlineStoreReady)enqueueOfflineStoreWrite('records',key,snapshot);else safeLocalStorageSet(key,JSON.stringify(snapshot))}
async function readCloudBackup(userId=currentUserId){const key=userId?`wochentisch-cloud-backup-${userId}`:'';if(!key)return null;if(offlineStoreReady){try{const backup=await window.WochentischStore?.get('records',key);return backup&&typeof backup==='object'?backup:null}catch(error){return null}}try{const backup=JSON.parse(localStorage.getItem(key));return backup&&typeof backup==='object'?backup:null}catch(error){return null}}
function cleanIngredients(ingredients){return Array.isArray(ingredients)?ingredients.filter(item=>typeof item==='string').map(normalizeIngredient).filter(Boolean):[]}
function cleanHiddenShoppingItems(items){return [...new Set((Array.isArray(items)?items:[]).filter(item=>typeof item==='string').map(manualItemKey).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de-DE'))}
function cleanRestDays(days){return [...new Set((Array.isArray(days)?days:[]).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<7))].sort((a,b)=>a-b)}
function cleanNutrition(nutrition){return nutrition&&typeof nutrition==='object'&&!Array.isArray(nutrition)?nutrition:null}
function cloudError(message){console.error(message);updateSyncStatus('Keine Verbindung – Änderungen bleiben auf diesem Gerät gespeichert.');if(appInitialized&&document.visibilityState==='visible')showToast('Änderung wird lokal gespeichert und später synchronisiert.')}
function householdError(message){const error=$('#household-error');error.textContent=message;error.hidden=!message}
function ensureUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)}
function newId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  if(crypto.getRandomValues){
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
    const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,character=>{const random=Math.random()*16|0;return(character==='x'?random:(random&0x3|0x8)).toString(16)});
}
function prepareLocalIdsForCloud(){
  const idMap=new Map();
  state.dishes.forEach(dish=>{if(!ensureUuid(dish.id)){const id=newId();idMap.set(dish.id,id);dish.id=id}});
  if(idMap.size){
    Object.values(state.plans).forEach(days=>days.forEach(day=>{for(let index=0;index<day.length;index++)day[index]=idMap.get(day[index])||day[index]}));
    pendingCatalogImports.forEach(item=>{const previous=item.dishId,next=idMap.get(previous);if(next){item.dishId=next;window.WochentischStore?.remove('imports',previous).catch(()=>{});enqueueOfflineStoreWrite('imports',next,item)}});
  }
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
    authClient.from('weekly_plans').select('id, household_id, week_start, pantry_ingredients, rest_days, shopping_quantities, shopping_hidden_items, updated_at').eq('household_id',currentHouseholdId).order('week_start')
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
  })),plans:{},pinnedMeals:{},restDays:{},noteHidden:state.noteHidden,shoppingChecks:{},hiddenShoppingItems:{},manualShoppingItems:{},shoppingQuantities:{}};
  nextState.pantryIngredients={};
  const weekByPlanId=new Map();
  plans.forEach(plan=>{nextState.plans[plan.week_start]=Array.from({length:7},()=>[]);nextState.pinnedMeals[plan.week_start]=Array.from({length:7},()=>[]);nextState.restDays[plan.week_start]=cleanRestDays(plan.rest_days);nextState.pantryIngredients[plan.week_start]=cleanIngredients(plan.pantry_ingredients);nextState.hiddenShoppingItems[plan.week_start]=cleanHiddenShoppingItems(plan.shopping_hidden_items);Object.assign(nextState.shoppingQuantities,plan.shopping_quantities||{});weekByPlanId.set(plan.id,plan.week_start)});
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
function conflictRecord(kind,key,label,baseValue,localValue,remoteValue){
  const keyParts=Array.isArray(key)?key:[key];
  return{id:`${kind}:${keyParts.map(value=>encodeURIComponent(String(value))).join(':')}`,kind,key:keyParts,label,baseValue:structuredClone(baseValue),localValue:structuredClone(localValue),remoteValue:structuredClone(remoteValue),createdAt:Date.now()};
}
function chooseMergedValue(baseValue,localValue,remoteValue,descriptor,conflicts){
  const localChanged=!sameValue(localValue,baseValue),remoteChanged=!sameValue(remoteValue,baseValue);
  if(!localChanged)return remoteValue;
  if(remoteChanged&&!sameValue(localValue,remoteValue)){conflicts.push(conflictRecord(descriptor.kind,descriptor.key,descriptor.label,baseValue,localValue,remoteValue));return remoteValue}
  return localValue;
}
function mergeKeyedArrays(baseItems=[],localItems=[],remoteItems=[],keyOf=item=>item.id,label='Eintrag',conflicts=[],kind='dish'){
  const toMap=items=>new Map((items||[]).map(item=>[keyOf(item),item])),base=toMap(baseItems),local=toMap(localItems),remote=toMap(remoteItems),result=[];
  const keys=new Set([...remote.keys(),...local.keys(),...base.keys()]);
  keys.forEach(key=>{const value=chooseMergedValue(base.get(key),local.get(key),remote.get(key),{kind,key,label:`${label}:${key}`},conflicts);if(value!==undefined)result.push(value)});
  return result;
}
function mergeKeyedObjects(baseObject={},localObject={},remoteObject={},label,conflicts,normalize=value=>value,kind='value'){
  const result={},keys=new Set([...Object.keys(baseObject||{}),...Object.keys(localObject||{}),...Object.keys(remoteObject||{})]);
  keys.forEach(key=>{const value=chooseMergedValue(normalize(mapValue(baseObject,key)),normalize(mapValue(localObject,key)),normalize(mapValue(remoteObject,key)),{kind,key,label:`${label}:${key}`},conflicts);if(value!==undefined)result[key]=value});
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
        if(remoteHas!==baseHas&&localHas!==remoteHas)conflicts.push(conflictRecord('manual-item',[week,key],`Einkaufsartikel: ${local.get(key)||remote.get(key)||key}`,base.get(key),local.get(key),remote.get(key)));
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
      const value=chooseMergedValue(baseValue,localValue,remoteValue,{kind:'shopping-check',key:[week,key],label:`Einkaufsstatus: ${key}`},conflicts);
      if(value)merged[key]=true;
    });
    if(Object.keys(merged).length)result[week]=merged;
  });
  return result;
}
function mergeHiddenShoppingItems(baseItems={},localItems={},remoteItems={},conflicts){
  const result={},weeks=new Set([...Object.keys(baseItems||{}),...Object.keys(localItems||{}),...Object.keys(remoteItems||{})]);
  weeks.forEach(week=>{
    const base=new Set(cleanHiddenShoppingItems(baseItems[week])),local=new Set(cleanHiddenShoppingItems(localItems[week])),remote=new Set(cleanHiddenShoppingItems(remoteItems[week])),keys=new Set([...base,...local,...remote]),merged=[];
    keys.forEach(key=>{if(chooseMergedValue(base.has(key),local.has(key),remote.has(key),{kind:'hidden-item',key:[week,key],label:`Ausgeblendeter Eintrag: ${key}`},conflicts))merged.push(key)});
    if(merged.length)result[week]=merged.sort((a,b)=>a.localeCompare(b,'de-DE'));
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
      const merged=chooseMergedValue(planDay(baseState,week,day),planDay(localState,week,day),planDay(remoteState,week,day),{kind:'plan-day',key:[week,day],label:`Wochenplan ${week}, ${shortDays[day]}`},conflicts);
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
      dishes:mergeKeyedArrays(base.dishes,localState.dishes,remoteState.dishes,item=>item.id,'Gericht',conflicts,'dish'),
      ...planData,
      pantryIngredients:mergeKeyedObjects(base.pantryIngredients,localState.pantryIngredients,remoteState.pantryIngredients,'Vorrat',conflicts,items=>items===undefined?undefined:cleanIngredients(items),'pantry'),
      restDays:mergeKeyedObjects(base.restDays,localState.restDays,remoteState.restDays,'Resteabend',conflicts,days=>days===undefined?undefined:cleanRestDays(days),'rest-days'),
      shoppingChecks:mergeShoppingChecks(base.shoppingChecks,localState.shoppingChecks,remoteState.shoppingChecks,conflicts),
      hiddenShoppingItems:mergeHiddenShoppingItems(base.hiddenShoppingItems,localState.hiddenShoppingItems,remoteState.hiddenShoppingItems,conflicts),
      manualShoppingItems:mergeShoppingItems(base.manualShoppingItems,localState.manualShoppingItems,remoteState.manualShoppingItems,conflicts),
      shoppingQuantities:mergeKeyedObjects(base.shoppingQuantities,localState.shoppingQuantities,remoteState.shoppingQuantities,'Menge',conflicts,value=>value,'quantity'),
      noteHidden:localState.noteHidden
    },
    conflicts
  };
}
async function persistConflicts(conflicts=[]){
  const byId=new Map(unresolvedConflicts.map(conflict=>[conflict.id,conflict]));
  conflicts.forEach(conflict=>{
    const existing=byId.get(conflict.id);
    byId.set(conflict.id,existing?{...existing,remoteValue:structuredClone(conflict.remoteValue),updatedAt:Date.now()}:conflict);
  });
  unresolvedConflicts=[...byId.values()];
  await Promise.all(conflicts.map(conflict=>{
    const storageKey=`${currentUserId||'local'}:${currentHouseholdId||'unknown'}:${conflict.id}`;
    const value={...byId.get(conflict.id),userId:currentUserId||'',householdId:currentHouseholdId||'',storageKey};
    byId.set(conflict.id,value);
    return enqueueOfflineStoreWrite('conflicts',storageKey,value);
  }));
  unresolvedConflicts=[...byId.values()];
  updateSyncStatus('');
}
async function loadOfflineQueues(userId=currentUserId,householdId=''){
  if(!window.WochentischStore)return;
  try{
    const [conflictRecords,importRecords]=await Promise.all([window.WochentischStore.getAll('conflicts'),window.WochentischStore.getAll('imports')]);
    unresolvedConflicts=conflictRecords.map(record=>record.value).filter(value=>value?.id&&value?.kind&&value.userId===userId&&(!householdId||value.householdId===householdId));
    pendingCatalogImports=importRecords.map(record=>record.value).filter(value=>value?.dishId&&value?.catalogId&&value.userId===userId);
    updateSyncStatus('');
  }catch(error){console.warn('Offline-Vormerkungen konnten nicht geladen werden:',error)}
}
function conflictEntityValue(value,conflict){
  const [first,second]=conflict.key;
  switch(conflict.kind){
    case 'dish': return value.dishes?.find(dish=>dish.id===conflict.key[0]);
    case 'plan-day': return planDay(value,first,second);
    case 'pantry': return mapValue(value.pantryIngredients,first);
    case 'rest-days': return mapValue(value.restDays,first);
    case 'quantity': return mapValue(value.shoppingQuantities,first);
    case 'shopping-check': return Boolean(value.shoppingChecks?.[first]?.[second]);
    case 'hidden-item': return (value.hiddenShoppingItems?.[first]||[]).includes(second);
    case 'manual-item': return (value.manualShoppingItems?.[first]||[]).find(name=>manualItemKey(name)===second);
    default: return undefined;
  }
}
async function appendFreshWriteConflict(conflicts,baseState,localState,kind,key,label){
  let latestState;
  try{latestState=(await readStateFromCloud()).state}catch(error){latestState=baseState}
  const descriptor={kind,key,label},baseValue=conflictEntityValue(baseState,descriptor),localValue=conflictEntityValue(localState,descriptor),remoteValue=conflictEntityValue(latestState,descriptor);
  const normalize=value=>{
    if(value===undefined)return value;
    if(kind==='pantry')return cleanIngredients(value);
    if(kind==='rest-days')return cleanRestDays(value);
    return value;
  };
  if(!sameValue(normalize(localValue),normalize(remoteValue)))conflicts.push(conflictRecord(kind,key,label,normalize(baseValue),normalize(localValue),normalize(remoteValue)));
}
function describeConflictValue(conflict,value){
  if(value===undefined)return 'Eintrag wurde gelöscht';
  switch(conflict.kind){
    case 'dish': return `${value.name}${value.ingredient?` · ${value.ingredient}`:''}${value.time?` · ${value.time} Min.`:''}`;
    case 'plan-day': {
      const names=(value.meals||[]).map(id=>state.dishes.find(dish=>dish.id===id)?.name||'Gericht nicht mehr vorhanden');
      return names.length?names.join(', '):'Kein Gericht geplant';
    }
    case 'pantry': return Array.isArray(value)&&value.length?value.join(', '):'Kein Vorrat ausgewählt';
    case 'rest-days': return Array.isArray(value)&&value.length?value.map(day=>shortDays[day]||day).join(', '):'Keine Resteabende';
    case 'quantity': return `${value} ${Number(value)===1?'Portion':'Portionen'}`;
    case 'shopping-check': return value?'Als eingekauft markiert':'Noch offen';
    case 'hidden-item': return value?'Ausgeblendet':'Sichtbar';
    case 'manual-item': return value||'Nicht auf dem Einkaufszettel';
    default: return String(value);
  }
}
function assignConflictValue(conflict,value){
  const [first,second]=conflict.key;
  switch(conflict.kind){
    case 'dish': {
      const index=state.dishes.findIndex(dish=>dish.id===conflict.key[0]);
      if(index>=0)state.dishes.splice(index,1);
      if(value)state.dishes.push(structuredClone(value));
      else Object.entries(state.plans||{}).forEach(([week,days])=>days.forEach((day,dayIndexValue)=>{
        const pins=state.pinnedMeals?.[week]?.[dayIndexValue]||[];
        for(let position=day.length-1;position>=0;position--)if(day[position]===conflict.key[0]){day.splice(position,1);pins.splice(position,1)}
      }));
      break;
    }
    case 'plan-day': {
      state.plans[first]??=Array.from({length:7},()=>[]);
      state.pinnedMeals[first]??=Array.from({length:7},()=>[]);
      state.plans[first][second]=value?.meals?.slice()||[];
      state.pinnedMeals[first][second]=value?.pins?.slice()||[];
      break;
    }
    case 'pantry': if(value===undefined)delete state.pantryIngredients[first];else state.pantryIngredients[first]=structuredClone(value);break;
    case 'rest-days': if(value===undefined)delete state.restDays[first];else state.restDays[first]=structuredClone(value);break;
    case 'quantity': if(value===undefined)delete state.shoppingQuantities[first];else state.shoppingQuantities[first]=structuredClone(value);break;
    case 'shopping-check': {
      state.shoppingChecks[first]??={};
      if(value)state.shoppingChecks[first][second]=true;else delete state.shoppingChecks[first][second];
      if(!Object.keys(state.shoppingChecks[first]).length)delete state.shoppingChecks[first];
      break;
    }
    case 'hidden-item': {
      const items=new Set(state.hiddenShoppingItems[first]||[]);
      if(value)items.add(second);else items.delete(second);
      if(items.size)state.hiddenShoppingItems[first]=[...items].sort((a,b)=>a.localeCompare(b,'de-DE'));else delete state.hiddenShoppingItems[first];
      break;
    }
    case 'manual-item': {
      const items=(state.manualShoppingItems[first]||[]).filter(name=>manualItemKey(name)!==second);
      if(value)items.push(value);
      if(items.length)state.manualShoppingItems[first]=items;else delete state.manualShoppingItems[first];
      break;
    }
  }
}
function renderConflictReview(){
  const list=$('#conflict-list');list.replaceChildren();
  if(!unresolvedConflicts.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Alle Änderungen sind geklärt.';list.append(empty);return}
  unresolvedConflicts.forEach(conflict=>{
    const card=document.createElement('article');card.className='conflict-card';
    const title=document.createElement('h3');title.textContent=conflict.label;
    const choices=document.createElement('div');choices.className='conflict-choices';
    [['local','Deine Fassung',conflict.localValue],['remote','Haushaltsfassung',conflict.remoteValue]].forEach(([source,label,value])=>{
      const button=document.createElement('button');button.type='button';button.className='conflict-choice';
      const strong=document.createElement('strong');strong.textContent=label;
      const detail=document.createElement('span');detail.textContent=describeConflictValue(conflict,value);
      button.append(strong,detail);button.addEventListener('click',()=>resolveConflict(conflict.id,source));choices.append(button);
    });
    card.append(title,choices);list.append(card);
  });
}
function openConflictReview(){renderConflictReview();const dialog=$('#conflict-dialog');if(!dialog.open)dialog.showModal()}
async function resolveConflict(id,source){
  const conflict=unresolvedConflicts.find(item=>item.id===id);if(!conflict)return;
  let value=source==='local'?conflict.localValue:conflict.remoteValue;
  if(source==='remote'&&cloudReady&&navigator.onLine){
    try{const latest=await readStateFromCloud();value=conflictEntityValue(latest.state,conflict)}catch(error){console.warn('Aktuelle Haushaltsfassung konnte nicht geladen werden:',error)}
  }
  assignConflictValue(conflict,value);
  save({sync:false});
  await offlineStoreWriteQueue.catch(()=>{});
  try{await window.WochentischStore?.remove('conflicts',conflict.storageKey||id)}catch(error){console.warn('Geklärter Konflikt konnte nicht aus dem lokalen Speicher entfernt werden:',error)}
  unresolvedConflicts=unresolvedConflicts.filter(item=>item.id!==id);
  updateCounts();refreshVisibleView();updateSyncStatus('');
  if(unresolvedConflicts.length)renderConflictReview();else $('#conflict-dialog').close();
  if(cloudReady&&hasCloudChanges(cloudBaseState,state))scheduleCloudSync();
}
function cloudComparable(value){
  const shoppingChecks=Object.fromEntries(Object.entries(value.shoppingChecks||{}).map(([week,checks])=>[
    week,Object.fromEntries(Object.entries(checks||{}).filter(([,checked])=>Boolean(checked)))
  ]).filter(([,checks])=>Object.keys(checks).length));
  const manualShoppingItems=Object.fromEntries(Object.entries(value.manualShoppingItems||{}).map(([week,items])=>[
    week,[...new Map((items||[]).map(name=>[manualItemKey(name),normalizeIngredient(name)])).values()].sort((a,b)=>a.localeCompare(b,'de-DE'))
  ]).filter(([,items])=>items.length));
  const hiddenShoppingItems=Object.fromEntries(Object.entries(value.hiddenShoppingItems||{}).map(([week,items])=>[
    week,cleanHiddenShoppingItems(items)
  ]).filter(([,items])=>items.length));
  return {
    dishes:(value.dishes||[]).map(dish=>({
      id:dish.id,name:dish.name,ingredient:dish.ingredient||'',time:Number(dish.time)||30,
      emoji:dish.emoji||emojiMap[dish.ingredient]||'🍽️',ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)
    })).sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    plans:value.plans||{},pinnedMeals:value.pinnedMeals||{},pantryIngredients:value.pantryIngredients||{},restDays:value.restDays||{},
    shoppingChecks,
    hiddenShoppingItems,
    manualShoppingItems,
    shoppingQuantities:value.shoppingQuantities||{}
  };
}
function hasCloudChanges(first,second){return !sameValue(cloudComparable(first),cloudComparable(second))}
function cloudBaseStorageKey(){return currentUserId&&currentHouseholdId?`wochentisch-cloud-base-${currentUserId}-${currentHouseholdId}`:''}
async function readCloudBase(){
  const key=cloudBaseStorageKey();if(!key)return null;
  if(offlineStoreReady){try{const value=await window.WochentischStore?.get('records',key);return value&&Array.isArray(value.dishes)&&value.plans?value:null}catch(error){return null}}
  try{const value=JSON.parse(localStorage.getItem(key));return value&&Array.isArray(value.dishes)&&value.plans?value:null}catch(error){return null}
}
function saveCloudBase(value){const key=cloudBaseStorageKey();if(!key||!value)return Promise.resolve();return offlineStoreReady?enqueueOfflineStoreWrite('records',key,value):Promise.resolve(safeLocalStorageSet(key,JSON.stringify(value)))}
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
      if(!data?.length)await appendFreshWriteConflict(conflicts,remote,target,'dish',[id],`Gericht: ${dish.name}`);
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
  const {data:planRows,error:planError}=await authClient.from('weekly_plans').select('id, household_id, week_start, pantry_ingredients, rest_days, shopping_quantities, shopping_hidden_items, updated_at').eq('household_id',currentHouseholdId);
  if(planError)throw planError;
  const planByWeek=new Map((planRows||[]).map(plan=>[plan.week_start,plan]));
  for(const week of targetWeeks){
    const plan=planByWeek.get(week);if(!plan)continue;
    const updates={},remotePantry=remote.pantryIngredients?.[week]||[],targetPantry=target.pantryIngredients?.[week]||[];
    const remoteRest=remote.restDays?.[week]||[],targetRest=target.restDays?.[week]||[];
    const remoteHidden=cleanHiddenShoppingItems(remote.hiddenShoppingItems?.[week]),targetHidden=cleanHiddenShoppingItems(target.hiddenShoppingItems?.[week]);
    if(!sameValue(remotePantry,cleanIngredients(targetPantry)))updates.pantry_ingredients=cleanIngredients(targetPantry);
    if(!sameValue(remoteRest,cleanRestDays(targetRest)))updates.rest_days=cleanRestDays(targetRest);
    if(!sameValue(remoteHidden,targetHidden))updates.shopping_hidden_items=targetHidden;
    if(!Object.keys(updates).length)continue;
    const {data,error}=await authClient.from('weekly_plans').update(updates).eq('id',plan.id).eq('updated_at',plan.updated_at).select('id');
    if(error)throw error;
    if(!data?.length){
      const latest=(await readStateFromCloud()).state;
      const fields=[
        ['pantry_ingredients','pantry','Vorrat'],
        ['rest_days','rest-days','Resteabend'],
        ['shopping_hidden_items','hidden-item','Ausgeblendete Einträge']
      ];
      for(const [field,kind,label] of fields){
        if(!Object.prototype.hasOwnProperty.call(updates,field))continue;
        const baseValue=kind==='pantry'?remote.pantryIngredients?.[week]:kind==='rest-days'?remote.restDays?.[week]:remote.hiddenShoppingItems?.[week];
        const localValue=kind==='pantry'?target.pantryIngredients?.[week]:kind==='rest-days'?target.restDays?.[week]:target.hiddenShoppingItems?.[week];
        const remoteValue=kind==='pantry'?latest.pantryIngredients?.[week]:kind==='rest-days'?latest.restDays?.[week]:latest.hiddenShoppingItems?.[week];
        if(kind==='hidden-item'){
          const baseItems=new Set(cleanHiddenShoppingItems(baseValue)),localItems=new Set(cleanHiddenShoppingItems(localValue)),remoteItems=new Set(cleanHiddenShoppingItems(remoteValue));
          for(const itemKey of new Set([...baseItems,...localItems,...remoteItems])){
            const wasHidden=baseItems.has(itemKey),isHidden=localItems.has(itemKey),nowHidden=remoteItems.has(itemKey);
            if(isHidden!==nowHidden)conflicts.push(conflictRecord(kind,[week,itemKey],`${label}: ${itemKey}`,wasHidden,isHidden,nowHidden));
          }
        }else if(!sameValue(localValue,remoteValue))conflicts.push(conflictRecord(kind,[week],`${label}: ${week}`,baseValue,localValue,remoteValue));
      }
    }
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
        if(data?.length)deletedPositions.add(position);else{blockedPositions.add(position);await appendFreshWriteConflict(conflicts,remote,target,'plan-day',[week,day],`Wochenplan ${week}, ${shortDays[day]}`)}
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
    const desired=target.shoppingChecks?.[week]||{};
    const existing=checkRows.filter(row=>weekForPlan.get(row.weekly_plan_id)===week);
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
    if(stillPlanned){conflicts.push(conflictRecord('dish',[id],`Gericht: ${dish.name}`,dish,undefined,dish));continue;}
    const row=remoteDishes.get(id);if(row)dishIdsToDelete.push(row);
  }
  for(const row of dishIdsToDelete){
    const {data,error}=await authClient.from('dishes').delete().eq('id',row.id).eq('household_id',currentHouseholdId).eq('updated_at',row.updated_at).select('id');
    if(error)throw error;
    if(!data?.length)await appendFreshWriteConflict(conflicts,remote,target,'dish',[row.id],`Gericht: ${dish.name}`);
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
async function reconcileCatalogImports(remoteState){
  if(!pendingCatalogImports.length)return;
  const remoteIds=new Set((remoteState?.dishes||[]).map(dish=>dish.id)),localIds=new Set(state.dishes.map(dish=>dish.id));
  const finished=pendingCatalogImports.filter(item=>remoteIds.has(item.dishId)||!localIds.has(item.dishId));
  if(!finished.length)return;
  await Promise.all(finished.map(item=>window.WochentischStore?.remove('imports',item.dishId).catch(error=>console.warn('Katalogimport bleibt lokal vorgemerkt:',error))));
  const finishedIds=new Set(finished.map(item=>item.dishId));pendingCatalogImports=pendingCatalogImports.filter(item=>!finishedIds.has(item.dishId));
}
async function syncStateToCloud({notify=false}={}){
  if(!cloudReady||!currentHouseholdId)return;
  prepareLocalIdsForCloud();
  const before=structuredClone(state),beforeShopping=localShoppingItems(before),remote=await readStateFromCloud(),base=cloudBaseState||remote.state;
  const latestLocal=structuredClone(state);
  const merged=mergeHouseholdState(base,latestLocal,remote.state);
  if(merged.conflicts.length)await persistConflicts(merged.conflicts);
  state=merged.state;
  const syncTarget=structuredClone(state);
  cloudBaseState=remote.state;await saveCloudBase(cloudBaseState);save({sync:false});
  await writeMergedStateToCloud(remote.state,syncTarget,remote,merged.conflicts);
  const refreshed=await readStateFromCloud(),stateAtRefresh=structuredClone(state);
  if(merged.conflicts.length){
    merged.conflicts.forEach(conflict=>{conflict.remoteValue=structuredClone(conflictEntityValue(refreshed.state,conflict));conflict.updatedAt=Date.now()});
    await persistConflicts(merged.conflicts);
  }
  const afterSync=mergeHouseholdState(syncTarget,stateAtRefresh,refreshed.state);
  if(afterSync.conflicts.length)await persistConflicts(afterSync.conflicts);
  state=afterSync.state;cloudBaseState=refreshed.state;await saveCloudBase(cloudBaseState);save({sync:false});
  await reconcileCatalogImports(refreshed.state);
  if(appInitialized){
    $('#bottom-note').classList.toggle('hidden',state.noteHidden);
    updateCounts();refreshVisibleView();
  }
  if(notify&&document.visibilityState==='visible'){
    const afterShopping=localShoppingItems(state),added=[...afterShopping.entries()].filter(([key])=>!beforeShopping.has(key)).map(([,name])=>name);
    if(added.length===1)showToast(`${added[0]} wurde auf den Einkaufszettel gesetzt.`);
    else if(added.length>1)showToast(`${added[0]} und ${added.length-1} weitere Artikel wurden ergänzt.`);
  }
  updateSyncStatus(unresolvedConflicts.length?'Synchronisierung abgeschlossen. Bitte prüfe die markierten Änderungen.':'');
  if(hasCloudChanges(cloudBaseState,state))scheduleCloudSync();
}
function scheduleCloudSync({notify=false}={}){
  if(!cloudReady||loadingCloudState||!navigator.onLine)return;
  cloudSyncNotificationRequested=cloudSyncNotificationRequested||notify;clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>{cloudSyncRequested=true;flushCloudSync()},notify?500:350);
}
function flushCloudSync(){
  if(cloudSyncInProgress){cloudSyncRequested=true;return cloudSyncPromise||Promise.resolve(false)}
  if(!cloudSyncRequested)return Promise.resolve(true);
  cloudSyncInProgress=true;
  cloudSyncPromise=(async()=>{
    let succeeded=true;
    try{
      while(cloudSyncRequested){
        cloudSyncRequested=false;
        const notify=cloudSyncNotificationRequested;cloudSyncNotificationRequested=false;
        await syncStateToCloud({notify});
      }
    }catch(error){succeeded=false;cloudError(error)}
    finally{cloudSyncInProgress=false;cloudSyncPromise=null}
    return succeeded;
  })();
  return cloudSyncPromise;
}
async function checkForPwaUpdate(){
  if(!('serviceWorker' in navigator))return;
  try{const registration=await navigator.serviceWorker.getRegistration();await registration?.update()}catch(error){console.debug('App-Update konnte gerade nicht geprüft werden:',error)}
}
async function refreshAppData(){
  if(!navigator.onLine){updateSyncStatus('Offline – deine Änderungen bleiben auf diesem Gerät gespeichert.');return'offline'}
  void checkForPwaUpdate();
  try{
    if(!authClient)await authClientReadyPromise;
    if(!authClient){updateSyncStatus('Synchronisierung ist gerade nicht verfügbar – Änderungen bleiben lokal gespeichert.');return'unavailable'}
    if(!cloudReady&&currentUserId){if(offlineMode)await resumeCloudSession();else await connectToCloud()}
    if(!cloudReady){
      if(!unresolvedConflicts.length)updateSyncStatus('Zum Synchronisieren ist eine erneute Anmeldung nötig.',{reauthRequired:true});
      return'unavailable';
    }
    updateSyncStatus('Synchronisierung läuft …');
    clearTimeout(cloudSyncTimer);cloudSyncRequested=true;cloudSyncNotificationRequested=false;
    const succeeded=await flushCloudSync();
    if(!succeeded)return'failed';
    return'success';
  }catch(error){cloudError(error);return'failed'}
}
function standalonePwa(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function setPullRefreshIndicator({visible=false,refreshing=false,offset=0,message='Zum Aktualisieren ziehen'}={}){
  const indicator=$('#pull-refresh-indicator');if(!indicator)return;
  indicator.style.setProperty('--pull-refresh-offset',`${offset}px`);
  indicator.classList.toggle('is-visible',visible);indicator.classList.toggle('is-refreshing',refreshing);
  indicator.setAttribute('aria-hidden',String(!visible));$('#pull-refresh-message').textContent=message;
}
function beginPullRefresh(event){
  if(!standalonePwa()||!compactNavigationQuery.matches||!appInitialized||$('.app-shell').hidden||pullRefreshGesture||mealDragState||document.querySelector('dialog[open]'))return;
  if(event.touches.length!==1||window.scrollY>2||(document.scrollingElement?.scrollTop||0)>2)return;
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('input,textarea,select,button,a,[contenteditable="true"],dialog,.meal-card,[data-no-pull-refresh]'))return;
  const touch=event.touches[0];
  if(touch.clientX<24||touch.clientX>window.innerWidth-24||touch.clientY>Math.min(180,window.innerHeight*.4))return;
  pullRefreshGesture={startX:touch.clientX,startY:touch.clientY,distance:0,dragging:false};
}
function movePullRefresh(event){
  const gesture=pullRefreshGesture;if(!gesture)return;
  if(event.touches.length!==1){cancelPullRefresh();return}
  const touch=event.touches[0],deltaX=touch.clientX-gesture.startX,deltaY=touch.clientY-gesture.startY;
  if(deltaY<0||Math.abs(deltaX)>Math.max(14,deltaY*.8)){cancelPullRefresh();return}
  if(deltaY<10)return;
  if(window.scrollY>2||(document.scrollingElement?.scrollTop||0)>2){cancelPullRefresh();return}
  gesture.dragging=true;gesture.distance=deltaY;
  if(event.cancelable)event.preventDefault();
  const offset=Math.min(88,deltaY*.9),ready=deltaY>=72;
  setPullRefreshIndicator({visible:true,offset,message:ready?'Loslassen zum Aktualisieren':'Zum Aktualisieren ziehen'});
}
function finishPullRefresh(){
  const gesture=pullRefreshGesture;if(!gesture)return;
  pullRefreshGesture=null;
  if(!gesture.dragging){setPullRefreshIndicator();return}
  if(gesture.distance<72){setPullRefreshIndicator();return}
  setPullRefreshIndicator({visible:true,refreshing:true,offset:76,message:'Wird synchronisiert …'});
  refreshAppData().then(result=>{
    const message=result==='success'?'Aktualisiert':result==='offline'?'Offline – lokale Daten bleiben verfügbar':result==='failed'?'Abgleich fehlgeschlagen':'Synchronisierung derzeit nicht verfügbar';
    setPullRefreshIndicator({visible:true,refreshing:result==='success',offset:76,message});
    window.setTimeout(()=>setPullRefreshIndicator(),result==='success'?850:1400);
  });
}
function cancelPullRefresh(){pullRefreshGesture=null;setPullRefreshIndicator()}
document.addEventListener('touchstart',beginPullRefresh,{capture:true,passive:true});
document.addEventListener('touchmove',movePullRefresh,{capture:true,passive:false});
document.addEventListener('touchend',finishPullRefresh,{capture:true,passive:true});
document.addEventListener('touchcancel',cancelPullRefresh,{capture:true,passive:true});
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
      await loadOfflineQueues(currentUserId,currentHouseholdId);
      const beforeShopping=localShoppingItems(state),cloud=await readStateFromCloud(),previousBase=await readCloudBase();
      if(previousBase){
        const merged=mergeHouseholdState(previousBase,state,cloud.state);
        if(merged.conflicts.length)await persistConflicts(merged.conflicts);
        state=merged.state;
      }else if(hasCloudChanges(emptyState(),state)){
        const merged=mergeHouseholdState(emptyState(),state,cloud.state);
        if(merged.conflicts.length)await persistConflicts(merged.conflicts);
        state=merged.state;
      }else if(cloud.hasCloudData)state=cloud.state;
      else state=starterState();
      cloudBaseState=cloud.state;await saveCloudBase(cloudBaseState);
      cloudReady=true;offlineMode=false;
      const migrationKey=cloudMigrationKey();if(!cloud.hasCloudData)localStorage.setItem(migrationKey,'true');
      save({sync:false});saveCloudBackup();
      updateSyncStatus(unresolvedConflicts.length?'Änderungen wurden synchronisiert. Bitte prüfe noch die markierten Konflikte.':'');
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
function startOfflineApp({reauthRequired=false}={}){
  let rememberedUser='',owner='';try{rememberedUser=localStorage.getItem(offlineSessionStorageKey)||'';owner=localStorage.getItem(localStateOwnerKey())||''}catch(error){}
  if(!rememberedUser||(owner&&owner!==rememberedUser))return false;
  currentUserId=rememberedUser;currentHouseholdId='';cloudReady=false;offlineMode=true;
  if(!appInitialized)renderCachedApp();
  else{$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false}
  updateSyncStatus(navigator.onLine?(reauthRequired?'Zum Synchronisieren ist eine erneute Anmeldung nötig.':'Anmeldestatus wird geprüft – Änderungen bleiben lokal gespeichert.'):'Offline – zuletzt gespeicherte Einkaufsliste verfügbar.',{reauthRequired:navigator.onLine&&reauthRequired});
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
    }else if(error)updateSyncStatus('Anmeldestatus konnte nicht geprüft werden – Änderungen bleiben lokal gespeichert.');
    else updateSyncStatus('Zum Synchronisieren ist eine erneute Anmeldung nötig.',{reauthRequired:true});
  }catch(error){updateSyncStatus('Keine Verbindung – Änderungen bleiben lokal gespeichert.')}
}
async function revealApp({showHome=false}={}){
  if(!appInitialized)renderCachedApp({showHome});
  offlineMode=false;
  if(navigator.onLine)updateSyncStatus('');
  return connectToCloud();
}
async function loadHouseholdMembers(){
  if(!authClient||!navigator.onLine)throw new Error('Haushaltsinformationen sind offline nicht verfügbar.');
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
  try{await loadHouseholdMembers()}catch(error){if(navigator.onLine)console.error(error);householdError(navigator.onLine?'Mitglieder konnten gerade nicht geladen werden.':'Haushaltsverwaltung ist offline nicht verfügbar.')}
});
$('#household-close').addEventListener('click',()=>$('#household-dialog').close());
$('#create-household-code').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;householdError('');
  try{
    if(!authClient||!navigator.onLine)throw new Error('Haushaltsaktionen benötigen eine Internetverbindung.');
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
    if(!authClient||!navigator.onLine)throw new Error('Haushaltsaktionen benötigen eine Internetverbindung.');
    const {data,error}=await authClient.rpc('join_household_with_code',{join_code:code});
    if(error)throw error;
    if(!data)throw new Error('Household was not returned');
    stopRealtimeChannel();currentHouseholdId=data;cloudReady=false;cloudBaseState=null;loadingCloudState=true;
    await loadOfflineQueues(currentUserId,currentHouseholdId);
    clearTimeout(cloudSyncTimer);cloudSyncRequested=false;
    $('#household-dialog').close();
    const cloud=await readStateFromCloud();state=cloud.state;cloudBaseState=cloud.state;await saveCloudBase(cloudBaseState);cloudReady=true;
    save({sync:false});
    loadingCloudState=false;weekOffset=0;renderCalendar();
    subscribeToHouseholdChanges();
    showToast('Du bist dem Haushalt beigetreten.');
  }catch(error){
    loadingCloudState=false;console.error(error);
    householdError(/Invalid or expired join code/i.test(error.message)?'Der Code ist ungültig, abgelaufen oder wurde bereits verwendet.':'Beitritt fehlgeschlagen. Bitte prüfe den Code und versuche es erneut.');
  }finally{button.disabled=false}
});
function showLogin({message='',allowOfflineReturn=false}={}){
  $('#startup-gate').hidden=true;
  $('.app-shell').hidden=true;
  $('#auth-gate').hidden=false;
  $('#auth-context').textContent=message;
  $('#auth-context').hidden=!message;
  $('#auth-offline-return').hidden=!allowOfflineReturn;
  updateSyncStatus('');
}
function openSignInForSync(){
  if(!currentUserId)return;
  save({sync:false});
  signInPromptActive=true;offlineMode=false;cloudReady=false;currentHouseholdId='';
  stopRealtimeChannel();appInitialized=false;appInitializationPromise=undefined;
  showLogin({message:'Deine gespeicherte Liste bleibt auf diesem Gerät. Melde dich erneut an, um wieder zu synchronisieren.',allowOfflineReturn:true});
  showAuthError('');
}
$('#sync-status-login').addEventListener('click',openSignInForSync);
$('#auth-offline-return').addEventListener('click',()=>{
  signInPromptActive=false;
  if(!appInitialized)renderCachedApp();
  offlineMode=true;
  updateSyncStatus(navigator.onLine?'Zum Synchronisieren ist eine erneute Anmeldung nötig. Änderungen bleiben lokal gespeichert.':'Offline – zuletzt gespeicherte Einkaufsliste verfügbar.',{reauthRequired:navigator.onLine});
});
$('#password-sign-in').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#password-sign-in-button');
  const email=$('#auth-email').value.trim();
  const password=$('#auth-password').value;
  interactiveLoginPending=true;
  button.disabled=true;showAuthError('');
  try{
    if(!authClient)await authClientReadyPromise;
    if(!authClient)throw new Error('Anmeldung ist nicht verfügbar.');
    const {error}=await authClient.auth.signInWithPassword({
      email,
      password
    });
    if(error){interactiveLoginPending=false;showAuthError('E-Mail-Adresse oder Passwort sind nicht korrekt.');button.disabled=false}
  }catch(error){interactiveLoginPending=false;showAuthError('Anmeldung fehlgeschlagen. Bitte prüfe deine Internetverbindung.');button.disabled=false}
});
$('#sign-out').addEventListener('click',async()=>{
  try{
    if(!authClient)await authClientReadyPromise;
    if(!authClient)throw new Error('Abmeldung ist nicht verfügbar.');
    explicitSignOutPending=true;
    const {error}=await authClient.auth.signOut({scope:'local'});
    if(error)throw error;
    try{localStorage.removeItem(offlineSessionStorageKey)}catch(error){}
    explicitSignOutPending=false;currentUserId='';currentHouseholdId='';cloudReady=false;cloudBaseState=null;appInitialized=false;appInitializationPromise=undefined;
    stopRealtimeChannel();showLogin();
  }catch(error){explicitSignOutPending=false;showToast(`Abmelden fehlgeschlagen: ${error.message||'Bitte später erneut versuchen.'}`)}
});
function loadSupabaseScript(){
  if(window.supabase?.createClient)return Promise.resolve(window.supabase);
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=supabaseScriptUrl;script.async=true;
    script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Supabase-Client konnte nicht initialisiert werden.'));
    script.onerror=()=>reject(new Error('Supabase-Client konnte nicht geladen werden.'));
    document.head.append(script);
  });
}
function handleAuthStateChange(event,session){
  if(session){
    signInPromptActive=false;$('#auth-context').hidden=true;$('#auth-offline-return').hidden=true;
    const userId=session.user.id,previousUserId=currentUserId;let owner='';try{owner=localStorage.getItem(localStateOwnerKey())||''}catch(error){}
    const accountChanged=(previousUserId&&previousUserId!==userId)||(owner&&owner!==userId);
    stopRealtimeChannel();cloudReady=false;currentHouseholdId='';cloudBaseState=null;
    currentUserId=userId;safeLocalStorageSet(offlineSessionStorageKey,userId);offlineMode=false;
    const showHome=event==='SIGNED_IN'&&interactiveLoginPending;interactiveLoginPending=false;
    if(accountChanged){
      appInitialized=false;appInitializationPromise=undefined;$('.app-shell').hidden=true;$('#auth-gate').hidden=true;$('#startup-gate').hidden=false;
      readCloudBackup(userId).then(async backup=>{state=normalizeState(backup||emptyState());await loadOfflineQueues(userId);return revealApp({showHome})}).catch(error=>{console.warn('Lokale Kontosicherung konnte nicht geladen werden:',error);state=emptyState();return revealApp({showHome})});
    }else if(appInitialized){connectToCloud()}else revealApp({showHome});
    return;
  }
  stopRealtimeChannel();currentHouseholdId='';cloudReady=false;cloudBaseState=null;interactiveLoginPending=false;
  if(explicitSignOutPending){currentUserId='';showLogin();return}
  if(signInPromptActive){showLogin({message:'Melde dich an, um wieder zu synchronisieren. Deine gespeicherte Liste bleibt erhalten.',allowOfflineReturn:true});return}
  if(startOfflineApp({reauthRequired:true}))return;
  currentUserId='';appInitialized=false;appInitializationPromise=undefined;showLogin();
}
async function initializeAuthentication(){
  if(!supabaseConfig?.url||!supabaseConfig?.publishableKey)throw new Error('Supabase-Konfiguration fehlt.');
  await loadSupabaseScript();
  authClient=window.supabase.createClient(supabaseConfig.url,supabaseConfig.publishableKey);
  authClient.auth.onAuthStateChange(handleAuthStateChange);
  const {data,error}=await authClient.auth.getSession();
  if(data?.session)handleAuthStateChange('INITIAL_SESSION',data.session);
  else if(signInPromptActive)showLogin({message:'Melde dich an, um wieder zu synchronisieren. Deine gespeicherte Liste bleibt erhalten.',allowOfflineReturn:true});
  else if(error){if(startOfflineApp())updateSyncStatus('Anmeldestatus konnte nicht geprüft werden – Änderungen bleiben lokal gespeichert.');else{showLogin();showAuthError('Anmeldestatus konnte nicht geprüft werden. Bitte verbinde dich mit dem Internet und versuche es erneut.')}}
  else if(startOfflineApp({reauthRequired:true})){}
  else showLogin();
  return authClient;
}
async function bootApplication(){
  await initializeOfflineData();
  let rememberedUser='',owner='';try{rememberedUser=localStorage.getItem(offlineSessionStorageKey)||'';owner=localStorage.getItem(localStateOwnerKey())||''}catch(error){}
  if(rememberedUser&&(!owner||owner===rememberedUser)){
    currentUserId=rememberedUser;offlineMode=true;renderCachedApp();
    updateSyncStatus(navigator.onLine?'Deine gespeicherten Daten werden geöffnet und anschließend synchronisiert.':'Offline – zuletzt gespeicherte Daten sind verfügbar.');
  }else showLogin();
  if(unresolvedConflicts.length)updateSyncStatus('Bitte prüfe die markierten Änderungen.');
  authClientReadyPromise=initializeAuthentication().catch(error=>{
    console.warn('Supabase ist gerade nicht erreichbar:',error);
    if(appInitialized)updateSyncStatus('Cloud-Synchronisierung nicht verfügbar – Änderungen bleiben lokal gespeichert.');
    else{showLogin();showAuthError('Anmeldung nicht verfügbar. Bitte verbinde dich mit dem Internet und versuche es erneut.')}
    return null;
  });
}
void bootApplication();
window.addEventListener('online',()=>{if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode)resumeCloudSession()});
window.addEventListener('offline',()=>{if(appInitialized)updateSyncStatus('Offline – Änderungen bleiben lokal gespeichert.')});
window.addEventListener('pageshow',()=>{if(!appInitialized)return;if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode&&navigator.onLine)resumeCloudSession()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||!appInitialized)return;if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode&&navigator.onLine)resumeCloudSession()});
function emptyState(){return{dishes:[],plans:{},pinnedMeals:{},restDays:{},pantryIngredients:{},noteHidden:false,shoppingChecks:{},hiddenShoppingItems:{},manualShoppingItems:{},shoppingQuantities:{}}}
function normalizeState(s){if(!s||!Array.isArray(s.dishes)||!s.plans)return emptyState();s.pantryIngredients??={};s.pinnedMeals??={};s.restDays??={};s.shoppingQuantities??={};s.shoppingChecks??={};s.hiddenShoppingItems??={};s.manualShoppingItems??={};return s}
function loadState(){try{return normalizeState(JSON.parse(localStorage.getItem('wochentisch-v1')))}catch(e){return emptyState()}}
async function initializeOfflineData(){
  if(!window.WochentischStore)return;
  try{
    await window.WochentischStore.migrateLegacyStorage();
    const saved=await window.WochentischStore.get('records','app-state');
    if(saved)state=normalizeState(saved);
    else await window.WochentischStore.put('records','app-state',structuredClone(state));
    let rememberedUser='';try{rememberedUser=localStorage.getItem(offlineSessionStorageKey)||''}catch(error){}
    await loadOfflineQueues(rememberedUser);
    offlineStoreReady=true;
  }catch(error){
    offlineStoreReady=false;
    console.warn('IndexedDB konnte nicht initialisiert werden; lokale Sicherung wird verwendet:',error);
    updateSyncStatus('Der sichere Offline-Speicher konnte nicht geöffnet werden. Änderungen werden vorübergehend auf diesem Gerät gesichert.',{storageError:true});
  }
}
function save({sync=true}={}){
  const snapshot=structuredClone(state);
  if(offlineStoreReady)enqueueOfflineStoreWrite('records','app-state',snapshot);else safeLocalStorageSet('wochentisch-v1',JSON.stringify(snapshot));
  if(currentUserId){safeLocalStorageSet(localStateOwnerKey(),currentUserId);saveCloudBackup()}
  updateCounts();if(sync)scheduleCloudSync()
}
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
function shoppingKeysForPlan(plan){const dishes=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));return [...new Set(dishes.flatMap(d=>(d.ingredients||[]).map(manualItemKey).filter(Boolean)))]}
function pantryShoppingKeys(plan,pantry){const dishes=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));return [...new Set(dishes.flatMap(d=>(d.ingredients||[]).filter(i=>pantry.some(item=>ingredientMatches(item,i))).map(manualItemKey).filter(Boolean)))]}
function replaceRangePlan(pantry){
  const dates=rangeDates(),plans=dates.map(date=>getPlanForDate(date)[dayIndex(date)]),pinFlags=dates.map(date=>pinnedMealsForDate(date).slice()),pinnedDays=new Set(),pinnedDishIds=new Set();
  pinFlags.forEach((flags,index)=>{if(flags.some(Boolean)){pinnedDays.add(index);plans[index].forEach((id,mealIndex)=>{if(flags[mealIndex])pinnedDishIds.add(id)})}});
  const generated=makePlan(dates[0],pantry,pinnedDays,pinnedDishIds),weekKeys=[...new Set(dates.map(date=>keyFor(mondayFor(date))))],resetKeysByWeek={};
  dates.forEach((date,index)=>{const weekKey=keyFor(mondayFor(date));resetKeysByWeek[weekKey]??=new Set();shoppingKeysForPlan([plans[index],generated[index]]).forEach(key=>resetKeysByWeek[weekKey].add(key))});
  state.shoppingChecks??={};state.hiddenShoppingItems??={};state.pantryIngredients??={};
  weekKeys.forEach(weekKey=>{
    const resetKeys=resetKeysByWeek[weekKey]||new Set(),checks=state.shoppingChecks[weekKey]||{};
    resetKeys.forEach(key=>delete checks[key]);
    if(Object.keys(checks).length)state.shoppingChecks[weekKey]=checks;else delete state.shoppingChecks[weekKey];
    const hidden=cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).filter(key=>!resetKeys.has(key));
    if(hidden.length)state.hiddenShoppingItems[weekKey]=hidden;else delete state.hiddenShoppingItems[weekKey];
    state.pantryIngredients[weekKey]=pantry.slice();
  });
  dates.forEach((date,index)=>{
    const weekKey=keyFor(mondayFor(date)),dayIndexValue=dayIndex(date),plan=getPlanForDate(date);
    if(pinnedDays.has(index)){const preserved=plans[index].filter((id,mealIndex)=>pinFlags[index][mealIndex]);plan[dayIndexValue]=preserved;state.pinnedMeals[weekKey][dayIndexValue]=preserved.map(()=>true)}
    else{plan[dayIndexValue]=generated[index];state.pinnedMeals[weekKey][dayIndexValue]=generated[index].map(()=>false)}
    setRestDay(date,false);
  });
  weekKeys.forEach(weekKey=>{const days=dates.filter(date=>keyFor(mondayFor(date))===weekKey).map(date=>getPlanForDate(date)[dayIndex(date)]);pantryShoppingKeys(days,pantry).forEach(key=>{state.shoppingChecks[weekKey]??={};state.shoppingChecks[weekKey][key]=true})});
  save();
}
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
function removeMealFromDay(date,mealIndex,dishId){
  cancelMealDrag();
  const day=getPlanForDate(date)[dayIndex(date)],index=day[mealIndex]===dishId?mealIndex:day.indexOf(dishId);
  if(index<0)return;
  day.splice(index,1);pinnedMealsForDate(date).splice(index,1);save();renderCalendar();
}
function setMealPinned(date,mealIndex,dishId){
  cancelMealDrag();
  const day=getPlanForDate(date)[dayIndex(date)],index=day[mealIndex]===dishId?mealIndex:day.indexOf(dishId);
  if(index<0)return;
  const pins=pinnedMealsForDate(date);pins[index]=!Boolean(pins[index]);save();renderCalendar();
}
// Keep meal actions on the persistent calendar so an in-flight render cannot detach their handlers.
function mealActionTargetAt(x,y){
  const hit=document.elementFromPoint(x,y),button=hit?.closest?.('.meal-remove,.meal-pin'),meal=button?.closest('.meal-card'),content=meal?.closest('.day-content');
  if(!button||!meal||!content)return null;
  const day=Number(content.dataset.day),mealIndex=Number(meal.dataset.mealIndex),date=rangeDates()[day],dishId=meal.dataset.dishId;
  return date&&dishId?{date,day,mealIndex,dishId,action:button.matches('.meal-remove')?'remove':'pin'}:null;
}
function startMealActionPointer(event){
  const target=event.target.closest?.('.meal-remove,.meal-pin');
  if(!target||event.isPrimary===false||event.button!==0)return;
  suppressedMealActionClick=null;
  cancelMealDrag();event.stopPropagation();
  const meal=target.closest('.meal-card'),content=target.closest('.day-content');
  if(!meal||!content)return;
  mealActionPointerState={pointerId:event.pointerId,day:Number(content.dataset.day),mealIndex:Number(meal.dataset.mealIndex),dishId:meal.dataset.dishId,action:target.matches('.meal-remove')?'remove':'pin',x:event.clientX,y:event.clientY};
}
function finishMealActionPointer(event){
  const pending=mealActionPointerState;
  if(!pending||pending.pointerId!==event.pointerId)return;
  mealActionPointerState=null;
  if(Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>18)return;
  const target=mealActionTargetAt(event.clientX,event.clientY);
  if(!target||target.day!==pending.day||target.mealIndex!==pending.mealIndex||target.dishId!==pending.dishId||target.action!==pending.action)return;
  if(event.cancelable)event.preventDefault();
  event.stopPropagation();
  suppressedMealActionClick={expires:Date.now()+700};
  if(target.action==='remove')removeMealFromDay(target.date,target.mealIndex,target.dishId);
  else setMealPinned(target.date,target.mealIndex,target.dishId);
}
function handleMealActionClick(event){
  const button=event.target.closest?.('.meal-remove,.meal-pin');
  if(!button)return;
  event.stopPropagation();
  const meal=button.closest('.meal-card'),content=button.closest('.day-content');
  if(!meal||!content)return;
  const day=Number(content.dataset.day),mealIndex=Number(meal.dataset.mealIndex),dishId=meal.dataset.dishId;
  const action=button.matches('.meal-remove')?'remove':'pin',suppressed=suppressedMealActionClick;
  if(event.detail!==0&&suppressed&&Date.now()<=suppressed.expires){
    suppressedMealActionClick=null;event.preventDefault();return;
  }
  suppressedMealActionClick=null;
  const date=rangeDates()[day];
  if(!date||!dishId)return;
  if(action==='remove')removeMealFromDay(date,mealIndex,dishId);
  else setMealPinned(date,mealIndex,dishId);
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
      meal.innerHTML=`<div class="meal-actions"><button type="button" class="meal-pin" aria-label="${isPinned?'Gericht nicht mehr fixieren':'Gericht fixieren'}" aria-pressed="${isPinned}"><svg class="meal-pin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 2H8v2l1 1v5.17L5.59 14.6A2 2 0 0 0 7 18h4v4h2v-4h4a2 2 0 0 0 1.41-3.4L15 10.17V5l1-1V2z"/></svg></button><button type="button" class="meal-remove" aria-label="Gericht entfernen">×</button></div><div class="meal-title"><span class="meal-icon"></span><div class="meal-name" lang="de"></div></div><div class="meal-meta"><span>◷ ${dish.time||25} min</span><span class="dot">·</span><span>${dish.ingredient||'Lieblingsgericht'}</span></div><div class="meal-nutrition"></div>`;
      meal.querySelector('.meal-icon').textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';meal.querySelector('.meal-name').textContent=dish.name;meal.querySelector('.meal-name').title=dish.name;meal.querySelector('.meal-nutrition').textContent=nutritionText(dish.nutrition);meal.querySelector('.meal-nutrition').hidden=!dish.nutrition;
      content.append(meal);
    });
    if(!isRest){const restAction=document.createElement('button');restAction.type='button';restAction.className='day-rest-action';restAction.innerHTML='<span class="day-rest-action-icon" aria-hidden="true">🥡</span><span>Reste</span>';restAction.setAttribute('aria-label',`Resteabend für ${date.toLocaleDateString('de-DE',{weekday:'long'})} markieren${day.length?', den Plan um einen Tag verschieben':''}`);restAction.title=day.length?'Resteabend eintragen und den Folgeplan weiterschieben':'Als Resteabend markieren';restAction.addEventListener('click',()=>markRestDay(i));content.append(restAction)}
    const add=document.createElement('button');add.type='button';add.className='add-meal';add.textContent=isRest?'＋ Gericht statt Reste eintragen':'＋ Gericht eintragen';add.addEventListener('click',()=>{cancelMealDrag();chooseDish(i)});content.append(add);grid.append(card);
  });
  save({sync:false});$('#bottom-note').classList.toggle('hidden',state.noteHidden);updateShoppingNavCount();
}
function renderCalendar(options){renderCalendarContent(options);renderedCalendarSnapshot=calendarStateForRange(state)}
const mealCalendar=$('#calendar');
mealCalendar.addEventListener('pointerdown',startMealActionPointer,true);
mealCalendar.addEventListener('click',handleMealActionClick,true);
window.addEventListener('pointerup',finishMealActionPointer,true);
window.addEventListener('pointercancel',()=>{mealActionPointerState=null},true);
mealCalendar.addEventListener('pointerdown',startMealPointerDrag);
mealCalendar.addEventListener('pointerup',finishMealPointerDrag);
mealCalendar.addEventListener('pointercancel',event=>finishMealPointerDrag(event,true));
mealCalendar.addEventListener('touchstart',startMealTouchDrag,{passive:true});
mealCalendar.addEventListener('touchmove',moveMealTouchDrag,{passive:false});
mealCalendar.addEventListener('touchend',finishMealTouchDrag);
mealCalendar.addEventListener('touchcancel',event=>finishMealTouchDrag(event,true));
mealCalendar.addEventListener('contextmenu',event=>{if(event.target.closest?.('.meal-card'))event.preventDefault()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelMealDrag();mealActionPointerState=null;cancelPullRefresh()}});
window.addEventListener('pagehide',()=>{cancelMealDrag();mealActionPointerState=null;cancelPullRefresh()});
window.addEventListener('blur',()=>{mealActionPointerState=null});
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
  state.shoppingChecks??={};state.hiddenShoppingItems??={};state.manualShoppingItems??={};
  selected.forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(!name)return;const key=name.toLocaleLowerCase('de-DE');if(!items.has(key))items.set(key,{name,dishes:new Set(),weekKeys:new Set()});const item=items.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey)}));
  [...new Set(weekKeys.flatMap(weekKey=>state.manualShoppingItems[weekKey]||[]))].forEach(name=>{const key=name.toLocaleLowerCase('de-DE');if(!items.has(key))items.set(key,{name,dishes:new Set(),weekKeys:new Set()});const item=items.get(key);selected.filter(({dish})=>(dish.ingredients||[]).some(raw=>normalizeIngredient(raw).toLocaleLowerCase('de-DE')===key)).forEach(({dish})=>item.dishes.add(dish.name));weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>itemName.toLocaleLowerCase('de-DE')===key)).forEach(weekKey=>item.weekKeys.add(weekKey))});
  for(const [key,item] of items){const relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;if(relevantWeeks.every(weekKey=>state.hiddenShoppingItems[weekKey]?.includes(key)))items.delete(key)}
  const openCount=[...items.values()].filter(item=>{const key=item.name.toLocaleLowerCase('de-DE'),checkKey=item.dishes.size?key:`manual:${key}`,relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;return !relevantWeeks.every(weekKey=>Boolean(state.shoppingChecks[weekKey]?.[checkKey]))}).length;
  $('#shopping-nav-count').textContent=openCount;
  $('#shopping-nav-count').parentElement.setAttribute('aria-label',`Einkaufszettel, ${openCount} offene Artikel`);
}
function syncShoppingDoneDisclosure(){
  const section=$('#shopping-done-section'),toggle=$('#shopping-done-toggle');
  if(!section||!toggle)return;
  const hasItems=Boolean($('#shopping-done .shopping-tile'));
  if(!hasItems)shoppingDoneExpanded=false;
  const expanded=shoppingDoneExpanded;
  section.classList.toggle('is-expanded',expanded);
  section.classList.toggle('has-items',hasItems);
  toggle.setAttribute('aria-expanded',String(expanded));
}
function renderShoppingListContent(){
  const start=rangeStart(),days=planDaysInRange(),weekKeys=[...new Set(days.map(item=>item.weekKey))],selected=days.flatMap(({weekKey,day})=>day.map(id=>({dish:state.dishes.find(d=>d.id===id),weekKey})).filter(item=>item.dish));
  state.shoppingChecks??={};state.hiddenShoppingItems??={};state.manualShoppingItems??={};
  const filterSelect=$('#shopping-meal-filter'),previousFilter=filterSelect.value,mealNames=[...new Set(selected.map(item=>item.dish.name))].sort((a,b)=>a.localeCompare(b,'de')),manualItems=[...new Set(weekKeys.flatMap(weekKey=>state.manualShoppingItems[weekKey]||[]))];
  $('#shopping-period').textContent=formatRange(start);filterSelect.replaceChildren(new Option('Alle Mahlzeiten',''));
  if(mealNames.length){const dishesGroup=document.createElement('optgroup');dishesGroup.label='Gerichte';mealNames.forEach(name=>dishesGroup.append(new Option(name,name)));filterSelect.append(dishesGroup)}
  if(manualItems.length){const manualGroup=document.createElement('optgroup');manualGroup.label='Manuelle Eingaben';manualGroup.append(new Option('Keinem Gericht zugeordnet','__manual__'));filterSelect.append(manualGroup)}
  filterSelect.value=mealNames.includes(previousFilter)||previousFilter==='__manual__'&&manualItems.length?previousFilter:'';
  const activeFilter=filterSelect.value,visible=activeFilter==='__manual__'?[]:activeFilter?selected.filter(({dish})=>dish.name===activeFilter):selected,counts=new Map();
  $('#shopping-overview').classList.toggle('hidden',!activeFilter);
  visible.forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(name){const key=name.toLocaleLowerCase('de-DE');if(!counts.has(key))counts.set(key,{name,dishes:new Set(),manual:false,weekKeys:new Set()});const item=counts.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey)}}));
  if(!activeFilter||activeFilter==='__manual__')manualItems.forEach(name=>{const key=name.toLocaleLowerCase('de-DE'),relatedDishes=new Set(selected.filter(({dish})=>(dish.ingredients||[]).some(raw=>normalizeIngredient(raw).toLocaleLowerCase('de-DE')===key)).map(({dish})=>dish.name));if(!counts.has(key))counts.set(key,{name,dishes:relatedDishes,manual:true,weekKeys:new Set()});const item=counts.get(key);item.manual=true;weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>itemName.toLocaleLowerCase('de-DE')===key)).forEach(weekKey=>item.weekKeys.add(weekKey))});
  for(const [key,item] of counts){const relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;if(relevantWeeks.every(weekKey=>state.hiddenShoppingItems[weekKey]?.includes(key)))counts.delete(key)}
  const hasHiddenShoppingItems=selected.some(({dish,weekKey})=>(dish.ingredients||[]).some(name=>state.hiddenShoppingItems[weekKey]?.includes(manualItemKey(name))))||weekKeys.some(weekKey=>cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).length>0);
  const open=$('#shopping-open'),done=$('#shopping-done'),empty=$('#shopping-empty');open.replaceChildren();done.replaceChildren();empty.classList.toggle('hidden',counts.size>0);empty.textContent=activeFilter==='__manual__'?'Noch keine manuellen Artikel hinzugefügt.':activeFilter?'Für dieses Gericht sind keine Zutaten eingetragen.':hasHiddenShoppingItems?'Die Einkaufsliste ist leer. Du kannst unten neue Artikel hinzufügen.':selected.length?'Für die geplanten Gerichte sind keine Zutaten eingetragen.':'Für diese 7 Tage sind keine Gerichte geplant. Du kannst unten eigene Artikel hinzufügen.';
  const categoryOrder=['Gemüse','Obst','Brot & Backwaren','Fleisch & Fisch','Kühlregal','Tiefkühl','Getränke','Vorrat','Drogerie & Haushalt','Tierbedarf','Sonstiges'],grouped=new Map();
  for(const item of counts.values()){const category=ingredientCategory(item.name);if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(item)}
  for(const category of categoryOrder){const items=grouped.get(category);if(!items?.length)continue;for(const container of [open,done]){const categoryItems=items.filter(item=>{const key=item.name.toLocaleLowerCase('de-DE'),checkKey=item.dishes.size?key:`manual:${key}`,relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;return relevantWeeks.every(weekKey=>Boolean(state.shoppingChecks[weekKey]?.[checkKey]))===(container===done)});if(!categoryItems.length)continue;const heading=document.createElement('h3');heading.className='shopping-category-title';heading.textContent=category;container.append(heading);
    for(const item of categoryItems.sort((a,b)=>a.name.localeCompare(b.name,'de'))){const {name,dishes,manual,weekKeys:itemWeekKeys}=item,key=name.toLocaleLowerCase('de-DE'),checked=container===done,checkKey=dishes.size?key:`manual:${key}`,relevantWeeks=itemWeekKeys.size?[...itemWeekKeys]:weekKeys,shell=document.createElement('div'),tile=document.createElement('button');shell.className='shopping-tile-shell';tile.type='button';tile.className=`shopping-tile${checked?' is-checked':''}`;tile.setAttribute('aria-pressed',String(checked));tile.dataset.ingredient=key;tile.innerHTML=`<span class="shopping-tile-icon" aria-hidden="true">${ingredientIcon(name)}</span><span class="shopping-tile-copy"><strong></strong><small></small></span>${checked?'<span class="shopping-tile-status" aria-label="Eingekauft">✓</span>':''}`;tile.querySelector('strong').textContent=name;tile.querySelector('small').textContent=dishes.size?[...dishes].join(', ')+(manual?' · Manuelle Eingabe':''):'Keinem Gericht zugeordnet';
      tile.addEventListener('click',()=>{const checking=!checked;tile.classList.add(checking?'is-completing':'is-unchecking');setTimeout(()=>{relevantWeeks.forEach(weekKey=>{state.shoppingChecks[weekKey]??={};if(checking)state.shoppingChecks[weekKey][checkKey]=true;else delete state.shoppingChecks[weekKey][checkKey];if(!Object.keys(state.shoppingChecks[weekKey]).length)delete state.shoppingChecks[weekKey]});save();renderShoppingList();const target=[...document.querySelectorAll(`#shopping-${checking?'done':'open'} .shopping-tile`)].find(candidate=>candidate.dataset.ingredient===key);target?.classList.add(checking?'just-checked':'just-unchecked')},180)});
      shell.append(tile);const quantity=document.createElement('div');quantity.className='shopping-quantity';quantity.setAttribute('aria-label',`Menge für ${name}`);const currentQuantity=Math.max(1,Number(state.shoppingQuantities?.[key])||1);const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label',`${name}: Menge verringern`);minus.disabled=currentQuantity<=1;const amount=document.createElement('output');amount.textContent=currentQuantity;amount.setAttribute('aria-live','polite');const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label',`${name}: Menge erhöhen`);[minus,plus].forEach(button=>button.addEventListener('click',()=>{const next=Math.max(1,currentQuantity+(button===plus?1:-1));state.shoppingQuantities??={};state.shoppingQuantities[key]=next;save();renderShoppingList()}));quantity.append(minus,amount,plus);shell.append(quantity);container.append(shell)
    }
  }}
  $('#shopping-open-count').textContent=`(${open.querySelectorAll('.shopping-tile').length})`;$('#shopping-done-count').textContent=`(${done.querySelectorAll('.shopping-tile').length})`;syncShoppingDoneDisclosure();updateShoppingNavCount();save({sync:false})
}
function renderShoppingList(){renderShoppingListContent();renderedShoppingSnapshot=shoppingStateForView(state)}
function openShoppingList(){setView('shopping');renderShoppingList()}
function clearShoppingList(){
  const dates=rangeDates(),hiddenByWeek={},manualKeysByWeek={};
  dates.forEach(date=>{
    const weekKey=keyFor(mondayFor(date)),day=state.plans[weekKey]?.[dayIndex(date)]||[];
    hiddenByWeek[weekKey]??=new Set();manualKeysByWeek[weekKey]??=new Set();
    day.forEach(id=>{const dish=state.dishes.find(item=>item.id===id);(dish?.ingredients||[]).forEach(name=>{const key=manualItemKey(name);if(key)hiddenByWeek[weekKey].add(key)})});
    (state.manualShoppingItems?.[weekKey]||[]).forEach(name=>{const key=manualItemKey(name);if(key){hiddenByWeek[weekKey].add(key);manualKeysByWeek[weekKey].add(key)}});
  });
  const hasVisibleEntries=Object.entries(hiddenByWeek).some(([weekKey,keys])=>[...keys].some(key=>!state.hiddenShoppingItems?.[weekKey]?.includes(key)));
  if(!hasVisibleEntries){pendingShoppingClearUndo=null;showToast('Die Einkaufsliste ist bereits leer.');return}
  const previous={shoppingChecks:structuredClone(state.shoppingChecks||{}),hiddenShoppingItems:structuredClone(state.hiddenShoppingItems||{}),manualShoppingItems:structuredClone(state.manualShoppingItems||{})};
  Object.entries(hiddenByWeek).forEach(([weekKey,keys])=>{
    state.hiddenShoppingItems??={};state.hiddenShoppingItems[weekKey]=cleanHiddenShoppingItems([...(state.hiddenShoppingItems[weekKey]||[]),...keys]);
    const checks=state.shoppingChecks[weekKey]||{};
    keys.forEach(key=>{delete checks[key];delete checks[`manual:${key}`]});
    if(Object.keys(checks).length)state.shoppingChecks[weekKey]=checks;else delete state.shoppingChecks[weekKey];
    const remaining=(state.manualShoppingItems[weekKey]||[]).filter(name=>!manualKeysByWeek[weekKey]?.has(manualItemKey(name)));
    if(remaining.length)state.manualShoppingItems[weekKey]=remaining;else delete state.manualShoppingItems[weekKey];
  });
  $('#shopping-meal-filter').value='';save();renderShoppingList();
  const undoState={reopenedByWeek:{},expiresAt:Date.now()+6500};
  pendingShoppingClearUndo=undoState;
  setTimeout(()=>{if(pendingShoppingClearUndo===undoState)pendingShoppingClearUndo=null},6500);
  showToast('Einkaufsliste geleert.',{actionLabel:'Rückgängig',duration:6500,onAction:()=>{
    state.shoppingChecks=previous.shoppingChecks;state.hiddenShoppingItems=previous.hiddenShoppingItems;state.manualShoppingItems=previous.manualShoppingItems;
    Object.entries(undoState.reopenedByWeek).forEach(([weekKey,keys])=>{
      const reopened=new Set(keys),hidden=cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).filter(key=>!reopened.has(key));
      if(hidden.length)state.hiddenShoppingItems[weekKey]=hidden;else delete state.hiddenShoppingItems[weekKey];
      const checks=state.shoppingChecks[weekKey]||{};
      reopened.forEach(key=>{delete checks[key];delete checks[`manual:${key}`]});
      if(Object.keys(checks).length)state.shoppingChecks[weekKey]=checks;else delete state.shoppingChecks[weekKey];
    });
    if(pendingShoppingClearUndo===undoState)pendingShoppingClearUndo=null;
    save();renderShoppingList();showToast('Einkaufsliste wiederhergestellt.');
  }});
}
function reopenShoppingIngredients(date,dish){
  const weekKey=keyFor(mondayFor(date)),keys=[...new Set(cleanIngredients(dish?.ingredients).map(manualItemKey).filter(Boolean))];
  if(!keys.length)return;
  const reopened=new Set(keys);
  state.hiddenShoppingItems??={};
  const hidden=cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).filter(key=>!reopened.has(key));
  if(hidden.length)state.hiddenShoppingItems[weekKey]=hidden;else delete state.hiddenShoppingItems[weekKey];
  state.shoppingChecks??={};
  const checks=state.shoppingChecks[weekKey]||{};
  keys.forEach(key=>{delete checks[key];delete checks[`manual:${key}`]});
  if(Object.keys(checks).length)state.shoppingChecks[weekKey]=checks;else delete state.shoppingChecks[weekKey];
  if(pendingShoppingClearUndo){
    if(Date.now()<=pendingShoppingClearUndo.expiresAt){
      pendingShoppingClearUndo.reopenedByWeek[weekKey]??=[];
      pendingShoppingClearUndo.reopenedByWeek[weekKey]=[...new Set([...pendingShoppingClearUndo.reopenedByWeek[weekKey],...keys])];
    }else pendingShoppingClearUndo=null;
  }
}
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
      button.addEventListener('click',()=>{reopenShoppingIngredients(targetDate,d);getPlanForDate(targetDate)[dayIndex(targetDate)].push(d.id);pinnedMealsForDate(targetDate).push(false);setRestDay(targetDate,false);save();$('#choose-dialog').close();renderCalendar()});
      entries.push({dish:d,button});
    });
    const empty=document.createElement('p');empty.className='empty-state choose-no-results';empty.hidden=true;empty.textContent='Keine passenden Gerichte gefunden.';
    list.append(...entries.map(entry=>entry.button),empty);
    const filter=()=>{const query=search.value.trim().toLocaleLowerCase('de-DE');let visible=0;for(const {dish,button} of entries){const haystack=[dish.name,dish.ingredient,...(dish.ingredients||[])].join(' ').toLocaleLowerCase('de-DE'),match=haystack.includes(query);button.hidden=!match;if(match)visible++}empty.hidden=visible>0};
    search.oninput=filter;
  }
  const dialog=$('#choose-dialog');if(!dialog.open)dialog.showModal();
}
function showCatalogFeedback(text){const feedback=$('#catalog-feedback');feedback.textContent=text;feedback.hidden=!text}
function catalogDishToLocalDish(dish){return{id:newId(),name:dish.name,ingredient:dish.ingredient||'',time:Number(dish.cooking_time_minutes)||30,emoji:dish.emoji||emojiMap[dish.ingredient]||'🍽️',ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)}}
async function removeCatalogImportForDish(dishId){pendingCatalogImports=pendingCatalogImports.filter(item=>item.dishId!==dishId);try{await window.WochentischStore?.remove('imports',dishId)}catch(error){console.warn('Vorgemerkter Katalogimport konnte nicht entfernt werden:',error)}}
function adoptCatalogDish(catalogDish){return adoptCatalogDishes([catalogDish])>0}
function adoptCatalogDishes(dishes){
  const names=new Set(state.dishes.map(dish=>dish.name.trim().toLocaleLowerCase('de-DE'))),added=[],newImports=[];
  (dishes||[]).forEach(catalogDish=>{
    const name=catalogDish.name.trim().toLocaleLowerCase('de-DE');
    if(names.has(name))return;
    names.add(name);
    const dish=catalogDishToLocalDish(catalogDish);state.dishes.push(dish);added.push(dish);
    const queued={dishId:dish.id,catalogId:catalogDish.id,name:catalogDish.name,userId:currentUserId};pendingCatalogImports.push(queued);newImports.push(queued);
  });
  if(!added.length)showCatalogFeedback('Alle ausgewählten Standardgerichte sind bereits in deiner Sammlung.');
  else{save();newImports.forEach(item=>enqueueOfflineStoreWrite('imports',item.dishId,item));renderDishes();renderCalendar();showCatalogFeedback(`${added.length} ${added.length===1?'Gericht ist':'Gerichte sind'} vorgemerkt und werden synchronisiert.`)}
  renderCatalogDishes(dishes,{offline:!navigator.onLine});
  return added.length;
}
function renderCatalogDishes(dishes,{offline=false}={}){
  const list=$('#catalog-list'),search=$('#catalog-search'),query=search.value.trim().toLocaleLowerCase('de-DE');
  list.replaceChildren();
  const ownNames=new Set(state.dishes.map(dish=>dish.name.toLocaleLowerCase('de-DE'))),queuedCatalogIds=new Set(pendingCatalogImports.map(item=>item.catalogId));
  const addAll=$('#catalog-add-all'),available=(dishes||[]).filter(dish=>!ownNames.has(dish.name.toLocaleLowerCase('de-DE'))).length;
  addAll.disabled=!available;addAll.textContent=available?'Alles übernehmen':'Alles bereits übernommen';addAll.onclick=()=>adoptCatalogDishes(dishes);
  const entries=[];
  (dishes||[]).forEach(dish=>{
    const alreadyAdded=ownNames.has(dish.name.toLocaleLowerCase('de-DE')),queued=queuedCatalogIds.has(dish.id);
    const button=document.createElement('button');button.type='button';button.className='choose-item';button.disabled=alreadyAdded;
    const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';
    const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=dish.name;
    const details=document.createElement('small');details.textContent=alreadyAdded?(queued?'Vorgemerkt · wird synchronisiert':'Bereits hinzugefügt'):`${dish.ingredient||'Ohne Kategorie'} · ${dish.cooking_time_minutes||30} Min.`;
    copy.append(name,details);button.append(icon,copy);
    button.addEventListener('click',()=>{if(adoptCatalogDish(dish)){renderCatalogDishes(dishes,{offline:!navigator.onLine});showCatalogFeedback(`${dish.name} ist vorgemerkt und wird synchronisiert.`)}});
    const match=dish.name.toLocaleLowerCase('de-DE').includes(query);button.hidden=!match;entries.push({dish,button});
  });
  const empty=document.createElement('p');empty.className='empty-state catalog-no-results';empty.hidden=true;empty.textContent='Keine passenden Gerichte gefunden.';
  list.append(...entries.map(entry=>entry.button),empty);
  empty.hidden=entries.some(entry=>!entry.button.hidden)||!entries.length;
  if(!entries.length){empty.textContent='Der Standardkatalog ist noch leer.';empty.hidden=false}
  if(offline)showCatalogFeedback('Offline: Es wird der zuletzt geladene Standardkatalog angezeigt.');
}
async function openCatalog(){
  const dialog=$('#catalog-dialog'),list=$('#catalog-list'),search=$('#catalog-search');$('#catalog-feedback').hidden=true;search.value='';list.innerHTML='<p class="empty-state">Standardkatalog wird geladen …</p>';if(!dialog.open)dialog.showModal();
  let cached=[];
  try{cached=(await window.WochentischStore?.getAll('catalog')||[]).map(record=>record.value).filter(Boolean).sort((a,b)=>(a.name||'').localeCompare(b.name||'','de-DE',{sensitivity:'base'}))}catch(error){console.warn('Lokaler Standardkatalog konnte nicht gelesen werden:',error)}
  if(cached.length)renderCatalogDishes(cached,{offline:!navigator.onLine});
  if(!navigator.onLine){if(!cached.length){list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Der Standardkatalog wird nach dem nächsten Onlinebesuch offline verfügbar sein.';list.append(message);$('#catalog-add-all').disabled=true}return}
  if(!authClient){try{await authClientReadyPromise}catch(error){}}
  if(!authClient){if(!cached.length){list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Der Katalog kann gerade nicht aktualisiert werden.';list.append(message)}return}
  try{
    const {data,error}=await authClient.from('catalog_dishes').select('*');if(error)throw error;
    const dishes=(data||[]).sort((a,b)=>(a.name||'').localeCompare(b.name||'','de-DE',{sensitivity:'base'}));
    if(window.WochentischStore)await Promise.all(dishes.map(dish=>window.WochentischStore.put('catalog',dish.id,dish)));
    renderCatalogDishes(dishes);
  }catch(error){
    console.warn('Online-Katalog konnte nicht geladen werden:',error);
    if(cached.length)showCatalogFeedback('Der letzte Katalogstand wird angezeigt. Aktualisieren ist gerade nicht möglich.');
    else{list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Standardkatalog konnte gerade nicht geladen werden. Bitte später erneut versuchen.';list.append(message)}
  }
}
function setView(view,{render=true}={}){const views={home:'#home-view',week:'#week-view',dishes:'#dishes-view',shopping:'#shopping-view'};if(!views[view]||(view==='home'&&!window.matchMedia('(max-width: 700px)').matches))view='week';try{localStorage.setItem(lastViewStorageKey,view)}catch(error){}Object.entries(views).forEach(([name,selector])=>$(selector).classList.toggle('hidden',name!==view));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const labels={week:'Wochenplan',dishes:'Meine Gerichte',shopping:'Einkaufszettel'};$('#crumb-view').textContent=labels[view]||'';$('#crumb-view').hidden=view==='home';$('#crumb-separator').hidden=view==='home';if(render&&view==='dishes')renderDishes();if(render&&view==='shopping')renderShoppingList()}
function savedSidebarCollapsed(){try{return localStorage.getItem(sidebarCollapsedStorageKey)==='true'}catch(error){return false}}
function updateMenuToggleState(){const compact=compactNavigationQuery.matches,open=$('#sidebar').classList.contains('mobile-open'),collapsed=$('.app-shell').classList.contains('sidebar-collapsed'),menuLabel=open?'Menü schließen':'Menü öffnen',sidebarLabel=collapsed?'Seitenleiste ausklappen':'Seitenleiste einklappen';$('#menu-toggle').setAttribute('aria-expanded',String(compact&&open));$('#menu-toggle').setAttribute('aria-label',menuLabel);$('#menu-toggle').title=menuLabel;$('#sidebar-toggle').setAttribute('aria-expanded',String(!collapsed));$('#sidebar-toggle').setAttribute('aria-label',sidebarLabel);$('#sidebar-toggle').title=sidebarLabel;$('#sidebar-toggle').firstElementChild.textContent=collapsed?'›':'‹'}
function closeMobileMenu(){$('#sidebar').classList.remove('mobile-open');$('#menu-backdrop').hidden=true;updateMenuToggleState()}
function toggleMobileMenu(){const open=$('#sidebar').classList.toggle('mobile-open');$('#menu-backdrop').hidden=!open;updateMenuToggleState()}
function setSidebarCollapsed(collapsed){const shouldCollapse=Boolean(collapsed)&&!compactNavigationQuery.matches;$('.app-shell').classList.toggle('sidebar-collapsed',shouldCollapse);try{localStorage.setItem(sidebarCollapsedStorageKey,String(Boolean(collapsed)))}catch(error){}updateMenuToggleState()}
function applyResponsiveNavigation(){const compact=compactNavigationQuery.matches;$('#sidebar').classList.remove('mobile-open');$('#menu-backdrop').hidden=true;$('.app-shell').classList.toggle('sidebar-collapsed',!compact&&savedSidebarCollapsed());updateMenuToggleState()}
$('#shopping-done-toggle').addEventListener('click',()=>{shoppingDoneExpanded=!shoppingDoneExpanded;syncShoppingDoneDisclosure()});
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');let themeOverride=null;
function updateThemeButton(){const button=$('#theme-toggle');const label=themeOverride?'Systemmodus verwenden':systemTheme.matches?'Hellmodus testen':'Dunkelmodus testen';button.textContent=themeOverride?'↻':systemTheme.matches?'☀':'☾';button.setAttribute('aria-label',label);button.title=label}
function applyTheme(){const link=$('#theme-stylesheet');link.media=themeOverride?(themeOverride==='dark'?'all':'not all'):'(prefers-color-scheme: dark)';updateThemeButton()}
function toggleTheme(){themeOverride=themeOverride?null:systemTheme.matches?'light':'dark';applyTheme()}
$('#theme-toggle').addEventListener('click',toggleTheme);systemTheme.addEventListener('change',()=>{if(!themeOverride)updateThemeButton()});applyTheme();$('#menu-toggle').addEventListener('click',toggleMobileMenu);$('#sidebar-toggle').addEventListener('click',()=>setSidebarCollapsed(!$('.app-shell').classList.contains('sidebar-collapsed')));compactNavigationQuery.addEventListener('change',applyResponsiveNavigation);applyResponsiveNavigation();$('#menu-backdrop').addEventListener('click',closeMobileMenu);document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view);closeMobileMenu()}));document.querySelectorAll('[data-home-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.homeView)));$('#home-breadcrumb').addEventListener('click',()=>setView(window.matchMedia('(max-width: 700px)').matches?'home':'week'));window.matchMedia('(max-width: 700px)').addEventListener('change',event=>{if(!event.matches&&$('#home-view').classList.contains('hidden')===false)setView('week')});$('#shopping-btn').addEventListener('click',openShoppingList);$('#shopping-back').addEventListener('click',()=>setView('week'));$('#shopping-clear').addEventListener('click',clearShoppingList);$('#shopping-print').addEventListener('click',()=>window.print());$('#week-print').addEventListener('click',()=>{document.body.classList.add('print-week');window.print()});window.addEventListener('afterprint',()=>document.body.classList.remove('print-week'));$('#shopping-meal-filter').addEventListener('change',renderShoppingList);$('#shopping-add-form').addEventListener('submit',e=>{e.preventDefault();const name=normalizeIngredient($('#shopping-item-input').value);if(!name)return;const weekKey=keyFor(mondayFor(rangeStart())),visibleWeekKeys=[...new Set(rangeDates().map(date=>keyFor(mondayFor(date))))],itemKey=manualItemKey(name);state.manualShoppingItems??={};state.hiddenShoppingItems??={};state.manualShoppingItems[weekKey]??=[];const duplicate=visibleWeekKeys.some(key=>(state.manualShoppingItems[key]||[]).some(item=>manualItemKey(item)===itemKey));if(duplicate){showToast('Dieser Artikel steht bereits auf dem Einkaufszettel.');return}state.manualShoppingItems[weekKey].push(name);const hidden=cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).filter(key=>key!==itemKey);if(hidden.length)state.hiddenShoppingItems[weekKey]=hidden;else delete state.hiddenShoppingItems[weekKey];delete state.shoppingChecks[weekKey]?.[`manual:${itemKey}`];save();$('#shopping-item-input').value='';$('#shopping-meal-filter').value='';renderShoppingList();$('#shopping-item-input').focus()});$('#shopping-overview').addEventListener('click',()=>{$('#shopping-meal-filter').value='';renderShoppingList()});
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
$('#add-dish-btn').addEventListener('click',()=>openDish());$('#starter-add').addEventListener('click',()=>openDish());$('#search-dishes').addEventListener('input',renderDishes);$('#close-dish-dialog').addEventListener('click',()=>$('#dish-dialog').close());$('#cancel-dialog').addEventListener('click',()=>$('#dish-dialog').close());$('#delete-dish').addEventListener('click',()=>{const id=$('#dish-id').value;if(!id)return;removeCatalogImportForDish(id);state.dishes=state.dishes.filter(d=>d.id!==id);Object.entries(state.plans).forEach(([week,days])=>days.forEach((day,dayIndexValue)=>{const pins=state.pinnedMeals?.[week]?.[dayIndexValue]||[];for(let i=day.length-1;i>=0;i--)if(day[i]===id){day.splice(i,1);pins.splice(i,1)}}));save();$('#dish-dialog').close();renderDishes();renderCalendar();showToast('Gericht gelöscht.')});$('#dish-form').addEventListener('submit',e=>{e.preventDefault();const pendingIngredient=$('#dish-ingredient-input').value.trim();if(pendingIngredient)addDishIngredient(pendingIngredient);const id=$('#dish-id').value,name=$('#dish-name').value.trim(),ingredient=$('#dish-ingredient').value.trim(),time=timeBlocks[Number($('#dish-time').value)]||30,ingredients=dishIngredientDraft.slice();if(!name)return;const duplicate=state.dishes.find(d=>d.id!==id&&(d.name.trim().toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE')||dishFingerprint(d.name,d.ingredient,d.ingredients)===dishFingerprint(name,ingredient,ingredients)));if(duplicate){const error=$('#dish-form-error');error.textContent=`Ähnliches Gericht existiert bereits: ${duplicate.name}`;error.hidden=false;return}const existing=state.dishes.find(d=>d.id===id);if(existing)Object.assign(existing,{name,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️'});else state.dishes.push({id:crypto.randomUUID?.()||`d${Date.now()}`,name,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️'});save();$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-dialog').close();renderDishes();renderCalendar();showToast(existing?'Gericht aktualisiert.':'Gericht hinzugefügt.')});
$('#catalog-btn').addEventListener('click',openCatalog);$('#close-catalog').addEventListener('click',event=>{event.preventDefault();const dialog=$('#catalog-dialog');if(dialog.open)dialog.close()});$('#catalog-search').addEventListener('input',event=>{const query=event.currentTarget.value.trim().toLocaleLowerCase('de-DE'),list=$('#catalog-list'),buttons=[...list.querySelectorAll('.choose-item')];let visible=0;buttons.forEach(button=>{const match=button.querySelector('b').textContent.toLocaleLowerCase('de-DE').includes(query);button.hidden=!match;if(match)visible++});const empty=list.querySelector('.catalog-no-results');if(empty)empty.hidden=visible>0||buttons.length===0});$('#catalog-dialog').addEventListener('click',event=>{if(event.target===$('#catalog-dialog'))$('#catalog-dialog').close()});
$('#sync-status-conflicts').addEventListener('click',openConflictReview);$('#close-conflicts').addEventListener('click',()=>$('#conflict-dialog').close());
window.addEventListener('wochentisch:update-ready',event=>showToast('Ein App-Update ist bereit.',{actionLabel:'Jetzt aktualisieren',duration:12000,onAction:()=>window.activateWochentischUpdate?.(event.detail)}));
window.addEventListener('wochentisch:update-blocked',event=>showToast('Schließe zuerst die offene Eingabe. Danach kannst du das Update starten.',{actionLabel:'Jetzt aktualisieren',duration:20000,onAction:()=>window.activateWochentischUpdate?.(event.detail)}));
$('#close-chooser').addEventListener('click',()=>{const dialog=$('#choose-dialog');if(dialog.open)dialog.close()});$('#choose-dialog').addEventListener('click',event=>{if(event.target===$('#choose-dialog'))$('#choose-dialog').close()});
if(state.noteHidden)$('#bottom-note').classList.add('hidden');updateCounts();

