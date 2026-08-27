// MusicFlow Service Worker for fast offline loading on mobile
const CACHE_NAME = 'musicflow-cache-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
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

  // NEVER intercept media/audio Range requests in service worker
  if (isMedia) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => caches.match('./index.html'));
    })
  );
});
