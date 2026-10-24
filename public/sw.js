// Offline support. Serves the app from the cache and refreshes the cache in
// the background, so a new deploy shows up on the next visit.

const CACHE = 'fireplace-v3';
const SHELL = [
  './',
  'styles.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/session.js',
  'js/art.js',
  'js/fire.js',
  'js/sparks.js',
  'js/sound.js',
  'audio/fireplace.wav',
  'js/store.js',
  'fonts/fraunces-latin.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Every page URL (with or without a query) is the same app shell.
  const key = request.mode === 'navigate' ? new URL('./', self.location).href : request;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(key, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return fresh;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w);
      return open ? open.focus() : self.clients.openWindow('./');
    })
  );
});
