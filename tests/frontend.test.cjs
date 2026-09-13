const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function context() {
    const local = new Map(), session = new Map(), events = {};
    const nodes = new Map();
    function element() {
        const el = { style: {}, children: [], hidden: false, isConnected: true, inert: false,
            classList: { add() {}, remove() {} },
            setAttribute(key, value) { (this.attributes ||= {})[key] = value; }, addEventListener() {}, scrollIntoView() {}, focus() {}, select() {},
            appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); return child; },
            append(...children) { children.forEach(child => this.appendChild(child)); },
            remove() { nodes.delete(this.id); },
            replaceChildren(...children) { this.children = children; },
            getClientRects() { return this.hidden ? [] : [{}]; },
            querySelector(selector) { return nodes.get(selector.slice(1)); },
            querySelectorAll() { return [...nodes.values()]; }
        };
        Object.defineProperty(el, 'innerHTML', { set(value) {
            this.markup = value;
            for (const match of value.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
                const child = element(); child.id = match[3]; child.hidden = /\bhidden\b/.test(match[2]); nodes.set(child.id, child);
            }
        }, get() { return this.markup || ''; } });
        return el;
    }
    const store = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
    const document = { body: element(), activeElement: element(), referrer: '', createElement: element,
        getElementById: id => nodes.get(id), querySelector: () => null };
    document.body.appendChild({ tagName: 'DIV', isConnected: true });
    const c = vm.createContext({ console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Intl, Date, Math,
        localStorage: store(local), sessionStorage: store(session),
        navigator: { userAgent: 'Android Chrome/130 Safari/537.36', maxTouchPoints: 5 }, document,
        window: { matchMedia: () => ({ matches: false }), location: { origin: 'https://example.test', pathname: '/index.html', search: '', hash: '' },
            addEventListener: (name, fn) => { events[name] = fn; } },
        fetch: async () => { throw new Error('offline'); }
    });
    c.window.navigator = c.navigator;
    for (const name of ['utils', 'pwa', 'api']) vm.runInContext(fs.readFileSync(path.join(root, `static/js/${name}.js`), 'utf8'), c);
    return { c, nodes, events, local, session };
}

