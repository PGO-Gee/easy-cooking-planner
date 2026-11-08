/* Optional integration suite. Run with a local server and Playwright installed.
   OCR_BASE_URL and OCR_BROWSER_EXECUTABLE may override their defaults.
   Uses an isolated browser profile, blocks external requests, never signs in. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let base=process.env.OCR_BASE_URL||'http://127.0.0.1:8765';
const output=process.env.OCR_TEST_OUTPUT||'/tmp/wochentisch-ocr-tests';
fs.mkdirSync(output,{recursive:true});
(async()=>{
  let server,port=0;
  async function startServer(){
    server=require('node:http').createServer((req,res)=>{
      const relative=decodeURIComponent(new URL(req.url,'http://local').pathname),root=path.resolve(__dirname,'..');
      const file=path.resolve(root,'.'+relative+(relative.endsWith('/')?'index.html':''));
      if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
      fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(bytes)});
    });
    await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));port=server.address().port;base=`http://127.0.0.1:${port}`;
  }
  async function stopServer(){if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
  if(process.env.OCR_MANAGED_SERVER==='1')await startServer();
  const engine=process.env.OCR_BROWSER==='webkit'?webkit:chromium;
  const browser=await engine.launch({headless:true,...(process.env.OCR_BROWSER_EXECUTABLE?{executablePath:process.env.OCR_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:375,height:812}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[],requests=[];
  page.on('dialog',dialog=>dialog.accept());
  page.on('pageerror',error=>errors.push(error.message));
  context.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER',msg.text().slice(0,250))});
  try{
    await page.goto(base);await page.waitForFunction(()=>typeof openRecipeCreation==='function');
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.equal(requests.filter(r=>r.url.includes('/vendor/ocr-')).length,0,'OCR must be lazy');
    async function png(text,{dark=false,size=28,mimeType='image/png'}={}){
      const data=await page.evaluate(({text,dark,size,mimeType})=>{
        const canvas=document.createElement('canvas'),lines=text.split('\n');canvas.width=1000;canvas.height=Math.max(180,lines.length*(size+12)+60);
        const ctx=canvas.getContext('2d');ctx.fillStyle=dark?'#151515':'white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=dark?'white':'black';ctx.font=`${size}px Arial`;
        lines.forEach((line,i)=>ctx.fillText(line,30,45+i*(size+12)));return canvas.toDataURL(mimeType).split(',')[1];
      },{text,dark,size,mimeType});return Buffer.from(data,'base64');
    }
    const first=await png('Rezept: Mandelkuchen\nZutaten für eine Backform (30 x 40 cm)\nFür den Boden und die Streusel:\n450 g Weizenmehl\n150 g gemahlene Mandeln\n150 g Marzipanrohmasse\n300 g kalte Butter\n130 g Zucker\n1 Pck. Vanillezucker\n1 Prise Salz\n1 Ei\nZusätzlich für die Streusel:\n50 g gemahlene Mandeln\nFür die Füllung:\n400 g Erdbeerkonfitüre');
    const second=await png('Zubereitung\n1. Marzipan fein raspeln und verkneten.\n2. Teig in die Backform geben.\n3. Erdbeerkonfitüre verstreichen.\n4. Mandeln unter den restlichen Teig kneten.\n5. Bei 180 Grad für 20 Minuten backen.\n6. Vollständig auskühlen lassen.\nTipp: In einer Dose aufbewahren.');
    const blank=await png('');
    await page.evaluate(()=>openRecipeCreation());await page.locator('#recipe-import-screenshot-choice').click();
    const panel=page.locator('#recipe-import-input .screenshot-import');
    await panel.locator('input').dispatchEvent('cancel',{bubbles:true});
    assert(await page.locator('#recipe-import-dialog').evaluate(el=>el.open),'Cancelling the file picker keeps the import open');
    await panel.locator('input').setInputFiles([{name:'schritte.png',mimeType:'image/png',buffer:second},{name:'zutaten.png',mimeType:'image/png',buffer:first},{name:'leer.png',mimeType:'image/png',buffer:blank}]);
    await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-start').disabled===false);
    await panel.getByRole('button',{name:'Nach oben: Screenshot 2',exact:true}).click();
    assert.equal(await page.locator('#recipe-import-text').isVisible(),false);
    await page.evaluate(()=>{document.querySelector('#recipe-import-text').value='Quelle: Synthetischer Browsertest'});
    const start=Date.now();await panel.locator('.screenshot-start').click();
    await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-cancel').hidden,{},{timeout:120000});
    const source=await page.locator('#recipe-import-text').inputValue();console.log('OCR',Date.now()-start,'ms');fs.writeFileSync(path.join(output,'synthetic-source.txt'),source);
    assert.match(source,/Quelle: Synthetischer Browsertest/);assert.match(await panel.locator('.screenshot-error').innerText(),/Screenshot 3/);
    const parsed=await page.evaluate(text=>WochentischRecipeImport.parse(text),source);
    console.log('PARSED',parsed.ingredients.length,'ingredients',parsed.steps.length,'steps');assert.equal(parsed.ingredients.length,10);assert.equal(parsed.steps.length,6);assert.equal(parsed.servings,null);
    assert.deepEqual(parsed.ingredients.filter(x=>x.name.includes('Mandeln')).map(x=>x.amount),[150,50]);
    assert(await page.evaluate(()=>WochentischOCR.offlineReady()));
    await page.screenshot({path:path.join(output,'375-light.png')});
    await page.locator('#recipe-import-analyze').click();
    assert.equal(await page.locator('#dish-recipe-title').inputValue(),'Mandelkuchen');
    assert.equal(await page.locator('.recipe-import-source textarea').count(),0);
    assert.equal(await page.locator('.recipe-import-source pre').count(),1);
    assert.equal(await page.locator('#dish-import-source-text').textContent(),source);
    assert.equal(await page.evaluate(()=>state.dishes.length),0,'Draft must not save');
    for(const [key,selector,count] of [['ingredients','#recipe-ingredient-rows .recipe-ingredient-row',10],['preparation','#recipe-step-rows .recipe-step-row',6]]){
      await page.evaluate(key=>{dishWizardStep=dishWizardSteps().findIndex(step=>step.key===key);renderDishWizard()},key);
      assert(await page.locator('.recipe-import-source').evaluate(el=>el.open));
      assert.equal(await page.locator(selector+':visible').count(),count);
      if(key==='ingredients'){
        await page.locator(selector).first().scrollIntoViewIfNeeded();
        for(const theme of ['light','dark']){
          await page.emulateMedia({colorScheme:theme});
          if(theme==='dark')await page.waitForFunction(()=>getComputedStyle(document.querySelector('#dish-form.is-imported-ingredients .recipe-ingredient-name input')).color==='rgb(224, 245, 232)');
          await page.screenshot({path:path.join(output,`ingredients-${theme}.png`)});
          const styles=await page.locator(selector+' input[data-recipe-field="name"]').first().evaluate(el=>({font:getComputedStyle(el).fontWeight,size:getComputedStyle(el).fontSize}));
          assert(Number(styles.font)>=700);assert.equal(styles.size,'16px');
        }
        await page.emulateMedia({colorScheme:'light'});
      }
      assert.equal(await page.locator('#dish-import-source-text').evaluate(el=>getComputedStyle(el).overflowY),'visible');
    }
    await page.evaluate(()=>{dishWizardStep=dishWizardSteps().length-1;renderDishWizard();document.querySelector('#dish-form').requestSubmit()});
    await page.waitForFunction(()=>state.dishes.length===1);
    const saved=await page.evaluate(()=>state.dishes[0]);
    assert.equal(saved.recipe.ingredients.length,10);assert.equal(saved.recipe.steps.length,6);assert.equal(saved.recipe.servings,null);
    assert(!JSON.stringify(saved).includes('Synthetischer Browsertest'));assert(!JSON.stringify(saved).includes('.png'));
    await page.waitForTimeout(50);
    await page.evaluate(()=>{openDish();document.querySelector('#dish-recipe-title').value='Mandelkuchen';dishWizardStep=dishWizardSteps().length-1;renderDishWizard();document.querySelector('#dish-form').requestSubmit()});
    assert.match(await page.locator('#dish-form-error').innerText(),/existiert bereits/);assert.equal(await page.evaluate(()=>state.dishes.length),1);
    await page.locator('#close-dish-dialog').click();
    await page.waitForTimeout(50);
    // Test each section using the same actual file-selection / OCR / parse path.
    const cases=[['ingredients','Zutaten für 4 Portionen\n1/2 kg Tomaten\n1,5 EL Öl\n2–3 Eier\nSalz nach Geschmack'],['preparation','1. Tomaten und Gurken schneiden.\nAlles gründlich vermischen.\n2. Mit Öl servieren.'],['nutrition','Nährwerte pro Portion\n430 kcal\nEiweiß: 22,5 g\nFett: 12 g\nKohlenhydrate: 45 g']];
    for(const [section,text] of cases){
      const buffer=await png(text,{dark:section==='nutrition'});
      await page.evaluate(key=>{openDish();dishWizardStep=dishWizardSteps().findIndex(s=>s.key===key);renderDishWizard();sectionImportPanels[key].panel.open=true;sectionImportPanels[key].ocr.panel.open=true},section);
      const sectionPanel=page.locator('.dish-section-import').filter({has:page.locator(`#dish-section-${section}-text`)});
      await sectionPanel.locator('input[type=file]').setInputFiles({name:section+'.png',mimeType:'image/png',buffer});
      await sectionPanel.locator('.screenshot-start').click();
      await page.waitForFunction(key=>sectionImportPanels[key].panel.querySelector('.screenshot-cancel').hidden,section,{timeout:120000});
      console.log(section,await page.locator(`#dish-section-${section}-text`).inputValue());
      // Review and correction are deliberate, especially for ambiguous g/9.
      if(section==='nutrition')await page.locator(`#dish-section-${section}-text`).fill(text);
      await sectionPanel.locator('.dish-section-import-action').click();
      assert.match(await sectionPanel.locator('.dish-section-import-status').innerText(),/Import abgeschlossen/);
      await page.evaluate(()=>document.querySelector('#dish-dialog').close());await page.waitForTimeout(50);
    }
    // Cancellation and reopening never attach a previous job's result.
    await page.evaluate(()=>openRecipeCreation());await page.locator('#recipe-import-screenshot-choice').click();
    await panel.locator('input').setInputFiles({name:'abbrechen.png',mimeType:'image/png',buffer:first});
    await page.waitForFunction(()=>!document.querySelector('#recipe-import-input .screenshot-start').disabled);
    await page.evaluate(()=>{document.querySelector('#recipe-import-input .screenshot-start').click();document.querySelector('#recipe-import-input .screenshot-cancel').click()});
    assert.match(await panel.locator('.screenshot-status').innerText(),/abgebrochen/);
    await page.locator('#recipe-import-close').click();await page.waitForTimeout(50);
    await page.evaluate(()=>openRecipeCreation());await page.locator('#recipe-import-screenshot-choice').click();
    await page.waitForTimeout(150);assert.equal(await page.locator('#recipe-import-text').inputValue(),'');assert.equal(await panel.locator('li').count(),0);
    await panel.locator('input').setInputFiles({name:'kaputt.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
    await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-cancel').hidden);
    assert.match(await panel.locator('.screenshot-error').innerText(),/Bildformat/);
    // Valid JPEG and WebP files traverse the real browser decoder and OCR.
    const jpeg=await png('Zutaten\n250 g Reis',{mimeType:'image/jpeg'}),webp=await png('Zutaten\n250 g Reis',{mimeType:'image/webp'});
    await panel.locator('input').setInputFiles([{name:'reis.jpg',mimeType:'image/jpeg',buffer:jpeg},{name:'reis.webp',mimeType:'image/webp',buffer:webp}]);
    await panel.locator('.screenshot-start').click();await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-cancel').hidden,{},{timeout:120000});
    assert.equal((await page.locator('#recipe-import-text').inputValue()).match(/250 g Reis/g)?.length,2,'Repeated ingredients remain separate');
    await panel.locator('input').setInputFiles(Array.from({length:4},(_,i)=>({name:`extra-${i}.png`,mimeType:'image/png',buffer:first})));
    assert.match(await panel.locator('.screenshot-error').innerText(),/Maximal 5/);assert.equal(await panel.locator('li').count(),2);
    await page.locator('#recipe-import-close').click();await page.waitForTimeout(50);
    // A fresh page must run OCR entirely from the completed cache while offline.
    // Playwright WebKit's offline emulation rejects even SW cache responses
    // (upstream #42775). Stopping our isolated origin tests real cache fallback.
    if(server)await stopServer();else await context.setOffline(true);
    await page.reload();await page.waitForFunction(()=>typeof openRecipeCreation==='function');
    await page.evaluate(()=>openRecipeCreation());await page.locator('#recipe-import-screenshot-choice').click();
    await panel.locator('input').setInputFiles({name:'offline.png',mimeType:'image/png',buffer:first});await panel.locator('.screenshot-start').click();
    await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-cancel').hidden,{},{timeout:120000});
    assert.match(await page.locator('#recipe-import-text').inputValue(),/450 g Weizenmehl/);
    for(const [width,height,dark] of [[320,568,false],[375,812,true],[812,375,true],[1280,800,false],[375,360,false]]){
      await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:dark?'dark':'light',reducedMotion:'reduce'});
      if(dark)await page.waitForFunction(()=>getComputedStyle(document.querySelector('#recipe-import-dialog')).backgroundColor==='rgb(28, 36, 46)');
      else await page.waitForFunction(()=>getComputedStyle(document.querySelector('#recipe-import-dialog')).backgroundColor!=='rgb(28, 36, 46)');
      await page.screenshot({path:path.join(output,`${width}-${height}-${dark?'dark':'light'}.png`)});
      const overflow=await page.locator('#recipe-import-dialog').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,children:[...el.querySelectorAll('*')].filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right).map(child=>[child.tagName,child.className,child.getBoundingClientRect().width])}));
      assert(overflow.scroll<=overflow.width,JSON.stringify({width,height,overflow}));
    }
    // A missing file in a previously complete cache must fail honestly offline.
    await page.evaluate(async()=>{
      const name=(await caches.keys()).find(name=>name.startsWith('wochentisch-ocr-'));
      const cache=await caches.open(name),file=(await cache.keys()).find(request=>request.url.endsWith('deu.traineddata.gz'));
      await cache.delete(file);
    });
    assert.equal(await page.evaluate(()=>WochentischOCR.offlineReady()),false);
    await panel.locator('input').setInputFiles({name:'fehlender-cache.png',mimeType:'image/png',buffer:first});
    await panel.locator('.screenshot-start').click();
    await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-cancel').hidden,{},{timeout:30000});
    assert.match(await panel.locator('.screenshot-error').innerText(),/Internet/);
    if(process.env.OCR_ORIGINAL_SCREENSHOT){
      if(server)await startServer();else await context.setOffline(false);
      await page.locator('#recipe-import-close').click();await page.waitForTimeout(50);
      await page.evaluate(()=>openRecipeCreation());await page.locator('#recipe-import-screenshot-choice').click();
      await panel.locator('input').setInputFiles(process.env.OCR_ORIGINAL_SCREENSHOT);
      await panel.locator('.screenshot-start').click();
      await page.waitForFunction(()=>document.querySelector('#recipe-import-input .screenshot-cancel').hidden,{},{timeout:120000});
      const originalText=await page.locator('#recipe-import-text').inputValue();
      const originalParsed=await page.evaluate(text=>WochentischRecipeImport.parse(text),originalText);
      console.log('ORIGINAL SCREENSHOT',originalParsed.ingredients.length,'ingredients',originalParsed.steps.length,'steps');fs.writeFileSync(path.join(output,'original-result.json'),JSON.stringify({text:originalText,parsed:originalParsed},null,2));
      assert.equal(originalParsed.ingredients.length,10);assert.equal(originalParsed.steps.length,6);assert.equal(originalParsed.servings,null);
    }
    assert.equal(errors.length,0,errors.join('\n'));
    assert(requests.filter(r=>r.url.includes('/vendor/ocr-')).every(r=>r.url.startsWith(base)&&r.method==='GET'));
    console.log('PASS: real OCR, all four import targets, sequential images, blank-image failure, preserved source, save/duplicate, cancel/reopen, damaged image, offline reload, incomplete cache, responsive layouts.');
    fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(requests,null,2));
  }finally{await browser.close();await stopServer()}
})().catch(error=>{console.error(error);process.exitCode=1});
