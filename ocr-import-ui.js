(function(){
  'use strict';
  let nextId=0;
  function attachTextReview(text,canReview){
    const panel=document.createElement('div');
    panel.className='recipe-text-review';
    panel.innerHTML=`<div class="recipe-text-review-header">
      <p role="status" aria-live="polite"></p>
      <button type="button" class="secondary-button">Zeilen prüfen</button>
    </div><div class="recipe-text-review-lines"></div>`;
    text.before(panel);
    const status=panel.querySelector('p'),toggle=panel.querySelector('button'),preview=panel.lastElementChild;
    preview.id=`${text.id}-review-lines`;
    toggle.setAttribute('aria-controls',preview.id);
    let open=false,removed=null;

    function render({reveal=false}={}){
      if(removed&&text.value!==removed.remaining)removed=null;
      const flags=WochentischRecipeImport.reviewLines(text.value);
      if(reveal&&flags.size)open=true;
      panel.hidden=!open&&!flags.size;
      text.hidden=open;
      preview.hidden=!open;
      toggle.textContent=open?'Text bearbeiten':'Zeilen prüfen';
      toggle.setAttribute('aria-expanded',String(open));
      status.textContent=flags.size===1?'1 markierte Zeile':flags.size?`${flags.size} markierte Zeilen`:'Keine markierten Zeilen';
      preview.replaceChildren();
      if(!open)return;

      const source=text.value,lines=source.split(/\n|[\u2028\u2029]/);
      const fragment=document.createDocumentFragment();
      let plain=[];
      function flush(){
        const value=plain.join('\n');plain=[];
        if(!value.trim())return;
        const block=document.createElement('div');
        block.className='recipe-text-review-plain';
        block.textContent=value.replace(/^\n+|\n+$/g,'');
        fragment.append(block);
      }
      function undoAt(row){
        if(removed?.row!==row)return;
        flush();
        const notice=document.createElement('div'),label=document.createElement('span'),undo=document.createElement('button');
        notice.className='recipe-text-review-undo';
        label.textContent='Zeile entfernt';
        undo.type='button';undo.className='secondary-button';undo.textContent='Rückgängig';
        undo.addEventListener('click',()=>{
          const previous=removed;
          removed=null;
          text.value=previous.source;
          text.dispatchEvent(new Event('input',{bubbles:true}));
          preview.querySelector(`[data-line="${row}"] button`)?.focus({preventScroll:true});
        });
        notice.append(label,undo);fragment.append(notice);
      }
      lines.forEach((value,row)=>{
        undoAt(row);
        if(!flags.has(row)){plain.push(value);return}
        flush();
        const item=document.createElement('div'),content=document.createElement('div'),reason=document.createElement('span');
        const line=document.createElement('div'),remove=document.createElement('button');
        item.className='recipe-text-review-flag';item.dataset.line=row;
        reason.className='recipe-text-review-reason';reason.textContent=flags.get(row);
        line.className='recipe-text-review-value';line.textContent=value;
        remove.type='button';remove.className='secondary-button';remove.textContent='Entfernen';
        remove.setAttribute('aria-label',`Zeile entfernen: ${value.trim().slice(0,100)}`);
        remove.addEventListener('click',()=>{
          const remaining=lines.filter((_,index)=>index!==row).join('\n');
          removed={row,source,remaining};
          text.value=remaining;
          text.dispatchEvent(new Event('input',{bubbles:true}));
          preview.querySelector('.recipe-text-review-undo button').focus({preventScroll:true});
        });
        content.append(reason,line);item.append(content,remove);fragment.append(item);
      });
      undoAt(lines.length);flush();
      preview.append(fragment);
    }

    toggle.addEventListener('click',()=>{
      open=!open;render();
      if(!open)text.focus({preventScroll:true});
    });
    text.addEventListener('input',event=>{
      if(!canReview())return;
      const hadFocus=document.activeElement===text;
      render({reveal:event.inputType==='insertFromPaste'});
      if(open&&hadFocus)toggle.focus({preventScroll:true});
    });
    function reset(){removed=null;open=false;panel.hidden=true;text.hidden=false;preview.replaceChildren()}
    reset();
    return {render,reset,setBusy:value=>{panel.inert=value}};
  }
  function attach({before,text,parseButton,review}){
    const panel=document.createElement('details');panel.className='screenshot-import';
    const id=`screenshot-files-${++nextId}`;
    panel.innerHTML=`<summary>Fotos oder Screenshots hinzufügen</summary>
      <p>Für gedruckte Rezepte bis zu 5 Bilder auswählen (PNG, JPEG oder WebP, je 25 MB).</p>
      <label class="screenshot-file-label" for="${id}">Bilder auswählen</label>
      <input id="${id}" type="file" accept="image/png,image/jpeg,image/webp" multiple>
      <details class="handwriting-help"><summary>Handschrift vom iPhone übernehmen</summary>
        <p>Öffne das Rezeptfoto in der Fotos-App. Tippe auf das Live-Text-Symbol oder halte ein erkanntes Wort gedrückt. Wähle den Rezepttext aus, kopiere ihn und füge ihn unten ins Textfeld ein. Prüfe besonders Mengen und Einheiten.</p>
      </details>
      <ol class="screenshot-list"></ol>
      <div class="screenshot-actions"><button type="button" class="primary-button screenshot-start">Text erkennen</button><button type="button" class="secondary-button screenshot-cancel" hidden>Erkennung abbrechen</button></div>
      <p class="screenshot-status" role="status" aria-live="polite"></p>
      <p class="screenshot-error" role="alert" hidden></p>
      <p class="screenshot-cache"></p>
`;
    before.before(panel);
    const input=panel.querySelector('input'),list=panel.querySelector('ol'),start=panel.querySelector('.screenshot-start'),cancel=panel.querySelector('.screenshot-cancel'),status=panel.querySelector('.screenshot-status'),errorBox=panel.querySelector('.screenshot-error'),cacheStatus=panel.querySelector('.screenshot-cache');
    // File inputs emit a bubbling cancel event when the native picker closes.
    // It must not reach the enclosing dialog's Escape handler.
    input.addEventListener('cancel',event=>event.stopPropagation());
    let entries=[],controller=null,generation=0,busy=false,sourcePrefix='',lastSource='';
    const generated=new Set();
    const textReview=review?attachTextReview(text,()=>!busy&&review()):null;
    function updateSource(){
      const recognized=WochentischOCR.combine(entries.map(entry=>generated.has(entry)?entry.result:null));
      text.value=sourcePrefix+(sourcePrefix.trim()&&recognized?'\n\n':'')+recognized;
      lastSource=text.value;
      text.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function error(message){errorBox.textContent=message;errorBox.hidden=!message}
    function setBusy(value){busy=value;input.disabled=value;start.disabled=value||!entries.some(entry=>!entry.done);cancel.hidden=!value;text.disabled=value;parseButton.disabled=value;textReview?.setBusy(value);panel.setAttribute('aria-busy',String(value));render();panel.dispatchEvent(new Event('ocr-state-change',{bubbles:true}))}
    function render(){
      list.replaceChildren();
      entries.forEach((entry,index)=>{
        const item=document.createElement('li'),img=document.createElement('img'),name=document.createElement('p'),actions=document.createElement('div');
        img.src=entry.thumbnail;img.alt=`Vorschau Bild ${index+1}`;img.width=90;img.height=120;
        name.textContent=`${index+1}. ${entry.file.name}${entry.done?' – Text hinzugefügt':''}${entry.error?' – '+entry.error:''}`;
        actions.className='screenshot-actions';
        [['Nach oben',-1],['Nach unten',1],['Entfernen',0]].forEach(([label,offset])=>{
          const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=label;button.setAttribute('aria-label',`${label}: Bild ${index+1}`);
          button.disabled=busy||(offset===-1&&index===0)||(offset===1&&index===entries.length-1);
          button.addEventListener('click',()=>{
            if(offset){[entries[index],entries[index+offset]]=[entries[index+offset],entries[index]]}
            else {entries.splice(index,1);generated.delete(entry)}
            if(entry.done&&text.value===lastSource)updateSource();
            render();start.disabled=busy||!entries.some(entry=>!entry.done);
            const destination=list.children[Math.min(Math.max(0,index+offset),entries.length-1)];
            (destination?.querySelector('button:not(:disabled)')||input).focus();
          });actions.append(button);
        });
        item.append(img,name,actions);list.append(item);
        if(entry.result?.rawText){const original=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');original.className='screenshot-original';summary.textContent='Unbearbeitete Texterkennung';raw.textContent=entry.result.rawText;original.append(summary,raw);item.append(original)}
      });
    }
    async function refreshCache(token){
      try{const ready=await WochentischOCR.offlineReady();if(token===generation)cacheStatus.textContent=ready?'Erkennungsdateien vollständig gespeichert. Offline verfügbar, solange der Browser den Cache behält.':'Erkennungsdateien noch nicht vollständig offline verfügbar.'}catch{if(token===generation)cacheStatus.textContent='Offline-Speicher derzeit nicht verfügbar.'}
    }
    panel.addEventListener('toggle',()=>{if(panel.open)refreshCache(generation)});
    input.addEventListener('change',async()=>{
      const files=[...input.files];input.value='';if(!files.length)return;
      error('');
      if(entries.length+files.length>WochentischOCR.MAX_FILES){error('Maximal 5 Bilder je Durchgang. Bitte zuerst Bilder entfernen.');return}
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
        error(errors.join(' '));status.textContent=`${entries.length} ${entries.length===1?'Bild':'Bilder'} ausgewählt. Reihenfolge prüfen und „Text erkennen“ wählen.`;
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
            if(result.text){
              if(text.value!==lastSource){sourcePrefix=text.value;generated.clear()}
              entry.result=result;entry.done=true;completed++;
              generated.add(entry);updateSource();
            }
            render();
          }
        });
        if(token!==generation)return;
        const failed=results.filter(result=>result.error);
        status.textContent=completed?`Text aus ${completed} ${completed===1?'Bild':'Bildern'} erkannt – bitte prüfen. Noch keine Rezeptfelder übernommen.`:'Kein Text übernommen. Bitte Lesbarkeit prüfen oder Text einfügen.';
        if(completed&&panel.closest('.screenshot-mode'))status.textContent=`Text aus ${completed} ${completed===1?'Bild':'Bildern'} erkannt. Wähle „Rezept erkennen“, um die Angaben zu übernehmen.`;
        error(failed.map(result=>`Bild ${entries.indexOf(selected[result.index])+1}: ${result.error}`).join(' '));
      }catch(e){if(token!==generation)return;error(e.message);status.textContent=completed?`Text aus ${completed} Bildern bleibt erhalten. Übrige Bilder bitte erneut versuchen.`:'Erkennung nicht abgeschlossen. Text kann weiterhin eingefügt werden.'}
      finally{
        if(token===generation){controller=null;setBusy(false);if(completed)textReview?.render({reveal:true});refreshCache(token);status.tabIndex=-1;status.focus({preventScroll:true});status.scrollIntoView({block:'nearest'})}
      }
    });
    cancel.addEventListener('click',()=>{
      generation++;controller?.abort();controller=null;setBusy(false);textReview?.render({reveal:true});status.textContent='Erkennung abgebrochen. Bereits erkannter Text bleibt erhalten.';error('');start.focus();
    });
    function reset(){generation++;controller?.abort();controller=null;entries=[];sourcePrefix=lastSource='';generated.clear();textReview?.reset();panel.querySelector('.handwriting-help').open=false;input.value='';status.textContent='';cacheStatus.textContent='';error('');panel.open=false;setBusy(false)}
    setBusy(false);
    return {panel,reset,hasDraft:()=>entries.length>0||busy,hasPending:()=>busy||entries.some(entry=>!entry.done),isBusy:()=>busy};
  }
  window.WochentischOCRUI={attach};
})();