for (const [label, ua, touch, expected] of [
    ['iPhone Safari', 'Mozilla/5.0 (iPhone) AppleWebKit Version/18 Mobile Safari', 5, {ios:true, android:false, embedded:false}],
    ['iPad desktop UA', 'Mozilla/5.0 (Macintosh) AppleWebKit Version/18 Safari', 5, {ios:true, android:false, embedded:false}],
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/130 Safari', 5, {ios:false, android:true, embedded:false}],
    ['Telegram Android', 'Android Telegram', 5, {ios:false, android:true, embedded:true}],
    ['Telegram iOS', 'iPhone Telegram AppleWebKit', 5, {ios:true, android:false, embedded:true}],
    ['Android WebView', 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit Chrome Safari', 5, {ios:false, android:true, embedded:true}],
    ['Instagram iOS', 'iPhone AppleWebKit Instagram', 5, {ios:true, android:false, embedded:true}],
    ['Desktop Safari', 'Macintosh AppleWebKit Version/18 Safari', 0, {ios:false, android:false, embedded:false}],
]) test(`browser detection: ${label}`, () => {
    const {c} = context(); const actual = c.browserContext({userAgent:ua, maxTouchPoints:touch}, {}, '');
    for (const key of Object.keys(expected)) assert.equal(actual[key], expected[key]);
});

test('Telegram launch parameters without UA markers', () => {
    const {c} = context();
    assert.equal(c.browserContext({userAgent:'Android Chrome'}, {hash:'#tgWebAppPlatform=android'}, '').telegram, true);
    assert.equal(c.browserContext({userAgent:'iPhone Safari'}, {}, 'https://t.me/channel').telegramReferral, true);
});
test('manual Android instructions exist without beforeinstallprompt', async () => {
    const {c, nodes, session} = context();
    const done = c.showPWAGuide();
    const guide = nodes.get('pwa-guide');
    assert.match(guide.innerHTML, /Додати на головний екран/);
    assert.match(guide.innerHTML, /Telegram/);
    assert.equal(nodes.get('pwa-install').hidden, true);
    nodes.get('pwa-browser').onclick();
    assert.equal(nodes.get('pwa-confirm').hidden, false);
    assert.equal(session.has('mykep_browser_session'), false);
    nodes.get('pwa-back').onclick();
    assert.equal(nodes.get('pwa-confirm').hidden, true);
    nodes.get('pwa-browser').onclick();
    nodes.get('pwa-confirm-browser').onclick();
    await done;
    assert.equal(session.get('mykep_browser_session'), 'yes');
    assert.equal(c.document.body.children[0].inert, false);
});
test('native prompt is optional and single-use', async () => {
    const {c, nodes, events} = context(); let prompted=0, prevented=0;
    const done = c.showPWAGuide();
    events.beforeinstallprompt({preventDefault(){prevented++;}, async prompt(){prompted++;}, userChoice:Promise.resolve({outcome:'dismissed'})});
    assert.equal(nodes.get('pwa-install').hidden, false);
    await nodes.get('pwa-install').onclick(); await nodes.get('pwa-install').onclick();
    assert.equal(prompted,1); assert.equal(prevented,1);
    events.appinstalled(); await done;
});
test('standalone app skips installation guide', async () => {
    const {c, nodes} = context(); c.navigator.standalone = true;
    await c.showPWAGuide(); assert.equal(nodes.has('pwa-guide'), false);
});
test('escaping upstream text prevents markup injection', () => {
    const {c} = context(); assert.equal(c.escapeHTML('<img src=x onerror="bad()">'), '&lt;img src=x onerror=&quot;bad()&quot;&gt;');
});
test('corrupted JSON cache does not crash', () => {
    const {c,local} = context(); local.set('mykep_schedule', '{broken');
    assert.equal(c.fallbackCache('key'), null);
});
test('cache is isolated by group, durations and calendar week', () => {
    const {c} = context(); const a=c.scheduleCacheKey('A',80,60);
    assert.notEqual(a,c.scheduleCacheKey('B',80,60)); assert.notEqual(a,c.scheduleCacheKey('A',60,60));
    c.getKyivNow = () => new Date(2026,8,14,8); const first = c.scheduleCacheKey('A',80,60);
    c.getKyivNow = () => new Date(2026,8,21,8); assert.notEqual(first,c.scheduleCacheKey('A',80,60));
});
test('offline without cache returns failure, not an empty school day', async () => {
    const {c} = context(); assert.equal(await c.fetchSchedule(), null);
});
test('offline matching snapshot is returned with a visible warning', async () => {
    const {c,local} = context(); const key = c.scheduleCacheKey('ПІ-24-02','80','60');
    local.set('mykep_schedule', JSON.stringify({key,data:{'понеділок':[]}}));
    const data = await c.fetchSchedule(); assert.ok(data); assert.equal(Object.keys(data)[0],'понеділок');
    assert.match(vm.runInContext('scheduleNotice',c), /Немає зв’язку/);
});
test('group requests deduplicate concurrent consumers', async () => {
    const {c} = context(); let calls=0;
    c.fetch=async () => { calls++; return {ok:true,json:async()=>({status:'success',data:['ПІ-24-02']})}; };
    await Promise.all([c.fetchGroups(),c.fetchGroups(),c.fetchGroups()]); assert.equal(calls,1);
});
test('404 does not fall back to old schedule', async () => {
    const {c,local} = context();
    const key=c.scheduleCacheKey('ПІ-24-02','80','60'); local.set('mykep_schedule',JSON.stringify({key,data:{'понеділок':[]}}));
    c.fetch=async()=>({ok:false,status:404,json:async()=>({status:'error',message:'Групу не знайдено.'})});
    assert.equal(await c.fetchSchedule(),null);
});
test('every service-worker shell URL exists and page dependencies are precached', () => {
    const source=fs.readFileSync(path.join(root,'static/sw.js'),'utf8');
    const urls=JSON.parse(source.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
    for (const url of urls) assert.ok(fs.existsSync(path.join(root,'static', url.split('?')[0] === '/' ? 'index.html' : url.split('?')[0])),url);
    for (const name of ['index','settings','schedule']) {
        const html=fs.readFileSync(path.join(root,`static/${name}.html`),'utf8');
        for (const match of html.matchAll(/(?:src|href)="((?:js\/|style\.css)[^"]+)"/g)) assert.ok(urls.includes('/'+match[1]),match[1]);
        assert.doesNotMatch(html,/user-scalable=no/);
    }
});

test('PWA: browser link is secondary and extra help is collapsed in Safari', async () => {
    const {c,nodes} = context(); c.navigator.userAgent = 'iPhone AppleWebKit Version/18 Safari';
    const done = c.showPWAGuide();
    const markup = nodes.get('pwa-guide').innerHTML;
    assert.match(markup, /class="pwa-browser-link" id="pwa-browser"/);
    assert.match(markup, /Для iOS \(Safari\)/);
    assert.doesNotMatch(markup, /Для Android/);
    assert.doesNotMatch(markup, /id="pwa-external-help" open/);
    nodes.get('pwa-browser').onclick();
    assert.equal(nodes.get('pwa-intro').hidden, true);
    nodes.get('pwa-back').onclick();
    assert.equal(nodes.get('pwa-intro').hidden, false);
    nodes.get('pwa-confirm-browser').onclick(); await done;
});
test('PWA: Telegram shows external-browser help instead of two instruction cards', async () => {
    const {c,nodes} = context(); c.navigator.userAgent = 'iPhone Telegram AppleWebKit';
    const done = c.showPWAGuide();
    const markup = nodes.get('pwa-guide').innerHTML;
    assert.match(markup, /id="pwa-external-help" open/);
    assert.match(markup, /Safari/);
    assert.doesNotMatch(markup, /class="pwa-instructions"/);
    nodes.get('pwa-confirm-browser').onclick(); await done;
});
test('PWA: browser consent lasts for this session and forced help still opens', async () => {
    const {c,nodes,session} = context(); session.set('mykep_browser_session','yes');
    await c.showPWAGuide(); assert.equal(nodes.has('pwa-guide'),false);
    const done = c.showPWAGuide(true); assert.ok(nodes.has('pwa-guide'));
    nodes.get('pwa-confirm-browser').onclick(); await done;
});
function groupContext() {
    const ctx=context(); const {c,nodes}=ctx;
    for (const id of ['ob-group-picker','ob-group-search','ob-group-status','ob-group-retry','ob-group-value','ob-group-options','ob-group-select']) {
        const node=c.document.createElement('div'); node.id=id; node.value=''; node.textContent=''; nodes.set(id,node);
    }
    c.window.location.reload=()=>{ c.reloaded=true; };
    vm.runInContext(fs.readFileSync(path.join(root,'static/js/settings.js'),'utf8'),c);
    c.fetchGroups=async()=>['АК-24-02','ПІ-24-02','ІС-23-01'];
    return ctx;
}
test('groups: only a selected list item can complete onboarding', async () => {
    const {c,nodes,local}=groupContext(); await c.initOnboardingGroups();
    nodes.get('ob-group-search').value='АК-24-02'; nodes.get('ob-group-search').oninput();
    c.window.obFinish(); assert.equal(local.has('mykep_onboarded'),false);
    const list=nodes.get('ob-group-options'); assert.equal(list.children.length,1);
    list.children[0].onclick();
    assert.equal(nodes.get('ob-group-picker').open,false);
    assert.equal(nodes.get('ob-group-value').textContent,'АК-24-02');
    c.window.obFinish(); assert.equal(local.get('mykep_group'),'АК-24-02');
    assert.equal(local.get('mykep_onboarded'),'true'); assert.equal(c.reloaded,true);
});
test('groups: empty search results do not create a custom group', async () => {
    const {c,nodes,local}=groupContext(); await c.initOnboardingGroups();
    nodes.get('ob-group-search').value='unknown'; nodes.get('ob-group-search').oninput();
    assert.match(nodes.get('ob-group-options').children[0].textContent,/Груп не знайдено/);
    c.window.obFinish(); assert.equal(local.has('mykep_group'),false);
});
test('groups: failed load can be retried', async () => {
    const {c,nodes}=groupContext(); c.fetchGroups=async()=>{throw Error('offline');};
    await c.initOnboardingGroups(); assert.equal(nodes.get('ob-group-retry').hidden,false);
    assert.equal(nodes.get('ob-group-search').disabled,true);
    c.fetchGroups=async()=>['ІС-23-01']; await nodes.get('ob-group-retry').onclick();
    assert.equal(nodes.get('ob-group-retry').hidden,true);
    assert.equal(nodes.get('ob-group-options').children[0].textContent,'ІС-23-01');
});
test('groups: empty upstream list is retryable, Escape closes picker', async () => {
    const {c,nodes}=groupContext(); c.fetchGroups=async()=>[];
    await c.initOnboardingGroups(); assert.equal(nodes.get('ob-group-retry').hidden,false);
    const picker=nodes.get('ob-group-picker'); picker.open=true; picker.onkeydown({key:'Escape'});
    assert.equal(picker.open,false);
});
test('groups: concurrent opening fetches once and storage failure does not finish', async () => {
    const {c,nodes}=groupContext(); let calls=0;
    c.fetchGroups=async()=>{calls++; return ['АК-24-02'];};
    await Promise.all([c.initOnboardingGroups(),c.initOnboardingGroups()]); assert.equal(calls,1);
    nodes.get('ob-group-options').children[0].onclick();
    c.localStorage.setItem=()=>{throw Error('storage denied');};
    c.window.obFinish(); assert.equal(c.reloaded,undefined);
    assert.match(nodes.get('ob-group-status').textContent,/заборонив збереження/);
});
test('layout source regression: one nav row, one bottom safe area, no duplicate picker', () => {
    const css=fs.readFileSync(path.join(root,'static/css/layout.css'),'utf8');
    const nav=css.match(/\.bottom-nav \{([^}]+)\}/)[1];
    assert.match(nav,/position: relative/); assert.doesNotMatch(nav,/position: fixed|translateX/);
    assert.match(nav,/max\(10px, env\(safe-area-inset-bottom/);
    const app=css.match(/\.app-container \{([^}]+)\}/)[1];
    assert.doesNotMatch(app,/safe-area-inset-bottom|90px/);
    const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
    assert.doesNotMatch(html,/ob-group-input|<select/);
    assert.match(html,/<details id="ob-group-picker"/);
});

for (const [label, ua, touch, native, media, expected] of [
    ['iPhone PWA navigator.standalone', 'iPhone AppleWebKit Safari', 5, true, false, true],
    ['iPhone PWA display-mode', 'iPhone AppleWebKit Safari', 5, false, true, true],
    ['iPad PWA desktop UA', 'Macintosh AppleWebKit Safari', 5, true, true, true],
    ['iPhone Safari tab unchanged', 'iPhone AppleWebKit Safari', 5, false, false, false],
    ['Android installed app unchanged', 'Linux Android Chrome Safari', 5, false, true, false],
    ['Android browser unchanged', 'Linux Android Chrome Safari', 5, false, false, false],
    ['Desktop installed app unchanged', 'Macintosh AppleWebKit Safari', 0, false, true, false],
]) test(`iOS nav fix scoping: ${label}`, () => {
    const {c} = context(); const classes = new Set();
    c.navigator.userAgent = ua; c.navigator.maxTouchPoints = touch; c.navigator.standalone = native;
    c.window.matchMedia = () => ({matches: media});
    c.document.documentElement = {classList: {
        toggle(name, enabled) { if(enabled) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
    }};
    vm.runInContext(fs.readFileSync(path.join(root,'static/js/display-mode.js'),'utf8'),c);
    assert.equal(classes.has('ios-standalone'),expected);
    assert.equal(typeof c.window.mykepViewportReport,'function');
    c.navigator.standalone = false; c.window.matchMedia = () => ({matches:false});
    c.updateMyKepDisplayMode(); assert.equal(classes.has('ios-standalone'),false);
});
test('iOS nav source: full viewport overrides dynamic viewport, app reserve matches nav', () => {
    const css=fs.readFileSync(path.join(root,'static/css/ios-standalone.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    assert.match(css,/height: 100vh;\s*height: 100lvh;/);
    assert.doesNotMatch(css,/100dvh|screen\.height|position: fixed/);
    assert.match(css,/padding-bottom: calc\(68px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    assert.match(css,/position: absolute;\s*bottom: 0;/);
    const selectors=[...css.matchAll(/([^{}]+)\{/g)].map(match=>match[1]);
    for (const group of selectors) for (const selector of group.split(',')) assert.ok(selector.trim().startsWith('html.ios-standalone '));
    const imports=fs.readFileSync(path.join(root,'static/style.css'),'utf8');
    assert.ok(imports.indexOf('ios-standalone.css')>imports.indexOf('responsive.css'));
    for (const page of ['index','settings','schedule']) {
        const html=fs.readFileSync(path.join(root,`static/${page}.html`),'utf8');
        assert.ok(html.indexOf('js/display-mode.js')<html.indexOf('rel="stylesheet"'));
    }
});
