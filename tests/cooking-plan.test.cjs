const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../cooking-plan.js'),recipes=require('../recipe-model.js');
const week='2026-11-09',dish={id:'curry',name:'Curry',ingredients:['Hähnchenbrust','Salz'],recipe:{servings:2,ingredients:[{name:'Hähnchenbrust',amount:200,unit:'g'},{name:'Salz',amount:null,note:'nach Geschmack'}],steps:[]}};
function state(){return {dishes:[dish,{...dish,id:'rice',name:'Reis'}],plans:{[week]:Array.from({length:7},()=>[])},pinnedMeals:{},restDays:{},cookingEntries:{}}}
function add(s,id,date,days=1,portions=2.5){return model.add(s,id,date,portions,days,`${id}:${date}`)}
test('household counts eaters separately from app members and accepts fractional target servings',()=>{
 const settings={configured:true,adults:2,children:1,childFactor:.5};assert.equal(model.householdPortions(settings),2.5);assert.equal(model.dailyPortions(settings,dish),2.5);assert.equal(model.dailyPortions({...settings,mode:'self'},dish),1);assert.equal(recipes.scaledAmount(200,2.5,2),250);
});
test('five portions require 500 g exactly once, with an explicit unquantified addition',()=>{
 const s=add(state(),'curry',week,2),entry=Object.values(s.cookingEntries)[0];assert.equal(model.total(entry),5);assert.deepEqual(s.restDays[week],[1]);
 const result=model.demand([{dish,entry,weekKey:week}]);assert.equal(result.get('hähnchenbrust').amounts.get('g'),500);assert.equal(result.get('salz').unknown.size,1);
});
test('same recipe twice receives independent occurrence IDs and sums both cook batches',()=>{
 let s=add(state(),'curry',week,2);s=add(s,'curry','2026-11-12',1);const entries=Object.values(s.cookingEntries);assert.equal(entries.length,2);assert.equal(model.demand(entries.map(entry=>({dish,entry,weekKey:week}))).get('hähnchenbrust').amounts.get('g'),750);
});
test('Sunday batch creates Monday leftovers without duplicating demand in the next week',()=>{
 const s=add(state(),'curry','2026-11-15',2);assert.deepEqual(s.restDays['2026-11-16'],[0]);assert.equal(model.restsAt(s,'2026-11-16')[0].date,'2026-11-15');assert.equal(Object.values(s.cookingEntries).length,1);
});
test('extending shifts whole blocks and preserves future entries beyond the current range',()=>{
 let s=add(state(),'curry','2026-11-14');s=add(s,'rice','2026-11-15',2);const first=model.entryAt(s,'2026-11-14',0);s=model.change(s,first.id,{days:3});const moved=Object.values(s.cookingEntries).find(e=>e.dishId==='rice');assert.equal(moved.date,'2026-11-17');assert.deepEqual(moved.restDates,['2026-11-18']);assert.equal(Object.values(s.cookingEntries).length,2);
});
test('a collision with a pinned occurrence rejects the whole operation without changing input',()=>{
 let s=add(state(),'curry',week);s=add(s,'rice','2026-11-10');s.pinnedMeals[week][1][0]=true;const before=structuredClone(s);assert.throws(()=>model.change(s,model.entryAt(s,week,0).id,{days:2}),/fixiert/);assert.deepEqual(s,before);
});
test('shortening and removing one rest day reduce quantities and release only linked markers',()=>{
 let s=add(state(),'curry',week,3);const id=model.entryAt(s,week,0).id;s.restDays[week].push(6);s=model.removeRest(s,id,'2026-11-10');assert.equal(model.total(s.cookingEntries[id]),5);assert.deepEqual(s.restDays[week],[2,6]);s=model.change(s,id,{days:1});assert.deepEqual(s.restDays[week],[6]);s=model.remove(s,id);assert.equal(Object.values(s.cookingEntries).length,0);
});
test('an explicit move retains block ID, links and its pin while protecting other pinned blocks',()=>{
 let s=add(state(),'curry',week,2);const id=model.entryAt(s,week,0).id;s=model.change(s,id,{date:'2026-11-16'});assert.deepEqual(s.cookingEntries[id].restDates,['2026-11-17']);assert.equal(s.restDays[week],undefined);s.pinnedMeals['2026-11-16'][0][0]=true;s=model.change(s,id,{date:'2026-11-18'});assert.equal(s.cookingEntries[id].pinned,true);assert.deepEqual(s.cookingEntries[id].restDates,['2026-11-19']);
});
test('legacy migration is deterministic and snapshots the recipe base, ignoring household changes',()=>{
 const s=state();s.plans[week][0]=['curry','curry'];const entries=model.normalizeEntries(s);assert.equal(Object.keys(entries).length,2);assert.equal(Object.values(entries)[0].portions,2);s.cookingEntries=entries;s.planningSettings={configured:true,adults:8};assert.deepEqual(model.normalizeEntries(s),entries);
});
test('weight and volume normalize independently; piece, spoon and free-form units stay separate',()=>{
 const recipe={servings:2,ingredients:[{name:'Hähnchenbrust',amount:.2,unit:'kg'},{name:'Hähnchenbrust',amount:100,unit:'g'},{name:'Hähnchenbrust',amount:.1,unit:'l'},{name:'Hähnchenbrust',amount:2,unit:'Stück'},{name:'Hähnchenbrust',amount:1,unit:'EL'}]};const demand=model.demand([{dish:{...dish,recipe},weekKey:week}]).get('hähnchenbrust');assert.deepEqual([...demand.amounts],[['g',300],['ml',100],['Stück',2],['EL',1]]);
});
test('unknown serving base never invents a quantity and hidden weeks do not contribute',()=>{
 const unknown={...dish,recipe:{...dish.recipe,servings:null}};assert.equal(model.demand([{dish:unknown,weekKey:week}]).get('hähnchenbrust').amounts.size,0);assert.equal(model.demand([{dish,weekKey:week}],{[week]:['hähnchenbrust']}).has('hähnchenbrust'),false);
});
test('invalid portions and durations fail atomically',()=>{const s=add(state(),'curry',week);const id=model.entryAt(s,week,0).id;for(const input of [{portions:0},{portions:Infinity},{portions:101},{days:8},{days:1.5}])assert.throws(()=>model.change(s,id,input));});
test('editing only portions preserves a gap left by a removed rest day',()=>{
 let s=add(state(),'curry',week,3);const id=model.entryAt(s,week,0).id;s=model.removeRest(s,id,'2026-11-10');s=add(s,'rice','2026-11-10');s=model.change(s,id,{portions:3,days:2});assert.deepEqual(s.cookingEntries[id].restDates,['2026-11-11']);assert.equal(Object.values(s.cookingEntries).find(e=>e.dishId==='rice').date,'2026-11-10');
});
test('filling a rest-day gap shifts occupied days safely',()=>{
 let s=add(state(),'curry',week,3);const id=model.entryAt(s,week,0).id;s=model.removeRest(s,id,'2026-11-10');s=add(s,'rice','2026-11-10');s=model.change(s,id,{days:3});assert.deepEqual(s.cookingEntries[id].restDates,['2026-11-10','2026-11-11']);assert.equal(Object.values(s.cookingEntries).find(e=>e.dishId==='rice').date,'2026-11-12');
});
test('manual rest insertion shifts a whole block with its stable ID and never drops the last visible meal',()=>{
 let s=add(state(),'curry','2026-11-15',2);const id=model.entryAt(s,'2026-11-15',0).id;s=model.manualRest(s,'2026-11-15');assert.equal(s.cookingEntries[id].date,'2026-11-16');assert.deepEqual(s.cookingEntries[id].restDates,['2026-11-17']);assert.deepEqual(s.restDays[week],[6]);
});
test('moving onto a rest day displaces the overlapping block beyond the reserved span',()=>{
 let s=add(state(),'curry',week,2);s=add(s,'rice','2026-11-12',3);const id=model.entryAt(s,week,0).id;s=model.change(s,id,{date:'2026-11-13'});const rice=Object.values(s.cookingEntries).find(e=>e.dishId==='rice');assert.equal(rice.date,'2026-11-15');assert.deepEqual(s.cookingEntries[id].restDates,['2026-11-14']);
});
test('manual rest days participate in collision chains without overwriting later meals',()=>{
 let s=add(state(),'curry',week);s.restDays[week]=[1];s=add(s,'rice','2026-11-11');const id=model.entryAt(s,week,0).id;s=model.change(s,id,{days:2});assert.equal(Object.values(s.cookingEntries).find(e=>e.dishId==='rice').date,'2026-11-12');assert.deepEqual(s.restDays[week],[1,2]);
});
