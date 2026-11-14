// Documentation tooling only; no dependency of the production app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.WOCHENTISCH_PLAYWRIGHT_MODULE||'playwright');
const base=path.resolve(__dirname,'..');
const screens=[
 ['week','01-wochenplan'],['dishes','02-gerichte'],['recipe','03-rezeptdetails'],
 ['prepare','04-zubereiten'],['cook','05-kochmodus'],['shopping','06-einkaufszettel'],['edit','07-rezept-bearbeiten']
];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true});
 const screenshotPage=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[],remoteRequests=[],files=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,route=>{remoteRequests.push(route.request().url());return route.abort()});
 await page.goto(pathToFileURL(path.join(base,'preview.html')).href);
 // Give the exported iframe enough height to capture complete phone contents.
 // Otherwise element screenshots can contain clipped areas at the iframe edge.
 await page.addStyleTag({content:'body{padding:0!important}iframe#codex-visualization{height:3000px!important}'});
 const frame=page.frameLocator('iframe');
 await frame.locator('#wt-screens .ws-phone svg').first().waitFor({state:'attached'});
 const content=page.frames().find(f=>f!==page.mainFrame());
 await content.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 for(const theme of ['light','dark']){
  const dir=path.join(base,'screenshots',theme);fs.mkdirSync(dir,{recursive:true});
  await frame.locator('[data-appearance="'+theme+'"]').click();
  const select=async id=>{await frame.locator('#ws-tab-'+id).click();await frame.locator('#ws-'+id).waitFor({state:'visible'})};
  const capture=async(id,name)=>{
   const dest=path.join(dir,name+'.png');
   // Capture the actual rendered DOM in a top-level page. Chrome's iframe
   // compositor can clip full-element screenshots below the visible viewport.
   // Freeze scripts and synchronize checkbox attributes before serializing.
   await content.evaluate(()=>document.querySelectorAll('input[type="checkbox"]').forEach(e=>e.toggleAttribute('checked',e.checked)));
   const frozen=(await content.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   await screenshotPage.emulateMedia({colorScheme:theme});
   await screenshotPage.setContent(frozen);
   await screenshotPage.addStyleTag({content:'html,body,.ws-stage{background:'+(theme==='dark'?'#171b21':'#f6f7fa')+'!important}'});
   await screenshotPage.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
   await screenshotPage.locator('[data-screen="'+id+'"]').screenshot({path:dest});
   files.push(path.relative(base,dest).replaceAll('\\','/'));
  };
  for(const[id,name]of screens){await select(id);await capture(id,name)}
  await select('week');await frame.locator('#ws-week .ws-menu summary').click();
  await capture('week','08-wochenplan-menue');await frame.locator('#ws-week .ws-menu summary').click();
  await select('shopping');await frame.locator('#ws-shopping .ws-menu summary').click();
  await capture('shopping','09-einkaufsfilter');await frame.locator('#ws-shopping .ws-menu summary').click();
  const row=frame.locator('[data-shopping-row="1"]');
  await row.locator('input').focus();await page.keyboard.press('Enter');
  await frame.locator('.ws-item-popover:not([hidden])').waitFor({state:'visible'});
  await frame.locator('.ws-item-popover:not([hidden]) [data-close-grocery]').evaluate(e=>e.blur());
  await capture('shopping','10-artikel-gerichtzuordnung');await frame.locator('.ws-item-popover:not([hidden]) [data-close-grocery]').click();
  await row.locator('input').check();await frame.locator('[data-grocery="2"]').check();
  await capture('shopping','11-artikel-abgehakt');
  await row.locator('input').uncheck();await frame.locator('[data-grocery="2"]').uncheck();
 }
 const result={designDate:'2026-11-14',viewport:{width:390,height:844},deviceScaleFactor:1,
  browser:await browser.version(),screens:screens.length,screenshots:files.length,files,
  sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'mockups.fragment.html'))).digest('hex'),
  remoteRequests,errors,notes:'Full-content captures of mobile mockups in desktop Chrome with touch emulation; no real iPhone/Safari test.'};
 fs.writeFileSync(path.join(base,'capture-manifest.json'),JSON.stringify(result,null,2)+'\n');
 await browser.close();
 if(errors.length||remoteRequests.length)throw new Error(JSON.stringify({errors,remoteRequests}));
 console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
