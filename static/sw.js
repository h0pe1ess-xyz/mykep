const CACHE_NAME = 'mykep-cache-v2.8.1';
const APP_SHELL = [
    "/",
    "/about.html",
    "/css/about.css?v=2.8.0",
    "/css/app.css?v=2.8.1",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.8.0",
    "/js/api.js?v=2.8.0-perf.1",
    "/js/app.js?v=2.8.0-share.2",
    "/js/boot.js?v=2.8.1",
    "/js/dashboard.js?v=2.8.0-share.1",
    "/js/onboarding.js?v=2.8.0-search.1",
    "/js/pwa.js?v=2.8.0-support.3",
    "/js/schedule-share.js?v=2.8.0-perf.1",
    "/js/schedule.js?v=2.8.0-perf.1",
    "/js/settings.js?v=2.8.1",
    "/js/support.js?v=2.8.0-share.1",
    "/js/tabs.js?v=2.8.1",
    "/js/teacher-hints.js?v=2.8.0-fix.1",
    "/js/utils.js?v=2.8.0-search.1",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-512.png",
    "/icons/maskable-orange-512.png"
];
const OPTIONAL_ASSETS = ["/pfp/1.png", "/pfp/2.webp"];
const TAB_PATHS = new Set(['/', '/index.html', '/schedule.html', '/settings.html']);

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
        const path = TAB_PATHS.has(url.pathname) ? '/' : url.pathname === '/about.html' ? '/about.html' : null;
        if (!path) return;
        // Cache /, not the redirected /index.html response. Keep HTML and assets on one version.
        event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(path)) || fetch(request)));
        return;
    }
    const resource = url.pathname + url.search;
    if (OPTIONAL_ASSETS.includes(resource)) {
        event.respondWith(caches.open(CACHE_NAME).then(async cache => {
            const cached = await cache.match(request);
            if (cached) return cached;
            const response = await fetch(request);
            if (response.ok) {
                try { await cache.put(request, response.clone()); }
                catch (error) { console.warn('Optional image cache unavailable:', error); }
            }
            return response;
        }));
        return;
    }
    if (!APP_SHELL.includes(resource)) return;
    // Shell resources are frozen by CACHE_NAME and versioned asset URLs.
    // A new worker precaches the next release before replacing this cache.
    event.respondWith(caches.open(CACHE_NAME).then(async cache =>
        (await cache.match(request)) || fetch(request)));
});
