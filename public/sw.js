self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
  // Simple fetch pass-through
  e.respondWith(fetch(e.request));
});
