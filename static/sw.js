const CACHE_NAME = 'mykep-cache-v2.9.17';
const RELEASE_VERSION = '2.9.17';
const APP_SHELL = [
    "/js/bells.js?v=2.9.17",
    "/data/bells.json?v=2.9.17",
    "/js/dialogs.js?v=2.9.17",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.17",
    "/css/app.css?v=2.9.17",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.17",
    "/js/api.js?v=2.9.17",
    "/js/app.js?v=2.9.17",
    "/js/boot.js?v=2.9.17",
    "/js/dashboard.js?v=2.9.17",
    "/js/onboarding.js?v=2.9.17",
    "/js/pwa.js?v=2.9.17",
    "/js/schedule-share.js?v=2.9.17",
    "/js/schedule.js?v=2.9.17",
    "/js/settings.js?v=2.9.17",
    "/js/support.js?v=2.9.17",
    "/js/tabs.js?v=2.9.17",
    "/js/teacher-hints.js?v=2.9.17",
    "/js/utils.js?v=2.9.17",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "783344d854d1878945c95b1ed5c2383a324b941790f8e9f301ea0241884a65ea", "/about.html": "8dcf8c3c5965c2bb0bb8aa69881687edb3e9843b41e820e8a15ece43f659021e", "/css/about.css?v=2.9.17": "63f9cb041b1dbb44e5d1bbcd99a0ea7b067221aaf0fcc5f2620d3081d1b2548b", "/css/app.css?v=2.9.17": "1d5f49f6f8deb4109b74fa4e342bb0e5a8c89f498d76c1dc0ecbfdf3262e2ac3", "/data/bells.json?v=2.9.17": "e0077bddf3aa9777c690934eac5ece991ce6b8cd5674ed9bb5eab66f1080d82c", "/data/teacher-hints.json?v=2.9.17": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.17": "100698d347224aca30ed0e15f988098c9855b15eedd47f14791188bbbe03c82e", "/js/app.js?v=2.9.17": "c5569c3c2399a6a7327e8223540b3f70f0ca463e550e024c87541f10032895cb", "/js/bells.js?v=2.9.17": "92486b6262653bc1333429981413a063b3ed9d9f9a166ebcc54367d56c915711", "/js/boot.js?v=2.9.17": "71dd4601a84090bf7ed82b876229cd8f55b958c2e4f6ee3d8f116b71b62b890f", "/js/dashboard.js?v=2.9.17": "341cab6907eba564074ca934869395d10a7ce3f4776474cc92beed4d918bb5b5", "/js/dialogs.js?v=2.9.17": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.17": "582adc4f745626c6d1cc3aa738457798fd8a16ee33fac05f07803255fc61c54a", "/js/pwa.js?v=2.9.17": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.17": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.17": "4a124b670b127344f4d317fb95beb9f27fe5794b58730b946a228ba43ff0f352", "/js/settings.js?v=2.9.17": "aade6a7e74958793057925afccbb2f1a3181dd1b228ec721360d9bb068673a77", "/js/support.js?v=2.9.17": "e31210b2a751b1cf9b13b9ef3f28034283f030a8793d48db60aa606c1e58394f", "/js/tabs.js?v=2.9.17": "5814669a9dd591269089cf5069598dba4b65094444388721d8675fe80d6737f7", "/js/teacher-hints.js?v=2.9.17": "0ecec01411bed3bf054f91a8173b66f26c9836c06e1734168e0b428ae2c35ed2", "/js/utils.js?v=2.9.17": "be8c46291bd6ea1063f77fe8107b0623499b1b045a0b32a55b76a68f78491e3a", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
