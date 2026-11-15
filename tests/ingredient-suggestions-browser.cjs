/* Ingredient picker regression: node tests/ingredient-suggestions-browser.cjs.
   Set WOCHENTISCH_PLAYWRIGHT_MODULE when Playwright is not on NODE_PATH. */
const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.WOCHENTISCH_UI_OUTPUT||path.join(root,'.ui-check');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'supabase/catalog-weeknight-recipes.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Not found':data)})});
async function fixture(page){await page.evaluate(async catalog=>{
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  state=emptyState();state.dishes=catalog.slice(0,5).map((d,i)=>({id:'ui-'+i,name:d.name,ingredient:d.ingredient,time:d.cooking_time_minutes,type:'meal',catalogSourceId:'fixture-'+i,recipe:d.recipe,ingredients:d.recipe.ingredients.map(i=>i.name),nutrition:d.nutrition}));
  const dates=rangeDates();[[0,['ui-0','ui-1']],[1,['ui-2']],[3,['ui-3']],[6,['ui-4']]].forEach(([i,meals])=>replaceDayPlan(dates[i],{meals,pins:meals.map((_,j)=>i===0&&j===0),isRest:false}));setRestDay(dates[2],true);
  offlineMode=true;currentUserId='isolated-ui';currentHouseholdId='';cloudReady=false;$('#startup-gate').hidden=true;$('#auth-gate').hidden=true;$('.app-shell').hidden=false;await renderCalendar();setView('week');
},catalog)}

(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
try{const context=await browser.newContext({serviceWorkers:'block'});await context.route('https://**/*',r=>r.abort());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.documentElement.classList.contains('design'));
for(const [width,height] of [[320,568],[390,844],[844,390],[390,340],[1440,900]])for(const theme of ['light','dark']){
await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await fixture(page);await page.evaluate(()=>{themeOverride=null;applyTheme();openPantryPlanner()});await page.locator('#pantry-input').fill('to');
assert(await page.locator('#pantry-suggestions').isVisible());assert(await page.locator('#pantry-suggestions mark').count());await page.locator('#pantry-input').press('ArrowDown');assert(await page.locator('#pantry-input').getAttribute('aria-activedescendant'));await page.locator('#pantry-input').press('Enter');assert.equal(await page.locator('#pantry-selected .pantry-chip').count(),1);await page.locator('#pantry-input').fill('ka');await page.screenshot({path:path.join(out,`${width}-${height}-${theme}-suggestions.png`)});await page.locator('#pantry-input').press('Escape');assert(await page.locator('#pantry-dialog').isVisible());assert(!await page.locator('#pantry-suggestions').isVisible());
await page.evaluate(()=>{$('#pantry-dialog').close();openShoppingList()});await page.locator('#shopping-item-input').fill('Kar');
const suggestions=await page.locator('#shopping-item-suggestions .ingredient-suggestion-label').allTextContents();
assert.equal(suggestions.filter(name=>name==='Karotten').length,1);
assert.equal(suggestions.filter(name=>name==='Kartoffeln').length,1);
assert(!suggestions.includes('Karotte'));assert(!suggestions.includes('Kartoffel'));
await page.locator('#shopping-item-input').fill('Karotte');await page.locator('#shopping-item-input').press('Enter');
assert(await page.evaluate(()=>Object.values(state.manualShoppingItems).flat().includes('Karotten')));
await page.locator('#shopping-item-input').fill('Karotten');await page.locator('#shopping-item-input').press('Enter');
assert(await page.locator('#shopping-add-status').isVisible());
assert.equal(await page.evaluate(()=>Object.values(state.manualShoppingItems).flat().filter(name=>name==='Karotten').length),1);
await page.locator('#shopping-item-input').fill('to');await page.locator('#shopping-item-input').press('ArrowDown');await page.locator('#shopping-item-input').press('Enter');assert.equal(await page.locator('#shopping-item-input').inputValue(),'');
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.evaluate(()=>{openDish('ui-0');document.querySelector('#editor-ingredients').open=true});await page.waitForTimeout(250);await page.locator('[data-recipe-field=name]').first().fill('ka');await page.locator('[data-recipe-field=name]').first().press('ArrowDown');await page.locator('[data-recipe-field=name]').first().press('Enter');assert(!await page.locator('.recipe-ingredient-suggestions').first().isVisible());await page.locator('[data-recipe-field=name]').first().fill('to');await page.locator('.recipe-ingredient-suggestions').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-${height}-${theme}-editor.png`)});
console.log(`${width}x${height} ${theme} passed`);
}assert.deepEqual(errors,[]);
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
