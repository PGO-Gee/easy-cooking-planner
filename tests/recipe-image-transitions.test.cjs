const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))}
const preparation=extract('function prepareRecipePhoto(','\nfunction recipePhoto(');
function element(){
  const selectors=new Map(),classes=new Set();
  return{children:[],attributes:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(){}},
    style:{setProperty(){}},dataset:{},append(child){this.children.push(child)},
    replaceChildren(child){this.children=[child]},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},
    addEventListener(){},before(node){this.beforeNode=node},remove(){this.removed=true},
    querySelector(selector){if(!selectors.has(selector))selectors.set(selector,element());return selectors.get(selector)}};
}
function calendar(){
  const elements=new Map(),photos=[];
  const context={calendarRenderSequence:0,authScope:1,currentHouseholdId:'household',renderedCalendarSnapshot:null,
    state:{dishes:[{id:'pasta',name:'Pasta'}]},version:1,
    document:{createElement:element,createDocumentFragment:element},
    $:selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)},
    rangeStart:()=>new Date(2026,10,12),planDaysInRange:()=>[{date:new Date(2026,10,12),day:['pasta'],isRest:false}],
    calendarStateForRange:()=>context.version,sameValue:(a,b)=>a===b,
    formatRange:()=>'',keyFor:date=>date.toDateString(),shortDays:['Mo','Di','Mi','Do','Fr','Sa','So'],dayIndex:()=>3,
    pinnedMealsForDate:()=>[],emojiMap:{},nutritionText:()=>'',updateShoppingNavCount(){},
    setTimeout,clearTimeout,
    recipePhoto:()=>{const pending=deferred(),photo=element();photo.decode=()=>pending.promise;photos.push({photo,...pending});return photo;},
  };
  vm.runInNewContext(preparation+'\n'+extract('async function renderCalendarContent(','\nfunction renderCalendar(options)'),context);
  const grid=context.$('#calendar'),old=element();grid.append(old);
  return{context,grid,old,photos};
}

test('the old plan stays visible until the exact replacement photo has decoded',async()=>{
  const {context,grid,old,photos}=calendar();
  const pending=context.renderCalendarContent({shuffleAnimation:true});
  assert.equal(grid.children[0],old);
  assert.equal(grid.inert,true);
  assert.equal(context.renderedCalendarSnapshot,null);
  photos[0].resolve();
  assert.equal(await pending,true);
  assert.notEqual(grid.children[0],old);
  assert.equal(grid.inert,false);
  assert.equal(context.renderedCalendarSnapshot,1);
  const meal=grid.children[0].children[0].querySelector('.day-content').children[0];
  assert.equal(meal.querySelector('.meal-title').beforeNode,photos[0].photo);
});

test('a slow earlier plan cannot replace a newer completed render',async()=>{
  const {context,grid,photos}=calendar();
  const first=context.renderCalendarContent();
  context.version=2;
  const second=context.renderCalendarContent();
  photos[1].resolve();await second;
  const latest=grid.children[0];
  photos[0].resolve();assert.equal(await first,false);
  assert.equal(grid.children[0],latest);
  assert.equal(context.renderedCalendarSnapshot,2);
});

test('failed photos show the existing emoji fallback when the plan is committed',async()=>{
  const {context,grid,photos}=calendar();
  const pending=context.renderCalendarContent();
  photos[0].reject(Error('404'));
  assert.equal(await pending,true);
  const meal=grid.children[0].children[0].querySelector('.day-content').children[0];
  assert.equal(photos[0].photo.removed,true);
  assert.equal(meal.querySelector('.meal-icon').classList.contains('hidden'),false);
});

test('a household change prevents committing the pending plan',async()=>{
  const {context,grid,old,photos}=calendar();
  const pending=context.renderCalendarContent();context.currentHouseholdId='other';
  photos[0].resolve();assert.equal(await pending,false);
  assert.equal(grid.children[0],old);
  assert.equal(grid.inert,false);
});

test('a stalled image has a bounded wait and is reported as unavailable',async()=>{
  let timeout,cleared=false;
  const context={setTimeout:callback=>{timeout=callback;return 1},clearTimeout:()=>{cleared=true}};
  vm.runInNewContext(preparation,context);
  const decode=deferred();const pending=context.prepareRecipePhoto({decode:()=>decode.promise});
  timeout();assert.equal(await pending,false);
  decode.resolve();await Promise.resolve();assert.equal(cleared,true);
  assert.equal(await context.prepareRecipePhoto(null),false);
});

function recipe(){
  const pending=deferred(),photo={decode:()=>pending.promise},renders=[],views=[];
  const context={recipeOpenSequence:0,authScope:1,currentHouseholdId:'household',state:{dishes:[{id:'pasta',recipe:{servings:4}}]},
    selectedRecipeDishId:'',cookingProgress:null,recipeDetailPreviousView:'',recipeReturnScroll:0,selectedCookServings:2,cookingStage:'list',
    recipePhoto:()=>photo,loadCookingProgress:async()=>null,setTimeout,clearTimeout,
    setView:view=>{context.recipeOpenSequence++;views.push(view)},renderCooking:options=>renders.push(options),window:{scrollY:100,scrollTo(){}}};
  vm.runInNewContext(preparation+'\n'+extract('async function openRecipe(','\nfunction renderRecipeOverview('),context);
  return{context,pending,photo,renders,views};
}

test('recipe navigation waits for decoding and renders the prepared image node',async()=>{
  const {context,pending,photo,renders,views}=recipe();
  const opening=context.openRecipe('pasta',{from:'week'});
  assert.equal(views.length,0);assert.equal(context.selectedRecipeDishId,'');
  pending.resolve();await opening;
  assert.deepEqual(views,['cooking']);assert.equal(renders[0].photo,photo);
  assert.equal(context.selectedCookServings,4);
});

test('navigation away cancels a pending recipe opening',async()=>{
  const {context,pending,renders,views}=recipe();
  const opening=context.openRecipe('pasta');context.setView('shopping');
  pending.resolve();await opening;
  assert.deepEqual(views,['shopping']);assert.equal(renders.length,0);
});
