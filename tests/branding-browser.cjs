'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const {startFixtureServer}=require('./fixture-server.cjs');

async function run() {
    const server=await startFixtureServer();
    fs.mkdirSync('.mykep-local/screens',{recursive:true});
    try {
        for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch();
            try {
                for(const host of ['testkep.oddxq.dev','mykep.pp.ua','testkep.oddxq.dev.example.org']) {
                    const name=host==='testkep.oddxq.dev'?'TestKep':'MyKep';
                    const isTest=name==='TestKep';
                    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
                    // Exercise real location.hostname without contacting the public hosts.
                    await context.route('**/*',async route=>{
                        const url=new URL(route.request().url());
                        const response=await route.fetch({url:server.url+url.pathname+url.search});
                        await route.fulfill({response});
                    });
                    await context.addInitScript(()=>{
                        localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');
                        sessionStorage.setItem('mykep_browser_session','yes');
                    });
                    const page=await context.newPage(),errors=[];
                    page.on('pageerror',error=>errors.push(error.message));
                    await page.goto(`https://${host}/`);
                    await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule);
                    assert.equal(await page.locator('.view-dashboard .app-title').innerText(),name);
                    assert.match(await page.title(),new RegExp(name));
                    for(const meta of ['application-name','apple-mobile-web-app-title']) {
                        assert.equal(await page.locator(`meta[name="${meta}"]`).getAttribute('content'),name);
                    }
                    const identity=await page.evaluate(async()=>{
                        const manifest=await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
                        const icons=[];
                        for(const icon of manifest.icons) {
                            const image=new Image();image.src=icon.src;await image.decode();
                            icons.push({width:image.naturalWidth,height:image.naturalHeight});
                        }
                        return {manifest,icons,icon:document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'),
                            report:getCurrentSupportReport(),robots:document.querySelector('meta[name="robots"]').content};
                    });
                    assert.equal(identity.manifest.name,name);
                    assert.equal(identity.manifest.short_name,name);
                    assert.equal(identity.manifest.id,'/');
                    assert.equal(identity.manifest.start_url,'/');
                    assert.deepEqual(identity.icons.slice(0,2),[{width:192,height:192},{width:512,height:512}]);
                    assert.match(identity.icon,isTest?/test-192.png$/:/icon-192.png$/);
                    assert.match(identity.report,new RegExp(`^Повідомлення ${name}`));
                    if(isTest) assert.equal(identity.robots,'noindex, nofollow');
                    for(const tab of ['schedule','settings']) {
                        await page.locator(`.bottom-nav [data-tab="${tab}"]`).click();
                        await page.waitForFunction(tab=>Tabs.current===tab,tab);
                        assert.match(await page.title(),new RegExp(name));
                    }
                    assert.match(await page.locator('.view-settings .location-badge').innerText(),new RegExp(name));
                    await page.locator('#advanced-settings summary').click();
                    assert.equal(await page.locator('#swipe-version-form').count(),0);
                    await page.evaluate(()=>{showPWAGuide(true);});
                    assert.match(await page.locator('#pwa-title').innerText(),new RegExp(name));
                    assert.equal(await page.locator('.pwa-icon').getAttribute('src'),isTest?'/icons/test-192.png':'/icons/install-144.webp');
                    await page.screenshot({path:`.mykep-local/screens/branding-${engine}-${name}-${host}.png`});
                    await page.goto(`https://${host}/about.html`);
                    assert.match(await page.title(),new RegExp(name));
                    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),isTest?'/manifest-test.json':'/manifest.json');
                    assert.deepEqual(errors,[]);
                    await context.close();
                    console.log(`${engine} ${host}: name, title, manifest identity, PNG icons, support, install help and about passed`);
                }
            } finally {await browser.close();}
        }
    } finally {await server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
