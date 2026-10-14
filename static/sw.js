const CACHE_NAME = 'mykep-cache-v2.9.0';
const RELEASE_VERSION = '2.9.0';
const APP_SHELL = [
    "/js/dialogs.js?v=2.9.0",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.0",
    "/css/app.css?v=2.9.0",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.0",
    "/js/api.js?v=2.9.0",
    "/js/app.js?v=2.9.0",
    "/js/boot.js?v=2.9.0",
    "/js/dashboard.js?v=2.9.0",
    "/js/onboarding.js?v=2.9.0",
    "/js/pwa.js?v=2.9.0",
    "/js/schedule-share.js?v=2.9.0",
    "/js/schedule.js?v=2.9.0",
    "/js/settings.js?v=2.9.0",
    "/js/support.js?v=2.9.0",
    "/js/tabs.js?v=2.9.0",
    "/js/teacher-hints.js?v=2.9.0",
    "/js/utils.js?v=2.9.0",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "4707c42cfac1988646740cdd7bec1744984fdb52736b5ff4daa8f08e85ec9825", "/about.html": "062033e3851365a88d86d99597b8271854250d6f3bb4b700c66c817fa2a8bd50", "/css/about.css?v=2.9.0": "33593833810c2168e06a0dcefa0576f751fadefa5214ff8a34bc1fd9b6c44447", "/css/app.css?v=2.9.0": "9394d98a01b400165b2bf79a420b457f74a1dead7961172a344b8ec6d84d565c", "/data/teacher-hints.json?v=2.9.0": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.0": "1b3e7a4f7373e909681d0eab4a06bf4fbe6bb8825f66b70126eb85b0615916f4", "/js/app.js?v=2.9.0": "3bd259be8e90cc53549e5fa3cda6d8889b4458946a5a86feb6f1034c75b808b3", "/js/boot.js?v=2.9.0": "d5f6fa265d2bd4f48584fc2b4cb260ba7f100c1ff434268d0a0eed98763f3457", "/js/dashboard.js?v=2.9.0": "408aefbd8979b3e459e7499b747cccf40de7044b3359576ad8705a8a5c692049", "/js/dialogs.js?v=2.9.0": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.0": "a1eda936fff8962ba3f781fd977a9287bda666f98b22b6f4ceb9873f4172ee00", "/js/pwa.js?v=2.9.0": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.0": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.0": "cdebb2b2c0111b3328c0cbd86b0b61a6f4e0c28f60cdd4153067ddc3f1fb0525", "/js/settings.js?v=2.9.0": "7d56f972ae97b03646282a9926348538795f2ef5c79ae79379d1bb8f80dac338", "/js/support.js?v=2.9.0": "45e543b384e41118e0c2591296f647456d9ff77e1c060f2eb833e9dcd440c61b", "/js/tabs.js?v=2.9.0": "7210f6a5b22006b1808457e4700f618cd170dc6375210e0a7e36fc9494432a1d", "/js/teacher-hints.js?v=2.9.0": "b62c0f9c932515881cb6acba425fc3b06fd6e30957e21e7d0a3a1312c3c41009", "/js/utils.js?v=2.9.0": "60ec12bb010288cfb0f73b5ca2351353c01a27ec0ea685007acdcc0324bd0fb0", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
