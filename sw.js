const CACHE_NAME = 'hacsura-v1';
const urlsToCache = [
  './index.html',
  './style.css',
  './main.js',
  './images/hero.png',
  './images/weapon.png',
  './images/armor.png',
  './images/accessory.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
  );
});
