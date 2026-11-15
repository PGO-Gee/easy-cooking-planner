// Captures the selected design only; production app and mobile references are untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const base=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const shot=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[],network=[],files=[],layouts=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,route=>{network.push(route.request().url());return route.abort()});
 await page.goto(pathToFileURL(path.join(base,'preview.html')).href);
 const frame=page.frameLocator('iframe');
 await frame.locator('.dt-agenda .dt-day-row svg').first().waitFor({state:'attached'});
 const content=page.frames().find(f=>f!==page.mainFrame());
 await content.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 const shell=frame.locator('[data-layout="agenda"]');
 async function capture(name,viewport,theme){
  const dir=path.join(base,'screenshots',theme);fs.mkdirSync(dir,{recursive:true});
  const dest=path.join(dir,name+'.png');
  await content.evaluate(()=>document.querySelectorAll('input[type="checkbox"]').forEach(e=>e.toggleAttribute('checked',e.checked)));
  const frozen=(await content.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  await shot.setViewportSize(viewport);await shot.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await shot.setContent(frozen);await shot.addStyleTag({content:'html,body,.dt-stage{background:'+(theme==='dark'?'#171b21':'#f6f7fa')+'!important}'});
  await shot.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
  await shot.locator('[data-layout="agenda"]').screenshot({path:dest});
  files.push(path.relative(base,dest).replaceAll('\\','/'));
 }
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await frame.locator('[data-dt-theme="'+theme+'"]').click();
  for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:1024,height:768}]){
   await page.setViewportSize(viewport);
   const result=await shell.evaluate(app=>({
    width:app.getBoundingClientRect().width,days:app.querySelectorAll('[data-day]').length,
    overflow:[...app.querySelectorAll('*')].filter(e=>e.checkVisibility()&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>e.className),
    images:[...app.querySelectorAll('img')].every(i=>i.naturalWidth>0),font:document.fonts.check('14px DTComic')
   }));
   layouts.push({theme,...viewport,...result});await capture('01-wochenliste-'+viewport.width,viewport,theme);
  }
  const viewport={width:1440,height:900};await page.setViewportSize(viewport);
  await shell.locator('[data-day="2"]').click();await capture('02-resteabend',viewport,theme);
  await shell.locator('[data-day="4"]').click();await capture('03-nicht-geplant',viewport,theme);
  await shell.locator('[data-day="0"]').click();await shell.locator('summary').click();await capture('04-planen-menue',viewport,theme);
  await shell.locator('[data-command="mix"]').click();await capture('05-mischen-vorraete',viewport,theme);
  await page.keyboard.press('Escape');
  if(!await shell.locator('summary').evaluate(e=>document.activeElement===e))errors.push('Focus return failed: '+theme);
 }
 const result={status:'selected',selectedLayout:'Wochenliste mit Gerichtsvorschau',decisionDate:'2026-11-14',browser:await browser.version(),screenshots:files.length,files,layouts,errors,remoteRequests:network,
  sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'mockups.fragment.html'))).digest('hex'),
  notes:'Desktop Chrome; no real iPhone/Safari test. Original comparison has additional fallback and interaction checks.'};
 fs.writeFileSync(path.join(base,'capture-manifest.json'),JSON.stringify(result,null,2)+'\n');
 await browser.close();
 console.log(JSON.stringify({screenshots:files.length,layouts:layouts.length,errors,remoteRequests:network,layoutFailures:layouts.filter(r=>r.overflow.length||r.days!==7||!r.images||!r.font)},null,2));
 if(errors.length||network.length||layouts.some(r=>r.overflow.length||r.days!==7||!r.images||!r.font))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
