const emojiMap={'Hühnchen':'🍗','Rind':'🥘','Fisch':'🐟','Schwein':'🥓','Wurst':'🌭','Vegetarisch':'🥦','Pasta':'🍝','Ei':'🍳'};
const shortDays=['MO','DI','MI','DO','FR','SA','SO'];
const timeBlocks=[15,30,45,60,90,120];
const $=s=>document.querySelector(s);
const supabaseConfig=window.WOCHENTISCH_SUPABASE;
const authClient=window.supabase?.createClient&&supabaseConfig?.url&&supabaseConfig?.publishableKey
  ?window.supabase.createClient(supabaseConfig.url,supabaseConfig.publishableKey)
  :null;
let state=loadState(); let weekOffset=0; let toastTimer;let pantryDraft=[];let dishIngredientDraft=[];
let appInitialized=false;
let appInitializationPromise;
let currentUserId='';
let currentHouseholdId='';
let cloudReady=false;
let cloudSyncTimer;
let cloudSyncInProgress=false;
let cloudSyncRequested=false;
let loadingCloudState=false;
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
function cloudMigrationKey(){return currentUserId?`wochentisch-cloud-migrated-${currentUserId}`:''}
function localStateOwnerKey(){return 'wochentisch-local-owner'}
function cloudBackupKey(){return currentUserId?`wochentisch-cloud-backup-${currentUserId}`:''}
function canUseLocalState(){const owner=localStorage.getItem(localStateOwnerKey());return !owner||owner===currentUserId}
function starterState(){return{dishes:[],plans:{},pantryIngredients:{},noteHidden:state.noteHidden,shoppingChecks:{},manualShoppingItems:{}}}
function saveCloudBackup(){if(currentUserId&&canUseLocalState()&&state.dishes.length)localStorage.setItem(cloudBackupKey(),JSON.stringify(state))}
function readCloudBackup(){try{const backup=JSON.parse(localStorage.getItem(cloudBackupKey()));return backup?.dishes?.length?backup:null}catch(error){return null}}
function cleanIngredients(ingredients){return Array.isArray(ingredients)?ingredients.filter(item=>typeof item==='string').map(normalizeIngredient).filter(Boolean):[]}
function cleanNutrition(nutrition){return nutrition&&typeof nutrition==='object'&&!Array.isArray(nutrition)?nutrition:null}
function cloudError(message){console.error(message);if(appInitialized)showToast('Änderung konnte nicht gespeichert werden. Bitte später erneut versuchen.')}
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
    authClient.from('weekly_plans').select('id, week_start, pantry_ingredients').eq('household_id',currentHouseholdId).order('week_start')
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
  const nextState={dishes:(dishesResult.data||[]).map(dish=>({
    id:dish.id,name:dish.name,ingredient:dish.ingredient,time:dish.cooking_time_minutes,
    emoji:dish.emoji,ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)
  })),plans:{},noteHidden:state.noteHidden,shoppingChecks:{},manualShoppingItems:{}};
  nextState.pantryIngredients={};
  const weekByPlanId=new Map();
  plans.forEach(plan=>{nextState.plans[plan.week_start]=Array.from({length:7},()=>[]);nextState.pantryIngredients[plan.week_start]=cleanIngredients(plan.pantry_ingredients);weekByPlanId.set(plan.id,plan.week_start)});
  meals.forEach(meal=>{const week=weekByPlanId.get(meal.weekly_plan_id);if(week&&nextState.plans[week][meal.day_of_week])nextState.plans[week][meal.day_of_week][meal.position]=meal.dish_id});
  Object.values(nextState.plans).forEach(days=>days.forEach((day,index)=>{days[index]=day.filter(Boolean)}));
  shoppingItems.forEach(item=>{const week=weekByPlanId.get(item.weekly_plan_id);if(week)(nextState.manualShoppingItems[week]??=[]).push(item.name)});
  shoppingChecks.forEach(item=>{const week=weekByPlanId.get(item.weekly_plan_id);if(week)(nextState.shoppingChecks[week]??={})[item.item_key]=true});
  return {state:nextState,hasCloudData:Boolean(dishesResult.data?.length||plans.length)};
}
async function syncStateToCloud(){
  if(!cloudReady||!currentHouseholdId)return;
  prepareLocalIdsForCloud();
  const currentState=structuredClone(state);
  const {data:oldPlans,error:oldPlansError}=await authClient.from('weekly_plans').select('id').eq('household_id',currentHouseholdId);
  if(oldPlansError)throw oldPlansError;
  const oldPlanIds=(oldPlans||[]).map(plan=>plan.id);
  if(oldPlanIds.length){
    const {error}=await authClient.from('weekly_plans').delete().in('id',oldPlanIds);
    if(error)throw error;
  }
  const {error:deleteDishesError}=await authClient.from('dishes').delete().eq('household_id',currentHouseholdId);
  if(deleteDishesError)throw deleteDishesError;
  if(currentState.dishes.length){
    const {error}=await authClient.from('dishes').insert(currentState.dishes.map(dish=>({
      id:dish.id,household_id:currentHouseholdId,name:dish.name,ingredient:dish.ingredient||'',
      cooking_time_minutes:Number(dish.time)||30,emoji:dish.emoji||'🍽️',ingredients:cleanIngredients(dish.ingredients),nutrition:cleanNutrition(dish.nutrition)
    })));
    if(error)throw error;
  }
  const planRows=Object.keys(currentState.plans).map(week_start=>({id:newId(),household_id:currentHouseholdId,week_start,pantry_ingredients:cleanIngredients(currentState.pantryIngredients?.[week_start])}));
  if(planRows.length){
    const {error}=await authClient.from('weekly_plans').insert(planRows);
    if(error)throw error;
  }
  const planByWeek=new Map(planRows.map(plan=>[plan.week_start,plan.id]));
  const mealRows=[];
  Object.entries(currentState.plans).forEach(([week,days])=>days.forEach((day,day_of_week)=>day.forEach((dish_id,position)=>mealRows.push({weekly_plan_id:planByWeek.get(week),dish_id,day_of_week,position}))));
  if(mealRows.length){const {error}=await authClient.from('planned_meals').insert(mealRows);if(error)throw error}
  const manualRows=[];
  Object.entries(currentState.manualShoppingItems||{}).forEach(([week,items])=>items.forEach(name=>manualRows.push({weekly_plan_id:planByWeek.get(week),name,normalized_name:normalizeIngredient(name).toLocaleLowerCase('de-DE')})));
  if(manualRows.length){const {error}=await authClient.from('shopping_items').insert(manualRows);if(error)throw error}
  const checkRows=[];
  Object.entries(currentState.shoppingChecks||{}).forEach(([week,checks])=>Object.entries(checks).filter(([,checked])=>checked).forEach(([item_key])=>checkRows.push({weekly_plan_id:planByWeek.get(week),item_key})));
  if(checkRows.length){const {error}=await authClient.from('shopping_item_checks').insert(checkRows);if(error)throw error}
}
function scheduleCloudSync(){
  if(!cloudReady||loadingCloudState)return;
  cloudSyncRequested=true;clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(flushCloudSync,350);
}
async function flushCloudSync(){
  if(cloudSyncInProgress||!cloudSyncRequested)return;
  cloudSyncInProgress=true;
  try{while(cloudSyncRequested){cloudSyncRequested=false;await syncStateToCloud()}}
  catch(error){cloudError(error)}
  finally{cloudSyncInProgress=false}
}
async function revealApp(){
  $('#auth-gate').hidden=true;
  $('.app-shell').hidden=false;
  if(appInitializationPromise)return appInitializationPromise;
  appInitializationPromise=(async()=>{
    try{
      currentHouseholdId=await getCurrentHousehold();
      const cloud=await readStateFromCloud(),migrationKey=cloudMigrationKey();
      cloudReady=true;
      saveCloudBackup();
      if(!cloud.hasCloudData){
        // Gerichte werden zentral in Supabase verwaltet. Lokale Gerichte werden
        // bei einem leeren Haushalt nicht automatisch wieder hochgeladen.
        state=starterState();
        await syncStateToCloud();
        localStorage.setItem(migrationKey,'true');
      }else state=cloud.state;
    }catch(error){cloudError(error);showAuthError('Die Datenbank ist gerade nicht erreichbar. Deine Änderungen werden vorübergehend nur auf diesem Gerät gespeichert.');}
    appInitialized=true;
    if(state.noteHidden)$('#bottom-note').classList.add('hidden');
    updateCounts();renderCalendar();
  })();
  return appInitializationPromise;
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
    currentHouseholdId=data;cloudReady=false;loadingCloudState=true;
    clearTimeout(cloudSyncTimer);cloudSyncRequested=false;
    $('#household-dialog').close();
    const cloud=await readStateFromCloud();state=cloud.state;cloudReady=true;
    save({sync:false});
    loadingCloudState=false;weekOffset=0;renderCalendar();
    showToast('Du bist dem Haushalt beigetreten.');
  }catch(error){
    loadingCloudState=false;console.error(error);
    householdError(/Invalid or expired join code/i.test(error.message)?'Der Code ist ungültig, abgelaufen oder wurde bereits verwendet.':'Beitritt fehlgeschlagen. Bitte prüfe den Code und versuche es erneut.');
  }finally{button.disabled=false}
});
function showLogin(){
  $('.app-shell').hidden=true;
  $('#auth-gate').hidden=false;
}
$('#password-sign-in').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!authClient){showAuthError('Die Anmeldung konnte nicht geladen werden. Bitte Seite neu laden.');return}
  const button=$('#password-sign-in-button');
  const email=$('#auth-email').value.trim();
  const password=$('#auth-password').value;
  button.disabled=true;showAuthError('');
  try{
    const {error}=await authClient.auth.signInWithPassword({
      email,
      password
    });
    if(error){showAuthError('E-Mail-Adresse oder Passwort sind nicht korrekt.');button.disabled=false}
  }catch(error){showAuthError('Anmeldung fehlgeschlagen. Bitte prüfe deine Internetverbindung.');button.disabled=false}
});
$('#sign-out').addEventListener('click',async()=>{
  const {error}=await authClient.auth.signOut();
  if(error)showToast(`Abmelden fehlgeschlagen: ${error.message}`);
});
if(authClient){
  authClient.auth.onAuthStateChange((_event,session)=>{if(session){currentUserId=session.user.id;revealApp()}else{currentUserId='';currentHouseholdId='';cloudReady=false;appInitialized=false;appInitializationPromise=undefined;showLogin()}});
  authClient.auth.getSession().then(({data,error})=>{
    if(error){showLogin();showAuthError(`Anmeldestatus konnte nicht geprüft werden: ${error.message}`)}
    else if(data.session){currentUserId=data.session.user.id;revealApp()}
    else showLogin();
  }).catch(()=>{showLogin();showAuthError('Supabase ist gerade nicht erreichbar. Bitte später erneut versuchen.')});
}else{
  showLogin();
  showAuthError('Supabase-Konfiguration fehlt. Bitte Projekt-URL und Publishable Key prüfen.');
}
function loadState(){try{const s=JSON.parse(localStorage.getItem('wochentisch-v1'));if(s&&Array.isArray(s.dishes)&&s.plans){s.pantryIngredients??={};return s}}catch(e){}return{dishes:[],plans:{},pantryIngredients:{},noteHidden:false,shoppingChecks:{},manualShoppingItems:{}}}
function save({sync=true}={}){localStorage.setItem('wochentisch-v1',JSON.stringify(state));if(currentUserId){localStorage.setItem(localStateOwnerKey(),currentUserId);saveCloudBackup()}updateCounts();if(sync)scheduleCloudSync()}
function updateCounts(){$('#dish-count').textContent=state.dishes.length;$('#dish-heading-count').textContent=state.dishes.length}
function mondayFor(offset=0){const d=new Date();d.setHours(0,0,0,0);const shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift+offset*7);return d}
function keyFor(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function getPlan(){const start=mondayFor(weekOffset),key=keyFor(start);if(!state.plans[key]){state.plans[key]=makePlan(start);save()}return state.plans[key]}
function ingredientKey(value){return normalizeIngredient(value).toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')}
function ingredientMatches(a,b){const forms=value=>{const key=ingredientKey(value),result=new Set([key]);if(/en$/.test(key))result.add(key.slice(0,-2));if(/n$/.test(key)||/e$/.test(key))result.add(key.slice(0,-1));return result};const first=forms(a),second=forms(b);return [...first].some(value=>value&&second.has(value))}
function availablePantryIngredients(){const values=new Map();[...(window.COMMON_INGREDIENTS||[]),...state.dishes.flatMap(dish=>dish.ingredients||[])].forEach(raw=>{const name=normalizeIngredient(raw),key=ingredientKey(name);if(name&&key&&!values.has(key))values.set(key,name)});return [...values.values()].sort((a,b)=>a.localeCompare(b,'de-DE'))}
function renderDishIngredientChips(){const chips=$('#dish-ingredient-chips');chips.replaceChildren();if(!dishIngredientDraft.length){const empty=document.createElement('p');empty.className='pantry-empty-selection';empty.textContent='Noch keine Zutaten ausgewählt.';chips.append(empty)}dishIngredientDraft.forEach(name=>{const chip=document.createElement('span');chip.className='pantry-chip';const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.type='button';remove.className='pantry-chip-remove';remove.setAttribute('aria-label',`${name} entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{dishIngredientDraft=dishIngredientDraft.filter(item=>ingredientKey(item)!==ingredientKey(name));$('#dish-ingredients').value=dishIngredientDraft.join(', ');renderDishIngredientChips();renderDishIngredientSuggestions()});chip.append(icon,label,remove);chips.append(chip)});$('#dish-ingredients').value=dishIngredientDraft.join(', ')}
function addDishIngredient(value){const name=normalizeIngredient(value);if(!name)return;if(!dishIngredientDraft.some(item=>ingredientKey(item)===ingredientKey(name)))dishIngredientDraft.push(name);$('#dish-ingredient-input').value='';renderDishIngredientChips();renderDishIngredientSuggestions();$('#dish-ingredient-input').focus({preventScroll:true})}
function renderDishIngredientSuggestions(){const input=$('#dish-ingredient-input'),list=$('#dish-ingredient-suggestions'),query=ingredientKey(input.value),selected=new Set(dishIngredientDraft.map(ingredientKey));const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)&&!selected.has(ingredientKey(name))).slice(0,60):[];renderIngredientOptions(list,matches,name=>addDishIngredient(name));input.setAttribute('aria-expanded',String(matches.length>0))}
function renderMainIngredientSuggestions(){const input=$('#dish-ingredient'),list=$('#dish-main-ingredient-suggestions'),query=ingredientKey(input.value);const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)).slice(0,8):[];renderIngredientOptions(list,matches,name=>{input.value=name;list.hidden=true;input.setAttribute('aria-expanded','false')});input.setAttribute('aria-expanded',String(matches.length>0))}
function renderIngredientOptions(list,matches,onSelect){list.replaceChildren();matches.forEach(name=>{const option=document.createElement('button');option.type='button';option.className='pantry-suggestion';option.role='option';option.setAttribute('aria-selected','false');const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;option.append(icon,label);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>onSelect(name));list.append(option)});list.hidden=!matches.length}
function addPantryIngredient(value){const name=normalizeIngredient(value);if(!name)return;const key=ingredientKey(name);if(!pantryDraft.some(item=>ingredientKey(item)===key))pantryDraft.push(name);$('#pantry-input').value='';renderPantryEditor();$('#pantry-input').focus()}
function openPantryPlanner(){const key=keyFor(mondayFor(weekOffset)),dialog=$('#pantry-dialog'),input=$('#pantry-input');pantryDraft=(state.pantryIngredients?.[key]||[]).slice();input.value='';try{if(!dialog.open)dialog.showModal();renderPantryEditor();requestAnimationFrame(()=>input.focus({preventScroll:true}))}catch(error){console.error('Wochenplan-Dialog konnte nicht geöffnet werden:',error);showToast('Der Wochenplan-Dialog konnte gerade nicht geöffnet werden. Bitte erneut versuchen.')}}
function renderPantryEditor(){const selected=$('#pantry-selected'),input=$('#pantry-input'),list=$('#pantry-suggestions'),query=ingredientKey(input.value);selected.replaceChildren();$('#pantry-selected-count').textContent=pantryDraft.length;$('#pantry-empty-selection').hidden=pantryDraft.length>0;pantryDraft.forEach(name=>{const chip=document.createElement('span');chip.className='pantry-chip';const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.type='button';remove.className='pantry-chip-remove';remove.setAttribute('aria-label',`${name} entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{pantryDraft=pantryDraft.filter(item=>ingredientKey(item)!==ingredientKey(name));renderPantryEditor()});chip.append(icon,label,remove);selected.append(chip)});const matches=query?availablePantryIngredients().filter(name=>ingredientKey(name).includes(query)&&!pantryDraft.some(item=>ingredientKey(item)===ingredientKey(name))).slice(0,8):[];list.replaceChildren();matches.forEach(name=>{const option=document.createElement('button');option.type='button';option.className='pantry-suggestion';option.role='option';option.setAttribute('aria-selected','false');const icon=document.createElement('span');icon.className='pantry-ingredient-icon';icon.setAttribute('aria-hidden','true');icon.textContent=ingredientIcon(name);const label=document.createElement('span');label.textContent=name;option.append(icon,label);option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>addPantryIngredient(name));list.append(option)});list.hidden=!matches.length;input.setAttribute('aria-expanded',String(matches.length>0));input.removeAttribute('aria-activedescendant')}
function makePlan(start,pantry=[]){const pool=shuffle(state.dishes.slice()),plan=[],prioritized=[],used=new Set();for(const item of pantry){const candidates=shuffle(pool.filter(d=>!used.has(d.id)&&(d.ingredients||[]).some(i=>ingredientMatches(item,i))));const dish=candidates[0];if(dish){prioritized.push(dish);used.add(dish.id)}}prioritized.forEach(d=>{const index=pool.findIndex(item=>item.id===d.id);if(index>=0)pool.splice(index,1)});pool.unshift(...prioritized);let last='';for(let i=0;i<7;i++){let idx=i<prioritized.length?0:pool.findIndex(d=>d.ingredient!==last);if(idx<0)idx=0;const dish=pool.splice(idx,1)[0];plan.push(dish?[dish.id]:[]);last=dish?.ingredient||'';if(!pool.length)pool.push(...shuffle(state.dishes.slice()))}return plan}
function pantryShoppingKeys(plan,pantry){const dishes=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));return [...new Set(dishes.flatMap(d=>(d.ingredients||[]).filter(i=>pantry.some(item=>ingredientMatches(item,i))).map(i=>normalizeIngredient(i).toLocaleLowerCase('de-DE'))))]}
function replaceWeekPlan(weekKey,pantry){const checks=state.shoppingChecks??={};checks[weekKey]??={};pantryShoppingKeys([state.dishes.map(d=>d.id)],state.pantryIngredients?.[weekKey]||[]).forEach(key=>delete checks[weekKey][key]);state.pantryIngredients??={};state.pantryIngredients[weekKey]=pantry;state.plans[weekKey]=makePlan(mondayFor(weekOffset),pantry);pantryShoppingKeys(state.plans[weekKey],pantry).forEach(key=>{checks[weekKey][key]=true});save()}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function formatRange(start){const end=new Date(start);end.setDate(end.getDate()+6);const opts={day:'numeric',month:'short'};const monthA=start.toLocaleDateString('de-DE',{month:'long'}),monthB=end.toLocaleDateString('de-DE',{month:'long'});return monthA===monthB?`${start.getDate()}. – ${end.getDate()}. ${monthA} ${end.getFullYear()}`:`${start.toLocaleDateString('de-DE',opts)} – ${end.toLocaleDateString('de-DE',opts)} ${end.getFullYear()}`}
function nutritionText(n){return n?`~${n.kcal} kcal · E ${n.protein} g · F ${n.fat} g · KH ${n.carbs} g / Portion`:''}
function renderCalendar({shuffleAnimation=false}={}){const start=mondayFor(weekOffset),plan=getPlan();$('#week-date').textContent=formatRange(start);$('#heading-period').textContent=`· ${start.toLocaleDateString('de-DE',{month:'long',year:'numeric'})}`;$('#nav-count').textContent=plan.reduce((n,x)=>n+x.length,0);$('#plan-meta').textContent=`${plan.reduce((n,x)=>n+x.length,0)} ${plan.reduce((n,x)=>n+x.length,0)===1?'Kochidee':'Kochideen'} geplant`;const today=keyFor(new Date());const grid=$('#calendar');grid.innerHTML='';for(let i=0;i<7;i++){const date=new Date(start);date.setDate(start.getDate()+i);const card=document.createElement('article');card.className='day-card'+(keyFor(date)===today?' today':'')+(shuffleAnimation?' shuffle-in':'');if(shuffleAnimation)card.style.setProperty('--shuffle-index',i);card.innerHTML=`<div class="day-head"><div><div class="day-name">${shortDays[i]}</div><div class="day-num">${date.getDate()} <span style="font:400 10px var(--sans);color:#a0a79e">${date.toLocaleDateString('de-DE',{month:'short'})}</span></div></div>${keyFor(date)===today?'<span class="today-pill">Heute</span>':''}</div><div class="day-content" data-day="${i}"></div>`;const content=card.querySelector('.day-content');plan[i].forEach((id,j)=>{const dish=state.dishes.find(d=>d.id===id);if(!dish)return;const meal=document.createElement('div');meal.className='meal-card';meal.innerHTML=`<button class="meal-remove" aria-label="Gericht entfernen">×</button><div class="meal-label">${j===0?'ABENDESSEN':j===1?'MITTAGESSEN':'WEITERE IDEE'}</div><div class="meal-title"><span class="meal-icon"></span><div class="meal-name"></div></div><div class="meal-meta"><span>◷ ${dish.time||25} min</span><span class="dot">·</span><span>${dish.ingredient||'Lieblingsgericht'}</span></div><div class="meal-nutrition"></div>`;meal.querySelector('.meal-icon').textContent=dish.emoji||emojiMap[dish.ingredient]||'🍽️';meal.querySelector('.meal-name').textContent=dish.name;meal.querySelector('.meal-nutrition').textContent=nutritionText(dish.nutrition);meal.querySelector('.meal-nutrition').hidden=!dish.nutrition;meal.querySelector('.meal-remove').addEventListener('click',e=>{e.stopPropagation();plan[i].splice(j,1);save();renderCalendar()});meal.addEventListener('click',()=>openDish(dish.id));content.append(meal)});const add=document.createElement('button');add.className='add-meal';add.textContent='＋ Gericht eintragen';add.addEventListener('click',()=>chooseDish(i));content.append(add);grid.append(card)}save({sync:false});$('#bottom-note').classList.toggle('hidden',state.noteHidden)}
function renderDishes(){const q=$('#search-dishes').value.trim().toLowerCase(),list=$('#dish-list');list.innerHTML='';const dishes=state.dishes.filter(d=>d.name.toLowerCase().includes(q)||String(d.ingredient||'').toLowerCase().includes(q)||(d.ingredients||[]).some(i=>i.toLowerCase().includes(q)));if(!dishes.length){list.innerHTML='<div class="empty-state"><b>Keine Gerichte gefunden.</b>Ändere die Suche oder füge ein Gericht hinzu.</div>';return}dishes.forEach(d=>{const row=document.createElement('div');row.className='dish-row';row.innerHTML=`<div class="dish-icon">${d.emoji||emojiMap[d.ingredient]||'🍽️'}</div><div class="dish-copy"><b></b><small>◷ ${d.time||25} Min. <span style="padding:0 5px;color:#d0d5cc">·</span> ${d.ingredient||'Ohne Angabe'}</small><small class="dish-nutrition"></small><small class="dish-ingredients-preview"></small></div><span class="dish-tag">${d.ingredient||'Ohne Kategorie'}</span><button class="row-edit" aria-label="Bearbeiten">···</button>`;row.querySelector('.dish-copy b').textContent=d.name;row.querySelector('.dish-nutrition').textContent=nutritionText(d.nutrition);row.querySelector('.dish-nutrition').hidden=!d.nutrition;row.querySelector('.dish-ingredients-preview').textContent=(d.ingredients||[]).join(' · ')||'Noch keine Zutaten';row.querySelector('.row-edit').addEventListener('click',()=>openDish(d.id));row.addEventListener('dblclick',()=>openDish(d.id));list.append(row)})}
function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}
function openDish(id=''){const d=state.dishes.find(x=>x.id===id),minutes=Number(d?.time)||30;let timeIndex=0;for(let i=1;i<timeBlocks.length;i++){if(Math.abs(timeBlocks[i]-minutes)<Math.abs(timeBlocks[timeIndex]-minutes))timeIndex=i}$('#dish-id').value=id;$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-name').value=d?.name||'';$('#dish-ingredient').value=d?.ingredient||'';$('#dish-main-ingredient-suggestions').hidden=true;dishIngredientDraft=(d?.ingredients||[]).slice();$('#dish-ingredient-input').value='';renderDishIngredientChips();renderDishIngredientSuggestions();$('#dish-time').value=timeIndex;$('#dish-time-output').textContent=`${timeBlocks[timeIndex]} Min.`;$('#dialog-title').textContent=d?'Gericht bearbeiten':'Gericht hinzufügen';$('#delete-dish').hidden=!d;$('#dish-dialog').showModal();setTimeout(()=>$('#dish-name').focus(),30)}
function normalizeIngredient(value){return value.trim().replace(/\s+/g,' ')}
function dishFingerprint(name,ingredient,ingredients){const normalizedName=name.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');const normalizedIngredients=[...new Set((ingredients||[]).map(normalizeIngredient).filter(Boolean).map(value=>value.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'')).filter(Boolean))].sort();return `${normalizedName}|${String(ingredient||'').toLocaleLowerCase('de-DE').trim()}|${normalizedIngredients.join(',')}`}
function ingredientIcon(name){const value=name.toLocaleLowerCase('de-DE');if(/saft|limonade|cola|wasser|sprudel|bier|wein|getränk/.test(value))return /bier/.test(value)?'🍺':/wein/.test(value)?'🍷':/wasser|sprudel/.test(value)?'💧':'🥤';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|zahnpasta/.test(value))return '🧴';if(/toilettenpapier|küchenrolle|taschentuch/.test(value))return '🧻';if(/hundefutter|katzenfutter|tierfutter|katzenstreu/.test(value))return '🐾';const icons=[[/paprika/,'🫑'],[/salat|kopfsalat|eisberg/,'🥬'],[/karotte|möhre/,'🥕'],[/brokkoli/,'🥦'],[/tomat/,'🍅'],[/gurke|zucchini/,'🥒'],[/zwiebel|lauch/,'🧅'],[/sellerie|spinat|kohl/,'🥬'],[/pilz|champignon/,'🍄'],[/knoblauch/,'🧄'],[/avocado/,'🥑'],[/kartoffel|pommes/,'🥔'],[/apfel/,'🍎'],[/birne/,'🍐'],[/banane/,'🍌'],[/orange/,'🍊'],[/zitrone|limette/,'🍋'],[/erdbeer/,'🍓'],[/himbeer|beere|blaubeer/,'🫐'],[/traube/,'🍇'],[/mango/,'🥭'],[/kaffee/,'☕'],[/tee/,'🫖'],[/wasser|sprudel/,'💧'],[/saft|limonade|cola|getränk/,'🥤'],[/bier/,'🍺'],[/wein/,'🍷'],[/reis|nudel|spaghetti|pasta/,'🍝'],[/prosciutto|speck/,'🥓'],[/wurst|würstchen/,'🌭'],[/hühnchen|hähnchen|chicken/,'🍗'],[/hackfleisch|fleisch|rind|schwein/,'🥩'],[/fisch|lachs|filet/,'🐟'],[/käse|mozzarella/,'🧀'],[/milch/,'🥛'],[/joghurt|schmand|soße|sauce/,'🥣'],[/brot|brötchen|baguette|toast|wrap|teig/,'🥖'],[/ei$|eier/,'🥚'],[/öl|olivenöl/,'🫒'],[/mehl|getreide/,'🌾'],[/honig/,'🍯'],[/dose|konserve/,'🥫'],[/gewürz|salz|pfeffer/,'🧂'],[/zucker|bonbon|schokolade/,'🍬'],[/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel/,'🧴'],[/toilettenpapier|küchenrolle|taschentuch/,'🧻'],[/müllbeutel|müllsack/,'🗑️'],[/hundefutter|katzenfutter|tierfutter|katzenstreu/,'🐾']];return icons.find(([pattern])=>pattern.test(value))?.[1]||'🛒'}
function ingredientCategory(name){const value=name.toLocaleLowerCase('de-DE');if(/orangensaft|apfelsaft|saft|limonade|cola|wasser|sprudel|bier|wein|getränk/.test(value))return 'Getränke';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|toilettenpapier|küchenrolle|taschentuch|müllbeutel|müllsack|schwamm|zahnpasta|windel/.test(value))return 'Drogerie & Haushalt';if(/hundefutter|katzenfutter|tierfutter|katzenstreu/.test(value))return 'Tierbedarf';if(/tomatensoße|tomatensauce|passierte tomaten/.test(value))return 'Vorrat';if(/apfel|birne|banane|orange|zitrone|limette|beere|erdbeer|himbeer|blaubeer|traube|mango|obst/.test(value))return 'Obst';if(/tomat|paprika|karotte|möhre|brokkoli|zucchini|gurke|salat|gemüse|zwiebel|sellerie|lauch|kohl|spinat|pilz|champignon|kartoffel|knoblauch|avocado/.test(value))return 'Gemüse';if(/brot|brötchen|baguette|toast|wrap|pizzateig|teig/.test(value))return 'Brot & Backwaren';if(/hühnchen|hähnchen|chicken|fleisch|hackfleisch|rind|schwein|würstchen|wurst|prosciutto|speck|fisch|lachs|filet/.test(value))return 'Fleisch & Fisch';if(/milch|käse|mozzarella|joghurt|schmand|quark|sahne|butter|ei$|eier/.test(value))return 'Kühlregal';if(/pommes|tiefkühl|tk-|gefroren/.test(value))return 'Tiefkühl';if(/wasser|sprudel|saft|limonade|cola|getränk|bier|wein/.test(value))return 'Getränke';if(/spülmittel|waschmittel|reiniger|shampoo|seife|putzmittel|toilettenpapier|küchenrolle|taschentuch|müllbeutel|müllsack|schwamm|zahnpasta/.test(value))return 'Drogerie & Haushalt';if(/reis|nudel|spaghetti|pasta|mehl|öl|essig|dose|konserve|passierte tomaten|tomatensoße|tomatensauce|gewürz|salz|zucker|brühe|kaffee|tee|müsli|haferflocken|honig|schokolade/.test(value))return 'Vorrat';return 'Sonstiges'}
function renderShoppingList(){
  const start=mondayFor(weekOffset),weekKey=keyFor(start),plan=getPlan(),selected=plan.flatMap(day=>day.map(id=>state.dishes.find(d=>d.id===id)).filter(Boolean));
  state.shoppingChecks??={};state.shoppingChecks[weekKey]??={};state.manualShoppingItems??={};state.manualShoppingItems[weekKey]??=[];
  const filterSelect=$('#shopping-meal-filter'),previousFilter=filterSelect.value,mealNames=[...new Set(selected.map(d=>d.name))].sort((a,b)=>a.localeCompare(b,'de')),manualItems=state.manualShoppingItems[weekKey];
  $('#shopping-period').textContent=formatRange(start);filterSelect.replaceChildren(new Option('Alle Mahlzeiten',''));
  if(mealNames.length){const dishesGroup=document.createElement('optgroup');dishesGroup.label='Gerichte';mealNames.forEach(name=>dishesGroup.append(new Option(name,name)));filterSelect.append(dishesGroup)}
  if(manualItems.length){const manualGroup=document.createElement('optgroup');manualGroup.label='Manuelle Eingaben';manualGroup.append(new Option('Keinem Gericht zugeordnet','__manual__'));filterSelect.append(manualGroup)}
  filterSelect.value=mealNames.includes(previousFilter)||previousFilter==='__manual__'&&manualItems.length?previousFilter:'';
  const activeFilter=filterSelect.value,visible=activeFilter==='__manual__'?[]:activeFilter?selected.filter(d=>d.name===activeFilter):selected,counts=new Map();
  $('#shopping-overview').classList.toggle('hidden',!activeFilter);
  visible.forEach(d=>(d.ingredients||[]).forEach(raw=>{const name=normalizeIngredient(raw);if(name){const key=name.toLocaleLowerCase('de-DE');if(!counts.has(key))counts.set(key,{name,dishes:new Set(),manual:false});counts.get(key).dishes.add(d.name)}}));
  if(!activeFilter||activeFilter==='__manual__')manualItems.forEach(name=>{const key=name.toLocaleLowerCase('de-DE'),relatedDishes=new Set(selected.filter(d=>(d.ingredients||[]).some(raw=>normalizeIngredient(raw).toLocaleLowerCase('de-DE')===key)).map(d=>d.name));if(!counts.has(key))counts.set(key,{name,dishes:relatedDishes,manual:true});else counts.get(key).manual=true});
  const open=$('#shopping-open'),done=$('#shopping-done'),empty=$('#shopping-empty');open.replaceChildren();done.replaceChildren();empty.classList.toggle('hidden',counts.size>0);empty.textContent=activeFilter==='__manual__'?'Noch keine manuellen Artikel hinzugefügt.':activeFilter?'Für dieses Gericht sind keine Zutaten eingetragen.':selected.length?'Für die geplanten Gerichte sind keine Zutaten eingetragen.':'Für diese Woche sind keine Gerichte geplant. Du kannst unten eigene Artikel hinzufügen.';
  const categoryOrder=['Gemüse','Obst','Brot & Backwaren','Fleisch & Fisch','Kühlregal','Tiefkühl','Getränke','Vorrat','Drogerie & Haushalt','Tierbedarf','Sonstiges'],grouped=new Map();
  for(const item of counts.values()){const category=ingredientCategory(item.name);if(!grouped.has(category))grouped.set(category,[]);grouped.get(category).push(item)}
  for(const category of categoryOrder){const items=grouped.get(category);if(!items?.length)continue;for(const container of [open,done]){const categoryItems=items.filter(item=>{const key=item.name.toLocaleLowerCase('de-DE'),checkKey=item.dishes.size?key:`manual:${key}`;return Boolean(state.shoppingChecks[weekKey][checkKey])===(container===done)});if(!categoryItems.length)continue;const heading=document.createElement('h3');heading.className='shopping-category-title';heading.textContent=category;container.append(heading);
    for(const item of categoryItems.sort((a,b)=>a.name.localeCompare(b.name,'de'))){const {name,dishes,manual}=item,key=name.toLocaleLowerCase('de-DE'),checked=container===done,checkKey=dishes.size?key:`manual:${key}`,shell=document.createElement(manual?'div':'button'),tile=manual?document.createElement('button'):shell;tile.type='button';tile.className=`shopping-tile${checked?' is-checked':''}`;tile.setAttribute('aria-pressed',String(checked));tile.dataset.ingredient=key;tile.innerHTML=`<span class="shopping-tile-icon" aria-hidden="true">${ingredientIcon(name)}</span><span class="shopping-tile-copy"><strong></strong><small></small></span>${checked?'<span class="shopping-tile-status" aria-label="Eingekauft">✓</span>':''}`;tile.querySelector('strong').textContent=name;tile.querySelector('small').textContent=dishes.size?[...dishes].join(', ')+(manual?' · Manuelle Eingabe':''):'Keinem Gericht zugeordnet';
      tile.addEventListener('click',()=>{const checking=!checked;tile.classList.add(checking?'is-completing':'is-unchecking');setTimeout(()=>{state.shoppingChecks[weekKey][checkKey]=checking;save();renderShoppingList();const target=[...document.querySelectorAll(`#shopping-${checking?'done':'open'} .shopping-tile`)].find(candidate=>candidate.dataset.ingredient===key);target?.classList.add(checking?'just-checked':'just-unchecked')},180)});
      if(manual){shell.className='shopping-tile-shell';shell.append(tile);const remove=document.createElement('button');remove.type='button';remove.className='shopping-tile-remove';remove.setAttribute('aria-label',`${name} aus dem Einkaufszettel entfernen`);remove.textContent='×';remove.addEventListener('click',()=>{state.manualShoppingItems[weekKey]=manualItems.filter(itemName=>itemName.toLocaleLowerCase('de-DE')!==key);if(!dishes.size)delete state.shoppingChecks[weekKey][checkKey];save();renderShoppingList()});shell.append(remove);container.append(shell)}else container.append(tile)
    }
  }}
  $('#shopping-open-count').textContent=`(${open.querySelectorAll('.shopping-tile').length})`;$('#shopping-done-count').textContent=`(${done.querySelectorAll('.shopping-tile').length})`;save()
}
function openShoppingList(){setView('shopping');renderShoppingList()}
function chooseDish(day){const list=$('#choose-dish-list');list.replaceChildren();if(!state.dishes.length){const message=document.createElement('p');message.className='empty-state';message.textContent='Noch keine Gerichte vorhanden.';const add=document.createElement('button');add.className='primary-button';add.textContent='Gericht hinzufügen';add.addEventListener('click',()=>{$('#choose-dialog').close();openDish()});list.append(message,add)}else{state.dishes.forEach(d=>{const button=document.createElement('button');button.type='button';button.className='choose-item';const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=d.emoji||emojiMap[d.ingredient]||'🍽️';const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=d.name;const details=document.createElement('small');details.textContent=`${d.time||25} Min. · ${d.ingredient||'Ohne Kategorie'}`;copy.append(name,details);button.append(icon,copy);button.addEventListener('click',()=>{getPlan()[day].push(d.id);save();$('#choose-dialog').close();renderCalendar()});list.append(button)})}$('#choose-dialog').showModal()}
function showCatalogFeedback(text){const feedback=$('#catalog-feedback');feedback.textContent=text;feedback.hidden=false}
async function adoptCatalogDishes(dishes){const existingNames=new Set(state.dishes.map(d=>d.name.toLocaleLowerCase('de-DE'))),pending=dishes.filter(d=>!existingNames.has(d.name.toLocaleLowerCase('de-DE')));if(!pending.length){showCatalogFeedback('Alle Standardgerichte sind bereits übernommen.');return}const button=$('#catalog-add-all');button.disabled=true;button.textContent='Wird übernommen …';let added=0;try{for(const dish of pending){const {error}=await authClient.rpc('add_catalog_dish_to_household',{catalog_id:dish.id});if(error)throw error;added++}const cloud=await readStateFromCloud();state=cloud.state;save({sync:false});renderDishes();renderCalendar();showCatalogFeedback(`${added} ${added===1?'Gericht':'Gerichte'} übernommen.`);openCatalog()}catch(error){console.error('Standardgerichte konnten nicht vollständig übernommen werden:',error);showCatalogFeedback(`${added} übernommen, danach Fehler: ${error.message||'Unbekannter Fehler'}`);button.disabled=false;button.textContent='Alles übernehmen'}}
async function openCatalog(){const dialog=$('#catalog-dialog'),list=$('#catalog-list');$('#catalog-feedback').hidden=true;list.innerHTML='<p class="empty-state">Standardkatalog wird geladen …</p>';dialog.showModal();try{if(!authClient)throw new Error('Supabase ist nicht initialisiert.');const {data,error}=await authClient.from('catalog_dishes').select('*').order('name');if(error)throw error;const dishes=data||[];list.replaceChildren();const ownNames=new Set(state.dishes.map(d=>d.name.toLocaleLowerCase('de-DE'))),addAll=$('#catalog-add-all'),available=dishes.filter(d=>!ownNames.has(d.name.toLocaleLowerCase('de-DE'))).length;addAll.disabled=!available;addAll.textContent=available?'Alles übernehmen':'Alles bereits übernommen';addAll.onclick=()=>adoptCatalogDishes(dishes);dishes.forEach(d=>{const button=document.createElement('button');button.type='button';button.className='choose-item';const icon=document.createElement('span');icon.className='choose-icon';icon.textContent=d.emoji||emojiMap[d.ingredient]||'🍽️';const copy=document.createElement('span');copy.className='choose-copy';const name=document.createElement('b');name.textContent=d.name;const details=document.createElement('small');details.textContent=ownNames.has(d.name.toLocaleLowerCase('de-DE'))?'Bereits hinzugefügt':`${d.ingredient||'Ohne Kategorie'} · ${d.cooking_time_minutes||30} Min.`;copy.append(name,details);button.append(icon,copy);button.disabled=ownNames.has(d.name.toLocaleLowerCase('de-DE'));button.addEventListener('click',async()=>{button.disabled=true;try{const result=await authClient.rpc('add_catalog_dish_to_household',{catalog_id:d.id});if(result.error)throw result.error;const cloud=await readStateFromCloud();state=cloud.state;save({sync:false});renderDishes();renderCalendar();details.textContent='Bereits hinzugefügt';showCatalogFeedback(`${d.name} wurde hinzugefügt.`)}catch(error){console.error('Kataloggericht konnte nicht übernommen werden:',error);showCatalogFeedback(`${d.name} konnte nicht übernommen werden: ${error.message||'Unbekannter Datenbankfehler'}`);button.disabled=false}});list.append(button)});if(!dishes.length)list.innerHTML='<p class="empty-state">Der Standardkatalog ist noch leer.</p>'}catch(error){console.error('Standardkatalog konnte nicht geladen werden:',error);list.innerHTML='';const message=document.createElement('p');message.className='empty-state';message.textContent=`Standardkatalog konnte nicht geladen werden: ${error.message||'Unbekannter Fehler'}`;list.append(message)}}
function setView(view){const views={week:'#week-view',dishes:'#dishes-view',shopping:'#shopping-view'};Object.entries(views).forEach(([name,selector])=>$(selector).classList.toggle('hidden',name!==view));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#crumb-view').textContent=view==='week'?'Wochenplan':view==='dishes'?'Meine Gerichte':'Einkaufszettel';if(view==='dishes')renderDishes();if(view==='shopping')renderShoppingList()}
function closeMobileMenu(){$('#sidebar').classList.remove('mobile-open');$('#menu-backdrop').hidden=true;$('#menu-toggle').setAttribute('aria-expanded','false');$('#menu-toggle').setAttribute('aria-label','Menü öffnen')}
function toggleMobileMenu(){const open=$('#sidebar').classList.toggle('mobile-open');$('#menu-backdrop').hidden=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));$('#menu-toggle').setAttribute('aria-label',open?'Menü schließen':'Menü öffnen')}
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');let themeOverride=null;
function updateThemeButton(){const button=$('#theme-toggle');const label=themeOverride?'Systemmodus verwenden':systemTheme.matches?'Hellmodus testen':'Dunkelmodus testen';button.textContent=themeOverride?'↻':systemTheme.matches?'☀':'☾';button.setAttribute('aria-label',label);button.title=label}
function applyTheme(){const link=$('#theme-stylesheet');link.media=themeOverride?(themeOverride==='dark'?'all':'not all'):'(prefers-color-scheme: dark)';updateThemeButton()}
function toggleTheme(){themeOverride=themeOverride?null:systemTheme.matches?'light':'dark';applyTheme()}
function exportDishes(){const data={format:'wochentisch-dishes',version:1,exportedAt:new Date().toISOString(),dishes:state.dishes};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wochentisch-gerichte.json';a.click();URL.revokeObjectURL(a.href);showToast('Gerichte wurden exportiert.')}
function importDishes(file){const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result),incoming=Array.isArray(data)?data:data.dishes;if(!Array.isArray(incoming))throw Error();let added=0;incoming.forEach(raw=>{if(!raw||typeof raw.name!=='string'||!raw.name.trim())return;if(state.dishes.some(d=>d.name.toLowerCase()===raw.name.trim().toLowerCase()))return;state.dishes.push({id:crypto.randomUUID?.()||`d${Date.now()}${Math.random()}`,name:raw.name.trim(),ingredient:typeof raw.ingredient==='string'?raw.ingredient:'',time:Number(raw.time)||25,emoji:raw.emoji||emojiMap[raw.ingredient]||'🍽️',ingredients:cleanIngredients(raw.ingredients),nutrition:cleanNutrition(raw.nutrition)});added++});save();renderDishes();showToast(added?`${added} ${added===1?'Gericht':'Gerichte'} importiert.`:'Keine neuen Gerichte gefunden.')}catch(e){showToast('Die Datei konnte nicht gelesen werden. Bitte JSON prüfen.')}};reader.readAsText(file)}
$('#theme-toggle').addEventListener('click',toggleTheme);systemTheme.addEventListener('change',()=>{if(!themeOverride)updateThemeButton()});applyTheme();$('#menu-toggle').addEventListener('click',toggleMobileMenu);$('#menu-backdrop').addEventListener('click',closeMobileMenu);document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view);closeMobileMenu()}));$('#shopping-btn').addEventListener('click',openShoppingList);$('#shopping-back').addEventListener('click',()=>setView('week'));$('#shopping-print').addEventListener('click',()=>window.print());$('#shopping-meal-filter').addEventListener('change',renderShoppingList);$('#shopping-add-form').addEventListener('submit',e=>{e.preventDefault();const name=normalizeIngredient($('#shopping-item-input').value);if(!name)return;const start=mondayFor(weekOffset),weekKey=keyFor(start);state.manualShoppingItems??={};state.manualShoppingItems[weekKey]??=[];const duplicate=state.manualShoppingItems[weekKey].some(item=>item.toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE'));if(duplicate){showToast('Dieser Artikel steht bereits auf dem Einkaufszettel.');return}state.manualShoppingItems[weekKey].push(name);save();$('#shopping-item-input').value='';$('#shopping-meal-filter').value='';renderShoppingList();$('#shopping-item-input').focus()});$('#shopping-overview').addEventListener('click',()=>{$('#shopping-meal-filter').value='';renderShoppingList()});
$('#dish-ingredient-input').addEventListener('input',renderDishIngredientSuggestions);$('#dish-ingredient-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const value=normalizeIngredient(event.currentTarget.value);if(value)addDishIngredient(value)});
$('#dish-ingredient').addEventListener('input',renderMainIngredientSuggestions);$('#dish-ingredient').addEventListener('keydown',event=>{if(event.key==='Enter'&& !$('#dish-main-ingredient-suggestions').hidden){event.preventDefault();$('#dish-main-ingredient-suggestions').querySelector('.pantry-suggestion')?.click()}});
$('#dish-time').addEventListener('input',event=>{$('#dish-time-output').textContent=`${timeBlocks[Number(event.currentTarget.value)]||30} Min.`});
$('#mix-btn').addEventListener('click',openPantryPlanner);
$('#pantry-close').addEventListener('click',()=>$('#pantry-dialog').close());
$('#pantry-cancel').addEventListener('click',()=>$('#pantry-dialog').close());
$('#pantry-input').addEventListener('input',renderPantryEditor);
$('#pantry-input').addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const value=normalizeIngredient(event.currentTarget.value);if(!value){$('#pantry-form').requestSubmit();return}const suggestion=availablePantryIngredients().find(name=>ingredientKey(name).startsWith(ingredientKey(value))&&!pantryDraft.some(item=>ingredientKey(item)===ingredientKey(name)));addPantryIngredient(suggestion||value)});
$('#pantry-form').addEventListener('submit',event=>{event.preventDefault();const key=keyFor(mondayFor(weekOffset)),pantry=pantryDraft.slice(),unmatched=pantry.filter(item=>!state.dishes.some(d=>(d.ingredients||[]).some(i=>ingredientMatches(item,i))));replaceWeekPlan(key,pantry);$('#pantry-dialog').close();renderCalendar({shuffleAnimation:true});showToast(unmatched.length?`Woche gemischt. Keine passenden Gerichte für: ${unmatched.join(', ')}`:'Deine Woche wurde neu gemischt.')});
$('#add-dish-btn').addEventListener('click',()=>openDish());$('#starter-add').addEventListener('click',()=>openDish());$('#search-dishes').addEventListener('input',renderDishes);$('#export-btn').addEventListener('click',exportDishes);$('#import-btn').addEventListener('click',()=>$('#import-file').click());$('#import-file').addEventListener('change',e=>{if(e.target.files[0])importDishes(e.target.files[0]);e.target.value=''});$('#close-dish-dialog').addEventListener('click',()=>$('#dish-dialog').close());$('#cancel-dialog').addEventListener('click',()=>$('#dish-dialog').close());$('#delete-dish').addEventListener('click',()=>{const id=$('#dish-id').value;if(!id)return;state.dishes=state.dishes.filter(d=>d.id!==id);Object.values(state.plans).forEach(p=>p.forEach(day=>{let i=day.indexOf(id);while(i!==-1){day.splice(i,1);i=day.indexOf(id)}}));save();$('#dish-dialog').close();renderDishes();renderCalendar();showToast('Gericht gelöscht.')});$('#dish-form').addEventListener('submit',e=>{e.preventDefault();const pendingIngredient=$('#dish-ingredient-input').value.trim();if(pendingIngredient)addDishIngredient(pendingIngredient);const id=$('#dish-id').value,name=$('#dish-name').value.trim(),ingredient=$('#dish-ingredient').value.trim(),time=timeBlocks[Number($('#dish-time').value)]||30,ingredients=dishIngredientDraft.slice();if(!name)return;const duplicate=state.dishes.find(d=>d.id!==id&&(d.name.trim().toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE')||dishFingerprint(d.name,d.ingredient,d.ingredients)===dishFingerprint(name,ingredient,ingredients)));if(duplicate){const error=$('#dish-form-error');error.textContent=`Ähnliches Gericht existiert bereits: ${duplicate.name}`;error.hidden=false;return}const existing=state.dishes.find(d=>d.id===id);if(existing)Object.assign(existing,{name,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️'});else state.dishes.push({id:crypto.randomUUID?.()||`d${Date.now()}`,name,ingredient,time,ingredients,emoji:emojiMap[ingredient]||'🍽️'});save();$('#dish-form-error').hidden=true;$('#dish-form-error').textContent='';$('#dish-dialog').close();renderDishes();renderCalendar();showToast(existing?'Gericht aktualisiert.':'Gericht hinzugefügt.')});
$('#catalog-btn').addEventListener('click',openCatalog);$('#close-catalog').addEventListener('click',()=>$('#catalog-dialog').close());
if(state.noteHidden)$('#bottom-note').classList.add('hidden');updateCounts();renderCalendar();

