/* Keep visual paragraph boundaries and isolated icon noise separate from text.
   Never repair digits or units; the untouched recognition stays available. */
(function(root){
  function prepare(data){
    const rawText=String(data.text||''),lines=[];
    for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[]){
      for(const line of paragraph.lines||[])lines.push({...line,paragraphEnd:false});
      if(lines.length)lines[lines.length-1].paragraphEnd=true;
    }
    if(!lines.length)return {text:rawText,rawText};
    const heading=/^(?:zutaten|einkaufsliste|zubereitung|anleitung|zubereitungsschritte|nährwerte|(?:mein\s+)?tipp|hinweis|aufbewahrung)\b/i;
    for(const line of lines){
      line.value=line.text.trim();const words=line.words||[],first=words[0];
      if(words.length<2)continue;
      const prefix=first.text,remainder=line.value.slice(prefix.length).trimStart();
      // Only a short standalone icon-like token, never a digit, minus sign,
      // fraction, or a word. Low-confidence single letters may be emoji noise.
      const icon=prefix.length<=3&&!/[\d½¼¾⅓⅔⅛+−-]/u.test(prefix)&&
        (!/[\p{L}]/u.test(prefix)||(first.confidence<20&&[...prefix].filter(c=>/\p{L}/u.test(c)).length===1));
      if(icon&&(heading.test(remainder)||/^\d+(?:[.,]\d+)?\s+(?:g|kg|ml|l|EL|TL|Prise|Pck\.)\s/i.test(remainder)))line.value=remainder;
    }
    let steps=false;const stepLines=[];
    for(const line of lines){
      if(/^(?:zubereitung|anleitung|zubereitungsschritte)\b/i.test(line.value)){steps=true;continue}
      if(heading.test(line.value))steps=false;
      if(steps)stepLines.push(line);
    }
    const left=Math.min(...stepLines.map(line=>line.bbox.x0));
    const heights=stepLines.map(line=>line.bbox.y1-line.bbox.y0).sort((a,b)=>a-b);
    const height=heights[Math.floor(heights.length/2)]||0;
    const indented=stepLines.filter(line=>line.bbox.x0-left>height);
    // Repeated first-line indentation can mark list items whose emoji number
    // was not recognized. Only split after a complete preceding sentence.
    const useIndent=indented.length>=3&&stepLines.length>indented.length;
    let output='',previous='';
    for(const line of lines){
      if(useIndent&&indented.includes(line)&&/[.!?]\s*$/.test(previous)&&!output.endsWith('\n\n'))output+='\n';
      output+=line.value+(line.paragraphEnd?'\n\n':'\n');previous=line.value;
    }
    return {text:output.trim(),rawText};
  }
  root.WochentischOCRLayout={prepare};if(typeof module==='object')module.exports={prepare};
})(typeof self!=='undefined'?self:globalThis);
