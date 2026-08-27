// MusicFlow Service Worker - Network-First Strategy for Instant Updates
const CACHE_NAME = 'musicflow-live-v16';

self.addEventListener('install', (e) => {
  // Activate immediately without waiting for tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url.toLowerCase();
  const isMedia = e.request.destination === 'audio' || 
                  e.request.destination === 'video' ||
                  e.request.headers.has('range') ||
                  url.endsWith('.wav') || 
                  url.endsWith('.mp3') || 
                  url.endsWith('.m4a') || 
                  url.endsWith('.ogg');

  // Bypass service worker completely for audio media streams
  if (isMedia) {
    return;
  }

  // Network-First for HTML, JS, CSS, and API requests to guarantee instant updates
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache when device is offline
        return caches.match(e.request).then((cached) => cached || caches.match('./index.html'));
      })
  );
});
