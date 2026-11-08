const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const ocr=require('../ocr-import.js');
const assets=require('../ocr-assets.js');

function png(width=100,height=100){const bytes=new Uint8Array(24),view=new DataView(bytes.buffer);view.setUint32(0,0x89504e47);view.setUint32(4,0x0d0a1a0a);view.setUint32(16,width);view.setUint32(20,height);return bytes}
const file=()=>({name:'rezept.png',size:24,type:'image/png',arrayBuffer:async()=>png().buffer});
test('validates supported files and rejects oversize or unsupported input',()=>{
  for(const type of ['image/png','image/jpeg','image/webp'])assert.doesNotThrow(()=>ocr.validateFile({size:123,type}));
  assert.throws(()=>ocr.validateFile({size:ocr.MAX_BYTES+1,type:'image/png'}),/10 MB/);
  assert.throws(()=>ocr.validateFile({size:5,type:'image/heic'}),/PNG/);
  assert.throws(()=>ocr.dimensions(new Uint8Array([1,2,3])),/Bildformat/);
});
test('checks PNG pixel limits before image decoding without reducing or cropping',()=>{
  assert.deepEqual(ocr.dimensions(png(2000,4000)),[2000,4000]);
  assert.doesNotThrow(()=>ocr.validateDimensions(2000,4000));
  assert.throws(()=>ocr.validateDimensions(...ocr.dimensions(png(2001,4000))),/8 Megapixel/);
  assert.throws(()=>ocr.validateDimensions(0,100),/gültige Größe/);
});
test('reads JPEG and WebP dimensions',()=>{
  assert.deepEqual(ocr.dimensions(new Uint8Array([255,216,255,192,0,7,8,0,40,0,80])),[80,40]);
  const bytes=new Uint8Array(30);bytes.set(Buffer.from('RIFF'));bytes.set(Buffer.from('WEBPVP8X'),8);bytes[24]=79;bytes[27]=39;
  assert.deepEqual(ocr.dimensions(bytes),[80,40]);
});
test('all pinned assets exist and match their documented hashes',()=>{
  const manifest=JSON.parse(fs.readFileSync(require.resolve('../vendor/ocr-7.0.0/checksums.json'),'utf8'));
  for(const name of assets.files){
    const bytes=fs.readFileSync(require.resolve('../'+name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest[name.split('/').pop()]);
  }
});

function harness({cached=true,initPending=false,failFetch=false}={}){
  const cache=new Map(),requests=[],workers=[];
  if(cached)assets.files.forEach(path=>cache.set('https://app.test/sub/'+path,new Response('asset')));
  class LocalURL extends URL{static createObjectURL(){return 'blob:local-image'}static revokeObjectURL(){}}
  class Image{naturalWidth=100;naturalHeight=100;set src(value){if(value)queueMicrotask(()=>this.onload?.())}}
  class Worker{
    constructor(url){assert.equal(url.origin,'https://app.test');workers.push(this)}
    postMessage(data){
      if(data.type==='init'&&!initPending)queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
      if(data.type==='recognize')queueMicrotask(()=>this.onmessage?.({data:{type:'result',text:'250 g Reis'}}));
    }
    terminate(){this.terminated=true}
  }
  const context={WochentischOCRAssets:assets,URL:LocalURL,Image,Worker,DOMException,AbortController,Uint8Array,DataView,Blob,Promise,setTimeout,clearTimeout,
    document:{currentScript:{src:'https://app.test/sub/ocr-import.js?v=test'},createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob:fn=>fn(new Blob([png()]))})},
    caches:{open:async()=>({match:async url=>cache.get(url)?.clone(),put:async(url,response)=>{await response.arrayBuffer();cache.set(url,new Response('asset'))}})},
    fetch:async(url,options)=>{requests.push({url,options});if(failFetch)throw Error('offline');return new Response('asset')},module:{exports:{}}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../ocr-import.js'),'utf8'),context);
  return {api:context.module.exports,workers,requests,cache};
}
test('sequential OCR uses one recognizer, retains duplicate text, and sends no image requests',async()=>{
  const h=harness(),results=await h.api.recognize([file(),file()]);
  assert.deepEqual(Array.from(results,r=>r.text),['250 g Reis','250 g Reis']);
  assert.equal(h.workers.length,1);assert(h.workers[0].terminated);assert.equal(h.requests.length,0);
});
test('first use downloads only the same-origin pinned assets and enables offline readiness only when complete',async()=>{
  const h=harness({cached:false});assert.equal(await h.api.offlineReady(),false);
  await h.api.recognize([file()]);assert.equal(await h.api.offlineReady(),true);
  assert.equal(h.requests.length,assets.files.length);
  for(const {url,options} of h.requests){assert(url.startsWith('https://app.test/sub/vendor/'));assert.equal(options.redirect,'error');assert.equal(options.body,undefined)}
  h.cache.delete(h.requests[0].url);assert.equal(await h.api.offlineReady(),false);
});
test('an interrupted asset download cannot claim offline support or start a worker',async()=>{
  const h=harness({cached:false,failFetch:true});await assert.rejects(h.api.recognize([file()]),/Internet/);
  assert.equal(await h.api.offlineReady(),false);assert.equal(h.workers.length,0);
});
test('abort during worker initialization terminates immediately and permits a new run',async()=>{
  const h=harness({initPending:true}),controller=new AbortController();
  const promise=h.api.recognize([file()],{signal:controller.signal});
  while(!h.workers.length)await new Promise(resolve=>setImmediate(resolve));
  const rejection=assert.rejects(promise,{name:'AbortError'});controller.abort();await rejection;
  assert(h.workers[0].terminated);
  const next=new AbortController();next.abort();await assert.rejects(h.api.recognize([file()],{signal:next.signal}),{name:'AbortError'});
});
test('oversized batches are rejected before downloading or starting a worker',async()=>{
  const h=harness();await assert.rejects(h.api.recognize(Array.from({length:6},file)),/fünf/);assert.equal(h.workers.length,0);
});

