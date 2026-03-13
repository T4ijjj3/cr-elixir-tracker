const CACHE_NAME = 'cr-elixir-v1';
const ASSETS = [
  './index.html',
  './style_v2.css?v=36',
  './app_v2.js?v=36',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
