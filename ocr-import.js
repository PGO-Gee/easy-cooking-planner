(function(root){
  'use strict';
  const assets=root.WochentischOCRAssets||(typeof require==='function'?require('./ocr-assets.js'):null);
  const base=typeof document!=='undefined'?new URL('.',document.currentScript.src):null;
  const MAX_FILES=5,MAX_BYTES=25*1024*1024,MAX_PIXELS=50000000;
  const abortError=()=>new DOMException('Abgebrochen','AbortError');
  const checkAbort=signal=>{if(signal?.aborted)throw abortError()};
  function validateFile(file){
    if(file.size>MAX_BYTES)throw Error('Das Bild ist größer als 25 MB. Bitte vorher zuschneiden.');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Bitte PNG, JPEG oder WebP auswählen.');
  }
  // Read dimensions before decoding, so a small compressed file cannot allocate
  // an unbounded canvas. EXIF orientation does not change the pixel count.
  function dimensions(bytes){
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
    const text=(start,len)=>String.fromCharCode(...bytes.subarray(start,start+len));
    if(n>=24&&v.getUint32(0)===0x89504e47&&v.getUint32(4)===0x0d0a1a0a)return [v.getUint32(16),v.getUint32(20)];
    if(n>=30&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
      const kind=text(12,4),u24=i=>bytes[i]+(bytes[i+1]<<8)+(bytes[i+2]<<16);
      if(kind==='VP8X')return [u24(24)+1,u24(27)+1];
      if(kind==='VP8 ')return [v.getUint16(26,true)&0x3fff,v.getUint16(28,true)&0x3fff];
      if(kind==='VP8L'&&bytes[20]===0x2f)return [1+((bytes[22]&0x3f)<<8|bytes[21]),1+((bytes[24]&15)<<10|bytes[23]<<2|bytes[22]>>6)];
    }
    if(n>4&&v.getUint16(0)===0xffd8){
      let i=2;
      while(i+3<n){
        if(bytes[i++]!==0xff)break;
        while(bytes[i]===0xff)i++;
        const marker=bytes[i++];
        if(marker===0xd9||marker===0xda)break;
        if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
        if(i+2>n)break;
        const length=v.getUint16(i);
        if(length<2||i+length>n)break;
        if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return [v.getUint16(i+5),v.getUint16(i+3)];
        i+=length;
      }
    }
    throw Error('Das Bildformat konnte nicht gelesen werden. Bitte ein anderes Bild auswählen.');
  }
  function validateDimensions(width,height){
    if(!(width>0&&height>0))throw Error('Das Bild hat keine gültige Größe.');
    if(width*height>MAX_PIXELS)throw Error('Das Bild hat mehr als 50 Megapixel. Bitte vorher zuschneiden.');
  }
  async function decode(file,signal){
    validateFile(file);checkAbort(signal);
    validateDimensions(...dimensions(new Uint8Array(await file.arrayBuffer())));checkAbort(signal);
    const url=URL.createObjectURL(file),img=new Image();
    try{
      await new Promise((resolve,reject)=>{
        const cleanup=()=>{img.onload=null;img.onerror=null;signal?.removeEventListener('abort',abort)};
        const abort=()=>{cleanup();img.src='';reject(abortError())};
        img.onload=()=>{cleanup();resolve()};
        img.onerror=()=>{cleanup();reject(Error('Das Bild ist beschädigt oder nicht lesbar.'))};
        signal?.addEventListener('abort',abort,{once:true});img.src=url;
      });
      checkAbort(signal);validateDimensions(img.naturalWidth,img.naturalHeight);return img;
    }finally{URL.revokeObjectURL(url)}
  }
  async function preview(file,signal){
    const img=await decode(file,signal),canvas=document.createElement('canvas');
    const scale=Math.min(1,180/Math.max(img.naturalWidth,img.naturalHeight));
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const thumbnail=canvas.toDataURL('image/png');img.src='';canvas.width=canvas.height=0;return thumbnail;
  }
  async function imageBytes(file,signal){
    const img=await decode(file,signal),canvas=document.createElement('canvas');
    try{
      // Bound the working canvas independently of the original camera resolution.
      const scale=Math.min(Math.sqrt(8000000/(img.naturalWidth*img.naturalHeight)),
        4096/Math.max(img.naturalWidth,img.naturalHeight),1);
      canvas.width=Math.max(1,Math.floor(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.floor(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Das Bild konnte nicht vorbereitet werden.');
      checkAbort(signal);return {image:await blob.arrayBuffer(),width:canvas.width,height:canvas.height};
    }finally{img.src='';canvas.width=canvas.height=0}
  }
  const compact=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  function sameRecipe(a,b){
    const left=compact(a),right=compact(b);
    return Math.min(left.length,right.length)>=12&&(left.startsWith(right)||right.startsWith(left));
  }
  function overlap(before,after,matches){
    let count=Math.min(before.length,after.length);
    while(count&&!before.slice(-count).every((item,i)=>matches(item,after[i])))count--;
    return count;
  }
  function combine(results){
    const parts=[];
    let pages=[];
    function flush(){
      if(!pages.length)return;
      const meta={},ingredients=[],steps=[];
      for(const page of pages){
        Object.assign(meta,page.meta);
        const shared=overlap(ingredients,page.ingredients,(a,b)=>compact(a.name)===compact(b.name)&&
          a.amount===b.amount&&a.unit.toLowerCase()===b.unit.toLowerCase());
        for(let i=0;i<shared;i++){
          const index=ingredients.length-shared+i;
          if(page.ingredients[i].note.length>ingredients[index].note.length)ingredients[index]=page.ingredients[i];
        }
        ingredients.push(...page.ingredients.slice(shared));
        const next=page.steps.slice();
        const previous=steps.at(-1);
        if(previous&&next[0]&&next[0].number===null){
          const left=previous.text.split(' '),right=next.shift().text.split(' ');
          const words=overlap(left,right,(a,b)=>a.toLowerCase()===b.toLowerCase());
          previous.text=[...left,...right.slice(words)].join(' ');
        }
        const repeated=overlap(steps,next,(a,b)=>a.number!==null&&a.number===b.number&&sameRecipe(a.text,b.text));
        for(let i=0;i<repeated;i++){
          const index=steps.length-repeated+i;
          if(next[i].text.length>steps[index].text.length)steps[index]={...next[i]};
        }
        steps.push(...next.slice(repeated).map(step=>({...step})));
      }
      const lines=[];
      if(meta.title)lines.push(`Rezept: ${meta.title}`);
      if(meta.servings)lines.push(`${meta.servings} Portionen`);
      if(meta.time)lines.push(`Gesamtzeit: ${meta.time} Min.`);
      if(ingredients.length){
        lines.push('Zutaten','| Zutat | Menge | Einheit | Hinweis |');
        for(const {name,amount,unit,note} of ingredients)
          lines.push(`| ${[name,amount,unit,note].map(value=>value.replace(/[|\t]/g,' ')).join(' | ')} |`);
      }
      if(steps.length)lines.push('Zubereitung',...steps.map(({number,text})=>number?`${number}. ${text}`:text));
      parts.push(lines.join('\n'));pages=[];
    }
    for(const result of results){
      if(!result.page){flush();parts.push(result.text);continue}
      if(pages.length&&!sameRecipe(pages.at(-1).label,result.page.label))flush();
      pages.push(result.page);
    }
    flush();
    return parts.filter(Boolean).join('\n\n');
  }
  const cacheName=()=>`wochentisch-ocr-${assets.version}:${base.href}`;
  async function offlineReady(){
    if(!root.caches)return false;
    const cache=await caches.open(cacheName());
    return (await Promise.all(assets.files.map(file=>cache.match(new URL(file,base).href)))).every(Boolean);
  }
  async function ensureAssets(signal,onProgress=()=>{}){
    if(!root.caches)throw Error('Die lokale Texterkennung benötigt einen Browser mit Offline-Speicher. Bitte stattdessen Text einfügen.');
    let cache;
    try{cache=await caches.open(cacheName())}catch{throw Error('Der Offline-Speicher ist nicht verfügbar. Bitte Browsereinstellungen prüfen oder Text einfügen.')}
    for(let i=0;i<assets.files.length;i++){
      checkAbort(signal);const url=new URL(assets.files[i],base).href;
      onProgress(`Erkennungsdateien vorbereiten (${i+1}/${assets.files.length}) …`);
      if(await cache.match(url))continue;
      try{
        const response=await fetch(url,{signal,cache:'no-cache',redirect:'error'});
        if(!response.ok)throw Error('Download fehlgeschlagen');
        await cache.put(url,response);checkAbort(signal);
      }catch(error){
        if(signal?.aborted)throw abortError();
        if(error.name==='QuotaExceededError')throw Error('Für die Erkennungsdateien ist nicht genug Gerätespeicher frei. Bitte Speicher freigeben oder Text einfügen.');
        throw Error('Erkennungsdateien nicht vollständig verfügbar. Bitte mit Internet erneut versuchen oder Text einfügen.');
      }
    }
    checkAbort(signal);
  }
  let active=false;
  async function recognize(files,{signal,onProgress=()=>{},onResult=()=>{}}={}){
    if(active)throw Error('Es läuft bereits eine Texterkennung. Bitte diese zuerst abbrechen.');
    if(!files.length||files.length>MAX_FILES)throw Error('Bitte ein bis fünf Bilder auswählen.');
    files.forEach(validateFile);active=true;
    let worker;
    try{
      await ensureAssets(signal,onProgress);checkAbort(signal);
      worker=new Worker(new URL('ocr-worker.js',base));
      let current=0,failed=false;
      const send=(type,payload={},transfer=[])=>new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null};
        const abort=()=>{cleanup();worker.terminate();reject(abortError())};
        const timeout=setTimeout(()=>{cleanup();failed=true;worker.terminate();reject(Error('Die Texterkennung dauert zu lange. Bitte ein kleineres Bild versuchen.'))},120000);
        signal?.addEventListener('abort',abort,{once:true});
        worker.onerror=()=>{cleanup();failed=true;reject(Error('Die lokale Texterkennung konnte nicht gestartet werden. Bitte Text einfügen oder einen aktuellen Browser verwenden.'))};
        worker.onmessage=({data})=>{
          if(data.type==='progress'){
            const percent=Math.round((data.progress.progress||0)*100);
            onProgress(current?`Bild ${current} von ${files.length}: ${percent} %`:'Lokale Texterkennung starten …');return;
          }
          cleanup();if(data.type==='error'){failed=true;reject(Error('Das Bild konnte nicht erkannt werden. Bitte Lesbarkeit prüfen oder Text einfügen.'))}else resolve(data);
        };
        if(signal?.aborted){abort();return}worker.postMessage({type,...payload},transfer);
      });
      await send('init');
      const results=[];
      for(let i=0;i<files.length;i++){
        checkAbort(signal);current=i+1;onProgress(`Bild ${current} von ${files.length} vorbereiten …`);
        let result;
        try{
          const input=await imageBytes(files[i],signal);checkAbort(signal);
          const data=await send('recognize',input,[input.image]);
          const text=data.page?combine([data]):data.text.trim();
          result=text?{index:i,text,rawText:data.rawText||data.text,page:data.page}:{index:i,error:'Kein lesbarer Text erkannt.'};
        }catch(error){if(signal?.aborted)throw error;result={index:i,error:error.message}}
        results.push(result);onResult(result);
        if(failed)throw Error('Die Erkennung wurde unterbrochen. Nicht erkannte Bilder bitte erneut versuchen; bereits erkannter Text bleibt erhalten.');
      }
      return results;
    }finally{worker?.terminate();active=false}
  }
  const api={MAX_FILES,MAX_BYTES,MAX_PIXELS,validateFile,dimensions,validateDimensions,preview,recognize,combine,offlineReady};
  root.WochentischOCR=api;if(typeof module==='object')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
