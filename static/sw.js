const CACHE_NAME = 'mykep-cache-v2.9.37';
const RELEASE_VERSION = '2.9.37';
const APP_SHELL = [
    "/js/calendar-config.js?v=2.9.37",
    "/js/bells.js?v=2.9.37",
    "/data/bells.json?v=2.9.37",
    "/js/dialogs.js?v=2.9.37",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.37",
    "/css/app.css?v=2.9.37",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.37",
    "/js/api.js?v=2.9.37",
    "/js/app.js?v=2.9.37",
    "/js/boot.js?v=2.9.37",
    "/js/dashboard.js?v=2.9.37",
    "/js/onboarding.js?v=2.9.37",
    "/js/pwa.js?v=2.9.37",
    "/js/schedule-share.js?v=2.9.37",
    "/js/schedule.js?v=2.9.37",
    "/js/settings.js?v=2.9.37",
    "/js/support.js?v=2.9.37",
    "/js/tabs.js?v=2.9.37",
    "/js/teacher-hints.js?v=2.9.37",
    "/js/utils.js?v=2.9.37",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "57bfbd5d9fd891300a8ca758449f06da522b56d0c7ac774a3420625b22ba95ab", "/about.html": "be77963a23c6d23e59565db72c40f73cf7a9beb1595af135490010bcdcaeb058", "/css/about.css?v=2.9.37": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.9.37": "08e508f40633fa8b21dd245ca42a090914001a85f89ee0a67f30d61520ec7e4f", "/data/bells.json?v=2.9.37": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.9.37": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.37": "72b05c672e5ecc118c1ecd52e3c8a4d3207bb0943f4b9364c610dfc2d289e8f3", "/js/app.js?v=2.9.37": "1febbe32e30d9db54c508a6f599eb48424c1370473b8b08d4a25cae4761605a4", "/js/bells.js?v=2.9.37": "aadda4458f42e40b7b8a50c73e124f291d2523aaa5ed1e29a33cf675eb82147a", "/js/boot.js?v=2.9.37": "ee08ac9b3c4fe26ec5a3271a77e4f3e00ac5d40ffcc3127bb767a6363dfea611", "/js/calendar-config.js?v=2.9.37": "5f552e607f0a260c0b117da8cc21a41c1cb95e17de9de4fe18025a1e348109ed", "/js/dashboard.js?v=2.9.37": "24ce9fe4ca9dd0a54e619349513b862de89c7a0805bc3f933cd45e1a7840e826", "/js/dialogs.js?v=2.9.37": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.37": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.9.37": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.37": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.37": "b47e36bf60b72f15f99fed9ba23185b35136179beb984f702d4e362f2e93ebd2", "/js/settings.js?v=2.9.37": "dbfcd78a739b4f0ce1216df184e42e43287cba744d921de21869441880248440", "/js/support.js?v=2.9.37": "e2b2b57c80131965ee570410a54b89b6c6e9849c9e50bad7d5368ee732d1d700", "/js/tabs.js?v=2.9.37": "bcd7d3ef2738773caa50fe831418fbae1e0c4c57d796a93d0bf188ba10105069", "/js/teacher-hints.js?v=2.9.37": "0502aebc8383c785d7e217a96819e5930e61181e89f4da7475e59a352fea0aba", "/js/utils.js?v=2.9.37": "d418cb50cc9e067c7d46751e94b4982e93127f54fb75eeca842a8135a27cee95", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
