/* Shared by the page and service worker. Never preload these in the app shell. */
(function(root){
  const directory='vendor/ocr-7.0.0/';
  const assets=Object.freeze({version:'7.0.0-deu-fast-4.1.0-1',directory,files:[
    'tesseract.min.js','worker.min.js','tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js','deu.traineddata.gz'
  ].map(file=>directory+file)});
  root.WochentischOCRAssets=assets;
  if(typeof module==='object')module.exports=assets;
})(typeof self!=='undefined'?self:globalThis);
