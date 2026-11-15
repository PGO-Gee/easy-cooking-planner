const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const model=require('../cooking-plan.js'),recipes=require('../recipe-model.js');
function fixture(){
 const dates=Array.from({length:7},(_,i)=>new Date(`2026-11-${String(9+i).padStart(2,'0')}T12:00:00`));let id=0;
 const ctx={structuredClone,window:{WochentischCookingPlan:model,WochentischRecipes:recipes},state:{dishes:[{id:'a',name:'A',type:'meal',ingredients:[],recipe:{servings:2}},{id:'fixed',name:'Fixed',type:'meal',ingredients:[],recipe:{servings:2}},{id:'cake',type:'baking',ingredients:[],recipe:{servings:8}}],plans:{},pinnedMeals:{},restDays:{},cookingEntries:{},planningSettings:{configured:true,adults:2,children:1,childFactor:.5,days:2}},
 rangeDates:()=>dates,keyFor:date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,mondayFor:date=>new Date(model.coordinates(ctx.keyFor(date)).week+'T12:00:00'),$:()=>({}),newId:()=>`generated-${++id}`,save(){},ingredientMatches:()=>false,manualItemKey:name=>name.toLowerCase()};
 ctx.planForDate=date=>{const {week,day}=model.coordinates(ctx.keyFor(date));return ctx.state.plans[week]?.[day]||[]};ctx.pinnedMealsForDate=date=>{const {week,day}=model.coordinates(ctx.keyFor(date));return ctx.state.pinnedMeals[week]?.[day]||[]};ctx.makePlan=(start,pantry,blocked)=>dates.map((d,i)=>blocked.has(i)?[]:['a']);
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../planning-ui.js'),'utf8'),ctx);ctx.readPlanningFields=()=>model.settings(ctx.state.planningSettings);return ctx;
}
test('automatic planning truncates before a pinned day and preserves its servings',()=>{
 const c=fixture();c.state=model.add(c.state,'fixed','2026-11-10',3,1,'pinned');c.state.pinnedMeals['2026-11-09'][1][0]=true;c.replaceCookingRange([]);
 assert.equal(model.entryAt(c.state,'2026-11-09',0).restDates.length,0);assert.equal(c.state.cookingEntries.pinned.portions,3);assert.equal(c.state.cookingEntries.pinned.pinned,true);assert.equal(model.entryAt(c.state,'2026-11-11',0).restDates.length,1);
});
test('a pinned day outside the visible range also truncates a new block',()=>{
 const c=fixture();c.state=model.add(c.state,'fixed','2026-11-16',2,1,'next-week-pin');c.state.pinnedMeals['2026-11-16'][0][0]=true;c.replaceCookingRange([]);assert.equal(model.entryAt(c.state,'2026-11-15',0).restDates.length,0);assert.equal(c.state.cookingEntries['next-week-pin'].date,'2026-11-16');
});
test('incoming leftovers protect the first visible day and baking survives planning',()=>{
 const c=fixture();c.state=model.add(c.state,'a','2026-11-08',2.5,2,'incoming');c.state=model.add(c.state,'cake','2026-11-10',8,1,'cake');c.replaceCookingRange([]);assert.equal(model.entryAt(c.state,'2026-11-09',0),undefined);assert.deepEqual(c.state.cookingEntries.incoming.restDates,['2026-11-09']);assert.equal(c.state.cookingEntries.cake.portions,8);assert.equal(Object.values(c.state.cookingEntries).filter(e=>e.date==='2026-11-10').length,2);
});
