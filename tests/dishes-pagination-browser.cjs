/* Isolated pagination regression: node tests/dishes-pagination-browser.cjs. */
const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.WOCHENTISCH_UI_OUTPUT||path.join(root,'.ui-check');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'supabase/catalog-weeknight-recipes.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':data)})});
async function fixture(page){await page.evaluate(catalog=>{
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());state=emptyState();
  state.dishes=Array.from({length:121},(_,i)=>{const d=catalog[i%catalog.length];return {id:'page-'+i,catalogSourceId:'fixture-'+i,name:i===120?'Fernziel':d.name,ingredient:d.ingredient,time:25,type:'meal',ingredients:['Testzutat'],recipe:d.recipe}});
  state.dishes.push({id:'baking',name:'Kuchen',type:'baking',ingredients:[]});
  offlineMode=true;currentUserId='isolated-pagination';currentHouseholdId='';cloudReady=false;
  $('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;
  $('#search-dishes').value='';setRecipeTypeFilter($('#dishes-type'),'meal');dishesPage=0;setView('dishes');window.scrollTo(0,0);
},catalog)}
async function swipe(page,dx,dy=0){await page.evaluate(({dx,dy})=>{
  const list=$('#dish-list'),touch=(x,y)=>new Touch({identifier:1,target:list,clientX:x,clientY:y});
  const a=touch(180,200),b=touch(180+dx,200+dy);
  list.dispatchEvent(new TouchEvent('touchstart',{touches:[a],bubbles:true}));
  list.dispatchEvent(new TouchEvent('touchmove',{touches:[b],bubbles:true}));
  list.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[b],bubbles:true}));
},{dx,dy})}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));fs.mkdirSync(out,{recursive:true});let browser;
try{browser=await chromium.launch({headless:true,executablePath:process.env.WOCHENTISCH_BROWSER_EXECUTABLE});const context=await browser.newContext({serviceWorkers:'block',hasTouch:true});await context.route('https://**/*',r=>r.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.documentElement.classList.contains('design'));
for(const [width,height] of [[320,568],[390,844],[844,390],[390,340],[1440,900]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await fixture(page);await page.evaluate(()=>{themeOverride=null;applyTheme()});
  const rows=page.locator('#dish-list .dish-row'),top=page.locator('#dish-pagination'),next=top.locator('[data-dish-page="1"]'),prev=top.locator('[data-dish-page="-1"]');
  assert.equal(await rows.count(),12);assert.equal(await page.locator('#dish-list img').count(),12);assert.match(await top.innerText(),/Seite 1 von 11/);assert(await prev.isDisabled());
  await next.click();assert.match(await top.innerText(),/Seite 2 von 11/);assert.equal(await page.evaluate(()=>dishesPage),1);
  await swipe(page,-100);assert.equal(await page.evaluate(()=>dishesPage),2);
  // Synthetic click after a swipe must not open a recipe.
  await rows.first().dispatchEvent('click');assert(!await page.locator('#recipe-detail-dialog').isVisible());
  await swipe(page,100);assert.equal(await page.evaluate(()=>dishesPage),1);
  await swipe(page,-100,100);assert.equal(await page.evaluate(()=>dishesPage),1);
  await page.locator('.dish-pagination').last().locator('[data-dish-page="1"]').click();assert.equal(await page.evaluate(()=>dishesPage),2);
  assert(await top.isVisible());assert(await top.evaluate(el=>el.getBoundingClientRect().top>=0));
  await page.screenshot({path:path.join(out,`${width}-${height}-${theme}-pagination.png`)});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const button of await top.locator('button').all()){const box=await button.boundingBox();assert(box.width>=44&&box.height>=44)}
  await page.evaluate(()=>{dishesPage=10;renderDishes()});assert.equal(await rows.count(),1);assert(await next.isDisabled());
  await swipe(page,-100);assert.equal(await page.evaluate(()=>dishesPage),10);
  await page.locator('#search-dishes').fill('Fernziel');assert.equal(await rows.count(),1);assert.match(await rows.first().innerText(),/Fernziel/);assert(!await top.isVisible());assert.equal(await page.evaluate(()=>dishesPage),0);
  await page.locator('#search-dishes').fill('gibt es nicht');assert.equal(await rows.count(),0);assert(await page.locator('#dish-list .empty-state').isVisible());
  await page.locator('#search-dishes').fill('');await next.click();
  await page.locator('#dishes-type [data-type="baking"]').click();assert.equal(await rows.count(),1);assert(!await top.isVisible());
  await page.locator('#dishes-type [data-type="meal"]').click();assert.equal(await page.evaluate(()=>dishesPage),0);
  await page.evaluate(()=>{dishesPage=10;state.dishes=state.dishes.slice(0,13);renderDishes()});assert.equal(await page.evaluate(()=>dishesPage),1);assert.equal(await rows.count(),1);
  await page.evaluate(()=>{currentHouseholdId='another-household';renderDishes()});assert.equal(await page.evaluate(()=>dishesPage),0);
  console.log(`${width}x${height} ${theme}: pagination, search, filters, boundaries, swipe, layout passed`);
}
await page.setViewportSize({width:390,height:844});await fixture(page);
await page.locator('#dish-pagination').scrollIntoViewIfNeeded();
const cdp=await context.newCDPSession(page),box=await page.locator('#dish-list .dish-row').first().boundingBox(),y=box.y+50;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y}]});
for(const x of [250,210,170,120])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
assert.equal(await page.evaluate(()=>dishesPage),1);
assert(!await page.locator('#recipe-detail-dialog').isVisible());
console.log('Chromium touch input: right-to-left swipe passed');
assert.deepEqual(errors,[]);
}finally{if(browser)await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
