const CACHE_NAME = 'mykep-cache-v2.9.25-swipe.5';
const RELEASE_VERSION = '2.9.25-swipe.5';
const APP_SHELL = [
    "/js/calendar-config.js?v=2.9.25-swipe.5",
    "/js/bells.js?v=2.9.25-swipe.5",
    "/data/bells.json?v=2.9.25-swipe.5",
    "/js/dialogs.js?v=2.9.25-swipe.5",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.25-swipe.5",
    "/css/app.css?v=2.9.25-swipe.5",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.25-swipe.5",
    "/js/api.js?v=2.9.25-swipe.5",
    "/js/app.js?v=2.9.25-swipe.5",
    "/js/boot.js?v=2.9.25-swipe.5",
    "/js/dashboard.js?v=2.9.25-swipe.5",
    "/js/onboarding.js?v=2.9.25-swipe.5",
    "/js/pwa.js?v=2.9.25-swipe.5",
    "/js/schedule-share.js?v=2.9.25-swipe.5",
    "/js/schedule.js?v=2.9.25-swipe.5",
    "/js/settings.js?v=2.9.25-swipe.5",
    "/js/support.js?v=2.9.25-swipe.5",
    "/js/tabs.js?v=2.9.25-swipe.5",
    "/js/teacher-hints.js?v=2.9.25-swipe.5",
    "/js/utils.js?v=2.9.25-swipe.5",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "acac6a8076f2c756c3ed3b56f241be06ef538ecb314c1d5a2eef43489c1dfd77", "/about.html": "719c83f3023fb1cd4b4e25e2324e24615b54d51740bdf8f144697882f66df61f", "/css/about.css?v=2.9.25-swipe.5": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.9.25-swipe.5": "8d191823babc2bcf82c1f9c341150ef231a284a398bff2352721c2d5e1bef530", "/data/bells.json?v=2.9.25-swipe.5": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.9.25-swipe.5": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.25-swipe.5": "19211a49eb7d161206e21d69a2162a12a8c9aa7bccf3337cba987c70942739f8", "/js/app.js?v=2.9.25-swipe.5": "448d164389b82f20067ad64427dc760f0b1403c6487262c4d97b6e51a3d369ab", "/js/bells.js?v=2.9.25-swipe.5": "d1f8ea0aca7ba6ec7d5df50158d5def64d05e11d981e7727c690cc597e0122d8", "/js/boot.js?v=2.9.25-swipe.5": "07b13dee61e110556b0e6de2913e4836c4e3c837aafd35a3c136d014375ba699", "/js/calendar-config.js?v=2.9.25-swipe.5": "5f552e607f0a260c0b117da8cc21a41c1cb95e17de9de4fe18025a1e348109ed", "/js/dashboard.js?v=2.9.25-swipe.5": "24ce9fe4ca9dd0a54e619349513b862de89c7a0805bc3f933cd45e1a7840e826", "/js/dialogs.js?v=2.9.25-swipe.5": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.25-swipe.5": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.9.25-swipe.5": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.25-swipe.5": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.25-swipe.5": "b47e36bf60b72f15f99fed9ba23185b35136179beb984f702d4e362f2e93ebd2", "/js/settings.js?v=2.9.25-swipe.5": "abe233122923f51050088c972dee94b3ea85de58702e5f66b48b0b33d3eea736", "/js/support.js?v=2.9.25-swipe.5": "e31210b2a751b1cf9b13b9ef3f28034283f030a8793d48db60aa606c1e58394f", "/js/tabs.js?v=2.9.25-swipe.5": "73d4884c33a4cdf9717ce734cae9391a7156c278284065525aa8ce405aaca3c2", "/js/teacher-hints.js?v=2.9.25-swipe.5": "6019cddd6c5154b9213cbe1fe63ac31440c378d27d0f09010e4576e8df2705af", "/js/utils.js?v=2.9.25-swipe.5": "d418cb50cc9e067c7d46751e94b4982e93127f54fb75eeca842a8135a27cee95", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
const OPTIONAL_ASSETS = ["/pfp/1-192.webp", "/pfp/2.webp"];
const TAB_PATHS = new Set(['/', '/index.html', '/schedule.html', '/settings.html']);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Reject a partial deployment before activating a mixed HTML/JS/CSS shell.
        const responses = await Promise.all(APP_SHELL.map(async url => {
            const response = await fetch(url, {cache:'reload'});
            if (!response.ok) throw new Error('Shell resource unavailable');
            if (url === '/' || url === '/about.html') {
                // The edge injects its analytics beacon into HTML. Validate the
                // release marker; frozen JS/CSS still require their exact hash.
                const html = await response.clone().text();
                if (!html.includes(`content="${RELEASE_VERSION}" name="mykep-build"`)) throw new Error('HTML build mismatch');
                return [url,response];
            }
            // Git checkouts can use LF or CRLF. Canonicalize only text line
            // endings; binary assets retain byte-for-byte verification.
            const bytes = /\.(?:js|css|json)(?:\?|$)/.test(url)
                ? new TextEncoder().encode((await response.clone().text()).replace(/\r\n/g,'\n'))
                : await response.clone().arrayBuffer();
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
            if (hash !== SHELL_HASHES[url]) throw new Error('Shell build mismatch');
            return [url,response];
        }));
        await Promise.all(responses.map(([url,response]) => cache.put(url,response)));
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
