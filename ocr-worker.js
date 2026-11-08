/* The small coordinator makes even Tesseract initialization cancellable:
   terminating this worker also terminates its single child OCR worker. */
importScripts('./ocr-assets.js');
importScripts('./ocr-layout.js');
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
      await engine.setParameters({tessedit_pageseg_mode:'3'});
      self.postMessage({type:'ready'});
    }else if(data.type==='recognize'){
      const result=await engine.recognize(new Uint8Array(data.image),{}, {text:true,blocks:true});
      self.postMessage({type:'result',...WochentischOCRLayout.prepare(result.data)});
    }
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)})}
};
