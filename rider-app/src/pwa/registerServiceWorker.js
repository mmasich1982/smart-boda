// rider-app/src/pwa/registerServiceWorker.js
// ADDED (ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #1, PWA launch vehicle): registers
// public/sw.js so the app shell is cached and installable. Only ever called on web (see
// App.js) — expo-sqlite/react-native have no notion of a service worker at all.
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err); // non-fatal: app still works, just not offline-installable
    });
  });
}
