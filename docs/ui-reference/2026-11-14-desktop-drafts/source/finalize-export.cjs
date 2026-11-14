// Run after exporting mockups.fragment.html with the Visualize standalone renderer.
// Embeds the icon library so the saved reference works without network access.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const icons=process.env.WOCHENTISCH_LUCIDE_MODULE||path.dirname(require.resolve('lucide/package.json'));
const file=path.join(base,'preview.html');
let document=fs.readFileSync(file,'utf8');
const match=document.match(/data-srcdoc="([^"]*)"/);
if(!match)throw new Error('Standalone iframe not found');
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const encode=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
let frame=decode(match[1]);
const external=/<script id="codex-visualization-lucide" async src="[^"]+"><\/script>/;
if(!external.test(frame))throw new Error('Expected exported Lucide script not found');
const code=fs.readFileSync(path.join(icons,'dist/umd/lucide.min.js'),'utf8').replace(/<\/script/gi,'<\\/script');
frame=frame.replace(external,()=>'<script id="codex-visualization-lucide">'+code+'</script>');
document=document.replace(match[0],()=>`data-srcdoc="${encode(frame)}"`).replaceAll('lang="en"','lang="de"');
document=document.replace('</head>','<style>body{padding:0!important}iframe#codex-visualization{height:100dvh}</style></head>');
fs.writeFileSync(file,document);
fs.copyFileSync(path.join(icons,'LICENSE'),path.join(__dirname,'lucide-LICENSE.txt'));
console.log(JSON.stringify({bytes:Buffer.byteLength(document),icons:JSON.parse(fs.readFileSync(path.join(icons,'package.json'),'utf8')).version}));
