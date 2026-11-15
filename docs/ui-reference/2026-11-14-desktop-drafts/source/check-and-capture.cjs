// Documentation-only inspection/capture tool. Requires Playwright and Google Chrome.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const base=path.resolve(__dirname,'..');
const desktop=[{width:1440,height:900},{width:1280,height:800},{width:1024,height:768}];
const fallback=[{width:736,height:390},{width:390,height:844},{width:320,height:568},{width:390,height:340}];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:desktop[0],deviceScaleFactor:1});
 const shot=await browser.newPage({viewport:desktop[0],deviceScaleFactor:1});
 const errors=[],network=[],layouts=[],checks=[],files=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,route=>{network.push(route.request().url());return route.abort()});
 await page.goto(pathToFileURL(path.join(base,'preview.html')).href);
 const frame=page.frameLocator('iframe');
 await frame.locator('.dt-agenda .dt-day-row svg').first().waitFor({state:'attached'});
 const content=page.frames().find(f=>f!==page.mainFrame());
 await content.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 async function variant(name){if(!await frame.locator('[data-layout="'+name+'"]').isVisible())await frame.locator('.viz-carousel-next').click();await frame.locator('[data-layout="'+name+'"]').waitFor({state:'visible'})}
 async function capture(layout,name,viewport,theme){
  const dir=path.join(base,'screenshots',theme);fs.mkdirSync(dir,{recursive:true});
  const destination=path.join(dir,name+'.png');
  await content.evaluate(()=>document.querySelectorAll('input[type="checkbox"]').forEach(e=>e.toggleAttribute('checked',e.checked)));
  const frozen=(await content.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  await shot.setViewportSize(viewport);await shot.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await shot.setContent(frozen);await shot.addStyleTag({content:'html,body,.dt-stage{background:'+(theme==='dark'?'#171b21':'#f6f7fa')+'!important}'});
  await shot.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
  await shot.locator('[data-layout="'+layout+'"]').screenshot({path:destination});
  files.push(path.relative(base,destination).replaceAll('\\','/'));
 }
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await frame.locator('[data-dt-theme="'+theme+'"]').click();
  for(const viewport of [...desktop,...fallback]){
   await page.setViewportSize(viewport);
   for(const layout of ['agenda','calendar']){
    await variant(layout);
    const result=await frame.locator('[data-layout="'+layout+'"]').evaluate(shell=>({
     shellWidth:shell.getBoundingClientRect().width,
     overflow:[...shell.querySelectorAll('*')].filter(e=>e.checkVisibility()&&!e.matches('input')&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>({cls:e.className,text:e.textContent.slice(0,50)})),
     gridColumns:shell.querySelector('.dt-grid')?getComputedStyle(shell.querySelector('.dt-grid')).gridTemplateColumns.split(' ').length:null,
     images:[...shell.querySelectorAll('img')].every(i=>i.naturalWidth>0),
     days:shell.querySelectorAll('[data-day]').length,
     menu:[...shell.querySelectorAll('.dt-menu-options button')].map(e=>e.textContent),
     font:document.fonts.check('14px DTComic')
    }));
    layouts.push({theme,...viewport,layout,...result});
    if(desktop.includes(viewport))await capture(layout,(layout==='agenda'?'01-wochenliste':'02-wochenraster')+'-'+viewport.width,viewport,theme);
   }
  }
  await page.setViewportSize(desktop[0]);await variant('agenda');
  let shell=frame.locator('[data-layout="agenda"]');
  await shell.locator('[data-day="2"]').click();
  checks.push({name:theme+' rest preview',pass:await shell.locator('[data-detail] .dt-rest-preview').isVisible()});
  await capture('agenda','03-wochenliste-resteabend',desktop[0],theme);
  await shell.locator('[data-day="4"]').click();
  checks.push({name:theme+' free-day preview',pass:await shell.locator('[data-detail] [data-choose="4"]').isVisible()});
  await capture('agenda','04-wochenliste-freier-tag',desktop[0],theme);
  await shell.locator('[data-day="0"]').click();
  await shell.locator('.dt-plan-menu summary').click();
  const menuFits=await shell.locator('.dt-menu-options').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth});
  checks.push({name:theme+' plan menu',pass:menuFits});
  await capture('agenda','05-planen-menue',desktop[0],theme);
  await shell.locator('[data-command="mix"]').click();
  checks.push({name:theme+' pantry inside mix flow',pass:await shell.locator('.dt-overlay [data-pantry]').count()===4});
  await capture('agenda','06-mischen-vorraete',desktop[0],theme);
  await page.keyboard.press('Escape');
  checks.push({name:theme+' escape and focus return',pass:await shell.locator('.dt-overlay').count()===0&&await shell.locator('summary').evaluate(e=>document.activeElement===e)});
  await variant('calendar');shell=frame.locator('[data-layout="calendar"]');
  await shell.locator('[data-day="0"]').focus();await page.keyboard.press('Enter');
  checks.push({name:theme+' grid keyboard opens detail',pass:await shell.locator('[role=dialog]').isVisible()});
  await capture('calendar','07-wochenraster-rezept',desktop[0],theme);
  await page.keyboard.press('Escape');
  checks.push({name:theme+' grid close restores focus',pass:await shell.locator('[data-day="0"]').evaluate(e=>document.activeElement===e)});
 }
 // Dialogs at reduced heights and narrow fallback widths.
 for(const viewport of [desktop[2],fallback[2],fallback[3]]){
  await page.setViewportSize(viewport);await variant('calendar');
  const shell=frame.locator('[data-layout="calendar"]');await shell.locator('[data-day="0"]').click();
  const dialog=await shell.locator('[role=dialog]').evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,height:r.height,available:innerHeight}});
  checks.push({name:'dialog fits '+viewport.width+'x'+viewport.height,pass:dialog.left>=0&&dialog.right<=dialog.width&&dialog.height<=dialog.available});
  await shell.locator('[data-close]').click();
 }
 // Local prototype: selection, adding a dish, pinning and mixing do not touch app data.
 await page.setViewportSize(desktop[0]);await variant('calendar');
 const c=frame.locator('[data-layout="calendar"]');
 await c.locator('[data-day="1"]').click();await c.locator('.dt-overlay [data-pin="1"]').click();await c.locator('[data-close]').click();
 checks.push({name:'dialog pin updates underlying grid',pass:await c.locator('[data-day="1"] .dt-grid-fixed').count()===1});
 await c.locator('[data-day="1"]').click();await c.locator('.dt-overlay [data-pin="1"]').click();await c.locator('[data-close]').click();
 await variant('agenda');
 const a=frame.locator('[data-layout="agenda"]');
 await a.locator('[data-day="1"]').click();
 checks.push({name:'Tuesday selection updates preview',pass:(await a.locator('[data-detail] h2').textContent()).includes('Tofu')});
 await a.locator('[data-day="4"]').click();await a.locator('[data-choose="4"]').click();await a.locator('[data-assign="1"]').click();
 checks.push({name:'free day can receive a recipe',pass:(await a.locator('[data-day="4"]').textContent()).includes('Tofu')});
 await a.locator('[data-day="0"]').click();
 const pinnedBefore=await a.locator('[data-day="0"] strong').last().textContent();
 await a.locator('summary').click();await a.locator('[data-command="mix"]').click();
 await a.locator('[data-pantry][value="Kartoffeln"]').check();await a.locator('[data-mix="pantry"]').click();
 checks.push({name:'mix preserves fixed Monday',pass:(await a.locator('[data-day="0"] strong').last().textContent())===pinnedBefore});
 const failures=layouts.filter(r=>r.overflow.length||!r.font||!r.images||r.days!==7||(r.layout==='calendar'&&r.width>=1280&&r.gridColumns!==7)||(r.layout==='calendar'&&r.width===1024&&r.gridColumns!==4));
 const result={status:'drafts-not-selected',designDate:'2026-11-14',browser:await browser.version(),files,screenshots:files.length,layouts,checks,errors,remoteRequests:network,layoutFailures:failures,
  sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'mockups.fragment.html'))).digest('hex'),
  notes:'Desktop Chrome only. Narrow layouts are fallback checks, not new mobile designs. No real iPhone/Safari or real iOS-keyboard test.'};
 fs.writeFileSync(path.join(base,'capture-manifest.json'),JSON.stringify(result,null,2)+'\n');
 await browser.close();
 console.log(JSON.stringify({screenshots:files.length,checkedLayouts:layouts.length,checks,errors,remoteRequests:network,layoutFailures:failures},null,2));
 if(errors.length||network.length||failures.length||checks.some(c=>!c.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
