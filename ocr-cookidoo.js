(function(root){
  const {readLines}=root.WochentischOCRLayout;
  const ingredientHeading=/^Zutaten\s*:?$/i;
  const stepHeading=/^Zubereitung\s*:?$/i;
  const footer=/^(?:Tipps?\s*(?:&\s*Tricks)?|Nährwerte|Zubehör|Schwierigkeitsgrad)\b/i;
  const fractionChars='¼½¾⅓⅔⅛⅜⅝⅞';
  const amountPattern=new RegExp(`^(\\d+(?:[.,]\\d+|\\s*/\\s*\\d+)?|\\d*\\s*[${fractionChars}])(?:\\s*(geh\\.?|gestr\\.?))?\\s*(mg|kg|g|ml|cl|dl|l|TL|EL|Stück|Prisen?|Dosen?|Bund|Pck\\.|Zehen?|Scheiben?)?$`,'i');
  const digit=value=>/^\d+$/.test(value);
  const clean=value=>value.trim().replace(/\s+/g,' ');
  const center=box=>(box.y0+box.y1)/2;

  function identify(data,width,height){
    if(height<width*1.4)return null;
    const lines=readLines(data).sort((a,b)=>a.bbox.y0-b.bbox.y0);
    const nav=lines.find(line=>line.bbox.y0>height*0.84&&/entdecken.*(?:meine\s*(?:rezepte|woche)|einkaufen)/i.test(line.text));
    const button=lines.find(line=>/\bheute\s+kochen\b/i.test(line.text));
    const portions=lines.find(line=>/^Portionsgr[öo]ße\b/i.test(line.text.trim()));
    const header=lines.find(line=>line.bbox.y0>height*0.06&&line.bbox.y1<height*0.14&&/\p{L}{3}/u.test(line.text));
    if(!nav||!button||(!portions&&!header))return null;

    const navTop=nav.bbox.y0-width*0.107;
    const bottom=button.bbox.y0>navTop-width*0.18?button.bbox.y0-width*0.034:navTop;
    const top=header?header.bbox.y1+width*0.052:0;
    const content=lines.filter(line=>line.bbox.y1>top&&line.bbox.y0<bottom);
    const ingredients=content.find(line=>ingredientHeading.test(line.text.trim()));
    const preparation=content.find(line=>stepHeading.test(line.text.trim()));
    const firstStep=content.find(line=>line.bbox.x0<width*0.075&&/^\d{1,2}(?:\s|$)/.test(line.text.trim()));
    const hasStepBody=content.some(line=>line.bbox.x0>width*0.10&&line.bbox.x0<width*0.135&&/\p{L}{3}/u.test(line.text));
    const after=content.find(line=>footer.test(line.text.trim()));
    const stepsTop=preparation?preparation.bbox.y1+width*0.022:
      !ingredients&&!portions&&hasStepBody?(firstStep?.bbox.y0>top+width*0.18&&
        content.some(line=>line.bbox.x0>width*0.17&&line.bbox.x0<width*0.21)?firstStep.bbox.y0-width*0.012:top):bottom;
    const meta={};
    if(portions&&ingredients){
      const times=content.find(line=>line.bbox.y0<button.bbox.y0&&/\d+\s*Portionen/i.test(line.text)&&/\d+\s*Min\b/i.test(line.text));
      const detail=times?.text.match(/(\d+)\s*Min\.?[^\d]+(\d+)\s*Min\.?[^\d]+(\d+)\s*Portionen/i);
      const count=portions.text.match(/(\d+)\s*Portionen/i);
      const servings=count?.[1]||detail?.[3];
      if(servings)meta.servings=Number(servings);
      if(detail)meta.time=Number(detail[2]);
      const titleLines=content.filter(line=>line.bbox.y1<(times?.bbox.y0??button.bbox.y0)&&
        line.bbox.x0<width*0.09&&/^[\p{L}\d][\p{L}\d -]*\p{L}{3}/u.test(line.text.trim())&&
        !/^(?:TM\s*\d|TM\s*S)/i.test(line.text.trim())&&line.bbox.y1-line.bbox.y0>width*0.035);
      if(titleLines.length)meta.title=clean(titleLines.map(line=>line.text).join(' '));
    }
    const sticky=header?.words?.filter(word=>word.bbox.x0>=width*0.17&&word.bbox.x1<=width*0.70)
      .map(word=>word.text).join(' ').replace(/[…\.]+$/,'');
    const label=meta.title||sticky;
    if(!label)return null;
    return {label,meta,content,ingredientTop:ingredients?ingredients.bbox.y1+width*0.028:portions?bottom:top,
      ingredientBottom:Math.min(stepsTop,preparation?.bbox.y0??bottom,after?.bbox.y0??bottom),
      stepsTop,stepsBottom:Math.min(bottom,after?.bbox.y0??bottom)};
  }

  async function readCrop(engine,bitmap,{x0,y0,x1,y1},mode,{scale=1,whitelist='',blocks=true}={}){
    const padding=12;
    x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));
    const width=Math.min(bitmap.width,Math.ceil(x1))-x0,height=Math.min(bitmap.height,Math.ceil(y1))-y0;
    if(width<=0||height<=0)return {text:'',lines:[]};
    const canvas=new OffscreenCanvas(width*scale+2*padding,height*scale+2*padding);
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,x0,y0,width,height,padding,padding,width*scale,height*scale);
    const bytes=new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    const {data}=await engine.recognize(bytes,{tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist},{text:true,blocks});
    const offset=box=>({x0:(box.x0-padding)/scale+x0,x1:(box.x1-padding)/scale+x0,
      y0:(box.y0-padding)/scale+y0,y1:(box.y1-padding)/scale+y0});
    return {text:clean(data.text||''),lines:readLines(data).map(line=>({...line,bbox:offset(line.bbox),
      words:line.words.map(word=>({...word,bbox:offset(word.bbox)}))})).sort((a,b)=>a.bbox.y0-b.bbox.y0)};
  }

  function amountInk(bitmap,{x0,y0,x1,y1}){
    const width=x1-x0,height=y1-y0;
    const canvas=new OffscreenCanvas(width,height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,x0,y0,width,height,0,0,width,height);
    const {data}=ctx.getImageData(0,0,width,height);
    const dark=data[0]+data[1]+data[2]<384;
    const ink=Uint8Array.from({length:width*height},(_,index)=>{
      const i=index*4,sum=data[i]+data[i+1]+data[i+2];
      return dark?sum>540:sum<480;
    });
    const columns=[];
    for(let x=0;x<width;x++){
      for(let y=0;y<height;y++){
        if(!ink[y*width+x])continue;
        const last=columns.at(-1);
        if(last&&last.x1>=x){last.x1=x+1;last.y0=Math.min(last.y0,y);last.y1=Math.max(last.y1,y+1)}
        else columns.push({x0:x,x1:x+1,y0:y,y1:y+1});
      }
    }
    return {columns,ink,width,height};
  }

  // The screenshot font draws a fraction as distinct raised digit, slash and lowered digit.
  function fractionDigits({ink,width,height},box){
    const pixels=ink.slice(),parts=[];
    for(let y=0;y<height;y++)for(let x=box.x0;x<box.x1;x++){
      const index=y*width+x;
      if(!pixels[index])continue;
      const pending=[index];pixels[index]=0;
      const part={x0:x,x1:x+1,y0:y,y1:y+1,size:0};
      while(pending.length){
        const pixel=pending.pop(),px=pixel%width,py=Math.floor(pixel/width);
        part.x0=Math.min(part.x0,px);part.x1=Math.max(part.x1,px+1);
        part.y0=Math.min(part.y0,py);part.y1=Math.max(part.y1,py+1);part.size++;
        for(const [nx,ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]]){
          const next=ny*width+nx;
          if(nx<box.x0||nx>=box.x1||ny<0||ny>=height||!pixels[next])continue;
          pixels[next]=0;pending.push(next);
        }
      }
      if(part.size>=3)parts.push(part);
    }
    if(parts.length!==3)return null;
    const [upper,slash,lower]=parts.sort((a,b)=>a.x0-b.x0);
    const slashHeight=slash.y1-slash.y0;
    if(upper.y1<lower.y1&&upper.y0<lower.y0&&slashHeight>(upper.y1-upper.y0)*1.4&&
       slashHeight>(lower.y1-lower.y0)*1.4&&slash.y0<=upper.y0+1&&slash.y1>=lower.y1-1)return [upper,lower];
    return null;
  }

  async function readAmount(engine,bitmap,crop){
    if(crop.y1<=crop.y0||crop.x1<=crop.x0)return {};
    const {text}=await readCrop(engine,bitmap,crop,'7',{blocks:false});
    const {columns,...ink}=amountInk(bitmap,crop);
    if(!columns.length)return {};
    const glyphHeight=Math.max(...columns.map(col=>col.y1-col.y0));
    const candidates=columns.slice(1).filter((col,i)=>col.x0-columns[i].x1>=glyphHeight*0.31);
    const direct=text.match(amountPattern);
    const readPart=(x0,x1,y0=0,y1=crop.y1-crop.y0,whitelist='')=>readCrop(engine,bitmap,
      {x0:crop.x0+x0,x1:crop.x0+x1,y0:crop.y0+y0,y1:crop.y0+y1},'7',{scale:2,whitelist,blocks:false});
    for(const unitStart of candidates){
      const prev=columns[columns.indexOf(unitStart)-1];
      let unit=(await readPart(unitStart.x0,columns.at(-1).x1)).text;
      // The double-storey g is often read as 8. Its descender sits below the
      // neighbouring digits, and it is separated from them by the unit gap.
      if(unitStart===columns.at(-1)&&unitStart.y0>prev.y0+glyphHeight*0.13&&unitStart.y1>prev.y1+glyphHeight*0.16&&
        unitStart.y1-unitStart.y0>=glyphHeight*0.86&&/^[gG238]$/.test(unit))unit='g';
      if(!('1 '+unit).match(amountPattern)?.[3])continue;
      const fraction=columns[0]===prev?fractionDigits(ink,prev):null;
      let amount='';
      if(fraction){
        const digits=[];
        for(const part of fraction){
          const result=await readPart(part.x0,part.x1,part.y0,part.y1,'123456789');
          digits.push(result.text);
        }
        if(digits.every(value=>/^[1-9]$/.test(value))&&Number(digits[0])<Number(digits[1]))amount=digits.join('/');
      }else{
        ({text:amount}=await readPart(columns[0].x0,prev.x1,0,ink.height,`0123456789.,/${fractionChars}`));
      }
      const match=(amount+' '+unit).match(amountPattern);
      if(match?.[3])return {amount:match[1].trim(),unit:match[3],measureNote:match[2]};
    }
    if(direct&&(direct[3]||!candidates.length))return {amount:direct[1].trim(),unit:direct[3]||'',measureNote:direct[2]};
    return text?{measureNote:`Menge prüfen: ${text}`}:{};
  }

  async function readIngredients(engine,bitmap,layout){
    const {width}=bitmap,{ingredientTop:y0,ingredientBottom:y1}=layout;
    if(y1-y0<width*0.035)return [];
    const {lines}=await readCrop(engine,bitmap,{x0:width*0.159,x1:width*0.785,y0,y1},'11');
    const alternatives=layout.content.filter(({words})=>{
      const [icon,quantity,name]=words||[];
      return name&&icon.bbox.x0>=width*0.18&&icon.bbox.x0<width*0.22&&icon.bbox.x1-icon.bbox.x0<width*0.045&&
        quantity.bbox.x0>width*0.23&&quantity.bbox.x0<width*0.31&&/^\d+(?:[¼½¾])?$/.test(quantity.text)&&/\p{L}/u.test(name.text);
    });
    const groups=[];
    for(const line of lines){
      const value=clean(line.text);
      if(line.bbox.x0>width*0.21||!/^(?:\p{L}|\d+[-%])/u.test(value)||line.bbox.y1>=y1||
         alternatives.some(alt=>line.bbox.y0<alt.bbox.y1&&alt.bbox.y0<line.bbox.y1))continue;
      const previous=groups.at(-1);
      if(previous&&line.bbox.y0-previous.last.y0<width*0.067){
        if(line.bbox.y0>previous.last.y0+width*0.022){previous.notes.push(value);previous.last=line.bbox}
      }else groups.push({name:value.replace(/,$/,''),first:line.bbox,last:line.bbox,notes:[]});
    }
    const ingredients=[];
    for(const [i,group] of groups.entries()){
      const middle=(group.first.y0+group.last.y1)/2,radius=width*0.032;
      const crop={x0:Math.floor(width*0.787),x1:Math.ceil(width*0.966),
        y0:Math.max(Math.ceil(y0),Math.floor(middle-radius)),y1:Math.min(Math.floor(y1),Math.ceil(middle+radius))};
      const {amount='',unit='',measureNote}=await readAmount(engine,bitmap,crop);
      const next=groups[i+1]?.first.y0??y1;
      const alternative=alternatives.find(line=>line.bbox.y0>group.last.y1&&line.bbox.y1<next);
      const alt=alternative?.words.slice(1).map(word=>word.text).join(' ').replace(/(\d)\s*[|lI](?=\s*\))/g,'$1 l');
      const note=[measureNote,...group.notes,alt&&'Alternativ: '+alt].filter(Boolean).join(' · ');
      ingredients.push({name:group.name,amount,unit,note});
    }
    return ingredients;
  }

  async function readSteps(engine,bitmap,layout){
    const {width}=bitmap,{stepsTop:y0,stepsBottom:y1}=layout;
    if(y1-y0<width*0.035)return [];
    const crop={y0,y1,x0:width*0.026,x1:width*0.977};
    const numbered=await readCrop(engine,bitmap,crop,'6');
    const markers=numbered.lines.flatMap(line=>line.words.filter(word=>word.bbox.x1<width*0.08&&digit(word.text))
      .map(word=>({number:Number(word.text),y:center(word.bbox)})));
    const body=await readCrop(engine,bitmap,{...crop,x0:width*0.103},'6');
    const steps=[];
    for(const line of body.lines){
      const marker=markers.find(mark=>Math.abs(mark.y-center(line.bbox))<width*0.021);
      const value=clean(line.text);
      if(marker||!steps.length)steps.push({number:marker?.number??null,text:value});
      else steps.at(-1).text+=' '+value;
    }
    for(const step of steps){
      step.text=step.text.replace(/\/\s+/g,'/').replace(/\/Stufel\b/g,'/Stufe 1')
        .replace(/\/Stufe ([1-9])(?=\p{L})/gu,'/Stufe $1 ')
        .replace(/\/(?:Sg?|G|g)>\/(?=Stufe)/g,'/Linkslauf/')
        .replace(/\/Linkslauf\/Stufe &(?=\s)/g,'/Linkslauf/Sanftrührstufe');
    }
    return steps.filter(step=>step.text);
  }

  async function recognize(engine,image,data,width,height){
    const layout=identify(data,width,height);
    if(!layout||typeof OffscreenCanvas!=='function'||typeof createImageBitmap!=='function')return null;
    const bitmap=await createImageBitmap(new Blob([image],{type:'image/png'}));
    try{
      const ingredients=await readIngredients(engine,bitmap,layout);
      const steps=await readSteps(engine,bitmap,layout);
      const {label,meta}=layout;
      return ingredients.length||steps.length?{label,meta,ingredients,steps}:null;
    }finally{bitmap.close()}
  }
  root.WochentischOCRCookidoo={recognize};
})(self);
