const emojiMap=Object.assign(Object.create(null),{'Hühnchen':'🍗','Rind':'🥘','Fisch':'🐟','Schwein':'🥓','Wurst':'🌭','Vegetarisch':'🥦','Pasta':'🍝','Ei':'🍳'});
const shortDays=['MO','DI','MI','DO','FR','SA','SO'];
const timeBlocks=[15,30,45,60,90,120];
const nutritionFields=[
  {key:'kcal',id:'dish-nutrition-kcal'},
  {key:'protein',id:'dish-nutrition-protein'},
  {key:'fat',id:'dish-nutrition-fat'},
  {key:'carbs',id:'dish-nutrition-carbs'}
];
const $=s=>document.querySelector(s);
const supabaseConfig=window.WOCHENTISCH_SUPABASE;
const supabaseScriptUrl='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const supabaseScriptIntegrity='sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK';
let authClient=null;
let authClientReadyPromise=null;
let state=emptyState(); let weekOffset=0; let toastTimer;let pantryDraft=[];let dishIngredientDraft=[];let mealDragState=null;let mealActionPointerState=null;let suppressedMealActionClick=null;let pendingShoppingClearUndo=null;let shoppingDoneExpanded=false;
let unresolvedConflicts=[];
let pendingCatalogImports=[];
let offlineStoreReady=false;
let offlineStoreWriteQueue=Promise.resolve();
let appInitialized=false;
let authScope=0,authUserLoad=null,hasLocalState=false;
let currentUserId='';
let currentHouseholdId='';
let cookingHouseholdScopeId='';
let interactiveLoginPending=false;
const lastViewStorageKey='wochentisch-last-view';
const sidebarCollapsedStorageKey='wochentisch-sidebar-collapsed';
const compactNavigationQuery=window.matchMedia('(max-width: 700px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
const offlineSessionStorageKey='wochentisch-last-signed-in-user';
function cookingHouseholdStorageKey(userId){return`wochentisch-cooking-household:${userId}`}
function rememberCookingHouseholdScope(householdId,userId=currentUserId){
  cookingHouseholdScopeId=householdId||'';
  if(!userId||!householdId)return;
  safeLocalStorageSet(cookingHouseholdStorageKey(userId),householdId);
}
function loadCookingHouseholdScope(userId){
  try{return userId?localStorage.getItem(cookingHouseholdStorageKey(userId))||'':''}catch(error){return''}
}
let cloudReady=false;
let cloudBaseState=null;
let syncCoordinator=null, syncWriteBarrier=null, syncCoordinatorKey='';
let cloudConnectPromise;
let realtimeChannel=null;
let cloudSyncTimer;
let cloudSyncInProgress=false;
let cloudSyncRequested=false;
let cloudSyncNotificationRequested=false;
let cloudSyncPromise=null;
let pullRefreshGesture=null;
let loadingCloudState=false;
let cloudStateOverrideInProgress=false;
let cloudStateOverrideError='';
let offlineMode=false;
let explicitSignOutPending=false;
let signInPromptActive=false;
let renderedCalendarSnapshot=null;
let renderedDishesSnapshot=null;
let renderedShoppingSnapshot=null;
let recipeEditorMode='dish';
let catalogEditDraft=null;
let catalogEditPermission=false;
let adminCatalogDishes=[];
let recipeReturnScroll=0;
let cookingStage='list';
let selectedRecipeDishId='';
let recipeDetailPreviousView='week';
let cookingProgress=null;
let selectedCookServings=2;
function catalogDishNameKey(value){return String(value||'').trim().toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu,'')}
// Native dialogs usually lock page scrolling, but iOS Safari can still move the
// document during touch gestures. Keep the page position fixed while any dialog is open.
let dialogScrollLockCount=0;
let dialogScrollY=0;
let lastVisualViewportHeight=0;
function syncVisualViewport(){
  const viewport=window.visualViewport;
  if(!viewport)return;
  document.documentElement.style.setProperty('--visual-viewport-height',`${viewport.height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top',`${viewport.offsetTop}px`);
  document.documentElement.classList.toggle('dish-keyboard-open', window.innerHeight-viewport.height>150 && Boolean(document.querySelector('#dish-dialog[open] input:focus, #dish-dialog[open] textarea:focus')));
  const heightChanged=lastVisualViewportHeight!==viewport.height;lastVisualViewportHeight=viewport.height;
  const focused=document.activeElement;if(heightChanged&&document.documentElement.classList.contains('dish-keyboard-open')&&focused?.closest('#dish-dialog'))requestAnimationFrame(()=>focused.scrollIntoView({block:'nearest',inline:'nearest'}));
}
syncVisualViewport();
window.visualViewport?.addEventListener('resize',syncVisualViewport);
window.visualViewport?.addEventListener('scroll',syncVisualViewport);
document.addEventListener('focusin',()=>requestAnimationFrame(syncVisualViewport));
document.addEventListener('focusout',()=>requestAnimationFrame(syncVisualViewport));
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
  dialog.addEventListener('close',()=>{unlockPageScroll();if(dialog.id==='dish-dialog')document.documentElement.classList.remove('dish-keyboard-open')});
  dialog.addEventListener('focusin',event=>{
    if(!event.target.matches('input,select,textarea'))return;
    if(dialog.id==='pantry-dialog')return;
    if(event.target.id==='dish-ingredient-input'||event.target.id==='dish-ingredient'){
      const field=event.target.closest('.dish-ingredient-suggest');
      const reveal=()=>{
        field.scrollIntoView({block:'nearest',inline:'nearest'});
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
    requestAnimationFrame(()=>event.target.scrollIntoView({block:'nearest',inline:'nearest'}));
  });
  const showModal=dialog.showModal.bind(dialog);
  dialog.showModal=()=>{lockPageScroll();showModal()};
});
function showAuthError(message){const error=$('#auth-error');error.textContent=message;error.hidden=!message}
function updateSyncStatus(message,{reauthRequired=false,storageError=false}={}){const status=$('#sync-status');if(!status)return;const hasConflicts=unresolvedConflicts.length>0;$('#sync-status-message').textContent=message||(hasConflicts?`${unresolvedConflicts.length} Änderung${unresolvedConflicts.length===1?'':'en'} muss${unresolvedConflicts.length===1?'':'en'} geprüft werden.`:'');$('#sync-status-login').hidden=!reauthRequired;$('#sync-status-conflicts').hidden=!hasConflicts;status.hidden=!(message||hasConflicts);status.classList.toggle('is-storage-error',storageError)}
function cloudMigrationKey(){return currentUserId?`wochentisch-cloud-migrated-${currentUserId}`:''}
function appStateKey(userId=currentUserId){return `app-state:${userId}`}
function cloudBackupKey(userId=currentUserId){return `wochentisch-cloud-backup-${userId}`}
function rememberedOfflineUser(){try{return localStorage.getItem(offlineSessionStorageKey)||''}catch(error){return''}}
function savedView(){try{const view=localStorage.getItem(lastViewStorageKey);return ['home','week','dishes','shopping','cooking','catalog-admin'].includes(view)?view:'week'}catch(error){return 'week'}}
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
async function readUserState(userId){
  await offlineStoreWriteQueue.catch(()=>{});
  const valid=value=>Boolean(value&&Array.isArray(value.dishes)&&value.plans);
  if(offlineStoreReady){
    try{
      for(const key of [appStateKey(userId),cloudBackupKey(userId)]){
        const saved=await window.WochentischStore.get('records',key);
        if(valid(saved))return normalizeState(saved);
      }
      if(localStorage.getItem('wochentisch-local-owner')===userId){
        const legacy=await window.WochentischStore.get('records','app-state');
        if(valid(legacy))return normalizeState(legacy);
      }
    }catch(error){console.warn('Lokaler Kontostand konnte nicht gelesen werden:',error)}
  }
  try{
    const saved=localStorage.getItem(appStateKey(userId))||localStorage.getItem(cloudBackupKey(userId))||
      (localStorage.getItem('wochentisch-local-owner')===userId?localStorage.getItem('wochentisch-sync-v1'):null);
    const value=JSON.parse(saved);
    return valid(value)?normalizeState(value):null;
  }catch(error){return null}
}
function cleanIngredients(ingredients){return window.WochentischIngredients?.unique(ingredients)||[]}
function cleanHiddenShoppingItems(items){return [...new Set((Array.isArray(items)?items:[]).map(manualItemKey).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de-DE'))}
function cleanRestDays(days){return [...new Set((Array.isArray(days)?days:[]).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<7))].sort((a,b)=>a-b)}
function cleanNutrition(nutrition){
  if(!nutrition||typeof nutrition!=='object'||Array.isArray(nutrition))return null;
  const cleaned={};
  nutritionFields.forEach(({key})=>{
    const raw=nutrition[key];
    if(raw===null||raw===undefined||(typeof raw==='string'&&!raw.trim())||typeof raw==='boolean')return;
    const value=typeof raw==='number'?raw:typeof raw==='string'?Number(raw.trim()):NaN;
    if(Number.isFinite(value)&&value>=0)cleaned[key]=value;
  });
  return Object.keys(cleaned).length?cleaned:null;
}
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
  return idMap.size>0;
}
async function getCurrentHousehold(){
  const {data,error}=await authClient.rpc('ensure_my_household');
  if(error)throw error;
  if(!data)throw new Error('Für dieses Konto konnte kein Haushalt angelegt werden.');
  return data;
}
async function readStateFromCloud(householdId=currentHouseholdId){
  const snapshot=await window.WochentischSyncApi.create(authClient).pull(householdId);
  if(snapshot){
    const rawState=snapshot.state;
    return {
      state:normalizeState({...rawState,noteHidden:state.noteHidden}),
      hasCloudData:Boolean(rawState.dishes.length||Object.keys(rawState.plans).length),
      rawState
    };
  }
  return readLegacyStateFromCloud(householdId);
}
async function readLegacyStateFromCloud(householdId=currentHouseholdId){
  const [dishesResult,plansResult]=await Promise.all([
    authClient.from('dishes').select('*').eq('household_id',householdId).order('created_at'),
    authClient.from('weekly_plans').select('id, household_id, week_start, pantry_ingredients, rest_days, shopping_quantities, shopping_hidden_items, updated_at').eq('household_id',householdId).order('week_start')
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
    id:dish.id,name:dish.name,ingredient:dish.ingredient,type:dish.recipe_type==='baking'?'baking':'meal',time:dish.cooking_time_minutes,
    emoji:dish.emoji,ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition),
    recipe:window.WochentischRecipes.normalizeRecipe(dish.recipe),catalogSourceId:dish.catalog_source_id||null,
    catalogSourceVersion:Number.isInteger(dish.catalog_source_version)?dish.catalog_source_version:null
  })),plans:{},pinnedMeals:{},restDays:{},noteHidden:state.noteHidden,shoppingChecks:{},hiddenShoppingItems:{},manualShoppingItems:{},shoppingQuantities:{}};
  nextState.pantryIngredients={};
  const weekByPlanId=new Map();
  plans.forEach(plan=>{nextState.plans[plan.week_start]=Array.from({length:7},()=>[]);nextState.pinnedMeals[plan.week_start]=Array.from({length:7},()=>[]);nextState.restDays[plan.week_start]=cleanRestDays(plan.rest_days);nextState.pantryIngredients[plan.week_start]=cleanIngredients(plan.pantry_ingredients);nextState.hiddenShoppingItems[plan.week_start]=cleanHiddenShoppingItems(plan.shopping_hidden_items);Object.assign(nextState.shoppingQuantities,window.WochentischIngredients.normalizeQuantities(plan.shopping_quantities||{}));weekByPlanId.set(plan.id,plan.week_start)});
  meals.forEach(meal=>{const week=weekByPlanId.get(meal.weekly_plan_id);if(week&&nextState.plans[week][meal.day_of_week]){nextState.plans[week][meal.day_of_week][meal.position]=meal.dish_id;nextState.pinnedMeals[week][meal.day_of_week][meal.position]=Boolean(meal.is_pinned)}});
  Object.entries(nextState.plans).forEach(([week,days])=>days.forEach((day,index)=>{const entries=day.map((id,position)=>({id,pinned:Boolean(nextState.pinnedMeals[week][index][position])})).filter(item=>item.id);days[index]=entries.map(item=>item.id);nextState.pinnedMeals[week][index]=entries.map(item=>item.pinned)}));
  shoppingItems.forEach(item=>{const week=weekByPlanId.get(item.weekly_plan_id);if(week)(nextState.manualShoppingItems[week]??=[]).push(item.name)});
  shoppingChecks.forEach(item=>{const week=weekByPlanId.get(item.weekly_plan_id);if(week){const key=window.WochentischIngredients.manualKey(String(item.item_key||'').replace(/^manual:/i,''));if(key)(nextState.shoppingChecks[week]??=Object.create(null))[key]=true}});
  const normalizedState=normalizeState(nextState);
  return {
    state:normalizedState,
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
function hasUncanonicalCloudIngredients(remote){
  if(remote.rawState)return !sameValue(remote.rawState,window.WochentischIngredients.normalizeStateIngredients(remote.rawState));
  if((remote.dishRows||[]).some(row=>!sameValue(row.ingredients,cleanIngredients(row.ingredients))))return true;
  if((remote.planRows||[]).some(row=>!sameValue(row.pantry_ingredients,cleanIngredients(row.pantry_ingredients))||!sameValue(row.shopping_hidden_items,cleanHiddenShoppingItems(row.shopping_hidden_items))||!sameValue(row.shopping_quantities||{},window.WochentischIngredients.normalizeQuantities(row.shopping_quantities||{}))))return true;
  if((remote.shoppingItemRows||[]).some(row=>row.name!==normalizeIngredient(row.name)||row.normalized_name!==manualItemKey(row.name)))return true;
  return (remote.shoppingCheckRows||[]).some(row=>row.item_key!==window.WochentischIngredients.key(String(row.item_key||'').replace(/^manual:/i,'')));
}
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
  if(!meals.length)return undefined;
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
    let hasPlan=[baseState,localState,remoteState].some(value=>Object.prototype.hasOwnProperty.call(value.plans||{},week));
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
    if(userId!==currentUserId||(householdId&&householdId!==currentHouseholdId))return;
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
function updateConflictCloudAction(){
  const cloudButton=$('#conflict-cloud-all'),cloudHint=$('#conflict-cloud-hint');
  if(!cloudButton||!cloudHint)return;
  cloudButton.hidden=!unresolvedConflicts.length;
  cloudButton.disabled=!cloudReady||!navigator.onLine||cloudStateOverrideInProgress;
  if(cloudStateOverrideError){cloudHint.textContent=cloudStateOverrideError;cloudHint.hidden=false}
  else{
    cloudHint.hidden=cloudReady&&navigator.onLine;
    cloudHint.textContent=navigator.onLine?'Die Cloud ist gerade nicht verbunden.':'Zum Übernehmen brauchst du eine Internetverbindung.';
  }
  document.querySelectorAll('#conflict-list .conflict-choice').forEach(button=>{button.disabled=cloudStateOverrideInProgress});
}
function renderConflictReview(){
  const list=$('#conflict-list');list.replaceChildren();
  updateConflictCloudAction();
  if(!unresolvedConflicts.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Alle Änderungen sind geklärt.';list.append(empty);return}
  unresolvedConflicts.forEach(conflict=>{
    const card=document.createElement('article');card.className='conflict-card';
    const title=document.createElement('h3');title.textContent=conflict.label;
    const choices=document.createElement('div');choices.className='conflict-choices';
    [['local','Deine Fassung',conflict.localValue],['remote','Haushaltsfassung',conflict.remoteValue]].forEach(([source,label,value])=>{
      const button=document.createElement('button');button.type='button';button.className='conflict-choice';
      button.disabled=cloudStateOverrideInProgress;
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
  if(!cloudReady||!navigator.onLine||cloudStateOverrideInProgress){updateSyncStatus('Zum Klären der Änderung ist eine Verbindung nötig.');return}
  cloudStateOverrideInProgress=true;updateConflictCloudAction();
  try{
    if(cloudSyncInProgress&&cloudSyncPromise)await cloudSyncPromise;
    const coordinator=getSyncCoordinator();
    await coordinator.resolve(conflict,source);
    await syncWriteBarrier.drain();
    await removeOrphanedCookingProgress();
    cloudBaseState=await readCloudBase();
    await loadOfflineQueues(currentUserId,currentHouseholdId);
    updateCounts();refreshVisibleView();updateSyncStatus('');
    if(unresolvedConflicts.length)renderConflictReview();else $('#conflict-dialog').close();
  }catch(error){console.warn('Konflikt konnte nicht geklärt werden:',error);updateSyncStatus('Die Änderung konnte nicht geklärt werden. Bitte erneut versuchen.')}
  finally{cloudStateOverrideInProgress=false;updateConflictCloudAction();if(cloudReady&&hasCloudChanges(cloudBaseState,state))scheduleCloudSync()}
}
async function takeCloudStateForAllConflicts(){
  if(!unresolvedConflicts.length||!cloudReady||!navigator.onLine||cloudStateOverrideInProgress)return;
  const button=$('#conflict-cloud-all'),hint=$('#conflict-cloud-hint');
  cloudStateOverrideError='';
  cloudStateOverrideInProgress=true;button.disabled=true;button.textContent='Cloud-Stand wird geladen …';hint.hidden=true;updateConflictCloudAction();
  clearTimeout(cloudSyncTimer);
  try{
    if(cloudSyncInProgress&&cloudSyncPromise)await cloudSyncPromise;
    clearTimeout(cloudSyncTimer);cloudSyncRequested=false;cloudSyncNotificationRequested=false;
    const coordinator=getSyncCoordinator();
    for(const conflict of [...unresolvedConflicts])await coordinator.resolve(conflict,'remote');
    await syncWriteBarrier.drain();
    await removeOrphanedCookingProgress();
    cloudBaseState=await readCloudBase();
    await loadOfflineQueues(currentUserId,currentHouseholdId);
    updateCounts();refreshVisibleView();updateSyncStatus('');
    if(unresolvedConflicts.length){renderConflictReview();showToast('Der Haushaltsstand hat sich geändert. Bitte prüfe die verbleibenden Änderungen.')}
    else{$('#conflict-dialog').close();showToast('Die Haushaltsfassungen wurden übernommen.')}
  }catch(error){
    console.error('Cloud-Stand konnte nicht vollständig übernommen werden:',error);
    cloudStateOverrideError='Cloud-Stand konnte nicht übernommen werden. Prüfe die Verbindung und versuche es erneut.';
  }finally{
    cloudStateOverrideInProgress=false;
    button.textContent='Alle Haushaltsfassungen übernehmen';updateConflictCloudAction();
  }
}
function cloudComparable(value){
  const shoppingChecks=Object.fromEntries(Object.entries(value.shoppingChecks||{}).map(([week,checks])=>[
    week,window.WochentischIngredients.normalizeChecks(checks)
  ]).filter(([,checks])=>Object.keys(checks).length));
  const manualShoppingItems=Object.fromEntries(Object.entries(value.manualShoppingItems||{}).map(([week,items])=>[
    week,(Array.isArray(items)?items:[]).map(normalizeManualItem).filter(Boolean).sort((a,b)=>a.localeCompare(b,'de-DE'))
  ]).filter(([,items])=>items.length));
  const hiddenShoppingItems=Object.fromEntries(Object.entries(value.hiddenShoppingItems||{}).map(([week,items])=>[
    week,cleanHiddenShoppingItems(items)
  ]).filter(([,items])=>items.length));
  return {
    dishes:(value.dishes||[]).map(dish=>({
      id:dish.id,name:dish.name,ingredient:dish.ingredient||'',type:dish.type==='baking'?'baking':'meal',time:Number(dish.time)||30,
      emoji:dish.emoji||emojiMap[dish.ingredient]||'🍽️',ingredients:cleanIngredients(window.WochentischRecipes.shoppingIngredients(dish.recipe,dish.ingredients)),nutrition:cleanNutrition(dish.nutrition),
      recipe:window.WochentischRecipes.normalizeRecipe(dish.recipe),catalogSourceId:dish.catalogSourceId||null,
      catalogSourceVersion:Number.isInteger(dish.catalogSourceVersion)?dish.catalogSourceVersion:null
    })).sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    plans:value.plans||{},pinnedMeals:value.pinnedMeals||{},pantryIngredients:Object.fromEntries(Object.entries(value.pantryIngredients||{}).map(([week,items])=>[week,cleanIngredients(items)])),restDays:value.restDays||{},
    shoppingChecks,
    hiddenShoppingItems,
    manualShoppingItems,
    shoppingQuantities:window.WochentischIngredients.normalizeQuantities(value.shoppingQuantities||{})
  };
}
function hasCloudChanges(first,second){return !sameValue(cloudComparable(first),cloudComparable(second))}
function cloudBaseStorageKey(){return currentUserId&&currentHouseholdId?`wochentisch-cloud-base-${currentUserId}-${currentHouseholdId}`:''}
async function readCloudBase(){
  const key=cloudBaseStorageKey();if(!key)return null;
  if(offlineStoreReady){try{const value=await window.WochentischStore?.get('records',key);return value&&Array.isArray(value.dishes)&&value.plans?normalizeState(value):null}catch(error){return null}}
  try{const value=JSON.parse(localStorage.getItem(key));return value&&Array.isArray(value.dishes)&&value.plans?normalizeState(value):null}catch(error){return null}
}
function saveCloudBase(value){const key=cloudBaseStorageKey();if(!key||!value)return Promise.resolve();return offlineStoreReady?enqueueOfflineStoreWrite('records',key,value):Promise.resolve(safeLocalStorageSet(key,JSON.stringify(value)))}
function manualItemKey(name){return window.WochentischIngredients.manualKey(name)}
function shoppingItemChecked(week,key){return Object.hasOwn(state.shoppingChecks?.[week]||{},key)&&Boolean(state.shoppingChecks[week][key])}
function dayEntry(day,pins,position){return position<(day||[]).length?{dish_id:day[position],is_pinned:Boolean(pins?.[position])}:null}
function dishRow(dish){return {id:dish.id,household_id:currentHouseholdId,name:dish.name,ingredient:dish.ingredient||'',cooking_time_minutes:Number(dish.time)||30,emoji:dish.emoji||'🍽️',ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)}}
async function writeMergedStateToCloud(remote,target,metadata,conflicts){
  const remoteDishes=new Map((metadata.dishRows||[]).map(row=>[row.id,row])),targetDishes=new Map((target.dishes||[]).map(dish=>[dish.id,dish]));
  for(const [id,dish] of targetDishes){
    const current=remoteDishes.get(id),cloudDish=remote.dishes.find(item=>item.id===id);
    if(cloudDish&&sameValue(cloudDish,dish)&&sameValue(current?.ingredients,cleanIngredients(dish.ingredients)))continue;
    if(current){
      const {data,error}=await authClient.from('dishes').update(dishRow(dish)).eq('id',id).eq('household_id',currentHouseholdId).eq('updated_at',current.updated_at).select('id');
      if(error)throw error;
      if(!data?.length)await appendFreshWriteConflict(conflicts,remote,target,'dish',[id],`Gericht: ${dish.name}`);
    }else{
      const {error}=await authClient.from('dishes').insert(dishRow(dish));
      if(error&&error.code!=='23505')throw error;
    }
  }

  const targetWeeks=[...new Set(['plans','pantryIngredients','restDays','shoppingChecks','hiddenShoppingItems','manualShoppingItems'].flatMap(field=>Object.keys(target[field]||{})))];
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
    const updates={},targetPantry=target.pantryIngredients?.[week]||[];
    const remoteRest=remote.restDays?.[week]||[],targetRest=target.restDays?.[week]||[];
    const targetHidden=cleanHiddenShoppingItems(target.hiddenShoppingItems?.[week]);
    if(!sameValue(plan.pantry_ingredients,cleanIngredients(targetPantry)))updates.pantry_ingredients=cleanIngredients(targetPantry);
    if(!sameValue(remoteRest,cleanRestDays(targetRest)))updates.rest_days=cleanRestDays(targetRest);
    if(!sameValue(plan.shopping_hidden_items,targetHidden))updates.shopping_hidden_items=targetHidden;
    const normalizedPlanQuantities=window.WochentischIngredients.normalizeQuantities(plan.shopping_quantities||{});
    if(!sameValue(plan.shopping_quantities||{},normalizedPlanQuantities))updates.shopping_quantities=normalizedPlanQuantities;
    if(!Object.keys(updates).length)continue;
    const {data,error}=await authClient.from('weekly_plans').update(updates).eq('id',plan.id).eq('updated_at',plan.updated_at).select('id');
    if(error)throw error;
    if(!data?.length){
      const latest=(await readLegacyStateFromCloud()).state;
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
      const current=existing.get(key);
      if(current){
        if(current.name!==name){const {error}=await authClient.from('shopping_items').update({name}).eq('id',current.id);if(error)throw error}
        continue;
      }
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
    const desired=window.WochentischIngredients.normalizeChecks(target.shoppingChecks?.[week]||{});
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
  const dishesById=new Map((value.dishes||[]).map(dish=>[dish.id,dish]));
  days.forEach(date=>{
    const week=keyFor(mondayFor(date)),day=dayIndex(date);
    (value.plans?.[week]?.[day]||[]).forEach(id=>{
      const dish=dishesById.get(id);
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
function getSyncCoordinator(){
  const key=`${currentUserId}:${currentHouseholdId}`;
  if(syncCoordinator&&syncCoordinatorKey===key)return syncCoordinator;
  if(!offlineStoreReady||!currentUserId||!currentHouseholdId)throw new Error('Der Offline-Speicher für die Synchronisierung ist nicht verfügbar.');
  syncCoordinatorKey=key;
  syncWriteBarrier=window.WochentischSyncWriteBarrier.create({store:window.WochentischStore,stateKey:appStateKey(),backupKey:cloudBackupKey(),pendingKey:`sync-pending:${key}`});
  const barrier=syncWriteBarrier;
  syncCoordinator=window.WochentischSyncCoordinator.create({
    store:window.WochentischStore,api:window.WochentischSyncApi.create(authClient),userId:currentUserId,householdId:currentHouseholdId,stateKey:appStateKey(),
    newRequestId:newId,toShared:cloudComparable,writeBarrier:barrier,
    beforeSnapshot:async()=>{await offlineStoreWriteQueue;await barrier.drain();if(`${currentUserId}:${currentHouseholdId}`!==key)throw new Error('Der Haushalt wurde während der Synchronisierung gewechselt.')},
    readMemory:()=>`${currentUserId}:${currentHouseholdId}`===key?state:null,applyMemory:value=>{state=normalizeState(value)}
  });
  return syncCoordinator;
}
async function syncStateToCloud({notify=false}={}){
  if(!cloudReady||!currentHouseholdId)return;
  if(prepareLocalIdsForCloud())save({sync:false});
  const beforeShopping=localShoppingItems(state),coordinator=getSyncCoordinator();
  const scope=authScope,householdId=currentHouseholdId,barrier=syncWriteBarrier;
  await coordinator.flush();
  await barrier.drain();
  if(scope!==authScope||householdId!==currentHouseholdId)return;
  await removeOrphanedCookingProgress();
  if(scope!==authScope||householdId!==currentHouseholdId)return;
  const base=await readCloudBase();
  if(scope!==authScope||householdId!==currentHouseholdId)return;
  cloudBaseState=base;
  await loadOfflineQueues(currentUserId,householdId);
  if(scope!==authScope||householdId!==currentHouseholdId)return;
  await reconcileCatalogImports(cloudBaseState);
  if(scope!==authScope||householdId!==currentHouseholdId)return;
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
  const pending=await window.WochentischStore.get('records',coordinator.keys.pending);
  if(scope!==authScope||householdId!==currentHouseholdId)return;
  if(pending||hasCloudChanges(cloudBaseState,state))scheduleCloudSync();
}
function scheduleCloudSync({notify=false}={}){
  if(!cloudReady||loadingCloudState||cloudStateOverrideInProgress||!navigator.onLine)return;
  cloudSyncNotificationRequested=cloudSyncNotificationRequested||notify;clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>{cloudSyncRequested=true;flushCloudSync()},notify?500:350);
}
function flushCloudSync(){
  if(cloudSyncInProgress){cloudSyncRequested=true;return cloudSyncPromise||Promise.resolve(false)}
  if(!cloudSyncRequested||cloudStateOverrideInProgress)return Promise.resolve(true);
  cloudSyncInProgress=true;
  cloudSyncPromise=(async()=>{
    let succeeded=true;
    try{
      while(cloudSyncRequested&&!cloudStateOverrideInProgress){
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
    if(!authClient)await ensureAuthentication();
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
function setPullRefreshIndicator({visible=false,refreshing=false,pulling=false,ready=false,progress=0,offset=0,message='Zum Aktualisieren ziehen'}={}){
  const indicator=$('#pull-refresh-indicator');if(!indicator)return;
  indicator.style.setProperty('--pull-refresh-offset',`${offset}px`);
  indicator.classList.toggle('is-visible',visible);indicator.classList.toggle('is-pulling',pulling);indicator.classList.toggle('is-ready',ready);indicator.classList.toggle('is-refreshing',refreshing);
  const ring=indicator.querySelector('.pull-refresh-progress'),normalizedProgress=Math.max(0,Math.min(1,progress));
  if(ring)ring.style.strokeDashoffset=String(refreshing?0:100-(normalizedProgress*100));
  indicator.setAttribute('aria-hidden',String(!visible));$('#pull-refresh-message').textContent=message;
}
function beginPullRefresh(event){
  if(!standalonePwa()||!compactNavigationQuery.matches||!appInitialized||$('.app-shell').hidden||pullRefreshGesture||mealDragState||document.querySelector('dialog[open]'))return;
  if(event.touches.length!==1||window.scrollY>2||(document.scrollingElement?.scrollTop||0)>2)return;
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('input,textarea,select,[contenteditable="true"],dialog,[data-no-pull-refresh]'))return;
  const touch=event.touches[0];
  pullRefreshGesture={startX:touch.clientX,startY:touch.clientY,distance:0,dragging:false};
}
function movePullRefresh(event){
  const gesture=pullRefreshGesture;if(!gesture)return;
  if(mealDragState?.touchGesture&&mealDragState.dragging){cancelPullRefresh();return}
  if(event.touches.length!==1){cancelPullRefresh();return}
  const touch=event.touches[0],deltaX=touch.clientX-gesture.startX,deltaY=touch.clientY-gesture.startY;
  if(deltaY<0||Math.abs(deltaX)>Math.max(14,deltaY*.8)){cancelPullRefresh();return}
  if(deltaY<10)return;
  if(window.scrollY>2||(document.scrollingElement?.scrollTop||0)>2){cancelPullRefresh();return}
  gesture.dragging=true;gesture.distance=deltaY;
  if(event.cancelable)event.preventDefault();
  const offset=Math.min(88,deltaY*.9),ready=deltaY>=72;
  setPullRefreshIndicator({visible:true,pulling:true,ready,progress:deltaY/72,offset,message:ready?'Loslassen zum Aktualisieren':'Zum Aktualisieren ziehen'});
}
function hasUnfinishedRefreshInput(){
  return Boolean($('#shopping-item-input')?.value.trim()||[...document.querySelectorAll('#password-sign-in input')].some(input=>input.value.trim()));
}
function finishPullRefresh(){
  const gesture=pullRefreshGesture;if(!gesture)return;
  pullRefreshGesture=null;
  if(!gesture.dragging){setPullRefreshIndicator();return}
  if(gesture.distance<72){setPullRefreshIndicator();return}
  if(hasUnfinishedRefreshInput()){
    setPullRefreshIndicator();showToast('Schließe zuerst die offene Eingabe.');
    return;
  }
  setPullRefreshIndicator({visible:true,refreshing:true,offset:76,message:'Wird synchronisiert …'});
  refreshAppData().then(async result=>{
    const message=result==='success'?'Aktualisiert':result==='offline'?'Offline – lokale Daten bleiben verfügbar':result==='failed'?'Abgleich fehlgeschlagen':'Synchronisierung derzeit nicht verfügbar';
    setPullRefreshIndicator({visible:true,refreshing:result==='success',offset:76,message});
    try{await offlineStoreWriteQueue}catch(error){
      console.error('Offline-Daten konnten vor dem Neuladen nicht gesichert werden:',error);
      updateSyncStatus('Lokale Speicherung fehlgeschlagen – die Seite wurde nicht neu geladen.',{storageError:true});
      setPullRefreshIndicator();showToast('Lokaler Speicher nicht verfügbar.');
      return;
    }
    window.setTimeout(()=>window.location.reload(),180);
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
function chooseFirstSync(){
  const dialog=$('#first-sync-dialog');
  return new Promise(resolve=>{
    const finish=choice=>{
      dialog.removeEventListener('click',onClick);
      dialog.removeEventListener('cancel',onCancel);
      dialog.removeEventListener('close',onClose);
      resolve(choice);
    };
    const onClick=event=>{
      const button=event.target.closest('button[value]');
      if(!button)return;
      event.preventDefault();
      finish(['cloud','local'].includes(button.value)?button.value:'later');
    };
    const onCancel=event=>{event.preventDefault();finish('later')};
    const onClose=()=>finish('later');
    dialog.addEventListener('click',onClick);
    dialog.addEventListener('cancel',onCancel);
    dialog.addEventListener('close',onClose);
    dialog.showModal();
  });
}
function closeFirstSync(){const dialog=$('#first-sync-dialog');if(dialog.open)dialog.close()}
async function connectToCloud(){
  if(cloudReady||loadingCloudState||!currentUserId||!authClient)return;
  const scope=authScope,userId=currentUserId;
  if(cloudConnectPromise){
    if(cloudConnectPromise.scope===scope)return cloudConnectPromise;
    await cloudConnectPromise;
    if(scope===authScope)return connectToCloud();
    return;
  }
  const checkScope=()=>{if(scope!==authScope)throw new Error('Das Konto wurde während der Synchronisierung gewechselt.')};
  cloudConnectPromise=(async()=>{
    try{
      const householdId=await getCurrentHousehold();
      checkScope();
      const householdChanged=Boolean(cookingHouseholdScopeId&&cookingHouseholdScopeId!==householdId);
      currentHouseholdId=householdId;
      await loadOfflineQueues(userId,householdId);
      checkScope();
      const beforeShopping=localShoppingItems(state),previousBase=householdChanged||!hasLocalState?null:await readCloudBase();
      let cloud=await readStateFromCloud(householdId),firstSyncChoice='',firstSyncState=null,firstSyncLocal=null;
      checkScope();
      if(householdChanged){state=cloud.state}
      else if(previousBase){
        // The server compares the confirmed base with both versions.
      }else if(hasCloudChanges(emptyState(),state)){
        const choice=await chooseFirstSync();
        checkScope();
        if(choice==='later'){
          updateSyncStatus('Erster Abgleich ausstehend – deine Änderungen bleiben auf diesem Gerät.');
          return;
        }
        // Refresh after the user decides; the dialog can remain open for a long time.
        const refreshedCloud=await readStateFromCloud(householdId);
        checkScope();
        if(choice==='local'&&hasCloudChanges(cloud.state,refreshedCloud.state)){
          updateSyncStatus('Der Haushaltsstand hat sich während der Auswahl geändert. Bitte starte den ersten Abgleich erneut.');
          return;
        }
        cloud=refreshedCloud;
        firstSyncChoice=choice;
        firstSyncLocal=structuredClone(state);
        firstSyncState=choice==='cloud'?{...cloud.state,noteHidden:state.noteHidden}:structuredClone(state);
      }else if(cloud.hasCloudData)state=cloud.state;
      else state=starterState();
      if(firstSyncChoice){
        if(!offlineStoreReady)throw new Error('Der erste Abgleich benötigt den lokalen Offline-Speicher.');
        // Commit both sides together: after a restart an old local state must
        // never be paired with the newly accepted cloud base.
        await offlineStoreWriteQueue;
        checkScope();
        if(!sameValue(state,firstSyncLocal))throw new Error('Lokale Daten wurden während der Auswahl verändert.');
        await window.WochentischStore.writeBatch([
          {type:'put',store:'records',key:appStateKey(userId),value:structuredClone(firstSyncState)},
          {type:'put',store:'records',key:cloudBaseStorageKey(),value:structuredClone(cloud.state)},
          {type:'put',store:'records',key:cloudBackupKey(),value:structuredClone(firstSyncState)}
        ]);
        checkScope();
        if(!sameValue(state,firstSyncLocal)){
          await window.WochentischStore.writeBatch([
            {type:'put',store:'records',key:appStateKey(userId),value:structuredClone(state)},
            {type:'put',store:'records',key:cloudBackupKey(),value:structuredClone(state)},
            {type:'remove',store:'records',key:cloudBaseStorageKey()}
          ]);
          throw new Error('Lokale Daten wurden während der Auswahl verändert.');
        }
        state=firstSyncState;
      }
      rememberCookingHouseholdScope(householdId,userId);
      await removeOrphanedCookingProgress();
      checkScope();
      cloudBaseState=previousBase||cloud.state;
      if(!firstSyncChoice&&!previousBase)await saveCloudBase(cloudBaseState);
      checkScope();
      cloudReady=true;offlineMode=false;
      updateConflictCloudAction();
      const migrationKey=cloudMigrationKey();if(!cloud.hasCloudData)localStorage.setItem(migrationKey,'true');
      save({sync:false});
      if(firstSyncChoice==='cloud')await reconcileCatalogImports(state);
      checkScope();
      updateSyncStatus(unresolvedConflicts.length?'Änderungen wurden synchronisiert. Bitte prüfe noch die markierten Konflikte.':'');
      if(previousBase||hasCloudChanges(cloudBaseState,state)||hasUncanonicalCloudIngredients(cloud))scheduleCloudSync();
      if(appInitialized){$('#bottom-note').classList.toggle('hidden',state.noteHidden);updateCounts();refreshVisibleView()}
      if(previousBase&&document.visibilityState==='visible'){
        const added=[...localShoppingItems(state).entries()].filter(([key])=>!beforeShopping.has(key)).map(([,name])=>name);
        if(added.length===1)showToast(`${added[0]} wurde auf den Einkaufszettel gesetzt.`);
        else if(added.length>1)showToast(`${added[0]} und ${added.length-1} weitere Artikel wurden ergänzt.`);
      }
      subscribeToHouseholdChanges();
    }catch(error){
      if(scope!==authScope)return;
      cloudReady=false;offlineMode=true;
      updateConflictCloudAction();
      console.warn('Cloud-Synchronisierung vorübergehend nicht verfügbar:',error);
      updateSyncStatus('Keine Verbindung – die gespeicherte Einkaufsliste bleibt verfügbar.');
    }finally{closeFirstSync()}
  })().finally(()=>{cloudConnectPromise=undefined});
  cloudConnectPromise.scope=scope;
  return cloudConnectPromise;
}
function startOfflineApp({reauthRequired=false}={}){
  if(!currentUserId||currentUserId!==rememberedOfflineUser())return false;
  currentHouseholdId='';cookingHouseholdScopeId=loadCookingHouseholdScope(currentUserId);cloudReady=false;offlineMode=true;
  if(!appInitialized)renderCachedApp();
  else{$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false}
  updateSyncStatus(navigator.onLine?(reauthRequired?'Zum Synchronisieren ist eine erneute Anmeldung nötig.':'Anmeldestatus wird geprüft – Änderungen bleiben lokal gespeichert.'):'Offline – zuletzt gespeicherte Einkaufsliste verfügbar.',{reauthRequired:navigator.onLine&&reauthRequired});
  return true;
}
async function resumeCloudSession(){
  if(!currentUserId)return;
  try{
    if(!authClient)await ensureAuthentication();
    if(!authClient)return;
    const scope=authScope,{data,error}=await authClient.auth.getSession();
    if(scope!==authScope)return;
    if(data?.session)await handleAuthStateChange('SIGNED_IN',data.session);
    else if(error)updateSyncStatus('Anmeldestatus konnte nicht geprüft werden – Änderungen bleiben lokal gespeichert.');
    else updateSyncStatus('Zum Synchronisieren ist eine erneute Anmeldung nötig.',{reauthRequired:true});
  }catch(error){updateSyncStatus('Keine Verbindung – Änderungen bleiben lokal gespeichert.')}
}
async function revealApp({showHome=false}={}){
  if(!appInitialized)renderCachedApp({showHome});
  offlineMode=false;
  if(navigator.onLine)updateSyncStatus('');
  await connectToCloud();
}
async function loadHouseholdMembers(){
  if(!authClient||!navigator.onLine)throw new Error('Haushaltsinformationen sind offline nicht verfügbar.');
  const list=$('#household-members'),scope=authScope,householdId=currentHouseholdId;
  list.innerHTML='<p class="household-loading">Wird geladen …</p>';
  const {data,error}=await authClient.rpc('list_my_household_members');
  if(scope!==authScope||householdId!==currentHouseholdId)return;
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
  closeProfileActionsMenu({restoreFocus:true});if(compactNavigationQuery.matches)closeMobileMenu();
  householdError('');$('#household-code-result').hidden=true;$('#household-code').textContent='';
  $('#household-dialog').showModal();
  try{await loadHouseholdMembers()}catch(error){if(navigator.onLine)console.error(error);householdError(navigator.onLine?'Mitglieder konnten gerade nicht geladen werden.':'Haushaltsverwaltung ist offline nicht verfügbar.')}
});
$('#household-close').addEventListener('click',()=>$('#household-dialog').close());
$('#create-household-code').addEventListener('click',async event=>{
  const button=event.currentTarget,scope=authScope,householdId=currentHouseholdId;button.disabled=true;householdError('');
  try{
    if(!authClient||!navigator.onLine)throw new Error('Haushaltsaktionen benötigen eine Internetverbindung.');
    const {data,error}=await authClient.rpc('create_household_join_code');
    if(scope!==authScope||householdId!==currentHouseholdId)return;
    if(error)throw error;
    $('#household-code').textContent=data;$('#household-code-result').hidden=false;
  }catch(error){console.error(error);householdError('Der Beitrittscode konnte nicht erstellt werden. Bitte später erneut versuchen.')}
  finally{button.disabled=false}
});
$('#household-join-code').addEventListener('input',event=>{event.currentTarget.value=event.currentTarget.value.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,'')});
$('#household-join-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]');
  const code=$('#household-join-code').value.trim(),scope=authScope;
  button.disabled=true;householdError('');loadingCloudState=true;
  try{
    if(!authClient||!navigator.onLine)throw new Error('Haushaltsaktionen benötigen eine Internetverbindung.');
    const {data,error}=await authClient.rpc('join_household_with_code',{join_code:code});
    if(scope!==authScope)return;
    if(error)throw error;
    if(!data)throw new Error('Household was not returned');
    stopRealtimeChannel();cloudReady=false;
    clearTimeout(cloudSyncTimer);cloudSyncRequested=false;
    if(cloudSyncPromise)await cloudSyncPromise;
    const cloud=await readStateFromCloud(data);
    if(scope!==authScope)return;
    currentHouseholdId=data;selectedRecipeDishId='';cookingProgress=null;cookingStage='list';
    state=cloud.state;cloudBaseState=cloud.state;
    await saveCloudBase(cloudBaseState);
    if(scope!==authScope)return;
    save({sync:false});
    rememberCookingHouseholdScope(data);
    await loadOfflineQueues(currentUserId,data);
    if(scope!==authScope)return;
    cloudReady=true;loadingCloudState=false;weekOffset=0;
    $('#household-dialog').close();renderCalendar();refreshVisibleView();
    subscribeToHouseholdChanges();
    showToast('Du bist dem Haushalt beigetreten.');
  }catch(error){
    if(scope!==authScope)return;
    if(!cloudReady)offlineMode=true;
    console.error(error);
    householdError(/Invalid or expired join code/i.test(error.message)?'Der Code ist ungültig, abgelaufen oder wurde bereits verwendet.':'Beitritt fehlgeschlagen. Bitte prüfe den Code und versuche es erneut.');
  }finally{loadingCloudState=false;button.disabled=false}
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
  stopRealtimeChannel();appInitialized=false;
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
    if(!authClient)await ensureAuthentication();
    if(!authClient)throw new Error('Anmeldung ist nicht verfügbar.');
    const {error}=await authClient.auth.signInWithPassword({
      email,
      password
    });
    if(error){interactiveLoginPending=false;showAuthError('E-Mail-Adresse oder Passwort sind nicht korrekt.');button.disabled=false}
  }catch(error){interactiveLoginPending=false;showAuthError('Anmeldung fehlgeschlagen. Bitte prüfe deine Internetverbindung.');button.disabled=false}
});
function finishSignOut(){
  authScope++;authUserLoad=null;
  stopRealtimeChannel();clearTimeout(cloudSyncTimer);cloudSyncRequested=false;
  currentUserId='';currentHouseholdId='';cookingHouseholdScopeId='';cloudReady=false;cloudBaseState=null;appInitialized=false;offlineMode=false;
  catalogEditPermission=false;$('#catalog-admin-nav').hidden=true;
  selectedRecipeDishId='';cookingProgress=null;cookingStage='list';unresolvedConflicts=[];pendingCatalogImports=[];
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  state=emptyState();hasLocalState=false;
  $('#auth-password').value='';$('#password-sign-in-button').disabled=false;
  showLogin();
}
window.addEventListener('storage',event=>{
  if(event.key===offlineSessionStorageKey&&!event.newValue&&currentUserId)finishSignOut();
});
$('#sign-out').addEventListener('click',async()=>{
  closeProfileActionsMenu();closeMobileMenu();
  try{
    if(!authClient)await ensureAuthentication();
    if(!authClient)throw new Error('Abmeldung ist nicht verfügbar.');
    explicitSignOutPending=true;
    const {error}=await authClient.auth.signOut({scope:'local'});
    if(error)throw error;
    try{localStorage.removeItem(offlineSessionStorageKey)}catch(error){}
    finishSignOut();
  }catch(error){showToast(`Abmelden fehlgeschlagen: ${error.message||'Bitte später erneut versuchen.'}`)}
  finally{explicitSignOutPending=false}
});
function loadSupabaseScript(){
  if(window.supabase?.createClient)return Promise.resolve(window.supabase);
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=supabaseScriptUrl;script.integrity=supabaseScriptIntegrity;script.crossOrigin='anonymous';script.async=true;
    script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Supabase-Client konnte nicht initialisiert werden.'));
    script.onerror=()=>reject(new Error('Supabase-Client konnte nicht geladen werden.'));
    document.head.append(script);
  });
}
async function handleAuthStateChange(event,session){
  if(session){
    const userId=session.user.id;
    if(currentUserId===userId&&cloudReady&&!signInPromptActive&&!interactiveLoginPending)return;
    const showHome=event==='SIGNED_IN'&&interactiveLoginPending;
    signInPromptActive=false;interactiveLoginPending=false;$('#auth-context').hidden=true;$('#auth-offline-return').hidden=true;
    $('#auth-password').value='';$('#password-sign-in-button').disabled=false;
    if(currentUserId!==userId){
      const scope=++authScope;
      stopRealtimeChannel();clearTimeout(cloudSyncTimer);cloudSyncRequested=false;
      cloudReady=false;currentHouseholdId='';cloudBaseState=null;appInitialized=false;
      selectedRecipeDishId='';cookingProgress=null;cookingStage='list';catalogEditPermission=false;
      unresolvedConflicts=[];pendingCatalogImports=[];currentUserId=userId;
      cookingHouseholdScopeId=loadCookingHouseholdScope(userId);
      $('.app-shell').hidden=true;$('#auth-gate').hidden=true;$('#startup-gate').hidden=false;
      document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
      authUserLoad=(async()=>{
        const saved=await readUserState(userId);
        if(scope!==authScope)return;
        state=saved||emptyState();hasLocalState=Boolean(saved);
        await loadOfflineQueues(userId);
      })();
    }
    const scope=authScope,loading=authUserLoad;
    if(loading){
      await loading;
      if(scope!==authScope)return;
      if(authUserLoad===loading)authUserLoad=null;
    }
    safeLocalStorageSet(offlineSessionStorageKey,userId);
    void refreshCatalogEditPermission();
    await revealApp({showHome});
    return;
  }
  if(explicitSignOutPending)return;
  authScope++;authUserLoad=null;closeFirstSync();
  stopRealtimeChannel();cloudReady=false;cloudBaseState=null;interactiveLoginPending=false;
  if(signInPromptActive){showLogin({message:'Melde dich an, um wieder zu synchronisieren. Deine gespeicherte Liste bleibt erhalten.',allowOfflineReturn:true});return}
  if(startOfflineApp({reauthRequired:true}))return;
  finishSignOut();
}
async function initializeAuthentication(){
  if(!supabaseConfig?.url||!supabaseConfig?.publishableKey)throw new Error('Supabase-Konfiguration fehlt.');
  const sdk=await loadSupabaseScript();
  authClient=sdk.createClient(supabaseConfig.url,supabaseConfig.publishableKey);
  authClient.auth.onAuthStateChange((event,session)=>{
    setTimeout(()=>{void handleAuthStateChange(event,session).catch(cloudError)},0);
  });
  return authClient;
}
function ensureAuthentication(){
  if(!authClientReadyPromise){
    authClientReadyPromise=initializeAuthentication().catch(error=>{
      authClientReadyPromise=null;
      console.warn('Supabase ist gerade nicht erreichbar:',error);
      if(appInitialized)updateSyncStatus('Cloud-Synchronisierung nicht verfügbar – Änderungen bleiben lokal gespeichert.');
      else{showLogin();showAuthError('Anmeldung nicht verfügbar. Bitte verbinde dich mit dem Internet und versuche es erneut.')}
      return null;
    });
  }
  return authClientReadyPromise;
}
async function bootApplication(){
  await initializeOfflineData();
  const rememberedUser=rememberedOfflineUser();
  if(rememberedUser){
    const saved=await readUserState(rememberedUser);
    if(rememberedUser===rememberedOfflineUser()){
      currentUserId=rememberedUser;state=saved||emptyState();hasLocalState=Boolean(saved);
      await loadOfflineQueues(rememberedUser);
      startOfflineApp();void refreshCatalogEditPermission();
    }else showLogin();
  }else showLogin();
  void ensureAuthentication();
}
void bootApplication();
window.addEventListener('online',()=>{updateConflictCloudAction();void refreshCatalogEditPermission();if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode)resumeCloudSession();else if(!authClient)void ensureAuthentication()});
window.addEventListener('offline',()=>{updateConflictCloudAction();if(appInitialized)updateSyncStatus('Offline – Änderungen bleiben lokal gespeichert.')});
window.addEventListener('pageshow',()=>{if(!appInitialized)return;if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode&&navigator.onLine)resumeCloudSession()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||!appInitialized)return;if(cloudReady)scheduleCloudSync({notify:true});else if(offlineMode&&navigator.onLine)resumeCloudSession()});
function emptyState(){return{dishes:[],plans:{},pinnedMeals:{},restDays:{},pantryIngredients:{},noteHidden:false,shoppingChecks:{},hiddenShoppingItems:{},manualShoppingItems:{},shoppingQuantities:{}}}
function normalizeState(s){
  if(!s||!Array.isArray(s.dishes)||!s.plans)return emptyState();
  const normalized=window.WochentischIngredients.normalizeStateIngredients(s);
  return{
    ...normalized,
    dishes:normalized.dishes.map(dish=>{
      const recipe=window.WochentischRecipes.normalizeRecipe(dish.recipe);
      return{...dish,type:dish.type==='baking'?'baking':'meal',ingredients:cleanIngredients(window.WochentischRecipes.shoppingIngredients(recipe,dish.ingredients)),recipe,
        catalogSourceId:typeof dish.catalogSourceId==='string'?dish.catalogSourceId:null,
        catalogSourceVersion:Number.isInteger(dish.catalogSourceVersion)?dish.catalogSourceVersion:null,
        nutrition:cleanNutrition(dish.nutrition)};
    }),
    plans:normalized.plans||{},pinnedMeals:normalized.pinnedMeals||{},restDays:normalized.restDays||{},
    noteHidden:Boolean(normalized.noteHidden)
  };
}
async function initializeOfflineData(){
  if(!window.WochentischStore)return;
  try{
    await window.WochentischStore.openDatabase();
    offlineStoreReady=true;
  }catch(error){
    offlineStoreReady=false;
    console.warn('IndexedDB konnte nicht initialisiert werden; lokale Sicherung wird verwendet:',error);
    updateSyncStatus('Der sichere Offline-Speicher konnte nicht geöffnet werden. Änderungen werden vorübergehend auf diesem Gerät gesichert.',{storageError:true});
  }
}
function save({sync=true}={}){
  state=normalizeState(state);
  if(syncCoordinatorKey!==`${currentUserId}:${currentHouseholdId}`){syncCoordinator=null;syncWriteBarrier=null;syncCoordinatorKey=''}
  if(currentUserId){
    hasLocalState=true;
    if(offlineStoreReady&&syncWriteBarrier){
      syncWriteBarrier.save(state).catch(error=>{console.warn('Lokale Speicherung fehlgeschlagen:',error);updateSyncStatus('Lokaler Speicher ist gerade nicht verfügbar.',{storageError:true})});
    }else if(offlineStoreReady)enqueueOfflineStoreWrite('records',appStateKey(),state);
    else safeLocalStorageSet(appStateKey(),JSON.stringify(state));
  }
  updateCounts();if(sync)scheduleCloudSync();
}
function updateCounts(){$('#dish-count').textContent=state.dishes.length;$('#dish-heading-count').textContent=state.dishes.length}
function mondayFor(date=new Date()){const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
function rangeStart(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+weekOffset*7);return d}
function rangeDates(){const start=rangeStart();return Array.from({length:7},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return date})}
function keyFor(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dayIndex(date){return (date.getDay()+6)%7}
function planForDate(date){const weekKey=keyFor(mondayFor(date));return state.plans?.[weekKey]?.[dayIndex(date)]||[]}
function ensurePlanWeek(weekKey){state.plans??={};state.plans[weekKey]??=Array.from({length:7},()=>[]);return state.plans[weekKey]}
function ensurePlanForDate(date){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),week=ensurePlanWeek(weekKey);week[index]??=[];return week[index]}
function pinnedMealsForDate(date){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),pins=state.pinnedMeals?.[weekKey]?.[index]||[],plan=planForDate(date);return plan.map((_,position)=>Boolean(pins[position]))}
function ensurePinnedMealsForDate(date){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),plan=ensurePlanForDate(date);state.pinnedMeals??={};state.pinnedMeals[weekKey]??=Array.from({length:7},()=>[]);state.pinnedMeals[weekKey][index]??=[];const pins=state.pinnedMeals[weekKey][index];while(pins.length<plan.length)pins.push(false);if(pins.length>plan.length)pins.splice(plan.length);return pins}
function restDaysForWeek(weekKey){state.restDays??={};const days=cleanRestDays(state.restDays[weekKey]);if(Object.prototype.hasOwnProperty.call(state.restDays,weekKey))state.restDays[weekKey]=days;return days}
function isRestDay(date){return restDaysForWeek(keyFor(mondayFor(date))).includes(dayIndex(date))}
function setRestDay(date,isRest){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),days=new Set(restDaysForWeek(weekKey));ensurePlanWeek(weekKey);if(isRest)days.add(index);else days.delete(index);if(days.size)state.restDays[weekKey]=[...days].sort((a,b)=>a-b);else delete state.restDays[weekKey]}
function replaceDayPlan(date,{meals,pins,isRest}){const weekKey=keyFor(mondayFor(date)),index=dayIndex(date),plan=ensurePlanWeek(weekKey);plan[index]=meals.slice();state.pinnedMeals??={};state.pinnedMeals[weekKey]??=Array.from({length:7},()=>[]);state.pinnedMeals[weekKey][index]=pins.slice(0,meals.length);while(state.pinnedMeals[weekKey][index].length<meals.length)state.pinnedMeals[weekKey][index].push(false);setRestDay(date,isRest)}
function planDaysInRange(){return rangeDates().map(date=>({date,weekKey:keyFor(mondayFor(date)),day:planForDate(date),isRest:isRestDay(date)}))}
function calendarStateForRange(value){
  const dishesById=new Map((value.dishes||[]).map(dish=>[dish.id,dish]));
  return rangeDates().map(date=>{
    const week=keyFor(mondayFor(date)),day=dayIndex(date),mealIds=value.plans?.[week]?.[day]||[],pins=value.pinnedMeals?.[week]?.[day]||[];
    return{
      date:keyFor(date),
      isRest:(value.restDays?.[week]||[]).includes(day),
      meals:mealIds.map((id,index)=>{
        const dish=dishesById.get(id);
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
  else if(view==='cooking')renderCooking();
}
function snapshotPlanDays(dates){return{days:dates.map(date=>({date:new Date(date),meals:planForDate(date).slice(),pins:pinnedMealsForDate(date),isRest:isRestDay(date)}))}}
function samePlanDay(a,b){return sameValue({meals:a.meals,pins:a.pins,isRest:a.isRest},{meals:b.meals,pins:b.pins,isRest:b.isRest})}
function restorePlanDays(snapshot,expected,firstIndex=0,lastIndex=snapshot.days.length-1){const affected=snapshot.days.slice(firstIndex,lastIndex+1);if(expected&&affected.some((day,offset)=>{const index=firstIndex+offset,current={date:day.date,meals:planForDate(day.date).slice(),pins:pinnedMealsForDate(day.date),isRest:isRestDay(day.date)};return !samePlanDay(current,expected.days[index])}))return{restored:0,skipped:affected.length};affected.forEach(day=>replaceDayPlan(day.date,day));return{restored:affected.length,skipped:0}}
function capturePlanDays(dates){return{days:dates.map(date=>({date:new Date(date),meals:planForDate(date).slice(),pins:pinnedMealsForDate(date),isRest:isRestDay(date)}))}}
function undoRestInsertion(before,after,firstIndex=0,lastIndex=before.days.length-1){const result=restorePlanDays(before,after,firstIndex,lastIndex);if(result.skipped){showToast(`Rückgängig nicht möglich: ${result.skipped===1?'Ein betroffener Tag hat':'Betroffene Tage haben'} sich seitdem geändert. Deine Änderungen blieben erhalten.`);return}save();renderCalendar();showToast('Plan wiederhergestellt.')}
function markRestDay(dayOffset){
  const dates=rangeDates(),index=Number(dayOffset);
  if(!Number.isInteger(index)||index<0||index>=dates.length)return;
  const snapshot=snapshotPlanDays(dates),selected=snapshot.days[index];
  if(selected.isRest)return;
  if(selected.meals.length){
    for(let day=dates.length-1;day>index;day--)replaceDayPlan(dates[day],snapshot.days[day-1]);
    replaceDayPlan(dates[index],{meals:[],pins:[],isRest:true});
  }else setRestDay(dates[index],true);
  save();renderCalendar();const after=capturePlanDays(dates);
  if(!selected.meals.length){showToast('Als Resteabend markiert.',{actionLabel:'Rückgängig',duration:6500,onAction:()=>undoRestInsertion(snapshot,after,index,index)});return}
  const last=snapshot.days[snapshot.days.length-1],dropped=[...last.meals.map(id=>state.dishes.find(dish=>dish.id===id)?.name).filter(Boolean),...(last.isRest?['Resteabend']:[])];
  const droppedMessage=dropped.length?`${dropped.join(', ')} ${dropped.length===1?'fällt':'fallen'} am letzten Tag aus dem Plan.`:'Am letzten Tag fällt kein Eintrag aus dem Plan.';
  showToast(`Plan um einen Tag verschoben. ${droppedMessage}`,{actionLabel:'Rückgängig',duration:6500,onAction:()=>undoRestInsertion(snapshot,after,index)});
}
function ingredientKey(value){return window.WochentischIngredients.key(value)}
function ingredientMatches(a,b){return ingredientKey(a)===ingredientKey(b)}
function availablePantryIngredients(){const values=new Map();[...(window.COMMON_INGREDIENTS||[]),...state.dishes.flatMap(dish=>dish.ingredients||[])].forEach(raw=>{const name=normalizeIngredient(raw),key=ingredientKey(name);if(name&&key&&!values.has(key))values.set(key,name)});return [...values.values()].sort((a,b)=>a.localeCompare(b,'de-DE'))}
function mainIngredientKey(value){return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE')}
function availableMainIngredients(){const values=new Map();[...(window.COMMON_MAIN_INGREDIENTS||[]),...state.dishes.map(dish=>String(dish.ingredient||''))].map(name=>String(name||'').trim()).filter(Boolean).forEach(name=>{const key=mainIngredientKey(name);if(!values.has(key))values.set(key,name)});return [...values.values()].sort((a,b)=>a.localeCompare(b,'de-DE'))}
function renderDishIngredientChips(){const chips=$('#dish-ingredient-chips');chips.replaceChildren();if(!dishIngredientDraft.length){const empty=document.createElement('p');empty.className='pantry-empty-selection';empty.textContent='Noch keine Zutaten ausgewählt.';chips.append(empty)}dishIngredientDraft.forEach(name=>{const chip=document.createElement('span');chip.className='pantry-chip';const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.type='button';remove.className='pantry-chip-remove';remove.setAttribute('aria-label',`${name} entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{dishIngredientDraft=dishIngredientDraft.filter(item=>ingredientKey(item)!==ingredientKey(name));$('#dish-ingredients').value=dishIngredientDraft.join(', ');renderDishIngredientChips();renderDishIngredientSuggestions()});chip.append(icon,label,remove);chips.append(chip)});$('#dish-ingredients').value=dishIngredientDraft.join(', ')}
function addDishIngredient(value){const name=normalizeIngredient(value);if(!name)return;if(!dishIngredientDraft.some(item=>ingredientKey(item)===ingredientKey(name)))dishIngredientDraft.push(name);$('#dish-ingredient-input').value='';renderDishIngredientChips();renderDishIngredientSuggestions();$('#dish-ingredient-input').focus({preventScroll:true})}
function renderDishIngredientSuggestions(){const input=$('#dish-ingredient-input'),list=$('#dish-ingredient-suggestions'),query=ingredientKey(input.value),selected=new Set(dishIngredientDraft.map(ingredientKey));const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)&&!selected.has(ingredientKey(name))).slice(0,60):[];renderIngredientOptions(list,matches,name=>addDishIngredient(name));input.setAttribute('aria-expanded',String(matches.length>0))}
function renderMainIngredientSuggestions(){const input=$('#dish-ingredient'),list=$('#dish-main-ingredient-suggestions'),query=mainIngredientKey(input.value);const matches=query?availableMainIngredients().filter(name=>mainIngredientKey(name).includes(query)).slice(0,8):[];renderIngredientOptions(list,matches,name=>{input.value=name;list.hidden=true;input.setAttribute('aria-expanded','false')});input.setAttribute('aria-expanded',String(matches.length>0))}
function renderIngredientOptions(list,matches,onSelect){list.replaceChildren();matches.forEach(name=>{const option=document.createElement('button');option.type='button';option.className='pantry-suggestion';option.role='option';option.setAttribute('aria-selected','false');const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;option.append(icon,label);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>onSelect(name));list.append(option)});list.hidden=!matches.length}
function addManualShoppingItem(value){const name=normalizeManualItem(value);if(!name)return;$('#shopping-item-input').value=name;$('#shopping-add-form').requestSubmit()}
let shoppingViewportBeforeKeyboard=0;
function positionShoppingSuggestions(){
  const input=$('#shopping-item-input'),list=$('#shopping-item-suggestions');
  if(list.hidden)return;
  const viewport=window.visualViewport,top=viewport?.offsetTop||0,height=viewport?.height||window.innerHeight,rect=input.getBoundingClientRect();
  const docked=$('#shopping-view').classList.contains('shopping-keyboard-docked');
  const above=docked?Math.max(0,height-$('#shopping-add-form').offsetHeight-20):Math.max(0,rect.top-top-14),below=Math.max(0,top+height-rect.bottom-14);
  const openBelow=!docked&&below>above&&above<180;
  list.classList.toggle('opens-below',openBelow);
  list.style.setProperty('--shopping-suggestions-space',`${Math.floor(openBelow?below:above)}px`);
}
function revealShoppingAddForm(){
  const input=$('#shopping-item-input'),screen=$('#shopping-view'),viewport=window.visualViewport;
  const focused=document.activeElement===input;
  const mobile=window.matchMedia('(max-width: 700px), (pointer: coarse) and (max-width: 1100px)').matches;
  const keyboardOpen=focused&&mobile&&viewport&&Math.max(window.innerHeight,shoppingViewportBeforeKeyboard)-viewport.height>150;
  screen.classList.toggle('shopping-keyboard-docked',Boolean(keyboardOpen));
  if(keyboardOpen){
    const form=$('#shopping-add-form');
    form.style.setProperty('--shopping-dock-bottom',`${viewport.offsetTop+viewport.height-8}px`);
    form.style.setProperty('--shopping-dock-left',`${viewport.offsetLeft}px`);
    form.style.setProperty('--shopping-dock-width',`${viewport.width}px`);
  }
  positionShoppingSuggestions();
}
const shoppingInput=$('#shopping-item-input');
shoppingInput.addEventListener('focus',()=>{
  shoppingViewportBeforeKeyboard=window.visualViewport?.height||window.innerHeight;
  requestAnimationFrame(revealShoppingAddForm);
  setTimeout(revealShoppingAddForm,400);
});
shoppingInput.addEventListener('blur',()=>{$('#shopping-view').classList.remove('shopping-keyboard-docked');shoppingViewportBeforeKeyboard=0});
$('#shopping-add-form button[type="submit"]').addEventListener('pointerdown',event=>{if(document.activeElement===shoppingInput)event.preventDefault()});
window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(revealShoppingAddForm));
window.visualViewport?.addEventListener('scroll',()=>requestAnimationFrame(revealShoppingAddForm));
window.addEventListener('scroll',positionShoppingSuggestions,true);
function renderShoppingItemSuggestions(){$('#shopping-add-status').hidden=true;const input=$('#shopping-item-input'),list=$('#shopping-item-suggestions'),query=manualItemKey(input.value),catalog=[...(window.COMMON_MAIN_INGREDIENTS||[]),...state.dishes.flatMap(dish=>dish.ingredients||[])],values=new Map();catalog.forEach(raw=>{const name=normalizeManualItem(raw),key=manualItemKey(name);if(name&&key&&!values.has(key))values.set(key,name)});const matches=query?[...values.values()].filter(name=>manualItemKey(name).includes(query)).sort((a,b)=>a.localeCompare(b,'de-DE')).slice(0,8):[];renderIngredientOptions(list,matches,addManualShoppingItem);list.scrollTop=0;positionShoppingSuggestions();input.setAttribute('aria-expanded',String(matches.length>0))}
function addPantryIngredient(value){const name=normalizeIngredient(value);if(!name)return;const key=ingredientKey(name);if(!pantryDraft.some(item=>ingredientKey(item)===key))pantryDraft.push(name);$('#pantry-input').value='';renderPantryEditor();$('#pantry-input').focus()}
function openPantryPlanner(){const key=keyFor(mondayFor(rangeStart())),dialog=$('#pantry-dialog'),input=$('#pantry-input');pantryDraft=(state.pantryIngredients?.[key]||[]).slice();input.value='';try{if(!dialog.open)dialog.showModal();renderPantryEditor();requestAnimationFrame(()=>input.focus({preventScroll:true}))}catch(error){console.error('Wochenplan-Dialog konnte nicht geöffnet werden:',error);showToast('Der Wochenplan-Dialog konnte gerade nicht geöffnet werden. Bitte erneut versuchen.')}}
function renderPantryEditor(){const selected=$('#pantry-selected'),input=$('#pantry-input'),list=$('#pantry-suggestions'),query=ingredientKey(input.value);selected.replaceChildren();$('#pantry-selected-count').textContent=pantryDraft.length;$('#pantry-empty-selection').hidden=pantryDraft.length>0;pantryDraft.forEach(name=>{const chip=document.createElement('span');chip.className='pantry-chip';const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.type='button';remove.className='pantry-chip-remove';remove.setAttribute('aria-label',`${name} entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{pantryDraft=pantryDraft.filter(item=>ingredientKey(item)!==ingredientKey(name));renderPantryEditor()});chip.append(icon,label,remove);selected.append(chip)});const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)&&!pantryDraft.some(item=>ingredientKey(item)===ingredientKey(name))).slice(0,8):[];list.replaceChildren();matches.forEach(name=>{const option=document.createElement('button');option.type='button';option.className='pantry-suggestion';option.role='option';option.setAttribute('aria-selected','false');const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;option.append(icon,label);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>addPantryIngredient(name));list.append(option)});list.hidden=!matches.length;input.setAttribute('aria-expanded',String(matches.length>0));input.removeAttribute('aria-activedescendant')}
function makePlan(start,pantry=[],pinnedDays=new Set(),pinnedDishIds=new Set()){const dishes=state.dishes.filter(dish=>dish.type!=='baking'&&!pinnedDishIds.has(dish.id)),pool=shuffle(dishes.slice()),plan=[],prioritized=[],used=new Set();for(const item of pantry){const candidates=shuffle(pool.filter(d=>!used.has(d.id)&&(d.ingredients||[]).some(i=>ingredientMatches(item,i))));const dish=candidates[0];if(dish){prioritized.push(dish);used.add(dish.id)}}prioritized.forEach(d=>{const index=pool.findIndex(item=>item.id===d.id);if(index>=0)pool.splice(index,1)});pool.unshift(...prioritized);let last='',plannedDays=0;for(let i=0;i<7;i++){if(pinnedDays.has(i)){plan.push([]);continue}let idx=plannedDays<prioritized.length?0:pool.findIndex(d=>d.ingredient!==last);if(idx<0)idx=0;const dish=pool.splice(idx,1)[0];plan.push(dish?[dish.id]:[]);last=dish?.ingredient||'';plannedDays++;if(!pool.length)pool.push(...shuffle(dishes.slice()))}return plan}
function shoppingKeysForPlan(plan){const dishes=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));return [...new Set(dishes.flatMap(d=>(d.ingredients||[]).map(manualItemKey).filter(Boolean)))]}
function pantryShoppingKeys(plan,pantry){const dishes=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));return [...new Set(dishes.flatMap(d=>(d.ingredients||[]).filter(i=>pantry.some(item=>ingredientMatches(item,i))).map(manualItemKey).filter(Boolean)))]}
function replaceRangePlan(pantry){
  const dates=rangeDates(),plans=dates.map(date=>planForDate(date)),pinFlags=dates.map(date=>pinnedMealsForDate(date)),pinnedDays=new Set(),pinnedDishIds=new Set();
  pinFlags.forEach((flags,index)=>{plans[index].forEach((id,mealIndex)=>{if(flags[mealIndex]&&state.dishes.find(d=>d.id===id)?.type!=='baking'){pinnedDays.add(index);pinnedDishIds.add(id)}})});
  const generated=makePlan(dates[0],pantry,pinnedDays,pinnedDishIds),weekKeys=[...new Set(dates.map(date=>keyFor(mondayFor(date))))],resetKeysByWeek={};
  dates.forEach((date,index)=>{const weekKey=keyFor(mondayFor(date));resetKeysByWeek[weekKey]??=new Set();shoppingKeysForPlan([plans[index].filter(id=>state.dishes.find(d=>d.id===id)?.type!=='baking'),generated[index]]).forEach(key=>resetKeysByWeek[weekKey].add(key))});
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
    const weekKey=keyFor(mondayFor(date)),dayIndexValue=dayIndex(date),plan=ensurePlanWeek(weekKey);
    state.pinnedMeals??={};state.pinnedMeals[weekKey]??=Array.from({length:7},()=>[]);
    const kept=[],keptPins=[];let insertion=-1;
    plans[index].forEach((id,mealIndex)=>{const baking=state.dishes.find(d=>d.id===id)?.type==='baking';if(baking||pinFlags[index][mealIndex]){kept.push(id);keptPins.push(Boolean(pinFlags[index][mealIndex]))}else if(insertion<0)insertion=kept.length});
    if(!pinnedDays.has(index)&&generated[index].length){if(insertion<0)insertion=kept.length;kept.splice(insertion,0,...generated[index]);keptPins.splice(insertion,0,...generated[index].map(()=>false))}
    plan[dayIndexValue]=kept;state.pinnedMeals[weekKey][dayIndexValue]=keptPins;
    setRestDay(date,false);
  });
  weekKeys.forEach(weekKey=>{const days=dates.filter(date=>keyFor(mondayFor(date))===weekKey).map(date=>planForDate(date).filter(id=>state.dishes.find(d=>d.id===id)?.type!=='baking'));pantryShoppingKeys(days,pantry).forEach(key=>{state.shoppingChecks[weekKey]??=Object.create(null);state.shoppingChecks[weekKey][key]=true})});
  save();
  return generated.some((day,index)=>!pinnedDays.has(index)&&!day.length);
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function formatRange(start){const end=new Date(start);end.setDate(end.getDate()+6);const opts={day:'numeric',month:'short'};const monthA=start.toLocaleDateString('de-DE',{month:'long'}),monthB=end.toLocaleDateString('de-DE',{month:'long'});return monthA===monthB?`${start.getDate()}. – ${end.getDate()}. ${monthA} ${end.getFullYear()}`:`${start.toLocaleDateString('de-DE',opts)} – ${end.toLocaleDateString('de-DE',opts)} ${end.getFullYear()}`}
function nutritionFromDishForm(){
  return cleanNutrition(Object.fromEntries(nutritionFields.map(({key,id})=>[key,$(`#${id}`).value.trim()]).filter(([,value])=>value!=='').map(([key,value])=>[key,Number(value)])));
}
function nutritionText(n){
  const values=cleanNutrition(n);if(!values)return'';
  const parts=[];
  if(values.kcal!==undefined)parts.push(`~${values.kcal} kcal`);
  if(values.protein!==undefined)parts.push(`E ${values.protein} g`);
  if(values.fat!==undefined)parts.push(`F ${values.fat} g`);
  if(values.carbs!==undefined)parts.push(`KH ${values.carbs} g`);
  return parts.length?`${parts.join(' · ')} / Portion`:'';
}
function clearMealDropPreview(drag){
  if(!drag)return;
  drag?.previewElements?.forEach(meal=>meal.classList.remove('drop-shifted'));
  drag?.previewContent?.style.removeProperty('--meal-drop-shift');
  drag.previewElements=null;drag.previewContent=null;drag.previewVisibleIndex=null;
}
function clearMealDragVisuals(drag,{keepGhost=false}={}){
  if(drag?.scrollFrame)cancelAnimationFrame(drag.scrollFrame);
  if(drag?.touchTimer)clearTimeout(drag.touchTimer);
  drag?.weekTargets?.remove();
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
  const day=ensurePlanForDate(date),pins=ensurePinnedMealsForDate(date),index=day[mealIndex]===dishId?mealIndex:day.indexOf(dishId);
  if(index<0)return;
  day.splice(index,1);pins.splice(index,1);save();renderCalendar();
}
function setMealPinned(date,mealIndex,dishId){
  cancelMealDrag();
  const day=ensurePlanForDate(date),index=day[mealIndex]===dishId?mealIndex:day.indexOf(dishId);
  if(index<0)return;
  const pins=ensurePinnedMealsForDate(date);pins[index]=!Boolean(pins[index]);save();renderCalendar();
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
function showMealWeekTargets(drag){
  const panel=document.createElement('div'),label=document.createElement('strong'),days=document.createElement('div');
  panel.className='meal-week-targets';
  panel.setAttribute('aria-hidden','true');
  label.textContent='Auf einen Tag ziehen';
  days.className='meal-week-target-days';
  rangeDates().forEach((date,index)=>{
    const target=document.createElement('span');
    target.className='meal-week-target';
    target.dataset.dropDay=index;
    target.classList.toggle('is-source',index===drag.sourceDay);
    target.textContent=shortDays[dayIndex(date)];
    days.append(target);
  });
  panel.append(label,days);
  document.body.append(panel);
  drag.weekTargets=panel;
}
function updateMealDropTarget(clientX,clientY){
  const drag=mealDragState,calendar=$('#calendar');
  if(!drag)return;
  const hit=document.elementFromPoint(clientX,clientY);
  if(drag.weekTargets){
    const overPanel=drag.weekTargets.contains(hit),target=overPanel?hit.closest('[data-drop-day]'):null;
    const day=target?Number(target.dataset.dropDay):null;
    // A stationary long press can reveal the panel directly under the finger.
    drag.hasMoved ||= Math.hypot(clientX-drag.startX,clientY-drag.startY)>10;
    const active=drag.hasMoved&&day!==drag.sourceDay?target:null;
    if(drag.activeWeekTarget!==active){
      drag.activeWeekTarget?.classList.remove('is-target');
      active?.classList.add('is-target');
      drag.activeWeekTarget=active;
    }
    if(overPanel){
      clearMealDropPreview(drag);
      drag.targetDay=active?day:null;
      drag.insertIndex=Infinity;
      return;
    }
  }
  const content=hit?.closest('.day-content');
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
  if(speed&&!drag.weekTargets?.contains(document.elementFromPoint(drag.clientX,drag.clientY)))window.scrollBy(0,speed);
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
  if(event.touches.length!==1||event.target.closest?.('.meal-remove,.meal-pin,.add-meal'))return;
  const meal=event.target.closest?.('.meal-card'),content=meal?.closest('.day-content');
  if(!meal||!content)return;
  const touch=event.touches[0],drag={pointerId:null,touchGesture:true,meal,mealIndex:Number(meal.dataset.mealIndex),dishId:meal.dataset.dishId,sourceDay:Number(content.dataset.day),targetDay:null,insertIndex:0,startX:touch.clientX,startY:touch.clientY,clientX:touch.clientX,clientY:touch.clientY,dragging:false,ghost:null,scrollFrame:0,touchTimer:0};
  mealDragState=drag;
  drag.touchTimer=setTimeout(()=>{
    if(mealDragState!==drag)return;
    createMealDragGhost(drag);showMealWeekTargets(drag);
    drag.scrollFrame=requestAnimationFrame(autoScrollMealDrag);
  },320);
}
function moveMealTouchDrag(event){
  const drag=mealDragState;
  if(!drag?.touchGesture)return;
  if(event.touches.length!==1){cancelMealTouchDrag();return}
  const touch=event.touches[0];drag.clientX=touch.clientX;drag.clientY=touch.clientY;
  if(!drag.dragging){
    if(Math.hypot(touch.clientX-drag.startX,touch.clientY-drag.startY)>10){suppressedMealOpenUntil=Date.now()+700;clearMealDragVisuals(drag);mealDragState=null}
    return;
  }
  if(event.cancelable)event.preventDefault();
  updateMealDragPosition(drag,touch.clientX,touch.clientY);
}
function moveMealToDropTarget(drag){
  if(drag.targetDay===null)return null;
  const dates=rangeDates(),sourceDate=dates[drag.sourceDay],destinationDate=dates[drag.targetDay];
  if(!sourceDate||!destinationDate)return null;
  const sourcePlan=ensurePlanForDate(sourceDate),destinationPlan=ensurePlanForDate(destinationDate),sourcePins=ensurePinnedMealsForDate(sourceDate),destinationPins=ensurePinnedMealsForDate(destinationDate);
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
  if(drag.dragging)suppressedMealOpenUntil=Date.now()+700;
  if(drag.dragging&&!cancelled)updateMealDropTarget(drag.clientX,drag.clientY);
  const dates=drag.activeWeekTarget&&!cancelled?rangeDates():null;
  const affectedDates=dates?[dates[drag.sourceDay],dates[drag.targetDay]]:null;
  const before=affectedDates?snapshotPlanDays(affectedDates):null;
  const destination=drag.dragging&&!cancelled?moveMealToDropTarget(drag):null,dish=state.dishes.find(item=>item.id===drag.dishId);
  clearMealDragVisuals(drag,{keepGhost:Boolean(destination)});mealDragState=null;
  if(!destination)return;
  const after=before?snapshotPlanDays(affectedDates):null;
  save();renderCalendar({droppedMeal:destination});animateMealDrop(drag.ghost,destination);
  const weekday=destination.date.toLocaleDateString('de-DE',{weekday:'long'});
  showToast(`${dish?.name||'Gericht'} auf ${weekday} verschoben.`,before?{
    actionLabel:'Rückgängig',duration:6500,onAction:()=>undoRestInsertion(before,after)
  }:undefined);
}
function finishMealPointerDrag(event,cancelled=false){
  const drag=mealDragState;
  if(!drag||drag.pointerId===null||event.pointerId!==drag.pointerId)return;
  drag.clientX=event.clientX;drag.clientY=event.clientY;
  if(drag.dragging&&drag.ghost){drag.ghost.style.left=`${event.clientX-drag.grabOffsetX}px`;drag.ghost.style.top=`${event.clientY-drag.grabOffsetY}px`}
  const openAfterTap=!drag.dragging&&!cancelled,dishId=drag.dishId;finishMealDrop(drag,cancelled);
  if(openAfterTap){suppressedMealOpenUntil=Date.now()+700;openRecipe(dishId,{from:'week'})}
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
  $('#week-date').textContent=formatRange(start);$('#heading-period').textContent=`· ${start.toLocaleDateString('de-DE',{month:'long',year:'numeric'})}`;$('#nav-count').textContent=planned;$('#plan-meta').textContent=`${planned} ${planned===1?'Rezept':'Rezepte'} geplant`;
  const today=keyFor(new Date()),grid=$('#calendar'),dishesById=new Map(state.dishes.map(dish=>[dish.id,dish]));grid.innerHTML='';
  days.forEach(({date,day,isRest},i)=>{
    const isToday=keyFor(date)===today,card=document.createElement('article');card.className='day-card'+(isToday?' today':'')+(isRest?' is-rest-day':'')+(shuffleAnimation?' shuffle-in':'');
    if(shuffleAnimation)card.style.setProperty('--shuffle-index',i);
    card.innerHTML=`<div class="day-head"><div><div class="day-name">${shortDays[dayIndex(date)]}</div><div class="day-num">${date.getDate()} <span style="font:400 10px var(--sans);color:#a0a79e">${date.toLocaleDateString('de-DE',{month:'short'})}</span></div></div>${isToday?'<span class="today-pill">Heute</span>':''}</div><div class="day-content" data-day="${i}"></div>`;
    const content=card.querySelector('.day-content'),pinned=pinnedMealsForDate(date);
    if(isRest){
      const restCard=document.createElement('div');restCard.className='rest-day-tile';restCard.innerHTML='<span class="rest-day-icon" aria-hidden="true">🥡</span><span class="rest-day-copy"><strong>Resteabend</strong><small></small></span>';
      restCard.querySelector('.rest-day-copy small').textContent=isToday?'Heute bleibt die Küche kalt.':'Kein Kochen geplant.';content.append(restCard);
    }
    day.forEach((id,j)=>{
      const dish=dishesById.get(id);if(!dish)return;
      const isPinned=Boolean(pinned[j]),wasDropped=droppedMeal?.day===i&&droppedMeal.mealIndex===j,meal=document.createElement('div');meal.className='meal-card'+(isPinned?' is-pinned':'')+(wasDropped?' just-dropped':'');meal.dataset.mealIndex=j;meal.dataset.dishId=id;meal.setAttribute('role','button');meal.setAttribute('tabindex','0');meal.setAttribute('aria-label',`${dish.name} öffnen`);
      meal.innerHTML=`<div class="meal-actions"><button type="button" class="meal-pin" aria-label="${isPinned?'Gericht nicht mehr fixieren':'Gericht fixieren'}" aria-pressed="${isPinned}"><svg class="meal-pin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 2H8v2l1 1v5.17L5.59 14.6A2 2 0 0 0 7 18h4v4h2v-4h4a2 2 0 0 0 1.41-3.4L15 10.17V5l1-1V2z"/></svg></button><button type="button" class="meal-remove" aria-label="Gericht entfernen">×</button></div><div class="meal-title"><span class="meal-icon"></span><div class="meal-name" lang="de"></div></div><div class="meal-meta"><span class="meal-time"></span><span class="dot">·</span><span class="meal-ingredient"></span></div><div class="meal-nutrition"></div>`;
      meal.querySelector('.meal-time').textContent=`◷ ${dish.time||25} min`;
      meal.querySelector('.meal-ingredient').textContent=dish.ingredient||'Lieblingsgericht';
      meal.querySelector('.meal-icon').textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';meal.querySelector('.meal-name').textContent=dish.name;meal.querySelector('.meal-name').title=dish.name;meal.querySelector('.meal-nutrition').textContent=nutritionText(dish.nutrition);meal.querySelector('.meal-nutrition').hidden=!dish.nutrition;
      content.append(meal);
    });
    const add=document.createElement('button');add.type='button';add.className='add-meal';add.textContent=isRest?'＋ Gericht statt Reste eintragen':'＋ Eintragen';add.addEventListener('click',()=>{cancelMealDrag();chooseDish(i)});content.append(add);grid.append(card);
  });
  $('#bottom-note').classList.toggle('hidden',state.noteHidden);updateShoppingNavCount();
}
function renderCalendar(options){cancelMealDrag();renderCalendarContent(options);renderedCalendarSnapshot=calendarStateForRange(state)}
const mealCalendar=$('#calendar');
let suppressedMealOpenUntil=0;
function openMealCardFromEvent(event){
  const meal=event.target.closest?.('.meal-card');
  if(!meal||event.target.closest?.('.meal-remove,.meal-pin')||mealDragState||Date.now()<suppressedMealOpenUntil)return;
  cancelMealDrag();openRecipe(meal.dataset.dishId,{from:'week'});
}
mealCalendar.addEventListener('click',openMealCardFromEvent);
mealCalendar.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||event.target.closest?.('.meal-remove,.meal-pin'))return;const meal=event.target.closest?.('.meal-card');if(!meal)return;event.preventDefault();openRecipe(meal.dataset.dishId,{from:'week'})});
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
function renderDishesContent(){
  const query=$('#search-dishes').value.trim().toLowerCase(),list=$('#dish-list'),type=selectedRecipeType($('#dishes-type'));
  const dishes=state.dishes.filter(dish=>(dish.type==='baking'?'baking':'meal')===type&&(dish.name.toLowerCase().includes(query)||String(dish.ingredient||'').toLowerCase().includes(query)||(dish.ingredients||[]).some(name=>name.toLowerCase().includes(query))));
  if(!dishes.length){
    list.innerHTML=type==='baking'?'<div class="empty-state"><b>Keine Backrezepte gefunden.</b>Ändere die Suche oder füge ein Backrezept hinzu.</div>':'<div class="empty-state"><b>Keine Gerichte gefunden.</b>Ändere die Suche oder füge ein Gericht hinzu.</div>';
    return;
  }
  const rows=document.createDocumentFragment();
  for(const dish of dishes){
    const row=document.createElement('div');row.className='dish-row';row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',`${dish.name} bearbeiten`);
    row.innerHTML='<div class="dish-icon"></div><div class="dish-copy"><b></b><small><span class="dish-time"></span> <span style="padding:0 5px;color:#d0d5cc">·</span> <span class="dish-ingredient"></span></small><small class="dish-nutrition"></small><small class="dish-ingredients-preview"></small></div><span class="dish-tag"></span><span class="row-edit" aria-hidden="true">···</span>';
    row.querySelector('.dish-icon').textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';
    row.querySelector('.dish-copy b').textContent=dish.name;
    row.querySelector('.dish-time').textContent=`◷ ${dish.time||25} Min.`;
    row.querySelector('.dish-ingredient').textContent=dish.ingredient||'Ohne Angabe';
    row.querySelector('.dish-tag').textContent=dish.type==='baking'?'Backen':(dish.ingredient||'Gericht');
    const nutrition=row.querySelector('.dish-nutrition');
    nutrition.textContent=nutritionText(dish.nutrition);nutrition.hidden=!dish.nutrition;
    row.querySelector('.dish-ingredients-preview').textContent=(dish.ingredients||[]).join(' · ')||'Noch keine Zutaten';
    row.addEventListener('click',()=>openDish(dish.id));
    row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDish(dish.id)}});
    rows.append(row);
  }
  list.replaceChildren(rows);
}
function renderDishes(){renderDishesContent();renderedDishesSnapshot=dishesStateForView(state)}
function showToast(text,{actionLabel='',onAction=null,duration=2600,scopeBound=true}={}){const t=$('#toast'),message=document.createElement('span');t.replaceChildren();t.classList.toggle('has-action',Boolean(actionLabel&&onAction));message.className='toast-message';message.textContent=text;t.append(message);if(actionLabel&&onAction){const scope=authScope,householdId=currentHouseholdId,action=document.createElement('button');action.type='button';action.className='toast-action';action.textContent=actionLabel;action.addEventListener('click',()=>{clearTimeout(toastTimer);t.classList.remove('show','has-action');if(!scopeBound||(scope===authScope&&householdId===currentHouseholdId))onAction()});t.append(action)}t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show','has-action'),duration)}
function recipeRowControl(tag,attrs={}){const element=document.createElement(tag);Object.entries(attrs).forEach(([key,value])=>{if(key==='text')element.textContent=value;else if(key==='className')element.className=value;else element.setAttribute(key,value)});return element}
let recipeIngredientSuggestionId=0,recipeIngredientPage=0,recipeStepPage=0;
let dishImport=null,importDefaultType='meal',dishSectionIngredients=false;
function renderRecipeIngredientRows(items=[]){
  const container=$('#recipe-ingredient-rows');container.replaceChildren();
  (items.length?items:[{name:'',amount:null,unit:'',note:''}]).forEach(item=>{
    const row=document.createElement('div');row.className='recipe-ingredient-row';const showNote=!dishWizardActive||Boolean(dishImport)||dishSectionIngredients||(dishWizardEditing&&Boolean(item.note));row.classList.toggle('has-ingredient-note',showNote);
    const nameWrap=document.createElement('div');nameWrap.className='recipe-ingredient-name';
    const listId=`recipe-ingredient-suggestions-${++recipeIngredientSuggestionId}`;
    const name=recipeRowControl('input',{type:'text',maxlength:'100',autocomplete:'off',placeholder:'Zutat',value:item.name||'',role:'combobox','aria-autocomplete':'list','aria-expanded':'false','aria-controls':listId});name.dataset.recipeField='name';name.setAttribute('aria-label','Zutat');
    const list=recipeRowControl('div',{id:listId,className:'pantry-suggestions recipe-ingredient-suggestions',role:'listbox'});list.hidden=true;
    let blurTimer;
    const closeSuggestions=()=>{clearTimeout(blurTimer);list.hidden=true;name.setAttribute('aria-expanded','false');name.removeAttribute('aria-activedescendant')};
    const showSuggestions=()=>{const query=ingredientKey(name.value),matches=query?availablePantryIngredients().filter(value=>ingredientKey(value).includes(query)).slice(0,8):[];renderIngredientOptions(list,matches,value=>{name.value=value;clearTimeout(blurTimer);name.focus({preventScroll:true});closeSuggestions()});[...list.children].forEach((option,index)=>option.id=`${listId}-${index}`);name.setAttribute('aria-expanded',String(matches.length>0));name.removeAttribute('aria-activedescendant')};
    name.addEventListener('input',showSuggestions);name.addEventListener('focus',()=>{clearTimeout(blurTimer);showSuggestions()});name.addEventListener('blur',()=>{blurTimer=setTimeout(closeSuggestions,200)});
    name.addEventListener('keydown',event=>{const options=[...list.children];if(event.key==='Escape'&&!list.hidden){event.preventDefault();event.stopPropagation();closeSuggestions()}else if(!list.hidden&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const current=options.findIndex(option=>option.id===name.getAttribute('aria-activedescendant'));const index=event.key==='ArrowDown'?Math.min(current+1,options.length-1):(current<0?options.length-1:Math.max(current-1,0));options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));name.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'})}else if(event.key==='Enter'){event.preventDefault();const active=options.find(option=>option.id===name.getAttribute('aria-activedescendant'));if(!list.hidden&&active)active.click();else closeSuggestions()}});
    nameWrap.append(name,list);
    const amount=recipeRowControl('input',{type:'text',inputmode:'decimal',maxlength:'40',placeholder:'Menge',value:item.amount??''});amount.dataset.recipeField='amount';amount.setAttribute('aria-label','Menge');
    const unit=recipeRowControl('select',{'aria-label':'Einheit'});unit.dataset.recipeField='unit';
    const units=['','g','kg','ml','l','EL','TL','Prise','Stück','Dose','Bund'];
    if(item.unit&&!units.includes(item.unit))units.push(item.unit);
    units.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value||'Einheit';unit.append(option)});unit.value=item.unit||'';
    const note=recipeRowControl('input',{type:showNote?'text':'hidden',maxlength:'100',placeholder:'Hinweis (optional)',value:item.note||''});note.dataset.recipeField='note';if(showNote)note.setAttribute('aria-label','Hinweis');
    const remove=recipeRowControl('button',{type:'button',className:'recipe-row-remove',text:'×','aria-label':'Zutat entfernen'});remove.addEventListener('click',()=>{row.remove();if(!container.children.length)renderRecipeIngredientRows([]);updateRecipePagers()});
    row.append(nameWrap,amount,unit,note,remove);container.append(row);
  });
  updateRecipePagers();
}
function renderRecipeStepRows(steps=[]){
  const container=$('#recipe-step-rows');container.replaceChildren();
  (steps.length?steps:['']).forEach((step,index)=>{
    const row=document.createElement('div');row.className='recipe-step-row';
    const number=recipeRowControl('span',{className:'recipe-step-number',text:`${index+1}.`});number.setAttribute('aria-hidden','true');
    const text=recipeRowControl('textarea',{rows:'5',maxlength:'1200',placeholder:`Schritt ${index+1}`});text.value=step;text.dataset.recipeField='step';text.setAttribute('aria-label',`Zubereitungsschritt ${index+1}`);
    const actions=document.createElement('div');actions.className='recipe-step-actions';
    [['↑','Schritt nach oben',-1],['↓','Schritt nach unten',1],['×','Schritt löschen',0]].forEach(([label,aria,direction])=>{const button=recipeRowControl('button',{type:'button',className:'recipe-row-move',text:label,'aria-label':aria});button.disabled=direction<0?index===0:direction>0?index===container.children.length:false;button.addEventListener('click',()=>{if(direction===0){row.remove();renderRecipeStepRows([...container.querySelectorAll('[data-recipe-field="step"]')].map(input=>input.value))}else{const sibling=direction<0?row.previousElementSibling:row.nextElementSibling;if(sibling){direction<0?container.insertBefore(row,sibling):container.insertBefore(sibling,row);recipeStepPage=Math.max(0,recipeStepPage+direction)}renderRecipeStepRows([...container.querySelectorAll('[data-recipe-field="step"]')].map(input=>input.value))}});actions.append(button)});
    row.append(number,text,actions);container.append(row);
  });
  [...container.children].forEach((row,index)=>{row.querySelector('.recipe-step-number').textContent=`${index+1}.`;const buttons=row.querySelectorAll('button');buttons[0].disabled=index===0;buttons[1].disabled=index===container.children.length-1});
  const addButton=$('#recipe-add-step'),atLimit=container.children.length>=100;addButton.disabled=atLimit;addButton.textContent=atLimit?'Maximal 100 Schritte':'＋ Schritt hinzufügen';
  updateRecipePagers();
}
function recipeEditorValue(){
  const servingsText=$('#recipe-servings').value.trim(),servings=servingsText?Number(servingsText):null;
  if(servingsText&&(!Number.isInteger(servings)||servings<1||servings>100))throw new Error('Die Basis-Portionszahl muss eine positive ganze Zahl sein.');
  const ingredients=[];
  $('#recipe-ingredient-rows').querySelectorAll('.recipe-ingredient-row').forEach(row=>{
    const item=Object.fromEntries([...row.querySelectorAll('[data-recipe-field]')].map(input=>[input.dataset.recipeField,input.value.trim()]));
    if(!item.name&&!item.amount&&!item.unit&&!item.note)return;
    if(!item.name)throw new Error('Gib für jede ausgefüllte Zutatenzeile einen Namen an.');
    if(item.amount&&/^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?$/i.test(item.amount)){const numericAmount=window.WochentischRecipes.parseAmount(item.amount);if(numericAmount===null||numericAmount>1000000000)throw new Error('Zahlenmengen müssen positiv sein und dürfen eine Milliarde nicht überschreiten.')}
    ingredients.push({name:item.name,amount:window.WochentischRecipes.normalizeAmount(item.amount),unit:item.unit,note:item.note});
  });
  const steps=[...$('#recipe-step-rows').querySelectorAll('[data-recipe-field="step"]')].map(input=>input.value.trim()).filter(Boolean);
  const hasData=Boolean(servingsText||ingredients.length||steps.length);
  return hasData?{servings,ingredients,steps}:null;
}
// The creation wizard reuses the editor controls and its existing save path.
let dishWizardActive=false,dishWizardEditing=false,dishWizardStep=0,dishWizardInitial='',dishWizardMobile=false;
const dishWizardForm=$('#dish-form'),dishWizardDialog=$('#dish-dialog');
const dishWizardProgress=document.createElement('div');
dishWizardProgress.className='dish-wizard-progress';dishWizardProgress.setAttribute('role','status');dishWizardProgress.setAttribute('aria-live','polite');
$('#dish-form-error').before(dishWizardProgress);
const dishWizardSection=document.createElement('select');dishWizardSection.className='dish-wizard-section';dishWizardSection.setAttribute('aria-label','Rezeptbereich auswählen');dishWizardProgress.after(dishWizardSection);
dishWizardSection.addEventListener('change',()=>{dishWizardStep=Number(dishWizardSection.value);$('#dish-form-error').hidden=true;renderDishWizard({focus:true})});
const dishWizardBack=document.createElement('button');dishWizardBack.type='button';dishWizardBack.className='secondary-button dish-wizard-back';dishWizardBack.textContent='Zurück';
const dishWizardNext=document.createElement('button');dishWizardNext.type='button';dishWizardNext.className='primary-button dish-wizard-next';dishWizardNext.textContent='Weiter';
$('#cancel-dialog').after(dishWizardBack);dishWizardBack.after(dishWizardNext);
function createRecipePager(container,label){
  const pager=document.createElement('div');pager.className='recipe-row-pager';pager.setAttribute('aria-label',label);
  const previous=recipeRowControl('button',{type:'button',className:'secondary-button',text:'←','aria-label':label==='Zutat'?'Vorherige Zutat':'Vorheriger Zubereitungsschritt'});
  const count=document.createElement('span');count.setAttribute('aria-live','polite');
  const next=recipeRowControl('button',{type:'button',className:'secondary-button',text:'→','aria-label':label==='Zutat'?'Nächste Zutat':'Nächster Zubereitungsschritt'});
  pager.append(previous,count,next);container.after(pager);
  previous.addEventListener('click',()=>{if(label==='Zutat')recipeIngredientPage--;else recipeStepPage--;updateRecipePagers()});
  next.addEventListener('click',()=>{if(label==='Zutat')recipeIngredientPage++;else recipeStepPage++;updateRecipePagers()});
  return {pager,previous,count,next};
}
const ingredientPager=createRecipePager($('#recipe-ingredient-rows'),'Zutat'),stepPager=createRecipePager($('#recipe-step-rows'),'Zubereitungsschritt');
function updateRecipePagers(){
  const paged=dishWizardActive&&dishWizardMobile,currentKey=paged?dishWizardSteps()[dishWizardStep]?.key:'';
  [[ingredientPager,$('#recipe-ingredient-rows'),'ingredient'],[stepPager,$('#recipe-step-rows'),'step']].forEach(([controls,container,type])=>{
    const imported=Boolean(dishImport)||(type==='ingredient'?Boolean(sectionImportPanels.ingredients.lastSource):Boolean(sectionImportPanels.preparation.lastSource));
    const showPages=paged&&!imported;
    const rows=[...container.children];let index=type==='ingredient'?recipeIngredientPage:recipeStepPage;index=Math.max(0,Math.min(index,rows.length-1));
    if(type==='ingredient')recipeIngredientPage=index;else recipeStepPage=index;
    rows.forEach((row,i)=>{row.hidden=showPages&&i!==index});controls.pager.hidden=!showPages||rows.length<2||currentKey!==(type==='ingredient'?'ingredients':'preparation');
    controls.previous.disabled=index===0;controls.next.disabled=index>=rows.length-1;
    controls.count.textContent=`${type==='ingredient'?'Zutat':'Schritt'} ${index+1} von ${rows.length}`;
  });
}
const portionHint=document.createElement('p');portionHint.className='recipe-per-portion';portionHint.textContent='Mengen pro Portion';$('#recipe-ingredient-rows').before(portionHint);
const servingsSuffix=document.createElement('span');servingsSuffix.className='recipe-servings-suffix';servingsSuffix.textContent='Portionen';$('#recipe-servings').after(servingsSuffix);

