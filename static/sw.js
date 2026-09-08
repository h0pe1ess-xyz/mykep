const CACHE_NAME = 'mykep-cache-v2.7';
const urlsToCache = [
    './',
    './index.html',
    './schedule.html',
    './settings.html',
    './style.css',
    './app.js',
    './favicon.png',
    './manifest.json',
    './pfp/1.png',
    './pfp/2.gif'
];

// Зберігаємо файли при першому завантаженні
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// Віддаємо файли з кешу, коли немає інтернету
self.addEventListener('fetch', event => {
    // API запити ігноруємо (бо в app.js ми вже зробили для них свій кеш)
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

// Очищуємо старі кеші при активації нового Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});
