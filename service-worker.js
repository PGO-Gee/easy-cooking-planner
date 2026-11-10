importScripts('./ocr-assets.js');
const OCR_CACHE_NAME=`wochentisch-ocr-${WochentischOCRAssets.version}:${self.registration.scope}`;
const ocrUrls=new Set(WochentischOCRAssets.files.map(path=>new URL(path,self.registration.scope).href));
const CACHE_PREFIX = 'wochentisch-shell-';
const CACHE_SCOPE = `:${self.registration.scope}`;
const CACHE_NAME = `${CACHE_PREFIX}v106${CACHE_SCOPE}`;
const recipeImagePath = new URL('./images/recipes/', self.registration.scope).pathname;
const SUPABASE_SCRIPT = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const SUPABASE_INTEGRITY = 'sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './interaction.css',
  './recipes-shopping.css',
  './auth.css',
  './mobile.css',
  './dark-theme.css',
  './supabase-config.js',
  './local-store.js',
  './ingredient-catalog.js',
  './recipe-model.js',
  './recipe-import.js',
  './ocr-assets.js',
  './ocr-import.js',
  './ocr-import-ui.js',
  './ocr-worker.js',
  './ocr-layout.js',
  './sync-transport.js',
  './sync-api.js',
  './sync-write-barrier.js',
  './sync-coordinator.js',
  './app.js',
  './icons/wochentisch.svg',
  './icons/wochentisch-192.png',
  './icons/wochentisch-512.png',
  './icons/wochentisch-maskable-512.png',
  './icons/apple-touch-icon.png',
  './datenschutz.html',
  './datenschutz.css'
];
const shellUrls = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async path => {
      const request = new Request(new URL(path, self.registration.scope), { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`App-Datei konnte nicht vorgeladen werden: ${path}`);
      await cache.put(request, response);
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(SUPABASE_SCRIPT, { mode: 'cors', integrity: SUPABASE_INTEGRITY, signal: controller.signal });
      if (response.ok) await cache.put(SUPABASE_SCRIPT, response);
    } catch (error) {
      // Offline app features remain usable without loading the cloud client.
    } finally {
      clearTimeout(timeout);
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name =>
      name === 'wochentisch-shell-v57' ||
      (name.startsWith(CACHE_PREFIX) && name.endsWith(CACHE_SCOPE) && name !== CACHE_NAME)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.destination === 'image' && url.pathname.startsWith(recipeImagePath)) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME).catch(() => null);
        const cached = await cache?.match(request).catch(() => null);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
          await cache?.put(request, response.clone()).catch(() => {});
        }
        return response;
      })());
      return;
    }
    if(ocrUrls.has(url.href)){
      event.respondWith((async()=>{
        try{
          const cache=await caches.open(OCR_CACHE_NAME);
          return await cache.match(url.href)||await fetch(request);
        }catch{
          return new Response('Erkennungsdatei offline nicht verfügbar.',{status:503});
        }
      })());
      return;
    }
    url.search = '';
    if (!shellUrls.has(url.href)) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.href) || fetch(request);
    })());
    return;
  }

  if (url.href === SUPABASE_SCRIPT && request.integrity === SUPABASE_INTEGRITY) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(SUPABASE_SCRIPT);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(SUPABASE_SCRIPT, response.clone());
      return response;
    })());
  }
});
