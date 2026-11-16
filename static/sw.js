const CACHE_NAME = 'mykep-cache-v2.10.17';
const RELEASE_VERSION = '2.10.17';
const APP_SHELL = [
    "/js/requests.js?v=2.10.17",
    "/js/calendar-config.js?v=2.10.17",
    "/js/bells.js?v=2.10.17",
    "/data/bells.json?v=2.10.17",
    "/js/dialogs.js?v=2.10.17",
    "/",
    "/about.html",
    "/css/about.css?v=2.10.17",
    "/css/app.css?v=2.10.17",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.10.17",
    "/js/api.js?v=2.10.17",
    "/js/app.js?v=2.10.17",
    "/js/boot.js?v=2.10.17",
    "/js/dashboard.js?v=2.10.17",
    "/js/onboarding.js?v=2.10.17",
    "/js/pwa.js?v=2.10.17",
    "/js/schedule-share.js?v=2.10.17",
    "/js/schedule.js?v=2.10.17",
    "/js/settings.js?v=2.10.17",
    "/js/support.js?v=2.10.17",
    "/js/tabs.js?v=2.10.17",
    "/js/teacher-hints.js?v=2.10.17",
    "/js/utils.js?v=2.10.17",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "9f8d3112e2998737694c2fedf1734fd117edc6e2022877534b6d3b506c44f2e7", "/about.html": "eb80a35c3f1c7833b73c7c56b1a68b74d276e111e10caafa01615f8a146fa844", "/css/about.css?v=2.10.17": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.10.17": "e109006c1f6bbdb422a3cfb2eae2696480a8c659a6d4bb09f591b716d9e5963f", "/data/bells.json?v=2.10.17": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.10.17": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.10.17": "915b2d21d021f0f31752c22011e43b2892338ae6649e13d5b57593fa51c44594", "/js/app.js?v=2.10.17": "7afc09a14939cb2f26cb439ee7ee66d85250cda89c31c7840af402a2cfdf3654", "/js/bells.js?v=2.10.17": "38415a679c05471732f9074c8e8987868d258742342fadcabe1f395ecaf4d9d3", "/js/boot.js?v=2.10.17": "4c89fff4e85f858cf0304a93ef8f1b1223dee609e9b9a5fd0eca17a91093a932", "/js/calendar-config.js?v=2.10.17": "5f552e607f0a260c0b117da8cc21a41c1cb95e17de9de4fe18025a1e348109ed", "/js/dashboard.js?v=2.10.17": "c88da4d93fb0330047bee4da5c6276db9de6fd70e1a9cf333d3f92682e79f2d6", "/js/dialogs.js?v=2.10.17": "b698d7b4bd160db9ffc07e1145ad925b2a0988c669ce85cc16049b72bb667b34", "/js/onboarding.js?v=2.10.17": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.10.17": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/requests.js?v=2.10.17": "9bf3a74363ad92c530358ead4a91cc2f0ce7eeae895690034024769122aca525", "/js/schedule-share.js?v=2.10.17": "bef80fb123ed6e7180e69f07f5b1993ff1f32d16e0d7ec547460d694243a6e48", "/js/schedule.js?v=2.10.17": "e1ad37b9590b8f6f85e9b81a5176d74bfb1cf9b8762492bee878b7a9ea14ca40", "/js/settings.js?v=2.10.17": "5eec0437a2563c2a9c2308f1bfeafeb0d5f68126a7dd9c4ab86757ff29d7e89c", "/js/support.js?v=2.10.17": "2b2f111e76faaa5a1bbaed6cc621d8f4043b4369785b7436155ccd2256de42e6", "/js/tabs.js?v=2.10.17": "9c2be50c23352b7ce53ef2d8e5730100523183768a52d0fc68cc0348500910c8", "/js/teacher-hints.js?v=2.10.17": "148e81441f753fe0890e3796691efdd6b785481c1d078e27e5a83081a61fa994", "/js/utils.js?v=2.10.17": "d418cb50cc9e067c7d46751e94b4982e93127f54fb75eeca842a8135a27cee95", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
const OPTIONAL_ASSETS = ["/pfp/1-192.webp", "/pfp/2.webp"];
const TAB_PATHS = new Set(['/', '/index.html', '/schedule.html', '/settings.html']);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
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
        const cache = await caches.open(CACHE_NAME);
        try {
            for (const [url, response] of responses) await cache.put(url, response);
        } catch (error) {
            // Quota/write failures must not strand a partial release forever.
            await caches.delete(CACHE_NAME);
            throw error;
        }
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
