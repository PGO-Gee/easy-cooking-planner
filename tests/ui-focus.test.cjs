const test=require('node:test'),assert=require('node:assert/strict');
const {focusPlanEntry}=require('../ui.js');
const days=[{date:'2026-11-13',day:['past']},{date:'2026-11-14',day:['today','cake']},{date:'2026-11-15',day:['next']}];
test('focus prefers today and the first of multiple planned recipes',()=>{assert.deepEqual(focusPlanEntry(days,'2026-11-14'),{id:'today',day:1,meal:0,date:'2026-11-14'})});
test('focus chooses the next planned date when today is free',()=>{assert.equal(focusPlanEntry([{date:'2026-11-14',day:[]},days[2]],'2026-11-14').id,'next')});
test('past ranges fall back to the first planned recipe',()=>{assert.equal(focusPlanEntry(days,'2026-11-20').id,'past')});
test('missing recipes are skipped without losing their original meal index',()=>{assert.deepEqual(focusPlanEntry(days,'2026-11-14',new Set(['cake'])),{id:'cake',day:1,meal:1,date:'2026-11-14'})});
test('an entirely free or rest-only range has no focus card',()=>{assert.equal(focusPlanEntry([{date:'2026-11-14',day:[],isRest:true}],'2026-11-14'),null)});
test('local calendar dates are used instead of UTC conversion',()=>{const date=new Date(2026,10,14);assert.equal(focusPlanEntry([{date,day:['local']}],new Date(2026,10,14)).id,'local')});
