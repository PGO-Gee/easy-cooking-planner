const {chromium,webkit}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.WOCHENTISCH_UI_OUTPUT||'/private/tmp/chooser-ui';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':data)})});
async function fixture(page){await page.evaluate(async()=>{
 await initializeOfflineData();await ensureAuthentication();appInitialized=true;
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());state=emptyState();
 state.dishes=Array.from({length:8},(_,i)=>({id:`dish-${i}`,name:i?'Reisgericht '+i:'Testcurry',type:'meal',time:30,ingredients:['Hähnchenbrust','Salz'],recipe:{servings:2,ingredients:[{name:'Hähnchenbrust',amount:200,unit:'g'},{name:'Salz',amount:null,unit:'',note:'nach Geschmack'}],steps:['Garen.']}}));
 offlineMode=true;currentUserId='cooking-browser-fixture';currentHouseholdId='';cloudReady=false;$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;await initializeOfflineData();await renderCalendar();setView('week');
})}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.WOCHENTISCH_BROWSER_EXECUTABLE?{executablePath:process.env.WOCHENTISCH_BROWSER_EXECUTABLE}:{channel:'chrome'})});
try{const context=await browser.newContext({hasTouch:true,serviceWorkers:'block'});await context.route('https://**/*',r=>r.abort());const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof initializePlanningUI==='function'&&document.documentElement.classList.contains('design'));await fixture(page);
for(const [width,height] of [[320,568],[844,390],[1440,900]])for(const reducedMotion of ['no-preference','reduce']){
 await page.setViewportSize({width,height});
 await page.emulateMedia({reducedMotion});
 const animation=await page.evaluate(async()=>{
  await renderCalendar();
  const dialog=$('#choose-dialog');
  $('#calendar .empty-day .add-meal').click();
  if(uiDesktop())$('#week-preview .primary-button').click();
  const waiting=dialog.open&&getComputedStyle(dialog).opacity==='0';
  for(let frame=0;frame<12&&dialog.classList.contains('is-waiting-to-reveal');frame++)await new Promise(resolve=>requestAnimationFrame(resolve));
  const motion=dialog.getAnimations().find(animation=>animation.effect.target===dialog);
  return {waiting,duration:motion?.effect.getTiming().duration??0,keyframes:motion?.effect.getKeyframes().map(frame=>frame.opacity)??[]};
 });
 assert.deepEqual(animation,reducedMotion==='reduce'
  ?{waiting:true,duration:0,keyframes:[]}
  :{waiting:true,duration:150,keyframes:['0','1']},`${width}×${height} ${reducedMotion}`);
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!$('#choose-dialog').open&&!document.body.classList.contains('has-open-dialog'));
}
for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900],[390,360],[320,280]])for(const theme of ['light','dark']){
 await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.evaluate(()=>{themeOverride=null;applyTheme();if($('#choose-dialog').open)$('#choose-dialog').close();chooseDish(0)});
 assert.notEqual(await page.evaluate(()=>document.activeElement.id),'choose-dish-search');
 await page.locator('#choose-dish-search').fill('Reis');
 assert.equal(await page.locator('#choose-dish-list .choose-item:visible').count(),7);
 const metrics=await page.evaluate(()=>{const d=$('#choose-dialog').getBoundingClientRect(),s=$('#choose-dish-search').getBoundingClientRect(),l=$('#choose-dish-list').getBoundingClientRect(),b=$('#choose-dish-list .choose-item:not([hidden])').getBoundingClientRect();return {right:d.right,bottom:d.bottom,search:s.bottom,list:l.height,first:b.bottom,client:innerHeight,overflow:document.documentElement.scrollWidth}});
 assert(metrics.overflow<=width+1,JSON.stringify(metrics));assert(metrics.right<=width+1,JSON.stringify(metrics));assert(metrics.search<height,JSON.stringify(metrics));assert(metrics.list>=64,JSON.stringify(metrics));assert(metrics.first<=height,JSON.stringify(metrics));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.locator('#choose-dish-list').evaluate(e=>e.scrollTop=e.scrollHeight);assert(await page.locator('#choose-dish-list').evaluate(e=>e.scrollHeight<=e.clientHeight+1||e.scrollTop>0));
 await page.locator('#choose-dish-search').fill('kein Treffer');assert(await page.locator('.choose-no-results').isVisible());
 await page.locator('#choose-dish-search').fill('Testcurry');await page.locator('#choose-search-done').click();assert.equal(await page.locator('#choose-dish-search').inputValue(),'Testcurry');assert(await page.locator('#choose-dish-type').isVisible());
 if(width===390&&height===844){await page.screenshot({path:path.join(out,theme+'-chooser.png')});await page.locator('#choose-dish-search').focus();await page.setViewportSize({width:390,height:360});await page.screenshot({path:path.join(out,theme+'-search-keyboard.png')});}
 await page.locator('#choose-dish-list .choose-item:visible').click();assert.equal(await page.locator('#choose-dialog').getAttribute('open'),null);
}
await page.evaluate(()=>chooseDish(1));await page.locator('#choose-more-options summary').click();await page.locator('#choose-rest-action').click();assert.equal(await page.locator('#choose-dialog').getAttribute('open'),null);
console.log('Chooser: empty-day entry animations, 12 viewport/theme combinations, filter, empty state, scroll, selection, and rest action passed.');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
