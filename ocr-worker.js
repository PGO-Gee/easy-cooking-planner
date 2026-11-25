/* The small coordinator makes even Tesseract initialization cancellable:
   terminating this worker also terminates its single child OCR worker. */
importScripts('./ocr-assets.js');
importScripts('./ocr-layout.js');
importScripts('./ocr-cookidoo.js');
importScripts('./vendor/ocr-7.0.0/tesseract.min.js');
let engine;
self.onmessage=async ({data})=>{
  try{
    if(data.type==='init'){
      const base=new URL(WochentischOCRAssets.directory,self.location.href).href;
      engine=await Tesseract.createWorker('deu',1,{
        workerPath:base+'worker.min.js',corePath:base,langPath:base.replace(/\/$/,''),
        workerBlobURL:false,cacheMethod:'none',gzip:true,
        logger:progress=>self.postMessage({type:'progress',progress}),
        errorHandler:()=>self.postMessage({type:'error'})
      });
      self.postMessage({type:'ready'});
    }else if(data.type==='recognize'){
      const image=new Uint8Array(data.image);
      const result=await engine.recognize(image,{tessedit_pageseg_mode:'3',tessedit_char_whitelist:''},{text:true,blocks:true});
      let page;
      try{page=await WochentischOCRCookidoo.recognize(engine,image,result.data,data.width,data.height)}
      catch{/* The original OCR still works when the browser cannot prepare the additional crops. */}
      self.postMessage({type:'result',...WochentischOCRLayout.prepare(result.data),page});
    }
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)})}
};
