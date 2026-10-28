const CACHE_NAME = 'wochentisch-shell-v35';
const SUPABASE_SCRIPT = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
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
  './app.js',
  './icons/wochentisch.svg',
  './icons/wochentisch-192.png',
  './icons/wochentisch-512.png',
  './icons/wochentisch-maskable-512.png',
  './icons/apple-touch-icon.png',
  './datenschutz.html',
  './datenschutz.css'
];

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
      const response = await fetch(SUPABASE_SCRIPT, { cache: 'no-store', signal: controller.signal });
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
    await Promise.all(names.filter(name => name.startsWith('wochentisch-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    const base = new URL('./', self.registration.scope);
    if (!url.pathname.startsWith(base.pathname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      const refresh = fetch(request).then(response => {
        if (response.ok) {
          const cacheKey = new Request(`${url.origin}${url.pathname}`);
          cache.put(cacheKey, response.clone());
        }
        return response;
      }).catch(() => null);

      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }

      const response = await refresh;
      if (response) return response;
      if (request.mode === 'navigate') {
        return await cache.match(new URL('./index.html', self.registration.scope)) || Response.error();
      }
      return Response.error();
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net' && url.href === SUPABASE_SCRIPT) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(SUPABASE_SCRIPT);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(SUPABASE_SCRIPT, response.clone());
        return response;
      } catch (error) {
        return Response.error();
      }
    })());
  }
});
