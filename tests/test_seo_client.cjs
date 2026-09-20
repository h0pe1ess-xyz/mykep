/* Dependency-free unit checks with test doubles; NOT a real-browser PWA test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

async function testServiceWorker() {
    const handlers = {};
    const deleted = [];
    let precached = [];
    let fetchResult = { ok: true, status: 200, label: 'online' };
    const entries = new Map([
        ['/index.html', { label: 'offline-home' }],
        ['/about.html', { label: 'offline-about' }],
        ['/js/pwa.js?v=2.6.8', { label: 'cached-js' }],
    ]);
    const context = {
        URL,
        self: {
            location: { origin: 'https://mykep.pp.ua' },
            addEventListener: (event, callback) => { handlers[event] = callback; },
            skipWaiting: async () => {},
            clients: { claim: async () => {} },
        },
        caches: {
            open: async () => ({
                addAll: async (urls) => { precached = [...urls]; },
                match: async key => entries.get(typeof key === 'string' ? key : new URL(key.url).pathname + new URL(key.url).search),
            }),
            keys: async () => ['mykep-cache-v2.6.5-mobile5', 'mykep-cache-v2.6.8', 'unrelated-cache'],
            delete: async name => { deleted.push(name); },
        },
        fetch: async () => {
            if (fetchResult instanceof Error) throw fetchResult;
            return fetchResult;
        },
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'static/sw.js'), 'utf8'), context);
    for (const type of ['install', 'activate']) {
        let pending;
        handlers[type]({ waitUntil: promise => { pending = promise; } });
        await pending;
    }
    assert.ok(precached.includes('/about.html'));
    assert.ok(precached.includes('/css/about.css?v=2.6.8'));
    assert.deepEqual(deleted, ['mykep-cache-v2.6.5-mobile5']);
    async function request(url, mode = 'navigate', method = 'GET') {
        let pending;
        handlers.fetch({ request: { url, mode, method }, respondWith: value => { pending = value; } });
        return pending === undefined ? 'bypassed' : await pending;
    }
    assert.equal((await request('https://mykep.pp.ua/')).label, 'online');
    fetchResult = new Error('offline');
    assert.equal((await request('https://mykep.pp.ua/about.html')).label, 'offline-about');
    assert.equal((await request('https://mykep.pp.ua/')).label, 'offline-home');
    assert.equal((await request('https://mykep.pp.ua/index.html')).label, 'offline-home');
    assert.equal((await request('https://mykep.pp.ua/js/pwa.js?v=2.6.8', 'cors')).label, 'cached-js');
    assert.equal(await request('https://mykep.pp.ua/api/schedule'), 'bypassed');
    assert.equal(await request('https://example.org/'), 'bypassed');
    assert.equal(await request('https://mykep.pp.ua/', 'navigate', 'POST'), 'bypassed');
    fetchResult = { ok: false, status: 404 };
    assert.equal((await request('https://mykep.pp.ua/missing')).status, 404);
    fetchResult = { ok: false, status: 503 };
    assert.equal((await request('https://mykep.pp.ua/about.html')).label, 'offline-about');
}

function testNavigation() {
    for (const pathname of ['/', '/index.html', '/schedule.html', '/settings.html']) {
        const domReady = [];
        const links = ['/', '/schedule.html', '/settings.html'].map(href => ({
            attrs: { href }, classes: new Set(),
            getAttribute(name) { return this.attrs[name] || null; },
            hasAttribute(name) { return name in this.attrs; },
            setAttribute(name, value) { this.attrs[name] = value; },
            removeAttribute(name) { delete this.attrs[name]; },
            addEventListener() {},
            classList: { add(name) {} },
        }));
        for (const link of links) link.classList.add = name => link.classes.add(name);
        const window = { location: { pathname }, innerHeight: 800, addEventListener() {} };
        const document = {
            documentElement: { style: { setProperty() {} } },
            addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') domReady.push(fn); },
            querySelectorAll: selector => selector.includes('bottom-nav') ? links : [],
        };
        vm.runInNewContext(fs.readFileSync(path.join(root, 'static/js/app.js'), 'utf8'), {
            document, window, navigator: {}, setInterval() {}, Date, console,
        });
        // Only the navigation callback; application data loading is outside this test.
        domReady[0]();
        const active = links.filter(link => link.attrs['aria-current'] === 'page');
        assert.equal(active.length, 1, pathname);
        assert.equal(active[0].attrs.href, pathname === '/index.html' ? '/' : pathname);
    }
}

(async () => {
    await testServiceWorker();
    testNavigation();
    console.log('PASS: service-worker lifecycle, cache isolation, online/offline paths, API bypass, 404 handling and navigation on four URLs (test doubles).');
})().catch(error => { console.error(error); process.exitCode = 1; });
