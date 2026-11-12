const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const scope = 'https://example.test/planner/';
const imageURL = new URL('images/recipes/pasta-thumb.jpg?v=2', scope).href;
const imageCacheName = `wochentisch-recipe-images-v1:${scope}`;
const imageResponse = () => ({ok:true, headers:{get:()=>'image/jpeg'}, clone:()=>imageResponse()});

function setup({put, fetch:fetchImage = async()=>imageResponse()} = {}) {
  const handlers = {}, cachesByName = new Map(), network = [];
  const key = request => typeof request === 'string' ? request : request.url;
  const caches = {
    async open(name) {
      if (!cachesByName.has(name)) {
        const entries = new Map();
        cachesByName.set(name, {
          entries,
          async match(request) {return entries.get(key(request));},
          async keys() {return [...entries.keys()].map(url=>({url}));},
          async put(request,response) {
            if (put) await put();
            entries.set(key(request),response);
          },
        });
      }
      return cachesByName.get(name);
    },
    async keys() {return [...cachesByName.keys()];},
    async delete(name) {return cachesByName.delete(name);},
  };
  vm.runInNewContext(workerSource, {
    importScripts() {}, WochentischOCRAssets:{version:'test',files:[]},
    self:{registration:{scope},location:{origin:new URL(scope).origin},
      addEventListener(type,handler) {handlers[type]=handler;},clients:{async claim() {}}},
    URL,caches,fetch:async request=>{network.push(request);return fetchImage(request);},
  });
  function load(url=imageURL) {
    let response;
    const background = [];
    handlers.fetch({request:{method:'GET',destination:'image',url},
      respondWith(promise) {response=promise;},waitUntil(promise) {background.push(promise);}});
    return {response,background};
  }
  return {handlers,caches,cachesByName,network,load};
}

test('a cold image response is returned while the cache write is still pending', async()=>{
  let release, started=false;
  const pending = new Promise(resolve=>{release=resolve;});
  const worker=setup({put:()=>{started=true;return pending;}});
  const load=worker.load();
  try {
    const response=await Promise.race([load.response,new Promise((_,reject)=>setTimeout(()=>reject(Error('Image blocked by cache write')),200))]);
    assert.equal(response.ok,true);
    assert.equal(started,true);
    assert.equal(load.background.length,1);
  } finally {release();}
  await Promise.all(load.background);
  await worker.load().response;
  assert.equal(worker.network.length,1,'the next render must use the cached image');
});

test('a failed cache write does not break image display',async()=>{
  const worker=setup({put:async()=>{throw Error('Quota exceeded');}});
  const load=worker.load();
  assert.equal((await load.response).ok,true);
  await Promise.all(load.background);
});

test('activation migrates old photos and retains the independent image cache',async()=>{
  const worker=setup();
  const oldName=`wochentisch-shell-v116:${scope}`;
  const oldCache=await worker.caches.open(oldName);
  const oldPhoto=imageResponse();
  await oldCache.put(imageURL,oldPhoto);
  await oldCache.put(new URL('app.js',scope).href,{ok:true});
  const imageCache=await worker.caches.open(imageCacheName);
  const detailURL=imageURL.replace('-thumb','');
  const detailPhoto=imageResponse();
  await imageCache.put(detailURL,detailPhoto);
  const otherScope=`wochentisch-shell-v116:https://example.test/other/`;
  await worker.caches.open(otherScope);
  let activation;
  worker.handlers.activate({waitUntil(promise) {activation=promise;}});
  await activation;
  assert.equal(worker.cachesByName.has(oldName),false);
  assert.equal(worker.cachesByName.has(otherScope),true);
  assert.equal(await imageCache.match(imageURL),oldPhoto);
  assert.equal(await imageCache.match(detailURL),detailPhoto);
  assert.equal((await imageCache.keys()).length,2,'only recipe images are migrated');
  assert.equal(await worker.load().response,oldPhoto);
  assert.equal(worker.network.length,0);
});

test('recipe lists remain lazy while plan thumbnails and detail photos load eagerly',()=>{
  const start=appSource.indexOf('function recipePhoto(');
  const end=appSource.indexOf('\nfunction recipeThumbnail(',start);
  const context={document:{createElement:()=>({})},
    catalogRecipePhotoFiles:new Map([['pasta','pasta']]),catalogDishNameKey:name=>name.toLowerCase()};
  vm.runInNewContext(appSource.slice(start,end),context);
  const dish={name:'Pasta',catalogSourceId:'catalog-id'};
  assert.equal(context.recipePhoto(dish,{thumbnail:true}).loading,'lazy');
  assert.equal(context.recipePhoto(dish,{thumbnail:true,loading:'eager'}).loading,'eager');
  assert.equal(context.recipePhoto(dish).loading,'eager');
  assert.equal(context.recipePhoto(dish).fetchPriority,'high');
  assert.equal(context.recipePhoto({name:'Own recipe'}),null);
  const calendar=appSource.slice(appSource.indexOf('function renderCalendarContent('),appSource.indexOf('\nfunction renderCalendar(options)'));
  assert.match(calendar,/recipePhoto\(dish,\{thumbnail:true,loading:'eager'\}\)/);
});

test('a migration storage failure preserves the old cache without blocking activation',async()=>{
  const worker=setup();
  const oldName=`wochentisch-shell-v116:${scope}`;
  const oldCache=await worker.caches.open(oldName);
  await oldCache.put(imageURL,imageResponse());
  const imageCache=await worker.caches.open(imageCacheName);
  imageCache.put=async()=>{throw Error('Quota exceeded');};
  let activation;
  worker.handlers.activate({waitUntil(promise) {activation=promise;}});
  await activation;
  assert.equal(worker.cachesByName.has(oldName),true);
  assert.ok(await oldCache.match(imageURL));
});
