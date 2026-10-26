const CACHE_NAME = 'mykep-cache-v2.9.16';
const RELEASE_VERSION = '2.9.16';
const APP_SHELL = [
    "/js/bells.js?v=2.9.16",
    "/data/bells.json?v=2.9.16",
    "/js/dialogs.js?v=2.9.16",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.16",
    "/css/app.css?v=2.9.16",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.16",
    "/js/api.js?v=2.9.16",
    "/js/app.js?v=2.9.16",
    "/js/boot.js?v=2.9.16",
    "/js/dashboard.js?v=2.9.16",
    "/js/onboarding.js?v=2.9.16",
    "/js/pwa.js?v=2.9.16",
    "/js/schedule-share.js?v=2.9.16",
    "/js/schedule.js?v=2.9.16",
    "/js/settings.js?v=2.9.16",
    "/js/support.js?v=2.9.16",
    "/js/tabs.js?v=2.9.16",
    "/js/teacher-hints.js?v=2.9.16",
    "/js/utils.js?v=2.9.16",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "408744c530b5259702026459c199c8d928bb4fdbc71262fd325b42ab06f0efc2", "/about.html": "f7b6fe11d4a8dd1fe3525e4c1530bd2121e8c45b93f3ddafeff74d6a4a2d4fcc", "/css/about.css?v=2.9.16": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.9.16": "7d10274e73be5e8e99adafd70bdd2c71815e774647594d4b1f0450991c6b0f18", "/data/bells.json?v=2.9.16": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.9.16": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.16": "100698d347224aca30ed0e15f988098c9855b15eedd47f14791188bbbe03c82e", "/js/app.js?v=2.9.16": "c5569c3c2399a6a7327e8223540b3f70f0ca463e550e024c87541f10032895cb", "/js/bells.js?v=2.9.16": "5eb57942676160074f5dbb53ef9e9ac71470e4e6adbea17661f784b298931598", "/js/boot.js?v=2.9.16": "d756c8d07adc7f4c67bc89f5c8f608ed7d22d18703da4c5ab8ffc17f71172815", "/js/dashboard.js?v=2.9.16": "09fe949e878b8cdb33b104ae4a36b12a53ffa4a9508c59afecca648d533e721f", "/js/dialogs.js?v=2.9.16": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.16": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.9.16": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.16": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.16": "f7e07af87dfc583f6a14f20fc68b3edee42319a6d4e6c9c85b9508be7d8289ef", "/js/settings.js?v=2.9.16": "aade6a7e74958793057925afccbb2f1a3181dd1b228ec721360d9bb068673a77", "/js/support.js?v=2.9.16": "e31210b2a751b1cf9b13b9ef3f28034283f030a8793d48db60aa606c1e58394f", "/js/tabs.js?v=2.9.16": "7210f6a5b22006b1808457e4700f618cd170dc6375210e0a7e36fc9494432a1d", "/js/teacher-hints.js?v=2.9.16": "feeeb8a157e9434eba1701ddc4173b6d6348d29b6d4030500845bf693ef4e46e", "/js/utils.js?v=2.9.16": "a338c5d7998f2342c9daaeae9b32280f3c928cc48ffb5db4abf2e8b8eb799524", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