const sectionImportPanels={};
[['ingredients','Zutaten'],['preparation','Zubereitung'],['nutrition','Nährwerte']].forEach(([key,label])=>{
  const panel=document.createElement('details');panel.className='dish-section-import';panel.hidden=true;
  const textId=`dish-section-${key}-text`,hint=key==='nutrition'?'Bitte nur Nährwerte pro Portion einfügen.':'Deutschen Text einfügen und die erkannten Angaben prüfen.';
  panel.innerHTML=`<summary>${label} aus Text hinzufügen</summary><p>${hint} Die Auswertung bleibt auf diesem Gerät.</p><label for="${textId}">Text für ${label}</label><textarea id="${textId}" rows="5"></textarea><button type="button" class="secondary-button dish-section-import-action">Text übernehmen</button><p class="dish-section-import-status" role="status" aria-live="polite"></p><pre class="dish-section-import-unassigned"></pre>`;
  sectionImportPanels[key]={panel,text:panel.querySelector('textarea'),status:panel.querySelector('.dish-section-import-status'),unassigned:panel.querySelector('pre'),pending:[],lastSource:''};
  const anchor=key==='ingredients'?$('.recipe-servings-control'):key==='preparation'?$('#recipe-editor-heading').parentElement.querySelector('h4'):$('.dish-nutrition-fieldset');anchor.before(panel);
  panel.querySelector('button').addEventListener('click',()=>importDishSection(key));
  sectionImportPanels[key].ocr=window.WochentischOCRUI.attach({before:panel.querySelector('label'),text:sectionImportPanels[key].text,parseButton:panel.querySelector('.dish-section-import-action')});
});
function resetSectionImports(){dishSectionIngredients=false;Object.values(sectionImportPanels).forEach(entry=>{entry.ocr.reset();entry.text.value='';entry.status.textContent='';entry.unassigned.textContent='';entry.pending=[];entry.lastSource='';entry.panel.open=false})}
function sectionImportHasUnreviewed(){return Object.values(sectionImportPanels).some(entry=>entry.pending.length||entry.ocr.hasPending()||(entry.text.value.trim()&&entry.text.value!==entry.lastSource))}
function showSectionImportStatus(entry,message){entry.status.textContent=message;requestAnimationFrame(()=>entry.status.scrollIntoView({block:'center',inline:'nearest'}))}
function importDishSection(key){
  const entry=sectionImportPanels[key],source=entry.text.value,result=window.WochentischRecipeImport.parseSection(source,key);
  if(result.error){showSectionImportStatus(entry,`Import nicht erfolgreich: ${result.error}`);return}
  if(source===entry.lastSource){showSectionImportStatus(entry,'Dieser Text wurde bereits übernommen. Ändere den Text, um weitere Angaben hinzuzufügen.');return}
  let current;
  if(key==='ingredients')current={ingredients:[...$('#recipe-ingredient-rows').querySelectorAll('.recipe-ingredient-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-recipe-field]')].map(input=>[input.dataset.recipeField,input.value]))),servings:$('#recipe-servings').value};
  else if(key==='preparation')current={steps:[...$('#recipe-step-rows').querySelectorAll('[data-recipe-field="step"]')].map(input=>input.value)};
  else current={nutrition:Object.fromEntries(nutritionFields.map(({key,id})=>[key,$(`#${id}`).value]))};
  const merged=window.WochentischRecipeImport.mergeSection(key,current,result);
  if(merged.error){if(key==='ingredients'){dishSectionIngredients=true;renderDishWizard()}showSectionImportStatus(entry,`Import nicht erfolgreich: ${merged.error}`);return}
  let summary;
  if(key==='ingredients'){
    dishSectionIngredients=true;$('#recipe-servings').value=merged.servings??'';recipeIngredientPage=Math.max(0,merged.ingredients.length-result.ingredients.length);renderRecipeIngredientRows(merged.ingredients);
    summary=`${result.ingredients.length} ${result.ingredients.length===1?'Zutat hinzugefügt':'Zutaten hinzugefügt'}.`;
    if(!merged.servings)summary+=' Basis-Portionen unbekannt: Bitte prüfen.';
  }else if(key==='preparation'){
    recipeStepPage=Math.max(0,merged.steps.length-result.steps.length);renderRecipeStepRows(merged.steps);
    summary=`${result.steps.length} ${result.steps.length===1?'Zubereitungsschritt hinzugefügt':'Zubereitungsschritte hinzugefügt'}.`;
  }else{
    const existing=current.nutrition;nutritionFields.forEach(({key:field,id})=>{$(`#${id}`).value=merged.nutrition[field]??''});
    const added=Object.keys(result.nutrition).filter(field=>existing[field]===''||existing[field]===undefined).length;
    summary=added?`${added} ${added===1?'Nährwert übernommen':'Nährwerte übernommen'}.`:'Keine neuen Nährwerte übernommen.';
    if(merged.skipped.length){summary+=' Vorhandene Werte wurden beibehalten.';entry.pending.push(...merged.skipped.map(field=>result.nutritionLines[field]||source))}
  }
  entry.pending.push(...(result.unassigned||[]));entry.lastSource=source;
  entry.unassigned.textContent=entry.pending.length?`Nicht übernommen (wird nicht gespeichert):\n${entry.pending.join('\n')}`:'';
  renderDishWizard();showSectionImportStatus(entry,`Import abgeschlossen: ${summary}${entry.pending.length?' Nicht zugeordnete Angaben bitte prüfen.':''}`);
}
const dishWizardElements={
  name:[$('#dish-recipe-title').closest('label'),$('#dish-type').closest('.dish-type-label')],
  main:[$('.dish-main-ingredient-field')],time:[$('.time-slider-label')],
  ingredients:[$('.recipe-servings-control'),$('.recipe-editor-hint'),portionHint,$('#recipe-ingredient-rows'),ingredientPager.pager,$('#recipe-add-ingredient')],
  preparation:[$('#recipe-editor-heading').parentElement.querySelector('h4'),$('#recipe-step-rows'),stepPager.pager,$('#recipe-add-step')],
  nutrition:[$('.dish-nutrition-fieldset')]
};
function dishWizardSteps(){
  const steps=[{key:'name',title:'Grunddaten',groups:['name']}];
  if(dishWizardMobile){if(selectedRecipeType($('#dish-type'))!=='baking')steps.push({key:'main',title:'Hauptzutat',groups:['main']});steps.push({key:'time',title:'Zeitaufwand',groups:['time']})}
  else steps[0].groups.push('main','time');
  return steps.concat([{key:'ingredients',title:'Zutaten',groups:['ingredients']},{key:'preparation',title:'Zubereitung',groups:['preparation']},{key:'nutrition',title:'Nährwerte',groups:['nutrition']}]);
}
function dishWizardSnapshot(){
  return JSON.stringify({fields:[...dishWizardForm.querySelectorAll('input:not([type=hidden]), textarea, select:not(.dish-wizard-section)')].map(el=>el.value),type:selectedRecipeType($('#dish-type')),ingredients:dishIngredientDraft});
}
let dishImportSourceStep='';
function renderDishWizard({focus=false}={}){
  const steps=dishWizardSteps(),step=steps[dishWizardStep];
  dishWizardForm.classList.toggle('is-imported-ingredients',dishWizardActive&&step.key==='ingredients'&&(Boolean(dishImport)||Boolean(sectionImportPanels.ingredients.lastSource)));
  dishWizardForm.classList.toggle('is-dish-wizard',dishWizardActive);
  dishWizardForm.classList.toggle('is-dish-edit-wizard',dishWizardEditing);
  dishWizardForm.noValidate=dishWizardActive;
  Object.entries(dishWizardElements).forEach(([key,group])=>group.forEach(el=>{el.hidden=dishWizardActive&&!step.groups.includes(key)}));
  $('.recipe-servings-control').hidden=dishWizardActive&&(!(dishWizardEditing||dishImport||dishSectionIngredients)||step.key!=='ingredients');
  servingsSuffix.hidden=!(dishWizardEditing||dishImport||dishSectionIngredients);
  $('.recipe-servings-field').textContent=dishWizardEditing?'Mengen für':'Basis-Portionen';
  $('#recipe-servings').placeholder=dishWizardEditing||dishImport||dishSectionIngredients?'–':'2';
  $('.recipe-editor-hint').hidden=dishWizardActive;
  portionHint.hidden=!dishWizardActive||dishWizardEditing||Boolean(dishImport)||dishSectionIngredients||step.key!=='ingredients';
  Object.entries(sectionImportPanels).forEach(([key,entry])=>{entry.panel.hidden=!dishWizardActive||!step.groups.includes(key)});
  if(dishImport&&dishImportSourceStep!==step.key){dishImportSource.open=['ingredients','preparation'].includes(step.key);dishImportSourceStep=step.key}
  dishImportSource.hidden=!dishImport;dishImportDefaults.hidden=!dishImport||!step.groups.includes('name');
  updateRecipePagers();
  if(step.key!=='ingredients')ingredientPager.pager.hidden=true;
  if(step.key!=='preparation')stepPager.pager.hidden=true;
  if(!dishWizardActive)updateDishTypeFields();
  else if(selectedRecipeType($('#dish-type'))==='baking')$('.dish-main-ingredient-field').hidden=true;
  $('#dish-form .form-row').hidden=dishWizardActive&&!step.groups.some(key=>key==='main'||key==='time');
  $('.recipe-editor-section').hidden=dishWizardActive&&!['ingredients','preparation'].includes(step.key);
  $('#recipe-editor-heading').hidden=dishWizardActive;
  const last=steps.length-1;
  dishWizardProgress.hidden=!dishWizardActive||dishWizardEditing;dishWizardSection.hidden=!dishWizardEditing;
  if(dishWizardEditing){dishWizardSection.replaceChildren(...steps.map((entry,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=entry.title;return option}));dishWizardSection.value=String(dishWizardStep)}
  $('#cancel-dialog').hidden=dishWizardEditing;$('#delete-dish').hidden=dishWizardEditing?dishWizardStep!==0:!$('#dish-id').value||recipeEditorMode==='catalog';
  dishWizardBack.hidden=!dishWizardActive||dishWizardStep===0;dishWizardNext.hidden=!dishWizardActive||dishWizardStep===last;
  const submit=dishWizardForm.querySelector('[type="submit"]');submit.hidden=dishWizardActive&&!dishWizardEditing&&dishWizardStep!==last;
  if(dishWizardActive){
    dishWizardProgress.textContent=`Schritt ${dishWizardStep+1} von ${steps.length} · ${step.title}`;
    $('#dialog-title').textContent=step.title;submit.textContent=dishWizardEditing?'Speichern':'Rezept speichern';
    if(focus){dishWizardDialog.scrollTop=0;dishWizardDialog.focus({preventScroll:true})}
  }
}
function dishWizardError(message,field){const error=$('#dish-form-error');error.textContent=message;error.hidden=false;field?.focus()}
function validateDishWizardStep(step){
  $('#dish-form-error').hidden=true;
  if(step==='name'&&!$('#dish-recipe-title').value.trim()){dishWizardError('Bitte gib einen Namen für das Rezept ein.',$('#dish-recipe-title'));return false}
  if(step==='ingredients'){
    if((dishWizardEditing||dishImport||dishSectionIngredients)&&!$('#recipe-servings').validity.valid){dishWizardError('Die Portionszahl muss eine ganze Zahl zwischen 1 und 100 sein.',$('#recipe-servings'));return false}
    for(const [index,row] of [...$('#recipe-ingredient-rows').querySelectorAll('.recipe-ingredient-row')].entries()){
      const name=row.querySelector('[data-recipe-field="name"]'),amount=row.querySelector('[data-recipe-field="amount"]');
      if(!name.value.trim()&&[...row.querySelectorAll('[data-recipe-field]')].some(input=>input.value.trim())){recipeIngredientPage=index;updateRecipePagers();dishWizardError('Gib für jede ausgefüllte Zutatenzeile einen Namen an.',name);return false}
      const value=amount.value.trim();if(value&&/^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?$/i.test(value)){const n=window.WochentischRecipes.parseAmount(value);if(n===null||n>1000000000){recipeIngredientPage=index;updateRecipePagers();dishWizardError('Zahlenmengen müssen positiv sein und dürfen eine Milliarde nicht überschreiten.',amount);return false}}
    }
  }
  if(step==='nutrition'){for(const {id} of nutritionFields){const field=$(`#${id}`);if(!field.validity.valid){dishWizardError('Bitte gib einen gültigen Nährwert ab 0 ein.',field);return false}}}
  return true;
}
function closeDishEditor(){if(dishWizardActive&&(dishImport||sectionImportHasUnreviewed()||Object.values(sectionImportPanels).some(entry=>entry.ocr.hasDraft())||dishWizardSnapshot()!==dishWizardInitial)&&!confirm('Deine Eingaben gehen verloren. Rezept wirklich verwerfen?'))return;dishWizardDialog.close()}
dishWizardDialog.addEventListener('cancel',event=>{if(event.target!==dishWizardDialog)return;if(dishWizardActive){event.preventDefault();closeDishEditor()}});
dishWizardBack.addEventListener('click',()=>{dishWizardStep--;$('#dish-form-error').hidden=true;renderDishWizard({focus:true})});
dishWizardNext.addEventListener('click',()=>{if(!validateDishWizardStep(dishWizardSteps()[dishWizardStep].key))return;dishWizardStep++;renderDishWizard({focus:true})});
const dishImportSource=document.createElement('details');dishImportSource.className='recipe-import-source';dishImportSource.hidden=true;
dishImportSource.innerHTML='<summary>Quelltext ansehen</summary><pre id="dish-import-source-text" tabindex="0" role="region" aria-label="Quelltext des Rezepts"></pre><p class="recipe-import-unassigned" aria-live="polite"></p>';
$('#dish-form-error').after(dishImportSource);
const dishImportSourceText=dishImportSource.querySelector('pre'),dishImportUnassigned=dishImportSource.querySelector('.recipe-import-unassigned');
const dishImportDefaults=document.createElement('p');dishImportDefaults.className='recipe-import-defaults';dishImportDefaults.hidden=true;$('#dish-recipe-title').closest('label').before(dishImportDefaults);
function recipeImportMessage(result){return result.error||(result.errors||[]).join(' ')}
function applyRecipeImport(result,source){
  resetSectionImports();dishImport={result,source};dishImportSourceText.textContent=source;
  dishImportUnassigned.textContent=result.unassigned.length?`${result.unassigned.length} Textzeilen wurden nicht übernommen. Ergänze wichtige Angaben in den Rezeptfeldern.`:'';
  dishImportDefaults.setAttribute('role','status');dishImportDefaults.textContent=`Import abgeschlossen: ${result.ingredients.length} Zutaten und ${result.steps.length} Zubereitungsschritte erkannt. Bitte prüfen. Rezeptart: Voreinstellung. ${result.time?'Zeit aus dem Text übernommen.':'Zeit: Voreinstellung (30 Min.).'} ${result.name?'':'Bitte ergänze den Rezeptnamen.'}`;
  $('#dish-recipe-title').value=result.name;setRecipeTypeFilter($('#dish-type'),importDefaultType);updateDishTypeFields();$('#dish-ingredient').value='';dishIngredientDraft=[];$('#dish-ingredient-input').value='';renderDishIngredientChips();
  const minutes=result.time||30;$('#dish-time').value=String(timeBlocks.indexOf(minutes));$('#dish-time-output').textContent=`${minutes} Min.`;
  nutritionFields.forEach(({id})=>{$(`#${id}`).value=''});$('#recipe-servings').value=result.servings??'';
  recipeIngredientPage=0;recipeStepPage=0;renderRecipeIngredientRows(result.ingredients);renderRecipeStepRows(result.steps);
}
const recipeImportDialog=$('#recipe-import-dialog'),recipeImportInput=$('#recipe-import-input'),recipeImportText=$('#recipe-import-text'),recipeImportError=$('#recipe-import-error');let creationDefaultType='meal';
const fullRecipeOCR=window.WochentischOCRUI.attach({before:recipeImportInput.querySelector('label'),text:recipeImportText,parseButton:$('#recipe-import-analyze')});
function updateRecipeImportAction(){ $('#recipe-import-analyze').disabled=fullRecipeOCR.isBusy()||!recipeImportText.value.trim()||(recipeImportInput.classList.contains('screenshot-mode')&&!fullRecipeOCR.hasRecognized()) }
recipeImportText.addEventListener('input',updateRecipeImportAction);
fullRecipeOCR.panel.addEventListener('ocr-state-change',updateRecipeImportAction);
function openRecipeCreation(defaultType='meal'){
  fullRecipeOCR.reset();recipeImportInput.classList.remove('screenshot-mode');
  creationDefaultType=defaultType;recipeImportText.value='';recipeImportError.hidden=true;recipeImportInput.hidden=true;$('#recipe-import-choice').hidden=false;updateRecipeImportAction();recipeImportDialog.showModal();
}
function closeRecipeImport(){if((recipeImportText.value.trim()||fullRecipeOCR.hasDraft())&&!confirm('Ausgewählte Bilder und eingefügter Text gehen verloren. Wirklich abbrechen?'))return;recipeImportDialog.close()}
$('#recipe-import-close').addEventListener('click',closeRecipeImport);
recipeImportDialog.addEventListener('cancel',event=>{if(event.target!==recipeImportDialog)return;event.preventDefault();closeRecipeImport()});
$('#recipe-import-manual').addEventListener('click',()=>{if((recipeImportText.value.trim()||fullRecipeOCR.hasDraft())&&!confirm('Ausgewählte Bilder und eingefügter Text gehen verloren. Selbst eingeben?'))return;recipeImportDialog.close();openDish('',{defaultType:creationDefaultType})});
$('#recipe-import-text-choice').addEventListener('click',()=>{recipeImportInput.classList.remove('screenshot-mode');$('#recipe-import-choice').hidden=true;recipeImportInput.hidden=false;updateRecipeImportAction();recipeImportText.focus()});
$('#recipe-import-screenshot-choice').addEventListener('click',()=>{recipeImportInput.classList.add('screenshot-mode');$('#recipe-import-choice').hidden=true;recipeImportInput.hidden=false;fullRecipeOCR.panel.open=true;updateRecipeImportAction();fullRecipeOCR.panel.querySelector('input').focus()});
$('#recipe-import-back').addEventListener('click',()=>{recipeImportInput.hidden=true;$('#recipe-import-choice').hidden=false;recipeImportError.hidden=true;$('#recipe-import-text-choice').focus()});
$('#recipe-import-analyze').addEventListener('click',()=>{
  if(fullRecipeOCR.hasPending()&&!confirm('Noch nicht erkannte Screenshots werden nicht übernommen. Mit dem vorhandenen Text fortfahren?'))return;
  const source=recipeImportText.value,result=window.WochentischRecipeImport.parse(source),message=recipeImportMessage(result);
  if(message){recipeImportError.textContent=message;recipeImportError.hidden=false;if(recipeImportInput.classList.contains('screenshot-mode')){recipeImportError.tabIndex=-1;recipeImportError.focus()}else recipeImportText.focus();return}
  recipeImportDialog.close();openDish('',{defaultType:creationDefaultType,importData:{source,result}});
});
dishWizardDialog.addEventListener('close',()=>{resetSectionImports();dishImport=null;dishImportSourceStep='';dishImportSourceText.textContent='';dishImportUnassigned.textContent='';dishImportSource.open=false});
recipeImportDialog.addEventListener('close',()=>{fullRecipeOCR.reset();recipeImportText.value=''});
function catalogDishForEditor(dish){return{...dish,time:Number(dish.cooking_time_minutes)||30,ingredients:cleanIngredients(dish.ingredients),recipe:window.WochentischRecipes.normalizeRecipe(dish.recipe),nutrition:cleanNutrition(dish.nutrition)}}
function openDish(id='',{catalogDish=null,catalogCreate=false,defaultType='meal',importData=null}={}){
  resetSectionImports();dishImport=importData;importDefaultType=defaultType;
  const catalogMode=Boolean(catalogDish)||catalogCreate,blankCatalogDish={name:'',ingredient:'',time:30,ingredients:[],nutrition:null,recipe:{servings:2,ingredients:[],steps:[]},version:1},d=catalogMode?catalogDishForEditor(catalogDish||blankCatalogDish):state.dishes.find(x=>x.id===id),minutes=Number(d?.time)||30;let timeIndex=0;
  dishWizardMobile=window.matchMedia('(max-width: 600px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches;dishWizardEditing=!catalogMode&&Boolean(d)&&dishWizardMobile;dishWizardActive=!catalogMode&&(!d||dishWizardEditing);dishWizardStep=0;recipeIngredientPage=0;recipeStepPage=0;
  recipeEditorMode=catalogMode?'catalog':'dish';catalogEditDraft=catalogMode?{id:catalogCreate?'':d.id,version:Number(d.version)||1,original:structuredClone(d),creating:catalogCreate}:null;
  $('#dish-editor-mode').value=recipeEditorMode;$('#dish-dialog-context').textContent=catalogMode?'STANDARDKATALOG FÜR ALLE':'DEINE REZEPTSAMMLUNG';
  $('#dish-id').value=catalogMode?(catalogCreate?'':d.id):id;$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-recipe-title').value=d?.name||'';setRecipeTypeFilter($('#dish-type'),(d?.type||d?.recipe_type||defaultType)==='baking'?'baking':'meal');updateDishTypeFields();$('#dish-ingredient').value=d?.ingredient||'';$('#dish-main-ingredient-suggestions').hidden=true;
  dishIngredientDraft=(d?.ingredients||[]).slice();$('#dish-ingredient-input').value='';renderDishIngredientChips();renderDishIngredientSuggestions();$('#dish-time').value=timeIndex;for(let i=1;i<timeBlocks.length;i++)if(Math.abs(timeBlocks[i]-minutes)<Math.abs(timeBlocks[Number($('#dish-time').value)]-minutes))$('#dish-time').value=i;$('#dish-time-output').textContent=`${timeBlocks[Number($('#dish-time').value)]} Min.`;
  const nutrition=cleanNutrition(d?.nutrition)||{};nutritionFields.forEach(({key,id:fieldId})=>{$(`#${fieldId}`).value=nutrition[key]===undefined?'':String(nutrition[key])});
  const recipe=window.WochentischRecipes.normalizeRecipe(d?.recipe);$('#recipe-servings').value=recipe?.servings??(dishWizardActive&&!dishWizardEditing?'1':(d?'':'2'));renderRecipeIngredientRows(window.WochentischRecipes.editableIngredients(recipe,d?.ingredients));renderRecipeStepRows(recipe?.steps||[]);
  if(dishImport)applyRecipeImport(dishImport.result,dishImport.source);
  $('#dialog-title').textContent=catalogCreate?'Standardgericht hinzufügen':catalogMode?`${d.name} bearbeiten`:d?'Rezept bearbeiten':'Rezept hinzufügen';$('#delete-dish').hidden=!d||catalogMode;$('#dish-form [type="submit"]').textContent=catalogCreate?'Standardgericht hinzufügen':catalogMode?'Änderungen speichern':'Speichern';hideCatalogVersionConflict();renderDishWizard();dishWizardInitial=dishWizardSnapshot();$('#dish-dialog').showModal();setTimeout(()=>{if(dishWizardEditing)dishWizardDialog.focus({preventScroll:true});else $('#dish-recipe-title').focus()},30);
}
function normalizeIngredient(value){return window.WochentischIngredients.normalize(value)}
function normalizeManualItem(value){return window.WochentischIngredients.manualName(value)}
function dishFingerprint(name,ingredient,ingredients){const normalizedName=name.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');const normalizedIngredients=[...new Set((ingredients||[]).map(normalizeIngredient).filter(Boolean).map(value=>value.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'')).filter(Boolean))].sort();return `${normalizedName}|${String(ingredient||'').toLocaleLowerCase('de-DE').trim()}|${normalizedIngredients.join(',')}`}
function ingredientIcon(name){
  const value=String(name||'').toLocaleLowerCase('de-DE');
  // Specific products come before broad ingredients contained in their names.
  const icons=[
    [/hundefutter|katzenfutter|tierfutter|katzenstreu/,'🐾'],[/toilettenpapier|küchenrolle|taschentuch/,'🧻'],[/müllbeutel|müllsack/,'🗑️'],[/zahnbürste|zahnpasta/,'🪥'],[/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel/,'🧴'],
    [/orangensaft|apfelsaft|saft|limonade|getränk|(?:^|[^a-z])cola(?:$|[^a-z])/,'🥤'],[/wassermelone/,'🍉'],[/wasser|sprudel/,'💧'],[/(?:^|[^a-z])bier(?:$|[^a-z])|(?:weiß|weiss|dunkel|malz|weizen)bier\b/,'🍺'],[/(?:^|[^a-z])wein(?:$|[^a-z])|(?:rot|weiß|weiss|rosé|rose|glüh|schaum)wein\b/,'🍷'],[/kaffee/,'☕'],[/tee/,'🫖'],
    [/tomatenmark|tomatensoße|tomatensauce|passierte tomaten|gehackte tomaten|tomaten aus der dose|ketchup/,'🥫'],[/brühe|fond|sauce|soße/,'🥣'],
    [/paprikapulver|curry|kurkuma|kreuzkümmel|kümmel|zimt|gewürz|salz|pfeffer|muskat|chiliflocken|chilipulver/,'🧂'],[/honig/,'🍯'],[/marmelade/,'🍓'],[/schokolade|kakao/,'🍫'],[/zucker|bonbon/,'🍬'],
    [/suppenhuhn|huhn|hühn|hähnchen|chicken|pute|entenbrust|entenschenkel/,'🍗'],[/garnel|shrimp/,'🦐'],[/fisch|lachs|forelle|thunfisch|kabeljau|seelachs|sardell/,'🐟'],[/wurst|würstchen|salami/,'🌭'],[/prosciutto|speck|bacon|schinken/,'🥓'],[/hackfleisch|fleisch|rind|schwein|lamm/,'🥩'],
    [/frischkäse|käse|mozzarella|feta|parmesan|gouda|cheddar|ricotta|mascarpone|halloumi/,'🧀'],[/milch/,'🥛'],[/joghurt|schmand|quark|sauerrahm|sahne|crème|creme/,'🥣'],[/(^|[\s-])ei(?:er)?($|[\s-])|freilandei|bioei/,'🥚'],[/butter/,'🧈'],
    [/erdbeer/,'🍓'],[/himbeer|blaubeer|brombeer|heidelbeer|beere/,'🫐'],[/apfel|äpfel/,'🍎'],[/birne/,'🍐'],[/banane/,'🍌'],[/orange|mandarine/,'🍊'],[/zitrone|limette/,'🍋'],[/traube/,'🍇'],[/mango/,'🥭'],[/melone/,'🍈'],[/pfirsich|aprikose/,'🍑'],[/kirsche/,'🍒'],[/kiwi/,'🥝'],[/ananas/,'🍍'],
    [/paprika/,'🫑'],[/karotte|möhre/,'🥕'],[/brokkoli/,'🥦'],[/tomat/,'🍅'],[/gurke|zucchini/,'🥒'],[/zwiebel|lauch|schalotte/,'🧅'],[/knoblauch/,'🧄'],[/avocado/,'🥑'],[/kartoffel|pommes/,'🥔'],[/aubergine/,'🍆'],[/mais/,'🌽'],[/pilz|champignon|shiitake/,'🍄'],[/salat|sellerie|spinat|kohl|rucola|mangold/,'🥬'],[/mungobohnensprossen|sojasprossen/,'🌱'],[/bohnenkraut/,'🌿'],[/tofu|erbsen|bohnen|linsen|kichererbsen/,'🫘'],[/ingwer/,'🫚'],[/chili/,'🌶️'],
    [/pelmeni|knödel|dumpling/,'🥟'],[/reisnudel|nudel|ramen/,'🍜'],[/spaghetti|pasta|penne|fusilli|makkaroni/,'🍝'],[/reis/,'🍚'],[/brot|brötchen|baguette|toast|wrap|teig/,'🥖'],[/mehl|getreide|hafer|couscous|bulgur|buchweizen/,'🌾'],[/sonnenblumenöl/,'🌻'],[/olivenöl/,'🫗'],[/oliven/,'🫒'],[/sesamöl/,'🥜'],[/rapsöl/,'🌼'],[/öl|essig/,'🫗'],[/nuss|nüsse|mandel|cashew|kerne|samen|sesam/,'🥜'],[/petersilie|basilikum|thymian|rosmarin|kräuter|schnittlauch|koriander|dill|oregano|majoran|lorbeer/,'🌿'],[/dose|konserve/,'🥫']
  ];
  return icons.find(([pattern])=>pattern.test(value))?.[1]||'🛒';
}
function ingredientCategory(name){const value=name.toLocaleLowerCase('de-DE');if(/orangensaft|apfelsaft|saft|limonade|cola|wasser|sprudel|bier|wein|getränk/.test(value))return 'Getränke';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|toilettenpapier|küchenrolle|taschentuch|müllbeutel|müllsack|schwamm|zahnpasta|windel/.test(value))return 'Drogerie & Haushalt';if(/hundefutter|katzenfutter|tierfutter|katzenstreu/.test(value))return 'Tierbedarf';if(/tomatensoße|tomatensauce|passierte tomaten/.test(value))return 'Vorrat';if(/apfel|birne|banane|orange|zitrone|limette|beere|erdbeer|himbeer|blaubeer|traube|mango|obst/.test(value))return 'Obst';if(/tomat|paprika|karotte|möhre|brokkoli|zucchini|gurke|salat|gemüse|zwiebel|sellerie|lauch|kohl|spinat|pilz|champignon|kartoffel|knoblauch|avocado/.test(value))return 'Gemüse';if(/brot|brötchen|baguette|toast|wrap|pizzateig|teig/.test(value))return 'Brot & Backwaren';if(/hühnchen|hähnchen|chicken|fleisch|hackfleisch|rind|schwein|würstchen|wurst|prosciutto|speck|fisch|lachs|filet/.test(value))return 'Fleisch & Fisch';if(/milch|käse|mozzarella|joghurt|schmand|quark|sahne|butter|ei$|eier/.test(value))return 'Kühlregal';if(/pommes|tiefkühl|tk-|gefroren/.test(value))return 'Tiefkühl';if(/wasser|sprudel|saft|limonade|cola|getränk|bier|wein/.test(value))return 'Getränke';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|toilettenpapier|küchenrolle|taschentuch|müllbeutel|müllsack|schwamm|zahnpasta/.test(value))return 'Drogerie & Haushalt';if(/reis|nudel|spaghetti|pasta|mehl|öl|essig|dose|konserve|passierte tomaten|tomatensoße|tomatensauce|gewürz|salz|zucker|brühe|kaffee|tee|müsli|haferflocken|honig|schokolade/.test(value))return 'Vorrat';return 'Sonstiges'}
function updateShoppingNavCount(){
  const days=planDaysInRange(),weekKeys=[...new Set(days.map(item=>item.weekKey))],selected=days.flatMap(({weekKey,day})=>day.map(id=>({dish:state.dishes.find(d=>d.id===id),weekKey})).filter(item=>item.dish)),items=new Map();
  state.shoppingChecks??={};state.hiddenShoppingItems??={};state.manualShoppingItems??={};
  selected.forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(!name)return;const key=manualItemKey(name);if(!items.has(key))items.set(key,{name,dishes:new Set(),weekKeys:new Set()});const item=items.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey)}));
  [...new Set(weekKeys.flatMap(weekKey=>state.manualShoppingItems[weekKey]||[]))].forEach(rawName=>{const name=normalizeManualItem(rawName),key=manualItemKey(name);if(!items.has(key))items.set(key,{name,dishes:new Set(),weekKeys:new Set()});const item=items.get(key);selected.filter(({dish})=>(dish.ingredients||[]).some(raw=>manualItemKey(raw)===key)).forEach(({dish})=>item.dishes.add(dish.name));weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>manualItemKey(itemName)===key)).forEach(weekKey=>item.weekKeys.add(weekKey))});
  for(const [key,item] of items){const relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;if(relevantWeeks.every(weekKey=>state.hiddenShoppingItems[weekKey]?.includes(key)))items.delete(key)}
  const openCount=[...items.values()].filter(item=>{const key=manualItemKey(item.name),relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;return !relevantWeeks.every(weekKey=>shoppingItemChecked(weekKey,key))}).length;
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
function openShoppingIngredientCountForDish(dishName,selected,weekKeys){
  const ingredients=new Map();
  selected.filter(({dish})=>dish.name===dishName).forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{
    const name=normalizeIngredient(raw);if(!name)return;
    const key=manualItemKey(name);if(!ingredients.has(key))ingredients.set(key,new Set());ingredients.get(key).add(weekKey);
  }));
  let openCount=0;
  for(const [key,itemWeekKeys] of ingredients){
    const relevantWeeks=itemWeekKeys.size?[...itemWeekKeys]:weekKeys;
    if(relevantWeeks.every(weekKey=>state.hiddenShoppingItems[weekKey]?.includes(key)))continue;
    if(!relevantWeeks.every(weekKey=>shoppingItemChecked(weekKey,key)))openCount++;
  }
  return openCount;
}
function openManualShoppingItemCount(manualItems,weekKeys){
  const items=new Map();
  manualItems.forEach(rawName=>{
    const name=normalizeIngredient(rawName);if(!name)return;
    const key=manualItemKey(name);if(!items.has(key))items.set(key,new Set());
    weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>manualItemKey(itemName)===key)).forEach(weekKey=>items.get(key).add(weekKey));
  });
  let openCount=0;
  for(const [key,itemWeekKeys] of items){
    const relevantWeeks=itemWeekKeys.size?[...itemWeekKeys]:weekKeys;
    if(relevantWeeks.every(weekKey=>state.hiddenShoppingItems[weekKey]?.includes(key)))continue;
    if(!relevantWeeks.every(weekKey=>shoppingItemChecked(weekKey,key)))openCount++;
  }
  return openCount;
}
function renderShoppingListContent(){
  const start=rangeStart(),days=planDaysInRange(),weekKeys=[...new Set(days.map(item=>item.weekKey))],selected=days.flatMap(({weekKey,day})=>day.map(id=>({dish:state.dishes.find(d=>d.id===id),weekKey})).filter(item=>item.dish));
  state.shoppingChecks??={};state.hiddenShoppingItems??={};state.manualShoppingItems??={};
  const filterSelect=$('#shopping-meal-filter'),previousFilter=filterSelect.value,mealNames=[...new Set(selected.map(item=>item.dish.name))].sort((a,b)=>a.localeCompare(b,'de')),manualItems=[...new Set(weekKeys.flatMap(weekKey=>state.manualShoppingItems[weekKey]||[]))];
  $('#shopping-period').textContent=formatRange(start);filterSelect.replaceChildren(new Option('Alle Mahlzeiten',''));
  if(mealNames.length){const dishesGroup=document.createElement('optgroup');dishesGroup.label='Gerichte';mealNames.forEach(name=>{const dish=selected.find(item=>item.dish.name===name)?.dish,icon=dish?.emoji||emojiMap[dish?.ingredient]||'🍽️',openCount=openShoppingIngredientCountForDish(name,selected,weekKeys);dishesGroup.append(new Option(`${icon} ${name} (${openCount})`,name))});filterSelect.append(dishesGroup)}
  if(manualItems.length){const manualGroup=document.createElement('optgroup');manualGroup.label='Manuelle Eingaben';manualGroup.append(new Option(`Keinem Gericht zugeordnet (${openManualShoppingItemCount(manualItems,weekKeys)})`,'__manual__'));filterSelect.append(manualGroup)}
  filterSelect.value=mealNames.includes(previousFilter)||previousFilter==='__manual__'&&manualItems.length?previousFilter:'';
  const activeFilter=filterSelect.value,visible=activeFilter==='__manual__'?[]:activeFilter?selected.filter(({dish})=>dish.name===activeFilter):selected,counts=new Map();
  $('#shopping-overview').classList.toggle('hidden',!activeFilter);
  visible.forEach(({dish,weekKey})=>(dish.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(name){const key=manualItemKey(name);if(!counts.has(key))counts.set(key,{name,dishes:new Set(),manual:false,weekKeys:new Set()});const item=counts.get(key);item.dishes.add(dish.name);item.weekKeys.add(weekKey)}}));
  if(!activeFilter||activeFilter==='__manual__')manualItems.forEach(rawName=>{const name=normalizeManualItem(rawName),key=manualItemKey(name),relatedDishes=new Set(selected.filter(({dish})=>(dish.ingredients||[]).some(raw=>manualItemKey(raw)===key)).map(({dish})=>dish.name));if(!counts.has(key))counts.set(key,{name,dishes:relatedDishes,manual:true,weekKeys:new Set()});const item=counts.get(key);item.manual=true;weekKeys.filter(weekKey=>(state.manualShoppingItems[weekKey]||[]).some(itemName=>manualItemKey(itemName)===key)).forEach(weekKey=>item.weekKeys.add(weekKey))});
  for(const [key,item] of counts){const relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;if(relevantWeeks.every(weekKey=>state.hiddenShoppingItems[weekKey]?.includes(key)))counts.delete(key)}
  const hasHiddenShoppingItems=selected.some(({dish,weekKey})=>(dish.ingredients||[]).some(name=>state.hiddenShoppingItems[weekKey]?.includes(manualItemKey(name))))||weekKeys.some(weekKey=>cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).length>0);
  const open=$('#shopping-open'),done=$('#shopping-done'),empty=$('#shopping-empty');open.replaceChildren();done.replaceChildren();empty.classList.toggle('hidden',counts.size>0);empty.textContent=activeFilter==='__manual__'?'Noch keine manuellen Artikel hinzugefügt.':activeFilter?'Für dieses Gericht sind keine Zutaten eingetragen.':hasHiddenShoppingItems?'Die Einkaufsliste ist leer. Du kannst unten neue Artikel hinzufügen.':selected.length?'Für die geplanten Gerichte sind keine Zutaten eingetragen.':'Für diese 7 Tage sind keine Gerichte geplant. Du kannst unten eigene Artikel hinzufügen.';
  const categoryOrder=['Gemüse','Obst','Brot & Backwaren','Fleisch & Fisch','Kühlregal','Tiefkühl','Getränke','Vorrat','Drogerie & Haushalt','Tierbedarf','Sonstiges'],grouped=new Map();
  for(const item of counts.values()){const category=ingredientCategory(item.name);if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(item)}
  for(const category of categoryOrder){const items=grouped.get(category);if(!items?.length)continue;for(const container of [open,done]){const categoryItems=items.filter(item=>{const key=manualItemKey(item.name),relevantWeeks=item.weekKeys.size?[...item.weekKeys]:weekKeys;return relevantWeeks.every(weekKey=>shoppingItemChecked(weekKey,key))===(container===done)});if(!categoryItems.length)continue;const heading=document.createElement('h3');heading.className='shopping-category-title';heading.textContent=category;container.append(heading);
    for(const item of categoryItems.sort((a,b)=>a.name.localeCompare(b.name,'de'))){const {name,dishes,manual,weekKeys:itemWeekKeys}=item,key=manualItemKey(name),checkKey=key,checked=container===done,relevantWeeks=itemWeekKeys.size?[...itemWeekKeys]:weekKeys,shell=document.createElement('div'),tile=document.createElement('button');shell.className='shopping-tile-shell';tile.type='button';tile.className=`shopping-tile${checked?' is-checked':''}`;tile.setAttribute('aria-pressed',String(checked));tile.dataset.ingredient=key;tile.innerHTML=`<span class="shopping-tile-icon" aria-hidden="true">${ingredientIcon(name)}</span><span class="shopping-tile-copy"><strong></strong><small></small></span>${checked?'<span class="shopping-tile-status" aria-label="Eingekauft">✓</span>':''}`;tile.querySelector('strong').textContent=name;tile.querySelector('small').textContent=dishes.size?[...dishes].join(', ')+(manual?' · Manuelle Eingabe':''):'Keinem Gericht zugeordnet';
      const mealHint=document.createElement('div');mealHint.className='shopping-tile-meal-hint';mealHint.setAttribute('role','status');const mealLabels=[...dishes].map(dishName=>{const meal=selected.find(({dish})=>dish.name===dishName)?.dish;return `${meal?.emoji||emojiMap[meal?.ingredient]||'🍽️'} ${dishName}`});const hintLabels=mealLabels.length?mealLabels:manual?['Keinem Gericht zugeordnet']:[];mealHint.textContent=hintLabels.join(', ');shell.append(tile,mealHint);
      let pointerStart=null,wasScroll=false,touchStart=null,touchScrolled=false,longPressTimer=0,longPressResetTimer=0,hintTimer=0,longPressTriggered=false;tile.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY};wasScroll=false});tile.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8)wasScroll=true});tile.addEventListener('pointercancel',()=>{pointerStart=null;wasScroll=true});tile.addEventListener('touchstart',event=>{if(event.touches.length!==1)return;clearTimeout(longPressTimer);clearTimeout(longPressResetTimer);clearTimeout(hintTimer);shell.classList.remove('is-showing-meal-hint');const touch=event.changedTouches[0];touchStart={x:touch.clientX,y:touch.clientY};touchScrolled=false;longPressTriggered=false;longPressTimer=setTimeout(()=>{if(!touchStart||touchScrolled||!hintLabels.length)return;longPressTriggered=true;shell.classList.add('is-showing-meal-hint');const tileRect=tile.getBoundingClientRect(),hintRect=mealHint.getBoundingClientRect(),edge=12,viewportWidth=document.documentElement.clientWidth;mealHint.style.left=`${Math.max(edge,Math.min(tileRect.left+(tileRect.width-hintRect.width)/2,viewportWidth-edge-hintRect.width))}px`;mealHint.style.top=`${Math.max(edge,tileRect.top-hintRect.height-8)}px`},500)},{passive:true});tile.addEventListener('touchmove',event=>{if(!touchStart)return;const touch=event.changedTouches[0];if(Math.hypot(touch.clientX-touchStart.x,touch.clientY-touchStart.y)>8){touchScrolled=true;clearTimeout(longPressTimer);shell.classList.remove('is-showing-meal-hint')}},{passive:true});tile.addEventListener('touchend',()=>{clearTimeout(longPressTimer);touchStart=null;if(longPressTriggered){hintTimer=setTimeout(()=>shell.classList.remove('is-showing-meal-hint'),1800);longPressResetTimer=setTimeout(()=>{longPressTriggered=false},900)}if(touchScrolled)setTimeout(()=>{touchScrolled=false},600)},{passive:true});tile.addEventListener('touchcancel',()=>{clearTimeout(longPressTimer);touchStart=null;touchScrolled=true;shell.classList.remove('is-showing-meal-hint');longPressResetTimer=setTimeout(()=>{longPressTriggered=false},900);setTimeout(()=>{touchScrolled=false},600)},{passive:true});if(window.matchMedia('(pointer: coarse)').matches)shell.addEventListener('contextmenu',event=>event.preventDefault());
      tile.addEventListener('click',event=>{if(longPressTriggered){event.preventDefault();event.stopPropagation();longPressTriggered=false;clearTimeout(longPressResetTimer);pointerStart=null;return}if(wasScroll||touchScrolled){event.preventDefault();event.stopPropagation();wasScroll=false;pointerStart=null;setTimeout(()=>{touchScrolled=false},600);return}pointerStart=null;const checking=!checked,scope=authScope,householdId=currentHouseholdId;tile.classList.add(checking?'is-completing':'is-unchecking');setTimeout(()=>{if(scope!==authScope||householdId!==currentHouseholdId)return;relevantWeeks.forEach(weekKey=>{state.shoppingChecks[weekKey]??=Object.create(null);if(checking)state.shoppingChecks[weekKey][checkKey]=true;else delete state.shoppingChecks[weekKey][checkKey];if(!Object.keys(state.shoppingChecks[weekKey]).length)delete state.shoppingChecks[weekKey]});if(checking&&state.shoppingQuantities)delete state.shoppingQuantities[checkKey];save();renderShoppingList();const target=[...document.querySelectorAll(`#shopping-${checking?'done':'open'} .shopping-tile`)].find(candidate=>candidate.dataset.ingredient===key);target?.classList.add(checking?'just-checked':'just-unchecked')},180)});
      const quantity=document.createElement('div');quantity.className='shopping-quantity';quantity.setAttribute('aria-label',`Menge für ${name}`);const currentQuantity=Math.max(1,Number(state.shoppingQuantities?.[key])||1);const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label',`${name}: Menge verringern`);minus.disabled=currentQuantity<=1;const amount=document.createElement('output');amount.textContent=currentQuantity;amount.setAttribute('aria-live','polite');const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label',`${name}: Menge erhöhen`);[minus,plus].forEach(button=>button.addEventListener('click',()=>{const next=Math.max(1,currentQuantity+(button===plus?1:-1));state.shoppingQuantities??=Object.create(null);state.shoppingQuantities[key]=next;save();renderShoppingList()}));quantity.append(minus,amount,plus);shell.append(quantity);container.append(shell)
    }
  }}
  $('#shopping-open-count').textContent=`(${open.querySelectorAll('.shopping-tile').length})`;$('#shopping-done-count').textContent=`(${done.querySelectorAll('.shopping-tile').length})`;syncShoppingDoneDisclosure();updateShoppingNavCount();save({sync:false})
}
function renderShoppingList(){renderShoppingListContent();renderedShoppingSnapshot=shoppingStateForView(state)}
function openShoppingList(){$('#shopping-add-status').hidden=true;setView('shopping');renderShoppingList()}
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
function selectedRecipeType(group){return group.querySelector('[aria-pressed="true"]')?.dataset.type||'meal'}
function setRecipeTypeFilter(group,type){group.querySelectorAll('button[data-type]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.type===type)))}
let chooseDishDay=null,chooseDishDateKey=null,chooseDishOpener=null,restPreviewSnapshot=null;
function formatChooserDate(date){return date.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}
function renderRestConfirmation({forceConfirm=false}={}){
  const dates=rangeDates(),index=dates.findIndex(date=>keyFor(date)===chooseDishDateKey);if(index<0){$('#choose-dialog').close();showToast('Der ausgewählte Tag ist nicht mehr im sichtbaren Zeitraum. Bitte erneut auswählen.');return}chooseDishDay=index;
  const before=snapshotPlanDays(dates),selected=before.days[index],preview=$('#choose-rest-preview'),confirm=$('#choose-rest-confirm');
  restPreviewSnapshot=before;
  if(!selected.meals.length&&!forceConfirm){setRestDay(selected.date,true);save();const after=capturePlanDays(dates);$('#choose-dialog').close();renderCalendar();showToast('Als Resteabend markiert.',{actionLabel:'Rückgängig',duration:6500,onAction:()=>undoRestInsertion(before,after,index,index)});return}
  preview.textContent=selected.meals.length?(index===dates.length-1?'Der Resteabend ersetzt die geplanten Gerichte an diesem Tag.':'Die folgenden Tage rücken einen Tag weiter. Was am letzten Tag geplant war, entfällt.'):'Der Tag ist inzwischen frei. Nur der Resteabend wird eingetragen.';
  $('#choose-rest-commit').textContent=selected.meals.length?(index===dates.length-1?'Reste eintragen und Gerichte entfernen':'Reste eintragen und Plan verschieben'):'Resteabend eintragen';
  $('#choose-rest-action').hidden=true;$('#choose-rest-confirm').hidden=false;$('#choose-dish-type').hidden=true;$('#choose-dish-search').parentElement.hidden=true;$('#choose-dish-list').hidden=true;
  $('#choose-rest-commit').focus({preventScroll:true});
}
function chooseDish(day){
  chooseDishDay=Number(day);chooseDishDateKey=keyFor(rangeDates()[day]);chooseDishOpener=document.activeElement;restPreviewSnapshot=null;
  const targetDate=rangeDates()[day],list=$('#choose-dish-list'),search=$('#choose-dish-search'),filterType=$('#choose-dish-type');setRecipeTypeFilter(filterType,'meal');
  $('#choose-dialog-title').textContent=`Für ${formatChooserDate(targetDate)} eintragen`;
  $('#choose-rest-action').hidden=isRestDay(targetDate);$('#choose-rest-confirm').hidden=true;filterType.hidden=false;search.parentElement.hidden=false;list.hidden=false;
  $('#choose-rest-action').onclick=renderRestConfirmation;
  $('#choose-rest-cancel').onclick=()=>{restPreviewSnapshot=null;$('#choose-rest-confirm').hidden=true;filterType.hidden=false;search.parentElement.hidden=false;list.hidden=false;$('#choose-rest-action').hidden=isRestDay(rangeDates()[chooseDishDay]);$('#choose-rest-action').focus()};
  $('#choose-rest-commit').onclick=()=>{
    const current=snapshotPlanDays(rangeDates());
    if(!restPreviewSnapshot||!sameValue(restPreviewSnapshot.days.map(day=>({date:keyFor(day.date),meals:day.meals,pins:day.pins,isRest:day.isRest})),current.days.map(day=>({date:keyFor(day.date),meals:day.meals,pins:day.pins,isRest:day.isRest})))){renderRestConfirmation({forceConfirm:true});return}
    $('#choose-dialog').close();markRestDay(chooseDishDay);
  };
  list.replaceChildren();search.value='';
  if(!state.dishes.length){
    const message=document.createElement('p');message.className='empty-state';message.textContent='Noch keine Gerichte vorhanden.';
    const add=document.createElement('button');add.type='button';add.className='primary-button';add.textContent='Gericht hinzufügen';
    add.addEventListener('click',()=>{$('#choose-dialog').close();openRecipeCreation()});list.append(message,add);search.hidden=true;
  }else{
    search.hidden=false;
    const dishes=[...state.dishes].sort((a,b)=>a.name.localeCompare(b.name,'de-DE',{sensitivity:'base'})),entries=[];
    dishes.forEach(d=>{
      const button=document.createElement('button');button.type='button';button.className='choose-item';
      const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=d.emoji||emojiMap[d.ingredient]||'🍽️';
      const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=d.name;
      const details=document.createElement('small');details.textContent=`${d.time||25} Min. · ${d.type==='baking'?'Backen':(d.ingredient||'Gericht')}`;
      copy.append(name,details);button.append(icon,copy);
      button.addEventListener('click',()=>{reopenShoppingIngredients(targetDate,d);const pins=ensurePinnedMealsForDate(targetDate);ensurePlanForDate(targetDate).push(d.id);pins.push(false);setRestDay(targetDate,false);save();$('#choose-dialog').close();renderCalendar()});
      entries.push({dish:d,button});
    });
    const empty=document.createElement('p');empty.className='empty-state choose-no-results';empty.hidden=true;empty.textContent='Keine passenden Gerichte gefunden.';
    list.append(...entries.map(entry=>entry.button),empty);
    const filter=()=>{const query=search.value.trim().toLocaleLowerCase('de-DE');let visible=0;for(const {dish,button} of entries){const haystack=[dish.name,dish.ingredient,...(dish.ingredients||[])].join(' ').toLocaleLowerCase('de-DE'),match=(dish.type==='baking'?'baking':'meal')===selectedRecipeType(filterType)&&haystack.includes(query);button.hidden=!match;if(match)visible++}empty.hidden=visible>0};
    search.oninput=filter;filterType.onclick=event=>{const button=event.target.closest('button[data-type]');if(button){setRecipeTypeFilter(filterType,button.dataset.type);filter()}};filter();
  }
  const dialog=$('#choose-dialog');if(!dialog.open)dialog.showModal();
}
$('#choose-dialog').addEventListener('close',()=>{
  if(!Number.isInteger(chooseDishDay))return;
  const index=rangeDates().findIndex(date=>keyFor(date)===chooseDishDateKey);
  requestAnimationFrame(()=>{const button=$(`#calendar .day-content[data-day="${index}"] .add-meal`);(button||chooseDishOpener)?.focus?.({preventScroll:true})});
  chooseDishDay=null;chooseDishDateKey=null;chooseDishOpener=null;restPreviewSnapshot=null;
});
function showCatalogFeedback(text){const feedback=$('#catalog-feedback');feedback.textContent=text;feedback.hidden=!text}
function catalogDishToLocalDish(dish){const recipe=window.WochentischRecipes.normalizeRecipe(dish.recipe);return{id:newId(),name:dish.name,type:dish.recipe_type==='baking'?'baking':'meal',ingredient:dish.ingredient||'',time:Number(dish.cooking_time_minutes)||30,emoji:dish.emoji||emojiMap[dish.ingredient]||'🍽️',ingredients:cleanIngredients(window.WochentischRecipes.shoppingIngredients(recipe,dish.ingredients)),nutrition:cleanNutrition(dish.nutrition),recipe,catalogSourceId:dish.id,catalogSourceVersion:Number.isInteger(dish.version)?dish.version:1}}
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
  const list=$('#catalog-list'),search=$('#catalog-search'),type=selectedRecipeType($('#catalog-dish-type')),query=search.value.trim().toLocaleLowerCase('de-DE');
  const filtered=(dishes||[]).filter(dish=>(dish.recipe_type==='baking'?'baking':'meal')===type&&dish.name.toLocaleLowerCase('de-DE').includes(query));
  list.replaceChildren();
  const ownNames=new Set(state.dishes.map(dish=>dish.name.toLocaleLowerCase('de-DE'))),queuedCatalogIds=new Set(pendingCatalogImports.map(item=>item.catalogId));
  const addAll=$('#catalog-add-all'),available=filtered.filter(dish=>!ownNames.has(dish.name.toLocaleLowerCase('de-DE'))).length;
  addAll.disabled=!available;addAll.textContent=available?'Angezeigte übernehmen':filtered.length?'Alles bereits übernommen':'Keine Rezepte ausgewählt';addAll.onclick=()=>{adoptCatalogDishes(filtered);renderCatalogDishes(dishes,{offline:!navigator.onLine})};
  const entries=[];
  (dishes||[]).forEach(dish=>{
    const alreadyAdded=ownNames.has(dish.name.toLocaleLowerCase('de-DE')),queued=queuedCatalogIds.has(dish.id);
    const button=document.createElement('button');button.type='button';button.className='choose-item';button.disabled=alreadyAdded;
    const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';
    const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=dish.name;
    const details=document.createElement('small');details.textContent=alreadyAdded?(queued?'Vorgemerkt · wird synchronisiert':'Bereits hinzugefügt'):`${dish.recipe_type==='baking'?'Backen':(dish.ingredient||'Gericht')} · ${dish.cooking_time_minutes||30} Min.`;
    copy.append(name,details);button.append(icon,copy);
    button.addEventListener('click',()=>{if(adoptCatalogDish(dish)){renderCatalogDishes(dishes,{offline:!navigator.onLine});showCatalogFeedback(`${dish.name} ist vorgemerkt und wird synchronisiert.`)}});
    button.hidden=!filtered.includes(dish);entries.push({dish,button});
  });
  const empty=document.createElement('p');empty.className='empty-state catalog-no-results';empty.hidden=true;empty.textContent='Keine passenden Gerichte gefunden.';
  list.append(...entries.map(entry=>entry.button),empty);
  empty.hidden=entries.some(entry=>!entry.button.hidden)||!entries.length;
  if(!entries.length){empty.textContent='Der Standardkatalog ist noch leer.';empty.hidden=false}
  search.oninput=()=>renderCatalogDishes(dishes,{offline:!navigator.onLine});
  $('#catalog-dish-type').onclick=event=>{const button=event.target.closest('button[data-type]');if(button){setRecipeTypeFilter($('#catalog-dish-type'),button.dataset.type);renderCatalogDishes(dishes,{offline:!navigator.onLine})}};
  if(offline)showCatalogFeedback('Offline: Es wird der zuletzt geladene Standardkatalog angezeigt.');
}
async function cacheCatalogDishes(dishes,cached){
  const previousById=new Map(cached.map(dish=>[dish.id,dish]));
  const writes=dishes.filter(dish=>!sameValue(dish,previousById.get(dish.id)))
    .map(dish=>({type:'put',store:'catalog',key:dish.id,value:dish}));
  try{await window.WochentischStore?.writeBatch(writes)}
  catch(error){console.warn('Standardkatalog konnte lokal nicht zwischengespeichert werden:',error)}
}
async function openCatalog(){
  const dialog=$('#catalog-dialog'),list=$('#catalog-list'),search=$('#catalog-search'),addAll=$('#catalog-add-all'),typeFilter=$('#catalog-dish-type');$('#catalog-feedback').hidden=true;search.value='';search.oninput=null;typeFilter.onclick=null;addAll.disabled=true;addAll.onclick=null;addAll.textContent='Katalog wird geladen …';setRecipeTypeFilter(typeFilter,'meal');list.innerHTML='<p class="empty-state">Standardkatalog wird geladen …</p>';if(!dialog.open)dialog.showModal();
  let cached=[];
  try{cached=(await window.WochentischStore?.getAll('catalog')||[]).map(record=>record.value).filter(Boolean).map(dish=>({...dish,ingredients:cleanIngredients(dish.ingredients)})).sort((a,b)=>(a.name||'').localeCompare(b.name||'','de-DE',{sensitivity:'base'}))}catch(error){console.warn('Lokaler Standardkatalog konnte nicht gelesen werden:',error)}
  if(cached.length)renderCatalogDishes(cached,{offline:!navigator.onLine});
  if(!navigator.onLine){if(!cached.length){list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Der Standardkatalog wird nach dem nächsten Onlinebesuch offline verfügbar sein.';list.append(message);$('#catalog-add-all').disabled=true}return}
  if(!authClient)await ensureAuthentication();
  if(!authClient){if(!cached.length){list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Der Katalog kann gerade nicht aktualisiert werden.';list.append(message)}return}
  try{
    const {data,error}=await authClient.from('catalog_dishes').select('*');if(error)throw error;
    const dishes=(data||[]).map(dish=>({...dish,ingredients:cleanIngredients(dish.ingredients)})).sort((a,b)=>(a.name||'').localeCompare(b.name||'','de-DE',{sensitivity:'base'}));
    if(!cached.length||!sameValue(cached,dishes))renderCatalogDishes(dishes);
    await cacheCatalogDishes(dishes,cached);
  }catch(error){
    console.warn('Online-Katalog konnte nicht geladen werden:',error);
    if(cached.length)showCatalogFeedback('Der letzte Katalogstand wird angezeigt. Aktualisieren ist gerade nicht möglich.');
    else{list.replaceChildren();const message=document.createElement('p');message.className='empty-state';message.textContent='Standardkatalog konnte gerade nicht geladen werden. Bitte später erneut versuchen.';list.append(message)}
  }
}
function cookingProgressKey(dishId){return`cook-progress:${currentUserId||'guest'}:${currentHouseholdId||cookingHouseholdScopeId||'local'}:${dishId}`}
async function loadCookingProgress(dishId){try{return await window.WochentischStore?.get('records',cookingProgressKey(dishId))||null}catch(error){console.warn('Kochfortschritt konnte nicht geladen werden:',error);return null}}
async function removeDishProgressForCurrentScope(dishId){try{await window.WochentischStore?.remove('records',cookingProgressKey(dishId))}catch(error){console.warn('Kochfortschritt des gelöschten Gerichts blieb lokal erhalten:',error)}}
async function removeOrphanedCookingProgress(){
  if(!currentUserId||!currentHouseholdId||!window.WochentischStore)return;
  try{
    const prefix=`cook-progress:${currentUserId}:${currentHouseholdId}:`,dishIds=new Set(state.dishes.map(dish=>dish.id));
    const keys=await window.WochentischStore.getKeys('records',prefix);
    const removals=keys.filter(key=>!dishIds.has(key.slice(prefix.length))).map(key=>({type:'remove',store:'records',key}));
    await window.WochentischStore.writeBatch(removals);
  }catch(error){console.warn('Verwaister Kochfortschritt konnte nicht entfernt werden:',error)}
}
async function saveCookingProgress(){
  const dish=state.dishes.find(item=>item.id===selectedRecipeDishId);
  if(!dish||!currentUserId||!window.WochentischStore||!['cook','done'].includes(cookingStage))return;
  const record={dishId:dish.id,step:cookingStage==='done'?(dish.recipe?.steps?.length||0):Math.max(0,cookingProgress?.step||0),servings:selectedCookServings,fingerprint:window.WochentischRecipes.fingerprint(dish),completed:cookingStage==='done',updatedAt:Date.now()};
  cookingProgress=record;try{await window.WochentischStore.put('records',cookingProgressKey(dish.id),record)}catch(error){console.warn('Kochfortschritt konnte nicht gespeichert werden:',error)}
}
async function invalidateRecipeProgress(dish){
  if(!dish||!currentUserId)return;
  const progress=await loadCookingProgress(dish.id);if(!progress)return;
  // The saved fingerprint intentionally stays unchanged. The next visit marks it stale and asks for a restart.
  if(progress.fingerprint!==window.WochentischRecipes.fingerprint(dish)&&selectedRecipeDishId===dish.id){cookingProgress={...progress,stale:true};if(savedView()==='cooking')renderCooking()}
}
function plannedDishIds(){const ids=[],seen=new Set();rangeDates().forEach(date=>planForDate(date).forEach(id=>{if(state.dishes.some(d=>d.id===id)&&!seen.has(id)){ids.push(id);seen.add(id)}}));return ids}
function recipeListCard(dish,{planned=false}={}){
  const button=document.createElement('button');button.type='button';button.className='recipe-list-card';
  const icon=document.createElement('span');icon.className='recipe-list-icon';icon.textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';
  const copy=document.createElement('span');copy.className='recipe-list-copy';const name=document.createElement('strong');name.textContent=dish.name;
  const detail=document.createElement('small');detail.textContent=`${dish.time||30} Min. · ${dish.recipe?.steps?.length||0} Schritte`;
  copy.append(name,detail);button.append(icon,copy);if(planned){const tag=document.createElement('span');tag.className='recipe-planned-tag';tag.textContent='Geplant';button.append(tag)}
  button.addEventListener('click',()=>openRecipe(dish.id,{from:'cooking'}));return button;
}
function renderCookingList(){
  const content=$('#cooking-content'),planned=plannedDishIds(),plannedSet=new Set(planned);content.replaceChildren();
  const search=document.createElement('input');search.type='search';search.id='cooking-search';search.placeholder='Gericht suchen …';search.autocomplete='off';search.setAttribute('aria-label','Rezepte zum Zubereiten suchen');search.className='cooking-search';content.append(search);
  const plannedSection=document.createElement('section');plannedSection.className='recipe-picker-section';const plannedTitle=document.createElement('h2');plannedTitle.textContent='Im angezeigten Plan';plannedSection.append(plannedTitle);const plannedList=document.createElement('div');plannedList.className='recipe-list';planned.forEach(id=>{const dish=state.dishes.find(item=>item.id===id);if(dish)plannedList.append(recipeListCard(dish,{planned:true}))});if(!planned.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Für diesen Zeitraum sind noch keine Gerichte geplant.';plannedList.append(empty)}plannedSection.append(plannedList);content.append(plannedSection);
  const allSection=document.createElement('section');allSection.className='recipe-picker-section';const allTitle=document.createElement('h2');allTitle.textContent='Alle eigenen Gerichte';allSection.append(allTitle);const allList=document.createElement('div');allList.className='recipe-list';
  state.dishes.filter(dish=>!plannedSet.has(dish.id)).sort((a,b)=>a.name.localeCompare(b.name,'de-DE',{sensitivity:'base'})).forEach(dish=>allList.append(recipeListCard(dish)));
  const ownPlanned=planned.map(id=>state.dishes.find(dish=>dish.id===id)).filter(Boolean);ownPlanned.forEach(dish=>allList.append(recipeListCard(dish,{planned:true})));allSection.append(allList);content.append(allSection);
  search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase('de-DE');content.querySelectorAll('.recipe-list-card').forEach(card=>{card.hidden=!card.textContent.toLocaleLowerCase('de-DE').includes(query)})});
}
function appendRecipeIngredients(container,dish,servings=selectedCookServings){
  const ingredients=dish.recipe?.ingredients||[];
  if(!ingredients.length){const message=document.createElement('p');message.className='recipe-missing-data';message.textContent='Für dieses Gericht sind noch keine Rezeptmengen erfasst.';container.append(message);return}
  if(!dish.recipe?.servings){const note=document.createElement('p');note.className='recipe-missing-data';note.textContent='Die Basis-Portionszahl ist nicht bekannt. Mengen werden unverändert angezeigt.';container.append(note)}
  const list=document.createElement('ul');list.className='recipe-ingredient-list';
  ingredients.forEach(item=>{
    const row=document.createElement('li'),amount=window.WochentischRecipes.parseAmount(item.amount);
    let quantity='Menge fehlt';
    if(item.amount!==null&&item.amount!==undefined&&String(item.amount).trim()){
      const scaled=dish.recipe?.servings?window.WochentischRecipes.scaledAmount(amount??item.amount,servings,dish.recipe.servings):null;
      quantity=scaled===null?String(item.amount):window.WochentischRecipes.formatAmount(scaled);
    }
    const strong=document.createElement('strong');strong.textContent=[quantity,item.unit].filter(Boolean).join(' ');const name=document.createElement('span');name.textContent=item.name;row.append(strong,name);
    const detail=[item.note].filter(Boolean).join(' · ');if(detail){const note=document.createElement('small');note.textContent=detail;row.append(note)}list.append(row);
  });container.append(list);
}
function recipePortionControl(dish){
  const label=document.createElement('label');label.className='recipe-portion-control';label.textContent='Portionen';const select=document.createElement('select');select.setAttribute('aria-label','Gewünschte Portionszahl');
  for(let servings=1;servings<=12;servings++){const option=document.createElement('option');option.value=String(servings);option.textContent=String(servings);select.append(option)}
  selectedCookServings=Math.max(1,Math.min(12,Number(selectedCookServings)||Number(dish.recipe?.servings)||2));select.value=String(selectedCookServings);
  select.addEventListener('change',()=>{selectedCookServings=Number(select.value);if(cookingStage==='cook'){void saveCookingProgress();renderCooking() }else renderCooking()});label.append(select);return label;
}
async function openRecipe(dishId,{from='cooking'}={}){
  const dish=state.dishes.find(item=>item.id===dishId);if(!dish)return;
  recipeDetailPreviousView=from==='week'?'week':'cooking';if(from==='week')recipeReturnScroll=window.scrollY;
  selectedRecipeDishId=dishId;cookingProgress=await loadCookingProgress(dishId);
  selectedCookServings=Math.max(1,Math.min(12,Number(cookingProgress?.servings)||Number(dish.recipe?.servings)||2));
  cookingStage='overview';setView('cooking',{render:false});renderCooking();
}
function renderRecipeOverview(dish){
  const content=$('#cooking-content');content.replaceChildren();const back=document.createElement('button');back.type='button';back.className='secondary-button recipe-back';back.textContent=recipeDetailPreviousView==='week'?'← Wochenplan':'← Alle Gerichte';back.addEventListener('click',()=>returnFromRecipe());content.append(back);
  const header=document.createElement('div');header.className='recipe-detail-heading';const icon=document.createElement('span');icon.className='recipe-list-icon';icon.textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';const title=document.createElement('div');const h=document.createElement('h2');h.textContent=dish.name;const meta=document.createElement('p');meta.textContent=`${dish.time||30} Min. · ${nutritionText(dish.nutrition)||'Nährwerte nicht angegeben'}`;title.append(h,meta);header.append(icon,title);content.append(header);
  const progress=cookingProgress,stale=progress&&!progress.completed&&progress.fingerprint!==window.WochentischRecipes.fingerprint(dish);
  if(stale){const warning=document.createElement('p');warning.className='recipe-stale-note';warning.textContent='Das Rezept wurde seit deinem letzten Start geändert. Bitte starte mit der neuen Fassung neu.';content.append(warning)}
  const ingredientPanel=document.createElement('section');ingredientPanel.className='recipe-overview-panel';const ingredientHead=document.createElement('div');ingredientHead.className='recipe-panel-heading';const ingredientTitle=document.createElement('h3');ingredientTitle.textContent='Zutaten';ingredientHead.append(ingredientTitle,recipePortionControl(dish));ingredientPanel.append(ingredientHead);appendRecipeIngredients(ingredientPanel,dish);content.append(ingredientPanel);
  const steps=document.createElement('section');steps.className='recipe-overview-panel';const stepsTitle=document.createElement('h3');stepsTitle.textContent='Zubereitung';steps.append(stepsTitle);if(dish.recipe?.steps?.length){const list=document.createElement('ol');list.className='recipe-step-overview';dish.recipe.steps.forEach(text=>{const li=document.createElement('li');li.textContent=text;list.append(li)});steps.append(list)}else{const missing=document.createElement('p');missing.className='recipe-missing-data';missing.textContent='Für dieses Gericht gibt es noch keine Anleitung.';steps.append(missing)}content.append(steps);
  const actions=document.createElement('div');actions.className='recipe-detail-actions';
  if(dish.recipe?.steps?.length){const start=document.createElement('button');start.type='button';start.className='primary-button';start.textContent=progress&&!progress.completed&&!stale?'Neu starten':'Zubereitung starten';start.addEventListener('click',()=>startCooking(dish));actions.append(start);if(progress&&!progress.completed&&!stale){const resume=document.createElement('button');resume.type='button';resume.className='secondary-button';resume.textContent='Fortsetzen';resume.addEventListener('click',()=>{cookingStage='cook';cookingProgress={...progress,servings:selectedCookServings,step:Math.min(progress.step||0,dish.recipe.steps.length-1)};void saveCookingProgress();renderCooking()});actions.append(resume)}}
  else{const edit=document.createElement('button');edit.type='button';edit.className='primary-button';edit.textContent='Anleitung ergänzen';edit.addEventListener('click',()=>openDish(dish.id));actions.append(edit)}
  if(dish.catalogSourceId&&catalogEditPermission){const editCatalog=document.createElement('button');editCatalog.type='button';editCatalog.className='secondary-button';editCatalog.textContent='Standardrezept bearbeiten';editCatalog.disabled=!navigator.onLine;if(editCatalog.disabled)editCatalog.title='Zum Bearbeiten ist eine Internetverbindung nötig.';editCatalog.addEventListener('click',()=>{recipeDetailPreviousView='cooking';void editCatalogDishById(dish.catalogSourceId)});actions.append(editCatalog)}
  content.append(actions);
  if(!dish.recipe?.ingredients?.length&&!dish.recipe?.steps?.length)void showCatalogRecipeOffer(dish,content);
  else if(dish.catalogSourceId)void showCatalogUpdateOffer(dish,content);
}
async function startCooking(dish){
  await window.WochentischStore?.remove('records',cookingProgressKey(dish.id)).catch(()=>{});cookingProgress={dishId:dish.id,step:0,servings:selectedCookServings,fingerprint:window.WochentischRecipes.fingerprint(dish),completed:false};cookingStage='cook';await saveCookingProgress();renderCooking();
}
function renderCookingStep(dish){
  const steps=dish.recipe?.steps||[],index=Math.min(Math.max(0,cookingProgress?.step||0),Math.max(steps.length-1,0)),content=$('#cooking-content');content.replaceChildren();
  const back=document.createElement('button');back.type='button';back.className='secondary-button recipe-back';back.textContent='← Rezeptübersicht';back.addEventListener('click',()=>{void saveCookingProgress();cookingStage='overview';renderCooking()});content.append(back);
  const progress=document.createElement('div');progress.className='cook-progress';progress.setAttribute('role','progressbar');progress.setAttribute('aria-valuemin','1');progress.setAttribute('aria-valuemax',String(steps.length));progress.setAttribute('aria-valuenow',String(index+1));progress.setAttribute('aria-label',`Schritt ${index+1} von ${steps.length}`);const fill=document.createElement('span');fill.style.width=`${((index+1)/steps.length)*100}%`;progress.append(fill);content.append(progress);
  const count=document.createElement('p');count.className='cook-step-count';count.textContent=`Schritt ${index+1} von ${steps.length}`;content.append(count);const title=document.createElement('h2');title.className='cook-step-title';title.textContent=dish.name;content.append(title);const text=document.createElement('p');text.className='cook-step-text';text.textContent=steps[index]||'';content.append(text);
  const actions=document.createElement('div');actions.className='cook-step-actions';const previous=document.createElement('button');previous.type='button';previous.className='secondary-button';previous.textContent='Zurück';previous.disabled=index===0;previous.addEventListener('click',()=>{cookingProgress={...cookingProgress,step:index-1};void saveCookingProgress();renderCooking()});const next=document.createElement('button');next.type='button';next.className='primary-button';next.textContent=index===steps.length-1?'Fertig':'Weiter';next.addEventListener('click',()=>{if(index===steps.length-1){cookingStage='done';cookingProgress={...cookingProgress,completed:true};void saveCookingProgress();renderCooking();return}cookingProgress={...cookingProgress,step:index+1};void saveCookingProgress();renderCooking()});actions.append(previous,next);content.append(actions);
  const ingredients=document.createElement('section');ingredients.className='cook-ingredients-details';ingredients.setAttribute('aria-labelledby','cook-ingredients-heading');const ingredientHead=document.createElement('div');ingredientHead.className='recipe-panel-heading';const ingredientTitle=document.createElement('h3');ingredientTitle.id='cook-ingredients-heading';ingredientTitle.textContent='Zutaten';ingredientHead.append(ingredientTitle,recipePortionControl(dish));ingredients.append(ingredientHead);appendRecipeIngredients(ingredients,dish);content.append(ingredients);
}
function renderCookingDone(dish){const content=$('#cooking-content');content.replaceChildren();const card=document.createElement('section');card.className='cook-done-card';const icon=document.createElement('span');icon.textContent='✓';icon.className='cook-done-icon';const heading=document.createElement('h2');heading.textContent='Fertig zubereitet';const name=document.createElement('p');name.textContent=dish.name;const restart=document.createElement('button');restart.type='button';restart.className='primary-button';restart.textContent='Noch einmal zubereiten';restart.addEventListener('click',()=>startCooking(dish));const back=document.createElement('button');back.type='button';back.className='secondary-button';back.textContent=recipeDetailPreviousView==='week'?'Zurück zum Wochenplan':'Zur Rezeptübersicht';back.addEventListener('click',()=>{if(recipeDetailPreviousView==='week')returnFromRecipe();else{cookingStage='overview';renderCooking()}});card.append(icon,heading,name,restart,back);content.append(card)}
function renderCooking(){$('#cooking-view').classList.toggle('is-cooking-step',cookingStage==='cook'&&Boolean(state.dishes.find(item=>item.id===selectedRecipeDishId)));const dish=state.dishes.find(item=>item.id===selectedRecipeDishId);if(cookingStage==='list'||!dish){cookingStage='list';selectedRecipeDishId='';renderCookingList();return}if(cookingStage==='cook'&&cookingProgress&&cookingProgress.fingerprint!==window.WochentischRecipes.fingerprint(dish)){cookingProgress={...cookingProgress,stale:true};cookingStage='overview'}if(cookingStage==='cook'){renderCookingStep(dish);return}if(cookingStage==='done'){renderCookingDone(dish);return}cookingStage='overview';renderRecipeOverview(dish)}
function returnFromRecipe(){
  void saveCookingProgress();const target=recipeDetailPreviousView==='cooking'?'cooking':recipeDetailPreviousView;selectedRecipeDishId='';cookingStage='list';setView(target,{render:true});requestAnimationFrame(()=>window.scrollTo(0,target==='week'?recipeReturnScroll:0));
}
function setCatalogAdminFeedback(text){const element=$('#catalog-admin-feedback');element.textContent=text;element.hidden=!text}
async function openCatalogAdmin(){if(!await refreshCatalogEditPermission()){showToast('Für diese Funktion ist eine aktive Katalogberechtigung erforderlich.');return}setView('catalog-admin',{render:false});void loadCatalogAdmin()}
async function openNewCatalogDish(){if(!navigator.onLine||!authClient){showToast('Standardgerichte können nur mit aktiver Internetverbindung hinzugefügt werden.');return}if(!await refreshCatalogEditPermission()){showToast('Für diese Funktion ist eine aktive Katalogberechtigung erforderlich.');return}openDish('',{catalogCreate:true})}
function catalogDishToEditorDish(dish){return{...dish,time:Number(dish.cooking_time_minutes)||30,ingredients:cleanIngredients(window.WochentischRecipes.shoppingIngredients(dish.recipe,dish.ingredients)),recipe:window.WochentischRecipes.normalizeRecipe(dish.recipe),nutrition:cleanNutrition(dish.nutrition)}}
let catalogPermissionRequest=null;
function refreshCatalogEditPermission(){
  const nav=$('#catalog-admin-nav'),userId=currentUserId,scope=authScope;
  if(!userId){catalogEditPermission=false;nav.hidden=true;return Promise.resolve(false)}
  if(catalogPermissionRequest?.scope===scope)return catalogPermissionRequest.result;
  const result=(async()=>{
    let allowed=false;
    try{
      if(!navigator.onLine){
        const saved=await window.WochentischStore?.get('records',`catalog-permission:${userId}`);
        allowed=Boolean(saved?.allowed);
      }else if(authClient){
        const {data,error}=await authClient.rpc('catalog_edit_allowed_v1');
        if(error)throw error;
        allowed=Boolean(data);
        await window.WochentischStore?.put('records',`catalog-permission:${userId}`,{allowed}).catch(()=>{});
      }
    }catch(error){console.warn('Katalogberechtigung konnte nicht geprüft werden:',error)}
    if(scope!==authScope)return false;
    catalogEditPermission=allowed;nav.hidden=!allowed;
    return allowed;
  })().finally(()=>{if(catalogPermissionRequest?.result===result)catalogPermissionRequest=null});
  catalogPermissionRequest={scope,result};
  return result;
}
function renderCatalogAdmin(){
  const list=$('#catalog-admin-list'),query=$('#catalog-admin-search').value.trim().toLocaleLowerCase('de-DE');$('#catalog-admin-add').disabled=!navigator.onLine;list.replaceChildren();
  const entries=adminCatalogDishes.filter(dish=>String(dish.name||'').toLocaleLowerCase('de-DE').includes(query));
  if(!entries.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=adminCatalogDishes.length?'Keine passenden Gerichte gefunden.':'Noch keine Standardgerichte vorhanden.';list.append(empty);if(!navigator.onLine){const note=document.createElement('p');note.className='catalog-offline-note';note.textContent='Offline wird der zuletzt gespeicherte Katalog angezeigt. Hinzufügen und Bearbeiten ist nur online möglich.';list.prepend(note)}return}
  entries.forEach(dish=>{const row=document.createElement('article');row.className='catalog-admin-row';const copy=document.createElement('div');const name=document.createElement('h2');name.textContent=dish.name;const meta=document.createElement('p');meta.textContent=`${dish.cooking_time_minutes||30} Min. · Version ${dish.version||1}`;copy.append(name,meta);const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='Bearbeiten';button.disabled=!navigator.onLine;button.addEventListener('click',()=>openDish('',{catalogDish:dish}));row.append(copy,button);list.append(row)});
  if(!navigator.onLine){const note=document.createElement('p');note.className='catalog-offline-note';note.textContent='Offline wird der zuletzt gespeicherte Katalog angezeigt. Hinzufügen und Bearbeiten ist nur online möglich.';list.prepend(note)}
}
async function loadCatalogAdmin(){
  try{adminCatalogDishes=(await window.WochentischStore?.getAll('catalog')||[]).map(record=>record.value).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'de-DE'));renderCatalogAdmin()}catch(error){}
  if(!navigator.onLine||!authClient){renderCatalogAdmin();return}
  try{const {data,error}=await authClient.from('catalog_dishes').select('*').order('name');if(error)throw error;const cached=adminCatalogDishes;adminCatalogDishes=data||[];renderCatalogAdmin();await cacheCatalogDishes(adminCatalogDishes,cached)}
  catch(error){console.warn('Standardkatalog kann nicht aktualisiert werden:',error);setCatalogAdminFeedback('Der gespeicherte Katalogstand wird angezeigt. Aktualisieren ist gerade nicht möglich.')}
}
async function editCatalogDishById(catalogId){
  if(!await refreshCatalogEditPermission()){showToast('Für die Verwaltung des Standardkatalogs ist eine aktive Berechtigung nötig.');return}
  let dish=adminCatalogDishes.find(item=>item.id===catalogId);
  if(!dish&&navigator.onLine&&authClient){const {data,error}=await authClient.from('catalog_dishes').select('*').eq('id',catalogId).maybeSingle();if(!error)dish=data}
  if(dish)openDish('',{catalogDish:dish});else showToast('Das Standardrezept ist nicht verfügbar.');
}
function showCatalogVersionConflict(current,draft){
  let panel=$('#catalog-version-conflict');if(!panel){panel=document.createElement('section');panel.id='catalog-version-conflict';panel.className='catalog-version-conflict';$('#dish-form-error').after(panel)}
  panel.replaceChildren();const heading=document.createElement('h3');heading.textContent='Das Katalogrezept wurde zwischenzeitlich geändert.';const currentSummary=document.createElement('p');currentSummary.textContent=`Aktuelle Fassung: Version ${current.version} · ${current.name}`;
  const comparison=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Fassungen vergleichen';const currentData=document.createElement('pre');currentData.textContent=`Aktuelle Fassung\n${JSON.stringify({name:current.name,type:current.recipe_type||'meal',ingredient:current.ingredient,time:current.cooking_time_minutes,ingredients:current.ingredients,nutrition:current.nutrition,recipe:current.recipe},null,2)}`;const draftData=document.createElement('pre');draftData.textContent=`Dein Entwurf\n${JSON.stringify(draft,null,2)}`;comparison.append(summary,currentData,draftData);
  const instruction=document.createElement('p');instruction.textContent='Dein Entwurf bleibt erhalten. Vergleiche beide Fassungen und bestätige erst danach, wenn du ihn auf die aktuelle Version übertragen möchtest.';
  const action=document.createElement('button');action.type='button';action.className='secondary-button';action.textContent=`Entwurf bewusst auf Version ${current.version} übertragen`;action.addEventListener('click',()=>{catalogEditDraft.version=current.version;catalogEditDraft.original=structuredClone(current);catalogEditDraft.rebased=true;$('#dish-form-error').hidden=true;panel.hidden=true;$('#dish-form').requestSubmit()});panel.append(heading,currentSummary,comparison,instruction,action);panel.hidden=false;
}
function hideCatalogVersionConflict(){const panel=$('#catalog-version-conflict');if(panel)panel.hidden=true}
async function saveCatalogDishDraft(values){
  const error=$('#dish-form-error');if(!navigator.onLine||!authClient){error.textContent='Zentrale Änderungen können nur mit aktiver Internetverbindung gespeichert werden.';error.hidden=false;return}
  if(!await refreshCatalogEditPermission()){error.textContent='Du hast aktuell keine Berechtigung, den Standardkatalog zu bearbeiten.';error.hidden=false;return}
  if(!catalogEditDraft||(!catalogEditDraft.creating&&catalogEditDraft.id!==values.id)||(catalogEditDraft.creating&&values.id)){error.textContent='Der Katalogeintrag wurde nicht geladen. Bitte schließe den Editor und öffne ihn erneut.';error.hidden=false;return}
  if(catalogEditDraft.creating&&(!values.recipe||!Number.isInteger(values.recipe.servings)||!values.recipe.ingredients.length||!values.recipe.steps.length)){error.textContent='Für ein Standardgericht brauchst du Basis-Portionen, mindestens eine Rezeptzutat und einen Zubereitungsschritt.';error.hidden=false;return}
  if(!catalogEditDraft.creating&&catalogEditDraft.conflict&&!catalogEditDraft.rebased){error.textContent='Lade die aktuelle Fassung und übertrage deinen Entwurf bewusst, bevor du erneut speicherst.';error.hidden=false;return}
  error.hidden=true;hideCatalogVersionConflict();const saveButton=$('#dish-form [type="submit"]');saveButton.disabled=true;saveButton.textContent='Wird gespeichert …';
  try{
    const changes={name:values.name,recipe_type:values.type,ingredient:values.ingredient,cooking_time_minutes:values.time,emoji:emojiMap[values.ingredient]||'🍽️',ingredients:values.ingredients,nutrition:values.nutrition,recipe:values.recipe};
    const creating=catalogEditDraft.creating,{data,error:rpcError}=creating?await authClient.rpc('create_catalog_dish_v1',{p_changes:changes}):await authClient.rpc('update_catalog_dish_v1',{p_catalog_id:values.id,p_expected_version:catalogEditDraft.version,p_changes:changes});if(rpcError)throw rpcError;
    if(creating&&data?.status==='duplicate'){error.textContent=`„${data.existing?.name||values.name}“ ist bereits im Standardkatalog vorhanden. Du kannst den vorhandenen Eintrag in der Liste bearbeiten.`;error.hidden=false;return}
    if(data?.status==='version_conflict'&&data.current){catalogEditDraft.conflict=true;catalogEditDraft.rebased=false;catalogEditDraft.current=data.current;adminCatalogDishes=adminCatalogDishes.map(item=>item.id===data.current.id?data.current:item);await window.WochentischStore?.put('catalog',data.current.id,data.current).catch(()=>{});showCatalogVersionConflict(data.current,values);return}
    const stored=data?.dish||data?.entry||data;if(!stored?.id||!Number.isInteger(stored.version))throw new Error('Der Server hat keine bestätigte Katalogfassung zurückgegeben.');
    await window.WochentischStore?.put('catalog',stored.id,stored).catch(cacheError=>console.warn('Katalogeintrag konnte lokal nicht zwischengespeichert werden:',cacheError));adminCatalogDishes=creating?[...adminCatalogDishes.filter(item=>item.id!==stored.id),stored].sort((a,b)=>a.name.localeCompare(b.name,'de-DE')):adminCatalogDishes.map(item=>item.id===stored.id?stored:item);if(creating)$('#catalog-admin-search').value='';$('#dish-dialog').close();renderCatalogAdmin();setCatalogAdminFeedback(creating?`${stored.name} wurde zum Standardkatalog hinzugefügt.`:`${stored.name} wurde in Version ${stored.version} gespeichert.`);
    if(savedView()==='cooking'&&selectedRecipeDishId){const local=state.dishes.find(item=>item.id===selectedRecipeDishId);if(local?.catalogSourceId===stored.id)void showCatalogUpdateOffer(local,$('#cooking-content'))}
  }catch(saveError){console.error('Katalogrezept konnte nicht gespeichert werden:',saveError);error.textContent=saveError.message||'Änderung konnte nicht gespeichert werden. Dein Entwurf ist noch geöffnet.';error.hidden=false}
  finally{saveButton.disabled=false;saveButton.textContent=catalogEditDraft?.creating?'Standardgericht hinzufügen':'Änderungen speichern'}
}
async function showCatalogUpdateOffer(dish,container){
  if(!dish.catalogSourceId)return;
  let catalog=navigator.onLine?await fetchCatalogDish(dish.catalogSourceId):adminCatalogDishes.find(item=>item.id===dish.catalogSourceId);
  if(!catalog){try{catalog=await window.WochentischStore?.get('catalog',dish.catalogSourceId)}catch(error){}}
  if(!catalog||Number(catalog.version||1)<=Number(dish.catalogSourceVersion||0)||!container.isConnected||selectedRecipeDishId!==dish.id)return;
  const panel=document.createElement('section');panel.className='catalog-update-offer';const title=document.createElement('h3');title.textContent='Eine neuere Katalogfassung ist verfügbar';const info=document.createElement('p');info.textContent=`Deine Kopie ist Version ${dish.catalogSourceVersion||'unbekannt'}, der Standardkatalog ist Version ${catalog.version}. Eine Übernahme ersetzt deine Rezeptfelder und Nährwerte.`;const apply=document.createElement('button');apply.type='button';apply.className='secondary-button';apply.textContent='Katalogfassung übernehmen';apply.addEventListener('click',async()=>{if(!confirm('Die eigenen Rezeptanpassungen werden durch die Katalogfassung ersetzt. Wochenplan und Einkaufsstatus bleiben erhalten. Übernehmen?'))return;const refreshed=await fetchCatalogDish(dish.catalogSourceId);if(!refreshed){showToast('Die aktuelle Katalogfassung konnte nicht geladen werden.');return}Object.assign(dish,{name:refreshed.name,type:refreshed.recipe_type==='baking'?'baking':'meal',ingredient:refreshed.ingredient||'',time:Number(refreshed.cooking_time_minutes)||30,emoji:refreshed.emoji||'🍽️',ingredients:cleanIngredients(window.WochentischRecipes.shoppingIngredients(refreshed.recipe,refreshed.ingredients)),nutrition:cleanNutrition(refreshed.nutrition),recipe:window.WochentischRecipes.normalizeRecipe(refreshed.recipe),catalogSourceId:refreshed.id,catalogSourceVersion:refreshed.version});await invalidateRecipeProgress(dish);save();renderCooking();renderDishes();renderCalendar();showToast('Die Katalogfassung wurde übernommen.')});panel.append(title,info,apply);container.append(panel);
}
async function fetchCatalogDish(id){if(!navigator.onLine||!authClient)return null;try{const {data,error}=await authClient.from('catalog_dishes').select('*').eq('id',id).maybeSingle();if(error)throw error;if(data)await window.WochentischStore?.put('catalog',data.id,data);return data}catch(error){return null}}
async function catalogRecipeForDish(dish){
  if(dish.catalogSourceId){
    const online=await fetchCatalogDish(dish.catalogSourceId);if(online)return online;
    try{return await window.WochentischStore?.get('catalog',dish.catalogSourceId)||null}catch(error){return null}
  }
  let cached=null;
  try{
    const key=catalogDishNameKey(dish.name),matches=(await window.WochentischStore?.getAll('catalog')||[]).map(record=>record.value).filter(item=>catalogDishNameKey(item?.name)===key);
    if(matches.length===1)cached=matches[0];
  }catch(error){console.warn('Lokaler Standardkatalog konnte nicht gelesen werden:',error)}
  if(cached&&navigator.onLine){const refreshed=await fetchCatalogDish(cached.id);if(refreshed)return refreshed}
  if(navigator.onLine&&authClient){
    try{
      const {data,error}=await authClient.from('catalog_dishes').select('*').eq('normalized_name',catalogDishNameKey(dish.name)).maybeSingle();
      if(error)throw error;
      if(data){await window.WochentischStore?.put('catalog',data.id,data);return data}
    }catch(error){console.warn('Passendes Standardrezept konnte nicht geladen werden:',error)}
  }
  return cached;
}
async function showCatalogRecipeOffer(dish,container){
  const panel=document.createElement('section');panel.className='catalog-update-offer';const title=document.createElement('h3');title.textContent='Standardrezept suchen';const info=document.createElement('p');info.textContent='Ich prüfe, ob es für dieses Gericht ein Rezept im Standardkatalog gibt.';panel.append(title,info);container.append(panel);
  const catalog=await catalogRecipeForDish(dish);
  if(!panel.isConnected||selectedRecipeDishId!==dish.id||cookingStage!=='overview')return;
  const recipe=window.WochentischRecipes.normalizeRecipe(catalog?.recipe);
  if(!catalog||!recipe?.ingredients?.length||!recipe?.steps?.length){panel.remove();return}
  title.textContent='Rezept im Standardkatalog gefunden';info.textContent='Du kannst Zutaten und Anleitung übernehmen. Deine übrigen Gerichtedaten und Wochenplan-Zuordnungen bleiben erhalten.';
  const apply=document.createElement('button');apply.type='button';apply.className='secondary-button';apply.textContent='Standardrezept übernehmen';apply.addEventListener('click',async()=>{
    if(!confirm('Das Standardrezept ersetzt die fehlenden Rezeptdaten und aktualisiert die Zutaten für den Einkaufszettel. Name, Hauptzutat, Zeitaufwand, Nährwerte, Wochenplan und abgehakte Einkäufe bleiben erhalten. Übernehmen?'))return;
    if(state.dishes.find(item=>item.id===dish.id)!==dish||dish.recipe?.ingredients?.length||dish.recipe?.steps?.length){showToast('Dieses Gericht wurde inzwischen geändert. Öffne es erneut, um die aktuelle Fassung zu sehen.');return}
    const latest=catalog.id&&navigator.onLine?await fetchCatalogDish(catalog.id):catalog;
    const latestRecipe=window.WochentischRecipes.normalizeRecipe(latest?.recipe);
    if(!latest||!latestRecipe?.ingredients?.length||!latestRecipe?.steps?.length){showToast('Das Standardrezept konnte gerade nicht geladen werden.');return}
    Object.assign(dish,{recipe:latestRecipe,ingredients:cleanIngredients(window.WochentischRecipes.shoppingIngredients(latestRecipe,latest.ingredients)),catalogSourceId:latest.id,catalogSourceVersion:Number.isInteger(latest.version)?latest.version:1});
    selectedCookServings=Math.max(1,Math.min(12,Number(latestRecipe.servings)||selectedCookServings||2));
    await invalidateRecipeProgress(dish);save();renderCooking();renderDishes();renderCalendar();showToast('Standardrezept wurde übernommen.');
  });panel.append(apply);
}
function setView(view,{render=true}={}){closeProfileActionsMenu();const views={home:'#home-view',week:'#week-view',dishes:'#dishes-view',shopping:'#shopping-view',cooking:'#cooking-view','catalog-admin':'#catalog-admin-view'};if(!views[view]||(view==='home'&&!window.matchMedia('(max-width: 700px)').matches)||(view==='catalog-admin'&&!catalogEditPermission))view='week';if(savedView()==='cooking'&&view!=='cooking')void saveCookingProgress();try{localStorage.setItem(lastViewStorageKey,view)}catch(error){}Object.entries(views).forEach(([name,selector])=>$(selector).classList.toggle('hidden',name!==view));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const labels={week:'Wochenplan',dishes:'Meine Gerichte',shopping:'Einkaufszettel',cooking:'Zubereiten','catalog-admin':'Standardkatalog verwalten'};$('#crumb-view').textContent=labels[view]||'';$('#crumb-view').hidden=view==='home';$('#crumb-separator').hidden=view==='home';if(render&&view==='dishes')renderDishes();if(render&&view==='shopping')renderShoppingList();if(render&&view==='cooking')renderCooking();if(render&&view==='catalog-admin')renderCatalogAdmin()}
function savedSidebarCollapsed(){try{return localStorage.getItem(sidebarCollapsedStorageKey)==='true'}catch(error){return false}}
function updateMenuToggleState(){const compact=compactNavigationQuery.matches,open=$('#sidebar').classList.contains('mobile-open'),collapsed=$('.app-shell').classList.contains('sidebar-collapsed'),menuLabel=open?'Menü schließen':'Menü öffnen',sidebarLabel=collapsed?'Seitenleiste ausklappen':'Seitenleiste einklappen';$('#menu-toggle').setAttribute('aria-expanded',String(compact&&open));$('#menu-toggle').setAttribute('aria-label',menuLabel);$('#menu-toggle').title=menuLabel;$('#sidebar-toggle').setAttribute('aria-expanded',String(!collapsed));$('#sidebar-toggle').setAttribute('aria-label',sidebarLabel);$('#sidebar-toggle').title=sidebarLabel;$('#sidebar-toggle').firstElementChild.textContent=collapsed?'›':'‹'}
function openProfileActionsMenu({focusFirst=false}={}){const menu=$('#profile-actions-menu'),toggle=$('#profile-menu-toggle');menu.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Kontomenü schließen');toggle.title='Kontomenü schließen';if(focusFirst)menu.querySelector('button')?.focus()}
function closeProfileActionsMenu({restoreFocus=false}={}){const menu=$('#profile-actions-menu'),toggle=$('#profile-menu-toggle');if(menu.hidden)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Kontomenü öffnen');toggle.title='Kontomenü öffnen';if(restoreFocus)toggle.focus()}
function closeMobileMenu(){$('#sidebar').classList.remove('mobile-open');$('#menu-backdrop').hidden=true;closeProfileActionsMenu();updateMenuToggleState()}
function toggleMobileMenu(){const open=$('#sidebar').classList.toggle('mobile-open');if(!open)closeProfileActionsMenu();$('#menu-backdrop').hidden=!open;updateMenuToggleState()}
function setSidebarCollapsed(collapsed){const shouldCollapse=Boolean(collapsed)&&!compactNavigationQuery.matches;$('.app-shell').classList.toggle('sidebar-collapsed',shouldCollapse);try{localStorage.setItem(sidebarCollapsedStorageKey,String(Boolean(collapsed)))}catch(error){}updateMenuToggleState()}
function applyResponsiveNavigation(){const compact=compactNavigationQuery.matches;$('#sidebar').classList.remove('mobile-open');$('#menu-backdrop').hidden=true;closeProfileActionsMenu();$('.app-shell').classList.toggle('sidebar-collapsed',!compact&&savedSidebarCollapsed());updateMenuToggleState()}
$('#shopping-done-toggle').addEventListener('click',()=>{shoppingDoneExpanded=!shoppingDoneExpanded;syncShoppingDoneDisclosure()});
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');let themeOverride=null;
function updateThemeButton(){const button=$('#theme-toggle'),icon=button.querySelector('.sidebar-action-icon'),label=themeOverride?(systemTheme.matches?'Dark Mode':'Light Mode'):(systemTheme.matches?'Light Mode':'Dark Mode');icon.textContent=label==='Dark Mode'?'☾':'☀';button.querySelector('.theme-toggle-label').textContent=label;button.setAttribute('aria-label',`${label} aktivieren`);button.title=`${label} aktivieren`}
function applyTheme(){const link=$('#theme-stylesheet');link.media=themeOverride?(themeOverride==='dark'?'all':'not all'):'(prefers-color-scheme: dark)';updateThemeButton()}
function toggleTheme(){themeOverride=themeOverride?null:systemTheme.matches?'light':'dark';applyTheme()}
const installButton=$('#install-app');
const installDialog=$('#install-dialog');
const standaloneDisplay=window.matchMedia('(display-mode: standalone)');
let pendingInstallPrompt=null;
let appInstalled=false;

function updateInstallButton(){
  installButton.hidden=appInstalled||standalonePwa();
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  pendingInstallPrompt=event;
});
window.addEventListener('appinstalled',()=>{
  appInstalled=true;
  pendingInstallPrompt=null;
  updateInstallButton();
});
standaloneDisplay.addEventListener('change',updateInstallButton);
updateInstallButton();

installButton.addEventListener('click',async()=>{
  closeProfileActionsMenu({restoreFocus:true});
  const prompt=pendingInstallPrompt;
  pendingInstallPrompt=null;
  if(prompt){
    try{
      await prompt.prompt();
      return;
    }catch(error){
      console.debug('Installationsdialog konnte nicht geöffnet werden:',error);
    }
  }

  const userAgent=navigator.userAgent;
  const appleMobile=/iPhone|iPad|iPod/.test(userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let instructions='Öffne das Browsermenü und wähle „Installieren“ oder „Zum Startbildschirm hinzufügen“, falls verfügbar.';
  if(appleMobile){
    instructions='Öffne Wochentisch in Safari. Tippe auf „Teilen“ und dann auf „Zu Home-Bildschirm hinzufügen“. Aktiviere „Als Web-App öffnen“, falls die Option angezeigt wird, und tippe auf „Hinzufügen“.';
  }else if(/Macintosh/.test(userAgent)&&/Safari/.test(userAgent)&&!/Chrome|Chromium|Edg/.test(userAgent)){
    instructions='Wähle in Safari „Ablage“ → „Zum Dock hinzufügen“ und bestätige mit „Hinzufügen“.';
  }
  $('#install-instructions').textContent=instructions;
  installDialog.showModal();
});

$('#profile-menu-toggle').addEventListener('click',()=>{$('#profile-actions-menu').hidden?openProfileActionsMenu():closeProfileActionsMenu()});
$('#profile-menu-toggle').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();openProfileActionsMenu({focusFirst:true})}});
document.addEventListener('click',event=>{if(!event.target.closest('.profile-menu-anchor'))closeProfileActionsMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#profile-actions-menu').hidden){event.preventDefault();closeProfileActionsMenu({restoreFocus:true})}});
$('#theme-toggle').addEventListener('click',()=>{toggleTheme();closeProfileActionsMenu({restoreFocus:true})});systemTheme.addEventListener('change',updateThemeButton);applyTheme();$('#menu-toggle').addEventListener('click',toggleMobileMenu);$('#sidebar-toggle').addEventListener('click',()=>setSidebarCollapsed(!$('.app-shell').classList.contains('sidebar-collapsed')));compactNavigationQuery.addEventListener('change',applyResponsiveNavigation);applyResponsiveNavigation();$('#menu-backdrop').addEventListener('click',closeMobileMenu);document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='catalog-admin')void openCatalogAdmin();else setView(b.dataset.view);closeMobileMenu()}));document.querySelectorAll('[data-home-view]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.homeView)}));$('#catalog-admin-add').addEventListener('click',()=>void openNewCatalogDish());$('#catalog-admin-search').addEventListener('input',renderCatalogAdmin);$('#home-breadcrumb').addEventListener('click',()=>setView(window.matchMedia('(max-width: 700px)').matches?'home':'week'));window.matchMedia('(max-width: 700px)').addEventListener('change',event=>{if(!event.matches&&$('#home-view').classList.contains('hidden')===false)setView('week')});$('#shopping-btn').addEventListener('click',openShoppingList);$('#shopping-back').addEventListener('click',()=>setView('week'));$('#shopping-clear').addEventListener('click',clearShoppingList);$('#shopping-meal-filter').addEventListener('change',renderShoppingList);$('#shopping-item-input').addEventListener('input',renderShoppingItemSuggestions);$('#shopping-item-input').addEventListener('keydown',event=>{if(event.key==='Escape'){$('#shopping-item-suggestions').hidden=true;event.currentTarget.setAttribute('aria-expanded','false')}});$('#shopping-add-form').addEventListener('submit',e=>{e.preventDefault();const name=normalizeManualItem($('#shopping-item-input').value);if(!name)return;const weekKey=keyFor(mondayFor(rangeStart())),visibleWeekKeys=[...new Set(rangeDates().map(date=>keyFor(mondayFor(date))))],itemKey=manualItemKey(name);state.manualShoppingItems??={};state.hiddenShoppingItems??={};state.manualShoppingItems[weekKey]??=[];const duplicate=visibleWeekKeys.some(key=>(state.manualShoppingItems[key]||[]).some(item=>manualItemKey(item)===itemKey));if(duplicate){const relevantWeeks=visibleWeekKeys.filter(key=>(state.manualShoppingItems[key]||[]).some(item=>manualItemKey(item)===itemKey)||rangeDates().some(date=>keyFor(mondayFor(date))===key&&planForDate(date).some(id=>(state.dishes.find(dish=>dish.id===id)?.ingredients||[]).some(item=>manualItemKey(item)===itemKey))));const checked=relevantWeeks.every(key=>shoppingItemChecked(key,itemKey));const status=$('#shopping-add-status');status.textContent=checked?'Dieser Artikel ist bereits abgehakt. Tippe ihn unter „Schon eingekauft“ an, um ihn wieder zu öffnen.':'Dieser Artikel steht bereits auf dem Einkaufszettel.';status.hidden=false;$('#shopping-item-suggestions').hidden=true;$('#shopping-item-input').setAttribute('aria-expanded','false');requestAnimationFrame(()=>{if(document.activeElement===$('#shopping-item-input'))revealShoppingAddForm();else $('#shopping-add-form').scrollIntoView({block:'nearest',inline:'nearest'})});return}$('#shopping-add-status').hidden=true;state.manualShoppingItems[weekKey].push(name);const hidden=cleanHiddenShoppingItems(state.hiddenShoppingItems[weekKey]).filter(key=>key!==itemKey);if(hidden.length)state.hiddenShoppingItems[weekKey]=hidden;else delete state.hiddenShoppingItems[weekKey];delete state.shoppingChecks[weekKey]?.[itemKey];delete state.shoppingChecks[weekKey]?.[`manual:${itemKey}`];save();$('#shopping-item-input').value='';$('#shopping-item-suggestions').replaceChildren();$('#shopping-item-suggestions').hidden=true;$('#shopping-item-input').setAttribute('aria-expanded','false');$('#shopping-meal-filter').value='';renderShoppingList();$('#shopping-item-input').focus({preventScroll:true});requestAnimationFrame(()=>revealShoppingAddForm())});$('#shopping-overview').addEventListener('click',()=>{$('#shopping-meal-filter').value='';renderShoppingList()});
$('#prev-week').addEventListener('click',()=>{weekOffset--;renderCalendar()});$('#next-week').addEventListener('click',()=>{weekOffset++;renderCalendar()});$('#today-btn').addEventListener('click',()=>{weekOffset=0;renderCalendar()});
$('#dish-ingredient-input').addEventListener('input',renderDishIngredientSuggestions);$('#dish-ingredient-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const value=normalizeIngredient(event.currentTarget.value);if(value)addDishIngredient(value)});
$('#dish-ingredient').addEventListener('input',renderMainIngredientSuggestions);$('#dish-ingredient').addEventListener('keydown',event=>{if(event.key==='Enter'&& !$('#dish-main-ingredient-suggestions').hidden){event.preventDefault();$('#dish-main-ingredient-suggestions').querySelector('.pantry-suggestion')?.click()}});
$('#dish-time').addEventListener('input',event=>{$('#dish-time-output').textContent=`${timeBlocks[Number(event.currentTarget.value)]||30} Min.`});
$('#mix-btn').addEventListener('click',openPantryPlanner);
$('#pantry-close').addEventListener('click',()=>$('#pantry-dialog').close());
$('#pantry-cancel').addEventListener('click',()=>$('#pantry-dialog').close());
$('#pantry-input').addEventListener('input',renderPantryEditor);
$('#pantry-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const value=normalizeIngredient(event.currentTarget.value);if(!value){$('#pantry-form').requestSubmit();return}const suggestion=availablePantryIngredients().find(name=>ingredientKey(name).startsWith(ingredientKey(value))&&!pantryDraft.some(item=>ingredientKey(item)===ingredientKey(name)));addPantryIngredient(suggestion||value)});
$('#pantry-form').addEventListener('submit',event=>{event.preventDefault();const pantry=pantryDraft.slice(),unmatched=pantry.filter(item=>!state.dishes.some(d=>d.type!=='baking'&&(d.ingredients||[]).some(i=>ingredientMatches(item,i))));const hasEmptyDays=replaceRangePlan(pantry);$('#pantry-dialog').close();renderCalendar({shuffleAnimation:true});showToast(hasEmptyDays?'Keine passenden Gerichte zum Würfeln verfügbar. Backrezepte bleiben im Plan.':unmatched.length?`7 Tage gemischt. Keine passenden Gerichte für: ${unmatched.join(', ')}`:'Deine nächsten 7 Tage wurden neu gemischt.',{duration:4500})});
function updateDishTypeFields(){const baking=selectedRecipeType($('#dish-type'))==='baking';$('.dish-main-ingredient-field').hidden=baking;$('#dish-form').classList.toggle('is-baking-recipe',baking);if(baking){$('#dish-main-ingredient-suggestions').hidden=true;$('#dish-ingredient').setAttribute('aria-expanded','false')}}
$('#dish-type').addEventListener('click',event=>{const button=event.target.closest('button[data-type]');if(button){setRecipeTypeFilter($('#dish-type'),button.dataset.type);updateDishTypeFields();if(dishWizardActive)renderDishWizard()}});
function deleteDish(){
  const id=$('#dish-id').value,dish=state.dishes.find(item=>item.id===id);
  if(!dish||!confirm(`„${dish.name}“ wirklich löschen? Das Rezept wird auch aus dem Wochenplan entfernt.`))return;
  void removeCatalogImportForDish(id);state.dishes=state.dishes.filter(item=>item.id!==id);
  Object.entries(state.plans).forEach(([week,days])=>days.forEach((day,dayIndexValue)=>{const pins=state.pinnedMeals?.[week]?.[dayIndexValue]||[];for(let i=day.length-1;i>=0;i--)if(day[i]===id){day.splice(i,1);pins.splice(i,1)}}));
  void removeDishProgressForCurrentScope(id);save();$('#dish-dialog').close();renderDishes();renderCalendar();showToast('Rezept gelöscht.');
}
$('#add-dish-btn').addEventListener('click',()=>openRecipeCreation(selectedRecipeType($('#dishes-type'))));$('#starter-add').addEventListener('click',()=>openRecipeCreation(selectedRecipeType($('#dishes-type'))));$('#search-dishes').addEventListener('input',renderDishes);$('#dishes-type').addEventListener('click',event=>{const button=event.target.closest('button[data-type]');if(!button)return;setRecipeTypeFilter($('#dishes-type'),button.dataset.type);renderDishes()});$('#close-dish-dialog').addEventListener('click',closeDishEditor);$('#cancel-dialog').addEventListener('click',closeDishEditor);$('#delete-dish').addEventListener('click',deleteDish);
$('#recipe-add-ingredient').addEventListener('click',()=>{const rows=[...$('#recipe-ingredient-rows').querySelectorAll('.recipe-ingredient-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-recipe-field]')].map(input=>[input.dataset.recipeField,input.value])));rows.push({name:'',amount:'',unit:'',note:''});recipeIngredientPage=rows.length-1;renderRecipeIngredientRows(rows);$('#recipe-ingredient-rows .recipe-ingredient-row:last-child input').focus()});
$('#recipe-add-step').addEventListener('click',()=>{const steps=[...$('#recipe-step-rows').querySelectorAll('[data-recipe-field="step"]')].map(input=>input.value);steps.push('');recipeStepPage=steps.length-1;renderRecipeStepRows(steps);$('#recipe-step-rows .recipe-step-row:last-child textarea').focus()});
$('#dish-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(dishWizardActive){const steps=dishWizardSteps();if(!dishWizardEditing&&dishWizardStep!==steps.length-1){if(validateDishWizardStep(steps[dishWizardStep].key)){dishWizardStep++;renderDishWizard({focus:true})}return}for(let step=0;step<steps.length;step++){if(!validateDishWizardStep(steps[step].key)){dishWizardStep=step;renderDishWizard();const error=$('#dish-form-error');error.tabIndex=-1;error.focus();return}}}
  const pendingIngredient=$('#dish-ingredient-input').value.trim();if(pendingIngredient)addDishIngredient(pendingIngredient);
  const id=$('#dish-id').value,name=$('#dish-recipe-title').value.trim(),type=selectedRecipeType($('#dish-type')),ingredient=$('#dish-ingredient').value.trim(),time=timeBlocks[Number($('#dish-time').value)]||30,nutrition=nutritionFromDishForm(),catalogMode=recipeEditorMode==='catalog';
  if(!name)return;
  let recipe;try{recipe=recipeEditorValue()}catch(error){$('#dish-form-error').textContent=error.message;$('#dish-form-error').hidden=false;return}
  const ingredients=cleanIngredients((recipe?.ingredients||[]).map(item=>item.name));
  const duplicate=!catalogMode&&state.dishes.find(d=>d.id!==id&&(d.name.trim().toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE')||dishFingerprint(d.name,d.ingredient,d.ingredients)===dishFingerprint(name,ingredient,ingredients)));
  if(duplicate){if(dishWizardActive){dishWizardStep=0;renderDishWizard()}const error=$('#dish-form-error');error.textContent=`Ähnliches Gericht existiert bereits: ${duplicate.name}`;error.hidden=false;if(dishWizardActive)$('#dish-recipe-title').focus();return}
  if(catalogMode){void saveCatalogDishDraft({id,name,type,ingredient,time,ingredients,recipe,nutrition});return}
  if(((dishImport&&dishImport.result.unassigned.length)||sectionImportHasUnreviewed())&&!confirm('Nicht zugeordnete oder nachträglich geänderte Inhalte aus dem Quelltext und noch nicht erkannte Screenshots werden nicht gespeichert. Rezept trotzdem speichern?'))return;
  const existing=state.dishes.find(d=>d.id===id);
  if(existing){const oldFingerprint=window.WochentischRecipes.fingerprint(existing);Object.assign(existing,{name,type,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️',nutrition,recipe});if(oldFingerprint!==window.WochentischRecipes.fingerprint(existing))void invalidateRecipeProgress(existing)}
  else state.dishes.push({id:newId(),name,type,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️',nutrition,recipe,catalogSourceId:null,catalogSourceVersion:null});
  save();$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-dialog').close();renderDishes();renderCalendar();if(savedView()==='cooking')renderCooking();showToast(existing?'Rezept aktualisiert.':'Rezept hinzugefügt.')
});
$('#catalog-btn').addEventListener('click',openCatalog);$('#close-catalog').addEventListener('click',event=>{event.preventDefault();const dialog=$('#catalog-dialog');if(dialog.open)dialog.close()});$('#catalog-dialog').addEventListener('click',event=>{if(event.target===$('#catalog-dialog'))$('#catalog-dialog').close()});
$('#sync-status-conflicts').addEventListener('click',openConflictReview);$('#close-conflicts').addEventListener('click',()=>$('#conflict-dialog').close());$('#conflict-cloud-all').addEventListener('click',takeCloudStateForAllConflicts);
window.addEventListener('wochentisch:update-ready',event=>showToast('Ein App-Update ist bereit. Deine lokalen Änderungen bleiben erhalten.',{actionLabel:'Jetzt aktualisieren',duration:12000,scopeBound:false,onAction:()=>window.activateWochentischUpdate?.(event.detail)}));
window.addEventListener('wochentisch:update-blocked',event=>showToast('Schließe zuerst die offene Eingabe. Danach kannst du das Update starten.',{actionLabel:'Jetzt aktualisieren',duration:20000,scopeBound:false,onAction:()=>window.activateWochentischUpdate?.(event.detail)}));
$('#close-chooser').addEventListener('click',()=>{const dialog=$('#choose-dialog');if(dialog.open)dialog.close()});$('#choose-dialog').addEventListener('click',event=>{if(event.target===$('#choose-dialog'))$('#choose-dialog').close()});
$('#note-close').addEventListener('click',()=>{state.noteHidden=true;$('#bottom-note').classList.add('hidden');save()});
if(state.noteHidden)$('#bottom-note').classList.add('hidden');updateCounts();

