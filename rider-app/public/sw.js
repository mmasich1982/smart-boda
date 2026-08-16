// rider-app/public/sw.js
// Service worker for the Smart Boda PWA. This is what makes the app installable and
// usable with no connectivity — the actual offline data (trips, fuel entries, etc.) is
// already handled by src/offline/LocalStore.js's IndexedDB adapter; this worker's job is
// purely to cache the APP SHELL (JS/CSS/HTML/icons) so the app itself loads with no network.
const CACHE_NAME = 'smart-boda-shell-v1';
const APP_SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // activate the new SW immediately, don't wait for all tabs to close
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for same-origin static assets (JS bundles, images, fonts) — these are
// content-hashed by the bundler, so a cache hit is always safe. Network-first for
// everything else (in particular, API calls to the backend must never be served stale).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApiCall = url.pathname.startsWith('/trips') || url.pathname.startsWith('/onboarding')
    || url.pathname.startsWith('/financial') || url.pathname.startsWith('/fuel-maintenance')
    || url.pathname.startsWith('/compliance') || url.pathname.startsWith('/admin');
  if (event.request.method !== 'GET' || isApiCall || url.origin !== self.location.origin) {
    return; // let the network handle it directly — this is app-shell caching only
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('/')); // offline + not cached yet: fall back to the app shell
    })
  );
});
