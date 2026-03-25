// ----- Monetag Ad Network Integration -----
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 10783775
}
self.lary = ""
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw')
// ----------------------------------------

const CACHE_NAME = 'hacsura-v4';
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
  self.skipWaiting(); // 強制的にインストール
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  // 古いキャッシュを削除するロジック
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        if (response) return response;
        // キャッシュにない場合はネットワークへ
        return fetch(event.request).then(networkResponse => {
            // ※必要に応じてここで動的にキャッシュ追加も可能
            return networkResponse;
        });
      });
    })
  );
});
