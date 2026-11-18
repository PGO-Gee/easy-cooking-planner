const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const model=require('../cooking-plan.js'),recipes=require('../recipe-model.js');
function fixture(){
 const dates=Array.from({length:7},(_,i)=>new Date(`2026-11-${String(9+i).padStart(2,'0')}T12:00:00`));let id=0;
 const ctx={structuredClone,window:{WochentischCookingPlan:model,WochentischRecipes:recipes},state:{dishes:[{id:'a',name:'A',type:'meal',ingredients:[],recipe:{servings:2}},{id:'fixed',name:'Fixed',type:'meal',ingredients:[],recipe:{servings:2}},{id:'cake',type:'baking',ingredients:[],recipe:{servings:8}}],plans:{},pinnedMeals:{},restDays:{},cookingEntries:{},planningSettings:{configured:true,adults:2,children:1,childFactor:.5,days:2}},
 rangeDates:()=>dates,keyFor:date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,mondayFor:date=>new Date(model.coordinates(ctx.keyFor(date)).week+'T12:00:00'),$:()=>({}),newId:()=>`generated-${++id}`,save(){},ingredientMatches:()=>false,manualItemKey:name=>name.toLowerCase()};
 ctx.planForDate=date=>{const {week,day}=model.coordinates(ctx.keyFor(date));return ctx.state.plans[week]?.[day]||[]};ctx.pinnedMealsForDate=date=>{const {week,day}=model.coordinates(ctx.keyFor(date));return ctx.state.pinnedMeals[week]?.[day]||[]};ctx.makePlan=(start,pantry,blocked)=>dates.map((d,i)=>blocked.has(i)?[]:['a']);
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../planning-ui.js'),'utf8'),ctx);ctx.readPlanningFields=()=>model.settings(ctx.state.planningSettings);return ctx;
}
test('automatic planning preserves a pinned day and its servings',()=>{
 const c=fixture();c.state=model.add(c.state,'fixed','2026-11-10',3,1,'pinned');c.state.pinnedMeals['2026-11-09'][1][0]=true;c.replaceCookingRange([]);
 assert.equal(model.entryAt(c.state,'2026-11-09',0).restDates.length,0);assert.equal(c.state.cookingEntries.pinned.portions,3);assert.equal(c.state.cookingEntries.pinned.pinned,true);assert.equal(model.entryAt(c.state,'2026-11-11',0).restDates.length,0);
});
test('a pinned day outside the visible range also truncates a new block',()=>{
 const c=fixture();c.state=model.add(c.state,'fixed','2026-11-16',2,1,'next-week-pin');c.state.pinnedMeals['2026-11-16'][0][0]=true;c.replaceCookingRange([]);assert.equal(model.entryAt(c.state,'2026-11-15',0).restDates.length,0);assert.equal(c.state.cookingEntries['next-week-pin'].date,'2026-11-16');
});
test('incoming leftovers protect the first visible day and baking survives planning',()=>{
 const c=fixture();c.state=model.add(c.state,'a','2026-11-08',2.5,2,'incoming');c.state=model.add(c.state,'cake','2026-11-10',8,1,'cake');c.replaceCookingRange([]);assert.equal(model.entryAt(c.state,'2026-11-09',0),undefined);assert.deepEqual(c.state.cookingEntries.incoming.restDates,['2026-11-09']);assert.equal(c.state.cookingEntries.cake.portions,8);assert.equal(Object.values(c.state.cookingEntries).filter(e=>e.date==='2026-11-10').length,2);
});
test('remix preserves an unpinned trial and its rest day',()=>{
 const c=fixture();
 c.state.dishes.push({id:'trial',name:'Trial',isTrial:true,ingredients:[]});
 c.state=model.add(c.state,'trial','2026-11-10',3,2,'trial-batch');
 c.replaceCookingRange([]);
 assert.equal(model.entryAt(c.state,'2026-11-10',0).id,'trial-batch');
 assert.equal(model.entryAt(c.state,'2026-11-10',1),undefined);
 assert.equal(model.entryAt(c.state,'2026-11-11',0),undefined);
 assert.deepEqual(c.state.cookingEntries['trial-batch'].restDates,['2026-11-11']);
});
test('removal deletes the trial only after its last occurrence and undo restores it',()=>{
 const c=fixture();
 c.state.dishes.push({id:'trial',name:'Trial',isTrial:true,trialSource:'Original'});
 c.state=model.add(c.state,'trial','2026-11-10',2,1,'first');
 c.state=model.add(c.state,'trial','2026-11-11',2,1,'second');
 c.state=model.remove(c.state,'first');
 assert.equal(c.state.dishes.find(dish=>dish.id==='trial').trialSource,'Original');
 c.renderCalendar=()=>{};
 c.sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 c.showToast=(message,options)=>{c.undo=options.onAction};
 assert(c.commitCookingChange(()=>model.remove(c.state,'second'),'Entfernt',{trialDishId:'trial'}));
 assert(!c.state.dishes.some(dish=>dish.id==='trial'));
 c.undo();
 assert.equal(c.state.dishes.find(dish=>dish.id==='trial').trialSource,'Original');
 assert.equal(c.state.cookingEntries.second.dishId,'trial');
});
test('one day per recipe plans seven cooking days without automatic leftovers',()=>{
 const c=fixture();c.state.planningSettings.days=1;c.replaceCookingRange([]);
 const entries=Object.values(c.state.cookingEntries);assert.equal(entries.length,7);assert(entries.every(e=>e.restDates.length===0));assert.deepEqual(c.state.restDays,{});
});
test('remixing ignores old custom portions and duration and uses the household for seven single days',()=>{
 const c=fixture();c.state.planningSettings.mode='custom';c.state.planningSettings.portions=9;c.replaceCookingRange([]);
 const entries=Object.values(c.state.cookingEntries);assert.equal(entries.length,7);assert(entries.every(e=>e.portions===2.5&&e.restDates.length===0));assert.equal(c.state.planningSettings.days,1);assert.equal(c.state.planningSettings.mode,'household');
});