const {prepare}=require('../ocr-layout.js');
function line(text,x=20,confidence=95){return {text,bbox:{x0:x,y0:0,y1:20,x1:400},words:text.split(' ').map((text,index)=>({text,confidence:index?95:confidence}))}}
function layout(lines){return {text:lines.map(l=>l.text).join('\n'),blocks:[{paragraphs:[{lines}]}]}}
test('OCR layout removes isolated icon artifacts before headings and quantities, retaining raw text',()=>{
  const input=layout([line('& Zutaten'),line('Ä 1 Prise Salz',20,0),line('@ 150 g Mandeln'),line('@ 50 g Mandeln'),line("'r Mein Tipp: Kühl lagern.",20,0)]);
  const result=prepare(input);assert.equal(result.rawText,input.text);assert.match(result.text,/^Zutaten\n1 Prise Salz\n150 g Mandeln\n50 g Mandeln\nMein Tipp:/);
});
test('OCR layout does not repair ambiguous digits, minus signs, fractions or ingredient names',()=>{
  for(const text of ['- 10 g Mehl','7 150 g Mandeln','1/2 kg Mehl','Fett: 129','ÖI nach Geschmack','Bio 150 g Mandeln'])assert.equal(prepare(layout([line(text,20,0)])).text,text);
});
test('repeated visual first-line indentation preserves steps without inventing numbering',()=>{
  const result=prepare(layout([line('Zubereitung'),line('Gemüse schneiden',60),line('und mischen.'),line('Öl hinzufügen',60),line('und umrühren.'),line('Alles anrichten.',60)]));
  assert.match(result.text,/mischen\.\n\nÖl/);assert.match(result.text,/umrühren\.\n\nAlles/);
  const parsed=require('../recipe-import.js').parse(result.text);assert.equal(parsed.steps.length,3);
});
test('an isolated indentation never splits a continuation line',()=>{
  const input=layout([line('Zubereitung'),line('Gemüse schneiden.'),line('Mit Öl servieren.',60)]);
  assert.equal(require('../recipe-import.js').parse(prepare(input).text).steps.length,1);
});
