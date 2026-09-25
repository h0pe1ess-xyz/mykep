const CACHE_NAME = 'mykep-cache-v2.7.0';
const APP_SHELL = [
  "/css/android-layout.css?v=2.7.0",
  "/js/android-layout.js?v=2.7.0",
  "/css/mobile-fit.css?v=2.7.0",
  "/js/mobile-fit.js?v=2.7.0",
  "/js/teacher-hints.js?v=2.7.0",
  "/data/teacher-hints.json?v=2.7.0",
  "/",
  "/index.html",
  "/schedule.html",
  "/settings.html",
  "/about.html",
  "/css/about.css?v=2.7.0",
  "/manifest.json",
  "/favicon.png",
  "/favicon.ico",
  "/pfp/1.png",
  "/pfp/2.gif",
  "/style.css?v=2.7.0",
  "/js/api.js?v=2.7.0",
  "/js/app.js?v=2.7.0",
  "/js/display-mode.js?v=2.7.0",
  "/js/gesture-guard.js?v=2.7.0",
  "/js/dashboard.js?v=2.7.0",
  "/js/pwa.js?v=2.7.0",
  "/js/schedule.js?v=2.7.0",
  "/js/settings.js?v=2.7.0",
  "/js/utils.js?v=2.7.0",
  "/css/base.css?v=2.7.0",
  "/css/components.css?v=2.7.0",
  "/css/dashboard.css?v=2.7.0",
  "/css/layout.css?v=2.7.0",
  "/css/ios-standalone.css?v=2.7.0",
  "/css/responsive.css?v=2.7.0",
  "/css/schedule.css?v=2.7.0",
  "/css/settings.css?v=2.7.0",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/maskable-orange-512.png"
];
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL);
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith('mykep-cache-') && name !== CACHE_NAME) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
    if (request.mode === 'navigate') {
        const shellPages = ['/', '/index.html', '/schedule.html', '/settings.html', '/about.html'];
        if (!shellPages.includes(url.pathname)) return;
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const path = url.pathname === '/index.html' ? '/' : url.pathname;
            const cached = await cache.match(path);
            if (cached) return cached;
            // A missing page must not silently become the dashboard.
            return fetch(request);
        })());
        return;
    }
    // Only predeclared shell resources are cached: arbitrary URLs cannot grow cache.
    const resource = url.pathname + url.search;
    if (!APP_SHELL.includes(resource)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(request) || fetch(request);
    })());
});
