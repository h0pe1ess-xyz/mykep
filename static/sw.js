const CACHE_NAME = 'mykep-cache-v2.9.33';
const RELEASE_VERSION = '2.9.33';
const APP_SHELL = [
    "/js/calendar-config.js?v=2.9.33",
    "/js/bells.js?v=2.9.33",
    "/data/bells.json?v=2.9.33",
    "/js/dialogs.js?v=2.9.33",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.33",
    "/css/app.css?v=2.9.33",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.33",
    "/js/api.js?v=2.9.33",
    "/js/app.js?v=2.9.33",
    "/js/boot.js?v=2.9.33",
    "/js/dashboard.js?v=2.9.33",
    "/js/onboarding.js?v=2.9.33",
    "/js/pwa.js?v=2.9.33",
    "/js/schedule-share.js?v=2.9.33",
    "/js/schedule.js?v=2.9.33",
    "/js/settings.js?v=2.9.33",
    "/js/support.js?v=2.9.33",
    "/js/tabs.js?v=2.9.33",
    "/js/teacher-hints.js?v=2.9.33",
    "/js/utils.js?v=2.9.33",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "63d0d593dd987d621b235989d2ef2152fec2c0bb55cbf420ac3f44c0f0fdb38d", "/about.html": "49b3e4db19862e6bfdedf9397018e5d1d17708646bdef81cbe04a49a154f4cab", "/css/about.css?v=2.9.33": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.9.33": "08e508f40633fa8b21dd245ca42a090914001a85f89ee0a67f30d61520ec7e4f", "/data/bells.json?v=2.9.33": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.9.33": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.33": "72b05c672e5ecc118c1ecd52e3c8a4d3207bb0943f4b9364c610dfc2d289e8f3", "/js/app.js?v=2.9.33": "1febbe32e30d9db54c508a6f599eb48424c1370473b8b08d4a25cae4761605a4", "/js/bells.js?v=2.9.33": "aadda4458f42e40b7b8a50c73e124f291d2523aaa5ed1e29a33cf675eb82147a", "/js/boot.js?v=2.9.33": "5b996b887e338cf0f49d2b5cbeec6ec38e355c0cf31caa711549a151b9ba413b", "/js/calendar-config.js?v=2.9.33": "5f552e607f0a260c0b117da8cc21a41c1cb95e17de9de4fe18025a1e348109ed", "/js/dashboard.js?v=2.9.33": "24ce9fe4ca9dd0a54e619349513b862de89c7a0805bc3f933cd45e1a7840e826", "/js/dialogs.js?v=2.9.33": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.33": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.9.33": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.33": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.33": "b47e36bf60b72f15f99fed9ba23185b35136179beb984f702d4e362f2e93ebd2", "/js/settings.js?v=2.9.33": "dbfcd78a739b4f0ce1216df184e42e43287cba744d921de21869441880248440", "/js/support.js?v=2.9.33": "e31210b2a751b1cf9b13b9ef3f28034283f030a8793d48db60aa606c1e58394f", "/js/tabs.js?v=2.9.33": "63d41f2873b649077850d3951cea42d11fe63c16bece2744fe6af5274236d6bd", "/js/teacher-hints.js?v=2.9.33": "4c8aba6966ee206b9ce3dd8e5fff7e2ed29b423df04ddf252577dc0744ef1a5f", "/js/utils.js?v=2.9.33": "d418cb50cc9e067c7d46751e94b4982e93127f54fb75eeca842a8135a27cee95", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
