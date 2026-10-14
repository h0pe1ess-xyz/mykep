const CACHE_NAME = 'mykep-cache-v2.9.7';
const RELEASE_VERSION = '2.9.7';
const APP_SHELL = [
    "/js/dialogs.js?v=2.9.7",
    "/",
    "/about.html",
    "/css/about.css?v=2.9.7",
    "/css/app.css?v=2.9.7",
    "/manifest.json",
    "/favicon.ico",
    "/data/teacher-hints.json?v=2.9.7",
    "/js/api.js?v=2.9.7",
    "/js/app.js?v=2.9.7",
    "/js/boot.js?v=2.9.7",
    "/js/dashboard.js?v=2.9.7",
    "/js/onboarding.js?v=2.9.7",
    "/js/pwa.js?v=2.9.7",
    "/js/schedule-share.js?v=2.9.7",
    "/js/schedule.js?v=2.9.7",
    "/js/settings.js?v=2.9.7",
    "/js/support.js?v=2.9.7",
    "/js/tabs.js?v=2.9.7",
    "/js/teacher-hints.js?v=2.9.7",
    "/js/utils.js?v=2.9.7",
    "/icons/install-144.webp",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-orange-512.png"
];
const SHELL_HASHES = {"/": "ea00111109c90dc69e9e612c069ee9a7b87e5fae4c57a705412f8ca3077ea778", "/about.html": "41e1576de034ab89384c351fd0ecf29a78df8e574d1ae22264dc84198191b4e8", "/css/about.css?v=2.9.7": "33593833810c2168e06a0dcefa0576f751fadefa5214ff8a34bc1fd9b6c44447", "/css/app.css?v=2.9.7": "6f10a41c5a521adbb914c0996ac6bcbbb7b35b1befe59fd4a000e567d5613703", "/data/teacher-hints.json?v=2.9.7": "62925f89ce7b723ca830be198a8016d44f7c3c477ba9500ef3d201abe9555452", "/favicon.ico": "3fec7714d2adfa4acaadea48e6f7514939ad689ed026dd221aa58cd2d369d67b", "/icons/icon-192.png": "e470d3f6cf6976a2d12c35dfe249f0561ae0ad457f046bd3612a40568dc134bd", "/icons/icon-512.png": "e2d86fe6dd7d2571e5bd941129fc3aa88469cead4c53d381abcd33ffd514d40d", "/icons/install-144.webp": "e55475df6ab9a48853cc92e9a3059734d84f002c895fc0e704df8e906b595679", "/icons/maskable-orange-512.png": "4fc555360c7c3d0b0ff993540d30e599756a15a26418280dc583ebac28db8d86", "/js/api.js?v=2.9.7": "04cb7e5d2280b29301d14561a20a1b03230bcd1c89f6b8fbadb0f8d87bfc597d", "/js/app.js?v=2.9.7": "1c65c79fa1a770352ff622eb59de688000a26746a097fecae0661c5ef04d0a87", "/js/boot.js?v=2.9.7": "e1829584fbc9197516618d8d3943c40563c8d07f61ccb688e1133a02e34dbfbd", "/js/dashboard.js?v=2.9.7": "408aefbd8979b3e459e7499b747cccf40de7044b3359576ad8705a8a5c692049", "/js/dialogs.js?v=2.9.7": "16ccdb6f1bbb037b22089ee96f315006a3f6c9303af39b0c2dfb701212ae7e3a", "/js/onboarding.js?v=2.9.7": "a1eda936fff8962ba3f781fd977a9287bda666f98b22b6f4ceb9873f4172ee00", "/js/pwa.js?v=2.9.7": "eedf3a7f92c0533ee92a605ce4cc93fa2b7b05f5969f61972476a6066f86795a", "/js/schedule-share.js?v=2.9.7": "da698b39bb40d59928b22cf186826837e3bd881875a0fe021924782e702f9568", "/js/schedule.js?v=2.9.7": "1bb137ae0af38cbce1e5b98f7d651600ca540ebd5f7bab192192b271e9eb3a17", "/js/settings.js?v=2.9.7": "7d56f972ae97b03646282a9926348538795f2ef5c79ae79379d1bb8f80dac338", "/js/support.js?v=2.9.7": "e31210b2a751b1cf9b13b9ef3f28034283f030a8793d48db60aa606c1e58394f", "/js/tabs.js?v=2.9.7": "7210f6a5b22006b1808457e4700f618cd170dc6375210e0a7e36fc9494432a1d", "/js/teacher-hints.js?v=2.9.7": "90e66b3694659fdeefec1a47deb3dfb48f7ac67932c1dbba4534fe80205bc3ab", "/js/utils.js?v=2.9.7": "60ec12bb010288cfb0f73b5ca2351353c01a27ec0ea685007acdcc0324bd0fb0", "/manifest.json": "1ca328a0070b66bdfb49fd6aa0b6ffca26d5239bddb8752dc328f5428f954ae4"};
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
