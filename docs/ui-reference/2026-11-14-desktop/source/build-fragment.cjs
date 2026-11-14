// Documentation tooling only. Reuses embedded media from the saved mobile reference.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const mobile=fs.readFileSync(path.resolve(base,'../2026-11-14/source/mockups.fragment.html'),'utf8');
const photos=JSON.parse(mobile.match(/const photos=(\[[^\r\n]*\]);/)[1]);
const recipes=JSON.parse(mobile.match(/const recipes=(\[[^\r\n]*\]);/)[1]);
const fonts=[...mobile.matchAll(/src:url\('(data:font\/ttf;base64,[^']+)'\)/g)].map(m=>m[1]);
if(fonts.length!==2||photos.length!==5||recipes.length!==5)throw new Error('Unexpected mobile reference assets');
const indices=[0,1,2,4];
let source=fs.readFileSync(path.join(__dirname,'desktop-week.template.html'),'utf8');
source=source.replace('__FONT_REGULAR__',fonts[0]).replace('__FONT_BOLD__',fonts[1]);
source=source.replace('__ASSETS__',JSON.stringify({photos:indices.map(i=>photos[i]),recipes:indices.map(i=>recipes[i])}));
if(Buffer.byteLength(source)>1000000)throw new Error('Fragment exceeds 1 MB');
fs.writeFileSync(path.join(__dirname,'mockups.fragment.html'),source);
if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),source);
console.log(JSON.stringify({bytes:Buffer.byteLength(source),selectedLayout:'agenda',photos:4}));
