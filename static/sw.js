const CACHE_NAME = 'mykep-cache-v2.10.15';
const RELEASE_VERSION = '2.10.15';
const APP_SHELL = [
    "/js/calendar-config.js?v=2.10.15",
    "/js/bells.js?v=2.10.15",
    "/data/bells.json?v=2.10.15",
    "/js/dialogs.js?v=2.10.15",
    "/",
    "/about.html",
    "/css/about.css?v=2.10.15",
    "/css/app.css?v=2.10.15",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.10.15",
    "/js/api.js?v=2.10.15",
    "/js/app.js?v=2.10.15",
    "/js/boot.js?v=2.10.15",
    "/js/dashboard.js?v=2.10.15",
    "/js/onboarding.js?v=2.10.15",
    "/js/pwa.js?v=2.10.15",
    "/js/schedule-share.js?v=2.10.15",
    "/js/schedule.js?v=2.10.15",
    "/js/settings.js?v=2.10.15",
    "/js/support.js?v=2.10.15",
    "/js/tabs.js?v=2.10.15",
    "/js/teacher-hints.js?v=2.10.15",
    "/js/utils.js?v=2.10.15",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "3bf4d411d1c2f2a0e5185e5cdc6e30b923200498f3f943598cb203eef4fbdfb0", "/about.html": "70ce588acbbdaf189f05753bead0c103917e11b40766352eb3eb11abab877a36", "/css/about.css?v=2.10.15": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.10.15": "60fddeef97cfc3b6707d0aeeb4d21b3c99696ff6a1ee71468862a0a5f939be34", "/data/bells.json?v=2.10.15": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.10.15": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.10.15": "72b05c672e5ecc118c1ecd52e3c8a4d3207bb0943f4b9364c610dfc2d289e8f3", "/js/app.js?v=2.10.15": "7afc09a14939cb2f26cb439ee7ee66d85250cda89c31c7840af402a2cfdf3654", "/js/bells.js?v=2.10.15": "3c438bbb3da5482457c121487da56028661f4333a40b6cdbea5332af895e2b7e", "/js/boot.js?v=2.10.15": "530fb4917cca1251c0e04d2073084cfa3145993872e70408c8718c793aa4cf1f", "/js/calendar-config.js?v=2.10.15": "5f552e607f0a260c0b117da8cc21a41c1cb95e17de9de4fe18025a1e348109ed", "/js/dashboard.js?v=2.10.15": "c88da4d93fb0330047bee4da5c6276db9de6fd70e1a9cf333d3f92682e79f2d6", "/js/dialogs.js?v=2.10.15": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.10.15": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.10.15": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.10.15": "bef80fb123ed6e7180e69f07f5b1993ff1f32d16e0d7ec547460d694243a6e48", "/js/schedule.js?v=2.10.15": "fb88a9f18b91d20296e09fd25dc0e74a579f31683eba33143f0327d03fe5c321", "/js/settings.js?v=2.10.15": "91d1d1a10829b972f7c76a18d3ed9be24e044c657239d98ef98d6796ba96aa15", "/js/support.js?v=2.10.15": "2b2f111e76faaa5a1bbaed6cc621d8f4043b4369785b7436155ccd2256de42e6", "/js/tabs.js?v=2.10.15": "b1da39cd526947ff67c5ed4e56cc3bf9b1aaed4bf4f09ed0319d0db068a1edfb", "/js/teacher-hints.js?v=2.10.15": "033dee7a7ba5a8e7b1ad2478beb5bc8b6673305433ae438204228b03b04c2b52", "/js/utils.js?v=2.10.15": "d418cb50cc9e067c7d46751e94b4982e93127f54fb75eeca842a8135a27cee95", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
