const CACHE_NAME = 'snapbooth-v2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/style.css',
  '/admin.css',
  '/app.js',
  '/filters.js',
  '/admin.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: Cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Keep the latest interface when online and fall back to cache offline.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass service worker for API calls & external Google endpoints
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse && networkResponse.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch (_) {
      const cachedResponse = await caches.match(event.request);
      return cachedResponse || Response.error();
    }
  })());
});
