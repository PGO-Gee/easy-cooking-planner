(function(){
  'use strict';
  let nextId=0;
  function attach({before,text,parseButton}){
    const panel=document.createElement('details');panel.className='screenshot-import';
    const id=`screenshot-files-${++nextId}`;
    panel.innerHTML=`<summary>Screenshots hinzufügen</summary>
      <p>Bis zu 5 deutsche Rezept-Screenshots (PNG, JPEG, WebP; je höchstens 10 MB und 8 Megapixel). Die Bilder bleiben auf diesem Gerät.</p>
      <p>Beim ersten Erkennen werden Programm- und Sprachdateien von unserer App geladen. Danach ist die Erkennung bei vorhandenem Cache offline möglich.</p>
      <label class="screenshot-file-label" for="${id}">Bilder auswählen</label>
      <input id="${id}" type="file" accept="image/png,image/jpeg,image/webp" multiple>
      <ol class="screenshot-list"></ol>
      <div class="screenshot-actions"><button type="button" class="secondary-button screenshot-start">Text erkennen</button><button type="button" class="secondary-button screenshot-cancel" hidden>Erkennung abbrechen</button></div>
      <p class="screenshot-status" role="status" aria-live="polite"></p>
      <p class="screenshot-error" role="alert" hidden></p>
      <p class="screenshot-cache"></p>
      <p>Erkannten Text unten prüfen, besonders Mengen und Einheiten. Überlappende Screenshots können doppelte Textstellen enthalten. Erst „${parseButton.textContent.trim()}“ übernimmt Angaben in die Rezeptfelder.</p>`;
    before.before(panel);
    const input=panel.querySelector('input'),list=panel.querySelector('ol'),start=panel.querySelector('.screenshot-start'),cancel=panel.querySelector('.screenshot-cancel'),status=panel.querySelector('.screenshot-status'),errorBox=panel.querySelector('.screenshot-error'),cacheStatus=panel.querySelector('.screenshot-cache');
    let entries=[],controller=null,generation=0,busy=false;
    function error(message){errorBox.textContent=message;errorBox.hidden=!message}
    function setBusy(value){busy=value;input.disabled=value;start.disabled=value||!entries.some(entry=>!entry.done);cancel.hidden=!value;text.disabled=value;parseButton.disabled=value;panel.setAttribute('aria-busy',String(value));render()}
    function render(){
      list.replaceChildren();
      entries.forEach((entry,index)=>{
        const item=document.createElement('li'),img=document.createElement('img'),name=document.createElement('p'),actions=document.createElement('div');
        img.src=entry.thumbnail;img.alt=`Vorschau Screenshot ${index+1}`;img.width=90;img.height=120;
        name.textContent=`${index+1}. ${entry.file.name}${entry.done?' – Text hinzugefügt':''}${entry.error?' – '+entry.error:''}`;
        actions.className='screenshot-actions';
        [['Nach oben',-1],['Nach unten',1],['Entfernen',0]].forEach(([label,offset])=>{
          const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=label;button.setAttribute('aria-label',`${label}: Screenshot ${index+1}`);
          button.disabled=busy||(offset===-1&&index===0)||(offset===1&&index===entries.length-1);
          button.addEventListener('click',()=>{
            if(offset){[entries[index],entries[index+offset]]=[entries[index+offset],entries[index]]}else entries.splice(index,1);
            render();start.disabled=busy||!entries.some(entry=>!entry.done);
            const destination=list.children[Math.min(Math.max(0,index+offset),entries.length-1)];
            (destination?.querySelector('button:not(:disabled)')||input).focus();
          });actions.append(button);
        });
        item.append(img,name,actions);list.append(item);
        if(entry.rawText){const original=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');original.className='screenshot-original';summary.textContent='Unbearbeitete Texterkennung';raw.textContent=entry.rawText;original.append(summary,raw);item.append(original)}
      });
    }
    async function refreshCache(token){
      try{const ready=await WochentischOCR.offlineReady();if(token===generation)cacheStatus.textContent=ready?'Erkennungsdateien vollständig gespeichert. Offline verfügbar, solange der Browser den Cache behält.':'Erkennungsdateien noch nicht vollständig offline verfügbar.'}catch{if(token===generation)cacheStatus.textContent='Offline-Speicher derzeit nicht verfügbar.'}
    }
    panel.addEventListener('toggle',()=>{if(panel.open)refreshCache(generation)});
    input.addEventListener('change',async()=>{
      const files=[...input.files];input.value='';if(!files.length)return;
      error('');
      if(entries.length+files.length>WochentischOCR.MAX_FILES){error('Maximal 5 Screenshots je Durchgang. Bitte zuerst Bilder entfernen.');return}
      controller=new AbortController();const token=++generation;setBusy(true);status.textContent='Bilder prüfen …';
      const errors=[];
      try{
        for(const file of files){
          try{
            const thumbnail=await WochentischOCR.preview(file,controller.signal);
            if(token!==generation)return;entries.push({file,thumbnail,done:false,error:''});render();
          }catch(e){if(e.name==='AbortError')return;errors.push(`${file.name}: ${e.message}`)}
        }
        if(token!==generation)return;
        error(errors.join(' '));status.textContent=`${entries.length} Screenshots ausgewählt. Reihenfolge prüfen und „Text erkennen“ wählen.`;
      }finally{if(token===generation){controller=null;setBusy(false)}}
    });
    start.addEventListener('click',async()=>{
      const selected=entries.filter(entry=>!entry.done);if(!selected.length||busy)return;
      controller=new AbortController();const token=++generation;let completed=0;error('');setBusy(true);
      try{
        const results=await WochentischOCR.recognize(selected.map(entry=>entry.file),{
          signal:controller.signal,
          onProgress:message=>{if(token===generation)status.textContent=message},
          onResult:result=>{
            if(token!==generation)return;
            const entry=selected[result.index];entry.error=result.error||'';
            if(result.text){text.value+=(text.value.trim()?'\n\n':'')+result.text;entry.rawText=result.rawText;entry.done=true;completed++;text.dispatchEvent(new Event('input',{bubbles:true}))}
            render();
          }
        });
        if(token!==generation)return;
        const failed=results.filter(result=>result.error);
        status.textContent=completed?`Text aus ${completed} ${completed===1?'Screenshot':'Screenshots'} erkannt – bitte unten prüfen. Noch keine Rezeptfelder übernommen.`:'Kein Text übernommen. Bitte Lesbarkeit prüfen oder Text einfügen.';
        error(failed.map(result=>`Screenshot ${result.index+1}: ${result.error}`).join(' '));
      }catch(e){if(token!==generation)return;error(e.message);status.textContent=completed?`Text aus ${completed} Screenshots bleibt unten erhalten. Übrige Bilder bitte erneut versuchen.`:'Erkennung nicht abgeschlossen. Text kann weiterhin eingefügt werden.'}
      finally{
        if(token===generation){controller=null;setBusy(false);refreshCache(token);status.tabIndex=-1;status.focus({preventScroll:true});status.scrollIntoView({block:'nearest'})}
      }
    });
    cancel.addEventListener('click',()=>{
      generation++;controller?.abort();controller=null;setBusy(false);status.textContent='Erkennung abgebrochen. Bereits erkannter Text bleibt unten erhalten.';error('');start.focus();
    });
    function reset(){generation++;controller?.abort();controller=null;entries=[];input.value='';status.textContent='';cacheStatus.textContent='';error('');panel.open=false;setBusy(false)}
    setBusy(false);
    return {panel,reset,hasDraft:()=>entries.length>0||busy,hasPending:()=>busy||entries.some(entry=>!entry.done)};
  }
  window.WochentischOCRUI={attach};
})();
