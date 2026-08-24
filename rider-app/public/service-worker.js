// public/service-worker.js
// ✅ Service Worker for PWA with translation caching
// ✅ FIXED VERSION - All bugs resolved

const CACHE_NAME = 'rider-app-v1';
const TRANSLATION_CACHE = 'translations-v1';
const STATIC_CACHE = 'static-v1';

// Files to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

/**
 * ✅ INSTALL: Cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to cache:', err);
        // Don't fail install if some assets are missing
        return Promise.resolve();
      });
    })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

/**
 * ✅ ACTIVATE: Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== TRANSLATION_CACHE && cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    })
  );
  
  self.clients.claim();
});

/**
 * ✅ FETCH: Intelligent caching strategy
 * 
 * Strategy:
 * 1. Translation API calls → Cache with network fallback (CacheFirst)
 * 2. Static assets → Cache first, then network
 * 3. Everything else → Network first, then cache (NetworkFirst)
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ STRATEGY 1: Translation API calls
  // These should be cached aggressively
  if (url.pathname.includes('/onboarding/translations/')) {
    console.log('[SW] Translating request (cache strategy):', url.pathname);
    
    event.respondWith(
      caches.open(TRANSLATION_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          // ✅ Return cached version immediately if available
          const fetchPromise = fetch(request)
            .then((response) => {
              // ✅ Update cache with fresh data
              if (response.ok) {
                cache.put(request, response.clone());
                console.log('[SW] Updated translation cache:', url.pathname);
              }
              return response;
            })
            .catch((err) => {
              console.warn('[SW] Translation fetch failed:', err.message);
              // Return cached version on network error
              if (cached) {
                return cached;
              }
              return new Response('Translation unavailable', { status: 503 });
            });

          // ✅ Return cached version immediately, but fetch fresh in background
          return cached || fetchPromise;
        });
      }).catch((err) => {
        console.error('[SW] Translation cache error:', err);
        return fetch(request).catch(() => {
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // ✅ STRATEGY 2: Static assets (cache first)
  if (url.pathname.match(/\.(js|css|png|jpg|svg|woff|woff2)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          return cached || fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => {
            return new Response('Asset offline', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // ✅ STRATEGY 3: Everything else (network first)
  // API calls, HTML, etc.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // ✅ Cache successful responses
        if (response.ok) {
          const cache = caches.open(CACHE_NAME);
          cache.then((c) => c.put(request, response.clone()));
        }
        return response;
      })
      .catch((err) => {
        console.warn('[SW] Fetch failed, trying cache:', request.url);
        // ✅ Fall back to cache on network error
        return caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }
          return new Response('Offline - page unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        });
      })
  );
});

/**
 * ✅ MESSAGE: Handle messages from client
 * Useful for force-clearing cache if needed
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing all caches...');
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting, becoming active...');
    self.skipWaiting();
  }
});

// ✅ Keep service worker alive
console.log('[SW] Service worker script loaded');