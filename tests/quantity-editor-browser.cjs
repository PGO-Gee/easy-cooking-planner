const {chromium,webkit}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.WOCHENTISCH_UI_OUTPUT||'/private/tmp/quantity-ui';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':data)})});
async function fixture(page){await page.evaluate(async()=>{
 await initializeOfflineData();await ensureAuthentication();appInitialized=true;
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());state=emptyState();
 state.dishes=Array.from({length:8},(_,i)=>({id:`dish-${i}`,name:i?'Reisgericht '+i:'Testcurry',type:'meal',time:30,ingredients:['Hähnchenbrust','Salz'],recipe:{servings:2,ingredients:[{name:'Hähnchenbrust',amount:200,unit:'g'},{name:'Salz',amount:null,unit:'',note:'nach Geschmack'}],steps:['Garen.']}}));
 offlineMode=true;currentUserId='cooking-browser-fixture';currentHouseholdId='';cloudReady=false;$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;await initializeOfflineData();await renderCalendar();setView('week');
})}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.WOCHENTISCH_BROWSER_EXECUTABLE?{executablePath:process.env.WOCHENTISCH_BROWSER_EXECUTABLE}:{channel:'chrome'})});
try{const context=await browser.newContext({hasTouch:true,serviceWorkers:'block'});await context.route('https://**/*',r=>r.abort());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof initializePlanningUI==='function'&&document.documentElement.classList.contains('design'));await fixture(page);
await page.evaluate(async()=>{state=WochentischCookingPlan.add(state,state.dishes[0].id,keyFor(rangeDates()[0]),2,1,'quantity-test');await renderCalendar()});
for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900],[390,360],[320,280]])for(const theme of ['light','dark']){
 await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
 await page.evaluate(()=>{themeOverride=null;applyTheme();document.querySelectorAll('dialog[open]').forEach(d=>d.close());openCookingEntryOptions(rangeDates()[0],0)});
 await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Kochmenge ändern',exact:true}).click();
 const field=page.locator('#cooking-entry-quantity [data-planning="portions"]');assert.notEqual(await page.evaluate(()=>document.activeElement.dataset.planning),'portions','no automatic keyboard');
 await field.fill('3.5');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const b=await field.boundingBox();assert(b.y>=0&&b.y+b.height<=height,`visible field ${width}x${height}: ${JSON.stringify(b)}`);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await field.evaluate(e=>getComputedStyle(e).fontSize),'16px');
 if(width===390&&height===844){
  // Model an iOS visual viewport shrinking/panning without changing the layout viewport.
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:340});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:70});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'))});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const visible=await field.boundingBox();assert(visible.y>=70&&visible.y+visible.height<=410,JSON.stringify(visible));
  await page.screenshot({path:path.join(out,theme+'-keyboard.png')});
  await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'))});
 }
 await page.locator('.quantity-more-options summary').click();assert(await page.locator('#cooking-entry-quantity [data-planning=mode]').isVisible());assert(await page.locator('#cooking-entry-quantity [data-planning=days]').isVisible());await page.locator('.quantity-more-options summary').click();
 await page.locator('#cooking-entry-quantity button[type=submit]').scrollIntoViewIfNeeded();await page.locator('#cooking-entry-quantity button[type=submit]').click();
 assert(await page.evaluate(()=>!$('#cooking-entry-dialog').open));assert.equal(await page.evaluate(()=>state.cookingEntries['quantity-test'].portions),3.5);
 await page.evaluate(()=>openCookingEntryOptions(rangeDates()[0],0,{editQuantity:true}));
 await page.locator('.quantity-back').click();assert(await page.locator('#cooking-entry-quantity').isHidden());assert(await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Rezept ansehen',exact:true}).isVisible());await page.locator('#cooking-entry-dialog').getByRole('button',{name:'Schließen',exact:true}).last().click();
}
assert.deepEqual(errors,[]);console.log('Quantity editor: 12 viewport/theme combinations, input visibility, visual viewport shrink/pan, save and back passed.');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
