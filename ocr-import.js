(function(root){
  'use strict';
  const assets=root.WochentischOCRAssets||(typeof require==='function'?require('./ocr-assets.js'):null);
  const base=typeof document!=='undefined'?new URL('.',document.currentScript.src):null;
  const MAX_FILES=5,MAX_BYTES=10*1024*1024,MAX_PIXELS=8000000;
  const abortError=()=>new DOMException('Abgebrochen','AbortError');
  const checkAbort=signal=>{if(signal?.aborted)throw abortError()};
  function validateFile(file){
    if(file.size>MAX_BYTES)throw Error('Das Bild ist größer als 10 MB. Bitte vorher zuschneiden.');
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
    throw Error('Das Bildformat konnte nicht gelesen werden. Bitte einen neuen Screenshot auswählen.');
  }
  function validateDimensions(width,height){
    if(!(width>0&&height>0))throw Error('Das Bild hat keine gültige Größe.');
    if(width*height>MAX_PIXELS)throw Error('Das Bild hat mehr als 8 Megapixel. Bitte in kleinere Screenshots aufteilen oder zuschneiden.');
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
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Das Bild konnte nicht vorbereitet werden.');
      checkAbort(signal);return await blob.arrayBuffer();
    }finally{img.src='';canvas.width=canvas.height=0}
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
    if(!files.length||files.length>MAX_FILES)throw Error('Bitte ein bis fünf Screenshots auswählen.');
    files.forEach(validateFile);active=true;
    let worker;
    try{
      await ensureAssets(signal,onProgress);checkAbort(signal);
      worker=new Worker(new URL('ocr-worker.js',base));
      let current=0,failed=false;
      const send=(type,payload={},transfer=[])=>new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null};
        const abort=()=>{cleanup();worker.terminate();reject(abortError())};
        const timeout=setTimeout(()=>{cleanup();failed=true;worker.terminate();reject(Error('Die Texterkennung dauert zu lange. Bitte einen kleineren Screenshot versuchen.'))},120000);
        signal?.addEventListener('abort',abort,{once:true});
        worker.onerror=()=>{cleanup();failed=true;reject(Error('Die lokale Texterkennung konnte nicht gestartet werden. Bitte Text einfügen oder einen aktuellen Browser verwenden.'))};
        worker.onmessage=({data})=>{
          if(data.type==='progress'){
            const percent=Math.round((data.progress.progress||0)*100);
            onProgress(current?`Screenshot ${current} von ${files.length}: ${percent} %`:'Lokale Texterkennung starten …');return;
          }
          cleanup();if(data.type==='error'){failed=true;reject(Error('Das Bild konnte nicht erkannt werden. Bitte Lesbarkeit prüfen oder Text einfügen.'))}else resolve(data);
        };
        if(signal?.aborted){abort();return}worker.postMessage({type,...payload},transfer);
      });
      await send('init');
      const results=[];
      for(let i=0;i<files.length;i++){
        checkAbort(signal);current=i+1;onProgress(`Screenshot ${current} von ${files.length} vorbereiten …`);
        let result;
        try{
          const bytes=await imageBytes(files[i],signal);checkAbort(signal);
          const data=await send('recognize',{image:bytes},[bytes]);
          result=data.text.trim()?{index:i,text:data.text.trim(),rawText:data.rawText||data.text}:{index:i,error:'Kein lesbarer Text erkannt.'};
        }catch(error){if(signal?.aborted)throw error;result={index:i,error:error.message}}
        results.push(result);onResult(result);
        if(failed)throw Error('Die Erkennung wurde unterbrochen. Nicht erkannte Bilder bitte erneut versuchen; bereits erkannter Text bleibt erhalten.');
      }
      return results;
    }finally{worker?.terminate();active=false}
  }
  const api={MAX_FILES,MAX_BYTES,MAX_PIXELS,validateFile,dimensions,validateDimensions,preview,recognize,offlineReady};
  root.WochentischOCR=api;if(typeof module==='object')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
