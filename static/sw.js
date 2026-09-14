const CACHE_NAME = 'mykep-cache-v2.6.5-mobile5';
const APP_SHELL = [
  "/css/android-layout.css?v=2.6.5-mobile5",
  "/js/android-layout.js?v=2.6.5-mobile5",
  "/css/mobile-fit.css?v=2.6.5-mobile5",
  "/js/mobile-fit.js?v=2.6.5-mobile5",
  "/js/teacher-hints.js?v=2.6.5-mobile5",
  "/data/teacher-hints.json?v=2.6.5-mobile5",
  "/",
  "/index.html",
  "/schedule.html",
  "/settings.html",
  "/manifest.json",
  "/favicon.png",
  "/favicon.ico",
  "/pfp/1.png",
  "/pfp/2.gif",
  "/style.css?v=2.6.5-mobile5",
  "/js/api.js?v=2.6.5-mobile5",
  "/js/app.js?v=2.6.5-mobile5",
  "/js/display-mode.js?v=2.6.5-mobile5",
  "/js/gesture-guard.js?v=2.6.5-mobile5",
  "/js/dashboard.js?v=2.6.5-mobile5",
  "/js/pwa.js?v=2.6.5-mobile5",
  "/js/schedule.js?v=2.6.5-mobile5",
  "/js/settings.js?v=2.6.5-mobile5",
  "/js/utils.js?v=2.6.5-mobile5",
  "/css/base.css?v=2.6.5-mobile5",
  "/css/components.css?v=2.6.5-mobile5",
  "/css/dashboard.css?v=2.6.5-mobile5",
  "/css/layout.css?v=2.6.5-mobile5",
  "/css/ios-standalone.css?v=2.6.5-mobile5",
  "/css/responsive.css?v=2.6.5-mobile5",
  "/css/schedule.css?v=2.6.5-mobile5",
  "/css/settings.css?v=2.6.5-mobile5",
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
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok) return response;
                if (response.status < 500) return response;
            } catch (_) {}
            const cache = await caches.open(CACHE_NAME);
            return await cache.match(url.pathname) || await cache.match('/index.html');
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