test('replanning with one day removes leftovers from the previous two-day plan',()=>{
 const c=fixture();c.replaceCookingRange([]);c.state.planningSettings.days=1;c.replaceCookingRange([]);
 const entries=Object.values(c.state.cookingEntries);assert.equal(entries.length,7);assert(entries.every(e=>e.restDates.length===0));assert.deepEqual(c.state.restDays,{});
});
test('replanning replaces unlinked rest markers left in the selected range',()=>{
 const c=fixture();c.state.planningSettings.days=1;c.state.restDays={'2026-11-09':[1,3,5]};c.replaceCookingRange([]);
 assert.equal(Object.values(c.state.cookingEntries).length,7);assert.deepEqual(c.state.restDays,{});
});
test('replanning leaves independent rest days outside the selected range untouched',()=>{
 const c=fixture();c.state.planningSettings.days=1;c.state.restDays={'2026-11-09':[1,3,5],'2026-11-16':[2]};c.replaceCookingRange([]);
 assert.equal(Object.values(c.state.cookingEntries).length,7);assert.deepEqual(c.state.restDays,{'2026-11-16':[2]});
});
test('undo snapshots ignore empty weeks and padded false pin arrays added by sync',()=>{
 const c=fixture();c.replaceCookingRange([]);const beforeSync=c.cookingPlanSnapshot(c.state),afterSync=structuredClone(c.state);
 afterSync.plans['2026-11-23']=[[],[],[],[],[],[],[]];afterSync.pinnedMeals['2026-11-23']=[[],[],[],[],[],[],[]];afterSync.restDays['2026-11-23']=[];
 assert.deepEqual(c.cookingPlanSnapshot(afterSync),beforeSync);
 const changed=structuredClone(afterSync);Object.values(changed.cookingEntries)[0].portions=5;assert.notDeepEqual(c.cookingPlanSnapshot(changed),beforeSync);
});

function dragFixture(){
 const c=fixture(),app=fs.readFileSync(require.resolve('../app.js'),'utf8');
 Object.assign(c,{sameValue:(a,b)=>JSON.stringify(a)===JSON.stringify(b),renderCalendar:()=>Promise.resolve(true),showToast:(message,options)=>{c.lastToast={message,...options}},updateMealDropTarget(){},clearMealDragVisuals(){},animateMealDrop(){},suppressedMealOpenUntil:0,mealDragState:null});
 vm.runInContext(app.slice(app.indexOf('function moveMealToDropTarget('),app.indexOf('function animateMealDrop(')),c);
 vm.runInContext(app.slice(app.indexOf('function finishMealDrop('),app.indexOf('function finishMealPointerDrag(')),c);
 return c;
}
for(const activeWeekTarget of [true,false])test('drag undo restores every displaced block without duplicates (week target '+activeWeekTarget+')',()=>{
 const c=dragFixture();c.state=model.add(c.state,'a','2026-11-14',2.5,1,'source');c.state=model.add(c.state,'fixed','2026-11-15',3,2,'displaced');c.state=model.add(c.state,'a','2026-11-17',4,1,'following');
 const before=JSON.stringify(c.cookingPlanSnapshot(c.state));
 for(let attempt=0;attempt<3;attempt++){
  c.finishMealDrop({dragging:true,activeWeekTarget,sourceDay:5,targetDay:6,mealIndex:0,dishId:'a',ghost:null,clientX:0,clientY:0});
  assert.equal(c.state.cookingEntries.source.date,'2026-11-15');assert.equal(c.state.cookingEntries.displaced.date,'2026-11-16');assert.equal(c.state.cookingEntries.following.date,'2026-11-18');
  assert.equal(typeof c.lastToast.onAction,'function');c.lastToast.onAction();
  assert.equal(JSON.stringify(c.cookingPlanSnapshot(c.state)),before);assert.equal(Object.keys(c.state.cookingEntries).length,3);
 }
});
