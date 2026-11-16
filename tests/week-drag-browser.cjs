const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.WOCHENTISCH_UI_OUTPUT||'/private/tmp/week-drag-ui';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':data)})});
async function fixture(page){await page.evaluate(async()=>{
 await initializeOfflineData();await ensureAuthentication();appInitialized=true;
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());state=emptyState();
 state.dishes=Array.from({length:8},(_,i)=>({id:`dish-${i}`,name:i?'Reisgericht '+i:'Testcurry',type:'meal',time:30,ingredients:['Hähnchenbrust','Salz'],recipe:{servings:2,ingredients:[{name:'Hähnchenbrust',amount:200,unit:'g'},{name:'Salz',amount:null,unit:'',note:'nach Geschmack'}],steps:['Garen.']}}));
 offlineMode=true;currentUserId='cooking-browser-fixture';currentHouseholdId='';cloudReady=false;$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;await initializeOfflineData();await renderCalendar();setView('week');
})}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true}),errors=[],results=[];
 try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[390,340],[1440,900]])for(const theme of ['light','dark']){
  const context=await browser.newContext({hasTouch:true,isMobile:width<1024,viewport:{width,height},serviceWorkers:'block'});
  await context.route('https://**/*',r=>r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.documentElement.classList.contains('design'));await fixture(page);
  await page.evaluate(async()=>{
   for(let i=0;i<3;i++)state=WochentischCookingPlan.add(state,state.dishes[i].id,keyFor(rangeDates()[i]),2.5,1,'drag-'+i);
   ensurePinnedMealsForDate(rangeDates()[1])[0]=true;
   await renderCalendar();window.__before=cookingPlanSnapshot(state);
  });

  const cdp=await context.newCDPSession(page),source=page.locator('#calendar .day-content[data-day="1"] .meal-title');
  async function start(){await source.scrollIntoViewIfNeeded();const r=await source.boundingBox();const p={x:r.x+r.width/2,y:r.y+r.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});return p}
  // Swiping remains scrolling, with no menu or ghost after a long gesture.
  let p=await start();await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-35}]});await page.waitForTimeout(550);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('dialog[open],.meal-drag-ghost,.meal-week-targets').count(),0);
  p=await start();const heldScroll=await page.evaluate(()=>scrollY);await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>scrollY),heldScroll,'holding still must not start scrolling');assert.equal(await page.locator('.meal-drag-ghost').count(),1);assert.equal(await page.locator('.meal-week-targets').count(),0);assert(await page.locator('#calendar').isVisible());
  await page.screenshot({path:path.join(out,`${width}-${height}-${theme}-hold.png`)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await page.locator('.meal-drag-ghost,.is-drop-target').count(),0);
  // Move onto the existing date column, including a day below the viewport.
  await start();await page.waitForTimeout(550);
  const target=page.locator('#calendar .day-card[data-day-index="6"]');
  for(let attempt=0;attempt<60;attempt++){
   const r=await target.boundingBox(),bottom=await page.evaluate(()=>{const r=document.querySelector('.mobile-nav-dock').getBoundingClientRect();return r.height?r.top:innerHeight});
   if(r.y+r.height/2<bottom-10&&r.y>0)break;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y:bottom-5}]});await page.waitForTimeout(50);
  }
  const edgeY=await page.evaluate(()=>{const r=document.querySelector('.mobile-nav-dock').getBoundingClientRect();return (r.height?r.top:innerHeight)-5});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y:edgeY}]});await page.waitForTimeout(500);
  const r=await target.boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+25,y:r.y+r.height/2}]});
  assert.equal(await target.evaluate(el=>el.classList.contains('is-drop-target')),true);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
  await page.screenshot({path:path.join(out,`${width}-${height}-${theme}-dropped.png`)});
  assert.equal(await page.evaluate(()=>state.cookingEntries['drag-1'].date),await page.evaluate(()=>keyFor(rangeDates()[6])),`${width}×${height} ${theme}`);
  assert.equal(await page.evaluate(()=>state.cookingEntries['drag-1'].pinned),true);
  assert.equal(await page.locator('dialog[open],.meal-drag-ghost,.meal-week-targets,.is-drop-target').count(),0);
  await page.locator('#toast button').tap();await page.waitForTimeout(100);assert(await page.evaluate(()=>sameValue(cookingPlanSnapshot(state),window.__before)));
  // Pointer dragging uses the same rows on desktop.
  if(width===1440){
   await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await page.locator('#calendar .day-card[data-day-index="2"]').boundingBox();
   await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+25,b.y+b.height/2,{steps:12});await page.mouse.up();await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>state.cookingEntries['drag-1'].date),await page.evaluate(()=>keyFor(rangeDates()[2])));
  }
  if(width===390&&height===844){
   await page.emulateMedia({reducedMotion:'no-preference'});await start();await page.waitForTimeout(550);
   const ghost=await page.locator('.meal-drag-ghost').boundingBox();assert(ghost.x>=0&&ghost.x+ghost.width<=width);
   await page.screenshot({path:path.join(out,`${width}-${height}-${theme}-animated-hold.png`)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await page.locator('.meal-drag-ghost,.is-drop-target').count(),0);
  }
  results.push({width,height,theme});await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors,checks:['scroll cancellation','hold and cancellation','inline day/date targets','edge autoscroll','move and pin preservation','undo','desktop mouse drag','no overflow']},null,2));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
