const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))}
const navigation=section('function savedView()','function starterState()');
for(const view of ['week','dishes','shopping','cooking'])test(`session restores ${view}`,()=>{
  const context={localStorage:{getItem:()=>view},lastViewStorageKey:'view'};vm.runInNewContext(navigation,context);
  assert.equal(context.viewForSession(),view);
});
test('invalid or unavailable navigation storage falls back to the weekly plan',()=>{
  for(const getItem of [()=>null,()=>'<invalid>',()=>{throw Error('storage unavailable')}]){
    const context={localStorage:{getItem},lastViewStorageKey:'view'};vm.runInNewContext(navigation,context);assert.equal(context.viewForSession(),'week');
  }
});
test('cached startup renders the saved screen instead of resetting navigation',()=>{
  const elements=new Map(),calls=[];
  const context={$:selector=>{if(!elements.has(selector))elements.set(selector,{hidden:true,classList:{add(){}}});return elements.get(selector)},state:{},updateCounts(){},renderCalendar(){},viewForSession:()=> 'shopping',setView:view=>calls.push(view),appInitialized:false};
  vm.runInNewContext(section('function renderCachedApp(','function stopRealtimeChannel('),context);context.renderCachedApp();
  assert.deepEqual(calls,['shopping']);assert.equal(context.appInitialized,true);assert.equal(elements.get('#auth-gate').hidden,true);assert.equal(elements.get('.app-shell').hidden,false);
});
function bootContext(remembered=''){
  const calls=[];const context={initializeOfflineData:async()=>{},rememberedOfflineUser:()=>remembered,readUserState:async()=>({dishes:[]}),emptyState:()=>({dishes:[]}),loadOfflineQueues:async()=>{},startOfflineApp:()=>calls.push('offline'),refreshCatalogEditPermission:async()=>{},showLogin:()=>calls.push('login'),ensureAuthentication:async()=>calls.push('auth')};
  vm.runInNewContext(section('async function bootApplication()','void bootApplication();'),context);return {context,calls};
}
test('startup waits for initial authentication instead of flashing login before the session arrives',async()=>{
  const {context,calls}=bootContext();await context.bootApplication();assert.deepEqual(calls,['auth']);
});
test('remembered local data opens before authentication is checked',async()=>{
  const {context,calls}=bootContext('user');await context.bootApplication();assert.deepEqual(calls,['offline','auth']);assert.equal(context.currentUserId,'user');
});
test('signing out in another tab while local data loads cannot reveal the old user',async()=>{
  const {context,calls}=bootContext('user');context.readUserState=async()=>{context.rememberedOfflineUser=()=>'';return {dishes:[]}};
  await context.bootApplication();assert.deepEqual(calls,['login','auth']);assert.equal(context.currentUserId,undefined);
});
for(const result of ['success','offline','unavailable','failed'])test(`pull refresh ${result} finishes in place without a page reload`,async()=>{
  const indicators=[],timers=[];let reloads=0;
  const context={pullRefreshGesture:{dragging:true,distance:90},hasUnfinishedRefreshInput:()=>false,setPullRefreshIndicator:value=>indicators.push(value),refreshAppData:async()=>result,offlineStoreWriteQueue:Promise.resolve(),window:{setTimeout:fn=>timers.push(fn),location:{reload:()=>reloads++}},showToast(){},console,updateSyncStatus(){}};
  vm.runInNewContext(section('function finishPullRefresh()','function cancelPullRefresh()'),context);context.finishPullRefresh();await new Promise(setImmediate);
  assert.equal(indicators[0].refreshing,true);assert.equal(timers.length,1);timers[0]();assert.equal(indicators.at(-1),undefined);assert.equal(reloads,0);
});
test('pull refresh preserves unfinished inputs and skips the sync',()=>{
  let syncs=0;const context={pullRefreshGesture:{dragging:true,distance:90},hasUnfinishedRefreshInput:()=>true,setPullRefreshIndicator(){},showToast(){},refreshAppData:()=>syncs++};
  vm.runInNewContext(section('function finishPullRefresh()','function cancelPullRefresh()'),context);context.finishPullRefresh();assert.equal(syncs,0);
});
test('initially missing sessions still route to login while cached users remain offline',async()=>{
  for(const cached of [false,true]){
    const calls=[];const context={explicitSignOutPending:false,authScope:0,authUserLoad:null,closeFirstSync(){},stopRealtimeChannel(){},cloudReady:true,cloudBaseState:{},interactiveLoginPending:false,signInPromptActive:false,startOfflineApp:()=>{calls.push('offline');return cached},finishSignOut:()=>calls.push('login')};
    vm.runInNewContext(section('async function handleAuthStateChange(','async function initializeAuthentication('),context);await context.handleAuthStateChange('INITIAL_SESSION',null);
    assert.deepEqual(calls,cached?['offline']:['offline','login']);assert.equal(context.cloudReady,false);
  }
});
test('a failed local save ends the refresh and reports the storage error',async()=>{
  const statuses=[],timers=[],indicators=[];let rejectWrite;
  const pendingWrite=new Promise((resolve,reject)=>{rejectWrite=reject});
  const context={pullRefreshGesture:{dragging:true,distance:90},hasUnfinishedRefreshInput:()=>false,setPullRefreshIndicator:value=>indicators.push(value),refreshAppData:async()=> 'success',offlineStoreWriteQueue:pendingWrite,window:{setTimeout:fn=>timers.push(fn)},showToast(){},console:{error(){}},updateSyncStatus:(message,options)=>statuses.push({message,options})};
  vm.runInNewContext(section('function finishPullRefresh()','function cancelPullRefresh()'),context);context.finishPullRefresh();await Promise.resolve();rejectWrite(Error('disk full'));await new Promise(setImmediate);
  assert.equal(statuses.length,1);assert.equal(statuses[0].options.storageError,true);assert.equal(indicators.at(-1),undefined);assert.equal(timers.length,0);
});
