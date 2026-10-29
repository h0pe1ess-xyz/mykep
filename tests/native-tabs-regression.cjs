'use strict';
const assert = require('node:assert/strict');
const {chromium,webkit} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function aligned(page,tab) {
    await page.waitForFunction(tab => Tabs.current === tab &&
        Math.abs(document.querySelector(`[data-view="${tab}"]`).getBoundingClientRect().left -
            document.querySelector('.views').getBoundingClientRect().left)<1,tab);
}
async function main() {
    const server=await startFixtureServer();
    try {
        for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch(engine==='chromium' && process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
            try {
                for(const platform of ['Android','iPhone']) {
                    const context=await browser.newContext({viewport:{width:430,height:932},hasTouch:true,isMobile:true,serviceWorkers:'block',
                        userAgent:platform==='iPhone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
                    await context.addInitScript(()=>{
                        localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_swipe_test','native');
                        sessionStorage.setItem('mykep_browser_session','yes');Object.defineProperty(navigator,'standalone',{value:true});
                    });
                    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
                    await page.goto(server.url+'/settings.html');
                    await aligned(page,'settings');
                    await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule && schedulePageData && document.querySelector('#dashboard-main').dataset.ready==='true');
                    assert.ok(await page.locator('#dynamic-schedule-list .lesson-card').count());
                    // A reload into settings must paint both neighbours from persistent cache,
                    // even if revalidation fails. No request is allowed to mask missing preload.
                    await page.route('**/api/schedule*',route=>route.abort());
                    await page.reload();await aligned(page,'settings');
                    assert.equal(await page.locator('#dashboard-main').getAttribute('data-ready'),'true');
                    assert.ok(await page.locator('#dynamic-schedule-list .lesson-card').count());
                    assert.doesNotMatch(await page.locator('#dashboard-main').textContent(),/Завантаження розкладу/);
                    // Deliberately cross two tabs in a single held gesture. The native
                    // boundary must constrain it to the adjacent tab before settlement.
                    await page.evaluate(()=>Tabs.show('schedule',{immediate:true}));await aligned(page,'schedule');
                    await page.evaluate(()=>{
                        const track=document.querySelector('.views-track');
                        const touch={identifier:7,clientX:390,clientY:180};
                        const e=new Event('touchstart',{bubbles:true,cancelable:true});
                        Object.defineProperties(e,{touches:{value:[touch]},changedTouches:{value:[touch]}});
                        track.dispatchEvent(e);track.scrollTo({left:track.clientWidth*2,behavior:'instant'});
                    });
                    await page.waitForFunction(()=>document.querySelector('.views-track').scrollLeft<=document.querySelector('.views-track').clientWidth+1);
                    assert.equal(await page.evaluate(()=>Tabs.current),'schedule','held gesture must not commit navigation');
                    await page.evaluate(()=>{
                        const e=new Event('touchend',{bubbles:true});Object.defineProperties(e,{touches:{value:[]},changedTouches:{value:[]}});
                        document.querySelector('.views-track').dispatchEvent(e);
                    });
                    await aligned(page,'dashboard');
                    await page.setViewportSize({width:932,height:430});await aligned(page,'dashboard');
                    await page.setViewportSize({width:430,height:932});await aligned(page,'dashboard');
                    if(platform==='iPhone') {
                        assert.equal(await page.locator('.swipe-edge-guard').count(),2);
                        assert.ok(await page.locator('.swipe-edge-left').evaluate(n=>{
                            const e=new Event('touchstart',{bubbles:true,cancelable:true});n.dispatchEvent(e);return e.defaultPrevented;
                        }));
                    } else assert.equal(await page.locator('.swipe-edge-guard').count(),0);
                    await page.screenshot({path:`.mykep-local/screens/${engine}-${platform}-native-cached.png`});
                    assert.deepEqual(errors,[]);await context.close();
                    console.log(`${engine} ${platform}: cached neighbours before swipe, failed revalidation, one-tab limit, held gesture, rotation and edge guard passed`);
                }
            } finally {await browser.close();}
        }
    } finally {await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
