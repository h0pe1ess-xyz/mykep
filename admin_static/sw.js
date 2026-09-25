/* MyKep Admin service worker: network-first app shell, never caches API data. */
const CACHE_NAME = 'mykep-admin-v2';
const SHELL = ['/admin/', '/admin/admin.css', '/admin/admin.js', '/admin/charts.js',
    '/admin/manifest.webmanifest', '/admin/icon-192.png', '/admin/apple-touch-icon.png'];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(SHELL);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith('mykep-admin-') && name !== CACHE_NAME) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || !url.pathname.startsWith('/admin/')) return;
    const key = SHELL.includes(url.pathname) ? url.pathname : (request.mode === 'navigate' ? '/admin/' : null);
    if (!key) return;
    event.respondWith((async () => {
        try {
            const response = await fetch(request, { cache: 'no-store' });
            if (response.ok && response.type === 'basic' && url.pathname === key) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(key, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await caches.match(key);
            if (cached) return cached;
            throw error;
        }
    })());
});
