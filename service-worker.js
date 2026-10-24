const CACHE_NAME = 'wochentisch-shell-v5';
const SUPABASE_SCRIPT = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './interaction.css',
  './recipes-shopping.css',
  './auth.css',
  './mobile.css',
  './dark-theme.css',
  './supabase-config.js',
  './ingredient-catalog.js',
  './app.js',
  './datenschutz.html',
  './datenschutz.css'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    try {
      await cache.add(SUPABASE_SCRIPT);
    } catch (error) {
      // The page can still finish installing; the script will be cached on a later online visit.
    }
    await self.skipWaiting();
  })());
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
  const base = new URL('./', self.registration.scope);
  if (url.origin === self.location.origin && url.pathname.startsWith(base.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      const refresh = fetch(request).then(response => {
        if (response.ok) cache.put(new Request(`${url.origin}${url.pathname}`), response.clone());
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

  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/npm/@supabase/supabase-js@')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return Response.error();
      }
    })());
  }
});
