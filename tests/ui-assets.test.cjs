const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('CSP permits the exact inline service-worker bootstrap',()=>{
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){
    const hash=crypto.createHash('sha256').update(match[1].replace(/\r\n/g,'\n')).digest('base64');assert(html.includes(`'sha256-${hash}'`));
  }
});
test('the offline shell contains all local script and stylesheet entry points',()=>{
  const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');const shell=worker.slice(worker.indexOf('const APP_SHELL = ['),worker.indexOf('const shellUrls'));
  for(const match of html.matchAll(/(?:src|href)="([^"?]+)(?:\?[^" ]*)?"/g)){
    const asset=match[1];if(!/\.(?:js|css)$/.test(asset)||asset.startsWith('https:'))continue;
    assert(fs.existsSync(path.join(root,asset)),asset+' must exist');assert(shell.includes(`'./${asset.replace(/^\.\//,'')}'`),asset+' must be cached');
  }
});
test('all recipe photos have a substantially smaller gallery image',()=>{for(const name of fs.readdirSync(path.join(root,'images/recipes')).filter(name=>name.endsWith('.jpg')&&!name.endsWith('-thumb.jpg'))){const original=path.join(root,'images/recipes',name),card=original.replace(/\.jpg$/,'-card.webp');assert(fs.existsSync(card),name);assert(fs.statSync(card).size<fs.statSync(original).size*.5,name+' card should save at least half the original transfer')}});
