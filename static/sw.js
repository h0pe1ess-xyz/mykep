const CACHE_NAME = 'mykep-cache-v2.12';
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

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    if (event.request.url.includes('/api/')) return;
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

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
        }).then(() => self.clients.claim())
    );
});
