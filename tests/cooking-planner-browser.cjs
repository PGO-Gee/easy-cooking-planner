const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.WOCHENTISCH_UI_OUTPUT||'/private/tmp/cooking-portions-ui';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':data)})});
async function fixture(page){await page.evaluate(async()=>{
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());state=emptyState();
 state.dishes=Array.from({length:8},(_,i)=>({id:`dish-${i}`,name:i?'Reisgericht '+i:'Testcurry',type:'meal',time:30,ingredients:['Hähnchenbrust','Salz'],recipe:{servings:2,ingredients:[{name:'Hähnchenbrust',amount:200,unit:'g'},{name:'Salz',amount:null,unit:'',note:'nach Geschmack'}],steps:['Garen.']}}));
 offlineMode=true;currentUserId='cooking-browser-fixture';currentHouseholdId='';cloudReady=false;$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;await initializeOfflineData();await renderCalendar();setView('week');
})}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome',timeout:20000}),errors=[],results=[];
try{const context=await browser.newContext({serviceWorkers:'block'});await context.route('https://**/*',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof initializePlanningUI==='function'&&document.documentElement.classList.contains('design'));await fixture(page);
 await page.evaluate(()=>$('#household-dialog').showModal());await page.locator('#household-adults').fill('2');await page.locator('#household-children').fill('1');await page.locator('#household-child-factor').fill('0.5');await page.locator('#household-portions-form button').click();assert.equal(await page.evaluate(()=>state.planningSettings.configured),true);assert.match(await page.locator('#household-portions-preview').innerText(),/2,5/);await page.evaluate(()=>$('#household-dialog').close());
 await page.evaluate(()=>chooseDish(0));assert.equal(await page.locator('#choose-plan-options input,#choose-plan-options select').count(),0);await page.locator('#choose-dish-list .choose-item').filter({hasText:'Testcurry'}).click();await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>Object.values(state.cookingEntries).map(e=>[e.portions,e.restDates.length])),[[2.5,0]]);assert.equal(await page.locator('#calendar .meal-more').count(),0);await page.locator('#calendar .meal-card').first().click();assert(await page.locator('#cooking-entry-dialog form').isHidden());await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Kochmenge ändern',exact:true}).click();await page.getByRole('button',{name:'Für zwei Tage kochen',exact:true}).click();await page.locator('#cooking-entry-dialog button[type=submit]').click();assert.deepEqual(await page.evaluate(()=>Object.values(state.cookingEntries).map(e=>[e.portions,e.restDates.length])),[[2.5,1]]);assert.equal(await page.locator('#calendar .linked-rest-copy').innerText(),'Reste');
 await page.evaluate(()=>openShoppingList());const chicken=page.locator('.shopping-tile-shell').filter({has:page.locator('[data-ingredient="hähnchenbrust"]')});assert.match(await chicken.innerText(),/500 g/);await chicken.locator('.shopping-recipe-quantity summary').click();await chicken.locator('input').fill('600');await chicken.getByRole('button',{name:'Menge übernehmen'}).click();assert.match(await chicken.innerText(),/600 g/);await chicken.locator('.shopping-recipe-quantity summary').click();assert.match(await chicken.innerText(),/Berechneter Bedarf: 500 g/);await chicken.getByRole('button',{name:'Auf berechnete Menge zurücksetzen'}).click();assert.match(await chicken.innerText(),/500 g/);
 await page.evaluate(async()=>{await offlineStoreWriteQueue;window.__persisted=await WochentischStore.get('records',appStateKey());state=normalizeState(window.__persisted);setView('week');await renderCalendar()});assert.deepEqual(await page.evaluate(()=>Object.values(state.cookingEntries).map(e=>e.portions)),[2.5]);
 await page.evaluate(()=>openPantryPlanner());assert.equal(await page.locator('#plan-options input,#plan-options select').count(),0);await page.locator('#pantry-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#pantry-dialog').open);
 const auto=await page.evaluate(()=>Object.values(state.cookingEntries).map(e=>({date:e.date,dishId:e.dishId,portions:e.portions,rests:e.restDates.length})));assert.equal(auto.length,7);assert(auto.every(e=>e.portions===2.5&&e.rests===0));
 await page.locator('#calendar .meal-card').first().click();assert(await page.locator('#cooking-entry-dialog form').isHidden());await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Kochmenge ändern',exact:true}).click();await page.getByRole('button',{name:'Für zwei Tage kochen',exact:true}).click();await page.locator('#cooking-entry-dialog button[type=submit]').click();assert.equal(await page.evaluate(()=>WochentischCookingPlan.entryAt(state,keyFor(rangeDates()[1]),0)),undefined);assert.equal(await page.evaluate(()=>WochentischCookingPlan.entryAt(state,keyFor(rangeDates()[2]),0).dishId),auto[1].dishId);
 // Per-occurrence editing is independent of identical recipe occurrences.
 await page.evaluate(()=>openCookingEntryOptions(rangeDates()[0],0));await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Kochmenge ändern',exact:true}).click();await page.locator('#cooking-entry-dialog [data-planning="portions"]').fill('5');await page.locator('#cooking-entry-dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>WochentischCookingPlan.entryAt(state,keyFor(rangeDates()[0]),0).portions),5);
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900],[390,360]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.evaluate(()=>{themeOverride=null;applyTheme()});
  for(const screen of ['household','plan','entry','rest','shopping']){
   await page.evaluate(screen=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());setView('week');if(screen==='household')$('#household-dialog').showModal();if(screen==='plan'){openPantryPlanner();pantryDraft=['Kartoffeln'];renderPantryEditor();}if(screen==='rest')openLinkedRest(rangeDates()[1]);if(screen==='shopping')openShoppingList()},screen);if(screen==='entry'){await page.locator('#calendar .meal-card').first().focus();await page.keyboard.press('Enter');assert(await page.locator('#cooking-entry-dialog').isVisible());assert(await page.locator('#cooking-entry-dialog form').isHidden());const centered=await page.locator('#cooking-entry-dialog').boundingBox();assert(Math.abs(centered.y+centered.height/2-height/2)<2,'dish menu is vertically centered');assert.equal(await page.locator('#cooking-entry-dialog [aria-controls="cooking-entry-quantity"] .ui-icon').count(),1);if(width===390&&height===844)await page.screenshot({path:path.join(out,`${theme}-entry-menu.png`),fullPage:true});assert(await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Weiteres Gericht hinzufügen',exact:true}).isVisible());await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Kochmenge ändern',exact:true}).click();assert(await page.locator('#cooking-entry-dialog form').isVisible())}await page.waitForTimeout(30);
   const metrics=await page.evaluate(()=>{const roots=[document.querySelector('dialog[open]')||document.querySelector('.view:not(.hidden)')];return {scroll:document.documentElement.scrollWidth,bad:roots.flatMap(r=>[...r.querySelectorAll('input,select,button')]).filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height&&(b.left< -1||b.right>innerWidth+1)}).map(e=>e.id||e.className),small:roots.flatMap(r=>[...r.querySelectorAll('.planning-options input,.planning-options select,.planning-options button,.shopping-recipe-quantity summary')]).filter(e=>{const b=e.getBoundingClientRect();return b.height&&b.height<43}).map(e=>e.id||e.className)}});
   assert(metrics.scroll<=width+1,`${screen} ${width} ${theme}: overflow ${JSON.stringify(metrics)}`);assert.deepEqual(metrics.bad,[],`${screen} ${width} ${theme}: clipped controls`);assert.deepEqual(metrics.small,[],`${screen} touch target sizes`);
   if(screen==='plan'&&height>=568){const visible=await page.evaluate(()=>{const d=document.querySelector('#pantry-dialog'),b=d.querySelector('button[type=submit]').getBoundingClientRect();return {scroll:d.scrollHeight,client:d.clientHeight,bottom:b.bottom,height:innerHeight}});assert(visible.scroll<=visible.client+1,`plan ${width} ${height}: should fit one screen ${JSON.stringify(visible)}`);assert(visible.bottom<=height,`plan ${width}: submit visible`)}
   if(width===390&&height===844)await page.screenshot({path:path.join(out,`${theme}-${screen}.png`),fullPage:true});results.push({width,height,theme,screen});
   // A reduced viewport simulates available keyboard space, not actual iOS.
   if(height===360&&screen==='plan'){assert.notEqual(await page.evaluate(()=>document.activeElement.id),'pantry-input','planner should not open the keyboard automatically');await page.locator('#pantry-input').focus();await page.locator('#pantry-form button[type="submit"]').scrollIntoViewIfNeeded();assert(await page.locator('#pantry-form button[type="submit"]').isVisible())}
   if(height===360&&screen==='entry'){await page.locator('#cooking-entry-dialog [data-planning="portions"]').focus();await page.locator('#cooking-entry-dialog button[type="submit"]').scrollIntoViewIfNeeded();assert(await page.locator('#cooking-entry-dialog button[type="submit"]').isVisible())}
  }
 }

 // Pin a later meal through its dialog; its right-hand pin must stay visible.
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());setView('week');openCookingEntryOptions(rangeDates()[2],0)});
 await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Gericht fixieren',exact:true}).click();await page.waitForTimeout(80);
 const pinned=page.locator('#calendar .day-content[data-day="2"] .meal-pin');assert(await pinned.isVisible());assert.equal(await pinned.getAttribute('aria-pressed'),'true');
 const pinPosition=await pinned.evaluate(pin=>{const title=pin.closest('.meal-card').querySelector('.meal-title').getBoundingClientRect(),rect=pin.getBoundingClientRect();return {titleRight:title.right,pinLeft:rect.left,width:rect.width,height:rect.height}});assert(pinPosition.pinLeft>=pinPosition.titleRight);assert(pinPosition.width>=44&&pinPosition.height>=44);
 await pinned.click();await page.waitForTimeout(80);assert.equal(await page.locator('#calendar .day-content[data-day="2"] .meal-pin').getAttribute('aria-pressed'),'false');
 // Exercise the actual mouse drag and toast undo repeatedly on an occupied day.
 await page.setViewportSize({width:1440,height:900});await page.evaluate(async()=>{const dishes=state.dishes;state=emptyState();state.dishes=dishes;for(let i=0;i<3;i++)state=WochentischCookingPlan.add(state,dishes[i].id,keyFor(rangeDates()[i]),2.5,1,'drag-'+i);setView('week');await renderCalendar();window.__beforeDrag=cookingPlanSnapshot(state)});
 for(let attempt=0;attempt<3;attempt++){
  const source=await page.locator('#calendar .day-content[data-day="0"] .meal-title').first().boundingBox(),target=await page.locator('#calendar .day-content[data-day="1"]').boundingBox();
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:15});await page.mouse.up();
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>state.cookingEntries['drag-0'].date),await page.evaluate(()=>keyFor(rangeDates()[1])));
  await page.locator('#toast button').click();await page.waitForTimeout(100);assert(await page.evaluate(()=>sameValue(cookingPlanSnapshot(state),window.__beforeDrag)),'drag undo restores displaced days without duplicates');
 }
 const overlaps=await page.evaluate(()=>[...document.querySelectorAll('.shopping-tile-shell:has(.shopping-recipe-quantity)')].filter(s=>s.querySelector('.shopping-tile').getBoundingClientRect().bottom>s.querySelector('.shopping-recipe-quantity').getBoundingClientRect().top+1).length);assert.equal(overlaps,0,'ingredient names must not overlap quantities');
 // Reproduce legacy, unlinked leftover markers and verify a one-day remix.
 await page.evaluate(async()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());const dishes=state.dishes;state=emptyState();state.dishes=dishes;state.planningSettings={configured:true,adults:2,children:1,childFactor:0.5,days:1};const dates=rangeDates();for(const index of [1,3,5])setRestDay(dates[index],true);window.__beforeLegacyRemix=cookingPlanSnapshot(state);setView('week');await renderCalendar();openPantryPlanner()});
 await page.locator('#pantry-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#pantry-dialog').open&&Object.values(state.cookingEntries).length===7);
 assert.equal(await page.locator('#calendar .rest-day-tile').count(),0,'one-day remix must replace old independent rest markers');
 // A normal cloud acknowledgement pads empty weeks; undo must remain usable.
 await page.evaluate(()=>{const week='2027-01-04';state.plans[week]=Array.from({length:7},()=>[]);state.pinnedMeals[week]=Array.from({length:7},()=>[]);state.restDays[week]=[];state=normalizeState(state)});
 await page.locator('#toast button').click();await page.waitForFunction(()=>Object.values(state.cookingEntries).length===0);
 assert.equal(await page.locator('#calendar .rest-day-tile').count(),3,'undo restores the previous manual rest days');
 assert(await page.evaluate(()=>sameValue(cookingPlanSnapshot(state),window.__beforeLegacyRemix)),'undo restores semantic plan after cloud padding');

 // A touch-enabled Chromium context exercises real compatibility events.
 const touchContext=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},serviceWorkers:'block'});await touchContext.route('https://**/*',r=>r.abort());
 const touchPage=await touchContext.newPage();touchPage.on('pageerror',e=>errors.push(e.message));await touchPage.goto(page.url());await touchPage.waitForFunction(()=>typeof initializePlanningUI==='function'&&document.documentElement.classList.contains('design'));await fixture(touchPage);
 await touchPage.evaluate(async()=>{for(let i=0;i<3;i++)state=WochentischCookingPlan.add(state,state.dishes[i].id,keyFor(rangeDates()[i]),2.5,1,'touch-'+i);await renderCalendar();window.__menuOpens=0;const original=openPlannedMeal;openPlannedMeal=meal=>{window.__menuOpens++;original(meal)}});
 const touchCard=touchPage.locator('#calendar .day-content[data-day="1"] .meal-card'),touchTitle=touchCard.locator('.meal-title'),touchDialog=touchPage.locator('#cooking-entry-dialog');
 for(const theme of ['light','dark']){
  await touchPage.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await touchPage.evaluate(()=>{themeOverride=null;applyTheme()});
  for(let attempt=0;attempt<3;attempt++){
   const before=await touchPage.evaluate(()=>window.__menuOpens);await touchTitle.tap();assert(await touchDialog.isVisible());assert.equal(await touchPage.evaluate(()=>window.__menuOpens),before+1);
   assert.equal(await touchDialog.locator('.close-button').evaluate(el=>getComputedStyle(el).outlineStyle),'none');await touchDialog.locator('.close-button').tap();await touchPage.waitForTimeout(80);
   assert.equal(await touchCard.evaluate(el=>getComputedStyle(el).outlineStyle),'none');assert(await touchCard.evaluate(el=>el===document.activeElement),'focus returns to the tapped card without a ring');assert.equal(await touchPage.locator('dialog[open]').count(),0);
  }
  const beforePin=await touchPage.evaluate(()=>window.__menuOpens);await touchCard.locator('.meal-pin').tap();await touchPage.waitForTimeout(100);assert.equal(await touchPage.locator('dialog[open]').count(),0);assert.equal(await touchPage.evaluate(()=>window.__menuOpens),beforePin);
 }
 const cdp=await touchContext.newCDPSession(touchPage);
 async function startTouch(){await touchTitle.scrollIntoViewIfNeeded();const b=await touchTitle.boundingBox();const point={x:b.x+b.width/2,y:b.y+b.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});return point}
 // A scroll lasting beyond the old suppression timeout must not become a tap.
 let point=await startTouch();await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-45}]});await touchPage.waitForTimeout(800);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchPage.waitForTimeout(100);assert.equal(await touchPage.locator('dialog[open],.meal-week-targets,.meal-drag-ghost').count(),0);
 // Holding briefly must not raise the drag overlay; cancelling a real hold cleans up.
 point=await startTouch();await touchPage.waitForTimeout(350);assert.equal(await touchPage.locator('.meal-week-targets').count(),0);await touchPage.waitForTimeout(250);assert.equal(await touchPage.locator('.meal-week-targets').count(),1);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await touchPage.waitForTimeout(100);assert.equal(await touchPage.locator('dialog[open],.meal-week-targets,.meal-drag-ghost').count(),0);

 // Touch drag still moves a whole block, without opening its menu on release.
 await touchPage.evaluate(()=>window.__beforeTouchDrag=cookingPlanSnapshot(state));point=await startTouch();await touchPage.waitForTimeout(550);
 const drop=await touchPage.locator('.meal-week-target[data-drop-day="2"]').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:drop.x+drop.width/2,y:drop.y+drop.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchPage.waitForTimeout(100);
 assert.equal(await touchPage.evaluate(()=>state.cookingEntries['touch-1'].date),await touchPage.evaluate(()=>keyFor(rangeDates()[2])));assert.equal(await touchPage.locator('dialog[open],.meal-week-targets,.meal-drag-ghost').count(),0);
 await touchPage.locator('#toast button').tap();await touchPage.waitForTimeout(100);assert(await touchPage.evaluate(()=>sameValue(cookingPlanSnapshot(state),window.__beforeTouchDrag)));
 // Keyboard focus is still visible after touch input.
 await touchTitle.scrollIntoViewIfNeeded();await touchCard.focus();await touchPage.keyboard.press('Tab');assert.equal(await touchPage.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');await touchCard.press('Enter');assert(await touchDialog.isVisible());assert.equal(await touchDialog.locator('.close-button').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');await touchPage.keyboard.press('Escape');

 // Sample the first visible layout and eight frames at several page scroll offsets.
 await touchPage.evaluate(async()=>{
  const dishes=state.dishes;state=emptyState();state.dishes=dishes;for(let i=0;i<7;i++)state=WochentischCookingPlan.add(state,dishes[i].id,keyFor(rangeDates()[i]),2.5,1,'scroll-'+i);await renderCalendar();
  document.querySelector('#cooking-entry-dialog')?.remove();const nativeShow=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
   const lockedBeforeShow=document.body.classList.contains('has-open-dialog');nativeShow.call(this);if(this.id!=='cooking-entry-dialog')return;
   const measure=()=>{const b=this.getBoundingClientRect();return {y:b.y,height:b.height,x:b.x,width:b.width}};window.__openingFrames=[measure()];window.__lockedBeforeShow=lockedBeforeShow;
   const sample=()=>{window.__openingFrames.push(measure());if(window.__openingFrames.length<9)requestAnimationFrame(sample)};requestAnimationFrame(sample);
  };
 });
 const scrollChecks=[];
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900],[390,360]])for(const theme of ['light','dark']){
  await touchPage.setViewportSize({width,height});await touchPage.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await touchPage.evaluate(()=>{themeOverride=null;applyTheme()});
  for(const fraction of [0,.25,.5,.75,1]){
   await touchPage.evaluate(f=>window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),fraction);await touchPage.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const tap=await touchPage.evaluate(()=>{const cards=[...document.querySelectorAll('#calendar .meal-card')];const visible=cards.map(el=>el.getBoundingClientRect()).find(b=>b.bottom>12&&b.top<innerHeight-90);if(!visible)throw Error('No visible dish');return {x:visible.x+visible.width/2,y:(Math.max(visible.top,12)+Math.min(visible.bottom,innerHeight-90))/2,scrollY}});
   await touchPage.touchscreen.tap(tap.x,tap.y);await touchPage.waitForFunction(()=>window.__openingFrames?.length===9);
   const measured=await touchPage.evaluate(()=>({frames:window.__openingFrames,locked:window.__lockedBeforeShow}));assert(measured.locked,'scroll lock must precede native dialog focus/layout');
   const first=measured.frames[0];for(const frame of measured.frames){assert(Math.abs(frame.y-first.y)<=1&&Math.abs(frame.height-first.height)<=1,'menu must stay still from first layout');assert(Math.abs(frame.y+frame.height/2-height/2)<=2,'menu starts centered')}
   await touchDialog.locator('.close-button').tap();await touchPage.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(Math.abs(await touchPage.evaluate(()=>scrollY)-tap.scrollY)<=1,'closing restores the page scroll position');scrollChecks.push({width,height,theme,fraction,scrollY:tap.scrollY});
  }
 }

 // Center within an offset visual viewport as iOS uses during zoom/keyboard changes.
 await touchPage.setViewportSize({width:390,height:844});
 await touchPage.evaluate(()=>{window.__actualViewport=Object.getOwnPropertyDescriptor(window,'visualViewport');const actual=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:new Proxy(actual,{get(target,key){if(key==='height')return 360;if(key==='offsetTop')return 120;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})});syncVisualViewport();openCookingEntryOptions(rangeDates()[0],0)});
 const offsetBounds=await touchDialog.boundingBox();assert(Math.abs(offsetBounds.y+offsetBounds.height/2-300)<2,'center respects the visual viewport offset');assert(offsetBounds.y>=132&&offsetBounds.y+offsetBounds.height<=468,'menu remains inside the available viewport');
 await touchDialog.getByRole('button',{name:'Kochmenge ändern',exact:true}).click();await touchDialog.locator('button[type=submit]').scrollIntoViewIfNeeded();assert(await touchDialog.locator('button[type=submit]').isVisible());
 await touchPage.evaluate(()=>{document.querySelector('#cooking-entry-dialog').close();Object.defineProperty(window,'visualViewport',window.__actualViewport);syncVisualViewport()});
 fs.writeFileSync(path.join(out,'scroll-opening.json'),JSON.stringify(scrollChecks,null,2));
 await touchContext.close();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks:results.length,results,errors,auto},null,2));console.log(`Passed household setup, 500 g calculation, 600 g override/reset, offline persistence, seven household days, per-dish leftovers and displacement, legacy leftover cleanup, undo after cloud padding, editing and ${results.length} viewport/theme checks.`);
 }finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
