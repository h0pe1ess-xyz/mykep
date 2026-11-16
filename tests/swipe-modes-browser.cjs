'use strict';
// Browser mechanics only; actual phone smoothness is assessed in the dev PWA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, webkit} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function aligned(page, tab) {
    await page.waitForFunction(tab => {
        const active = document.querySelector(`[data-view="${tab}"]`);
        const views = document.querySelector('.views');
        return Tabs.current === tab && !active.inert &&
            Math.abs(active.getBoundingClientRect().left - views.getBoundingClientRect().left) < 1;
    }, tab);
}

async function main() {
    const server = await startFixtureServer();
    fs.mkdirSync('.mykep-local/swipe-modes', {recursive:true});
    try {
        for (const [engine, type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser = await type.launch(engine === 'chromium' && process.env.PLAYWRIGHT_BROWSER_CHANNEL
                ? {channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL} : {});
            try {
                for (const platform of ['Android','iPhone']) for (const savedMode of [null,'baseline']) {
                    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
                        serviceWorkers:'block',userAgent:platform === 'Android'
                            ? 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
                            : 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1'});
                    await context.addInitScript(savedMode => {
                        localStorage.setItem('mykep_onboarded','true');
                        sessionStorage.setItem('mykep_browser_session','yes');
                        if (savedMode) localStorage.setItem('mykep_swipe_test',savedMode);
                        localStorage.setItem('mykep_swipe_blur','off');
                        Object.defineProperty(navigator,'standalone',{value:true});
                    }, savedMode);
                    const page = await context.newPage(), errors = [];
                    page.on('pageerror',e=>errors.push(e.message));
                    await page.goto(server.url);
                    await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule);
                    await aligned(page,'dashboard');
                    assert.equal(await page.locator('html').getAttribute('data-swipe'),'native');
                    {
                        assert.equal(await page.locator('.views-track').evaluate(n=>getComputedStyle(n).scrollSnapType),'x mandatory');
                        assert.equal(await page.locator('.view').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).scrollSnapAlign==='start').length),3);
                    }
                    const historyLength = await page.evaluate(()=>history.length);
                    for (const viewport of [{width:320,height:568},{width:844,height:390},{width:390,height:844}]) {
                        await page.setViewportSize(viewport);
                        await aligned(page,'dashboard');
                        assert.ok(await page.locator('.views').evaluate(n=>n.clientHeight>100));
                    }
                    for (const tab of ['schedule','dashboard','settings']) {
                        await page.locator(`.bottom-nav [data-tab="${tab}"]`).click();
                        await aligned(page,tab);
                        assert.equal(await page.locator('.bottom-nav [aria-current="page"]').getAttribute('data-tab'),tab);
                    }
                    if(platform==='iPhone') {
                        assert.equal(await page.evaluate(()=>history.length),historyLength,'iOS PWA tab changes do not create snapshot history');
                        // Actual history traversal remains supported, without a trap.
                        await page.evaluate(()=>history.pushState(null,'','/'));
                        await page.goBack();await aligned(page,'settings');
                    } else {
                        await page.goBack();await aligned(page,'dashboard');
                        await page.goForward();await aligned(page,'settings');
                    }
                    await page.locator('#open-group-modal').click();
                    await page.locator('#group-modal[open]').waitFor();
                    await page.locator('#close-modal').click();
                    await page.locator('#group-modal[open]').waitFor({state:'hidden'});
                    await page.locator('.bottom-nav [data-tab="schedule"]').click();
                    await aligned(page,'schedule');
                    const selectedDay = await page.locator('.day-picker .day-item').last().getAttribute('data-day');
                    if (await page.locator('.day-picker').getAttribute('data-scroll-engine') === 'controlled') {
                        // Reveal the offscreen day through the picker's keyboard control.
                        await page.locator('.day-picker .day-item.active').press('End');
                    }
                    await page.locator('.day-picker .day-item').last().click();
                    await page.waitForFunction(day=>document.querySelector(`.day-item[data-day="${day}"]`).getAttribute('aria-pressed')==='true',selectedDay);
                    assert.equal(await page.evaluate(()=>Tabs.current),'schedule');
                    await page.locator('.bottom-nav [data-tab="dashboard"]').click();
                    await aligned(page,'dashboard');
                    // Browser-owned zoom must not activate the tab gesture controller.
                    const zoom=await page.evaluate(()=>{
                        const target=document.querySelector('.view-dashboard .app-title');
                        const before=Tabs.current, prevented=[];
                        for(const touches of [
                            [{identifier:1,clientX:150,clientY:100},{identifier:2,clientX:230,clientY:100}],
                            [{identifier:1,clientX:100,clientY:100},{identifier:2,clientX:280,clientY:100}]
                        ]) {
                            const event=new Event('touchstart',{bubbles:true,cancelable:true});
                            Object.defineProperty(event,'touches',{value:touches});
                            target.dispatchEvent(event);prevented.push(event.defaultPrevented);
                        }
                        const end=new Event('touchend',{bubbles:true,cancelable:true});
                        Object.defineProperties(end,{touches:{value:[]},changedTouches:{value:[]}});
                        target.dispatchEvent(end);
                        return {before,after:Tabs.current,prevented,touchAction:getComputedStyle(target).touchAction};
                    });
                    assert.equal(zoom.after,zoom.before);
                    assert.deepEqual(zoom.prevented,[false,false]);
                    assert.ok(zoom.touchAction.includes('pinch-zoom'));
                    if (engine === 'chromium') {
                        // CDP sends real browser input, unlike dispatching DOM TouchEvents.
                        const cdp = await context.newCDPSession(page);
                        await page.evaluate(()=>{
                            const track=document.querySelector('.views-track'),scroll=track.scrollTo;
                            window.originalNativeWrites=0;
                            track.scrollTo=function(...args){window.originalNativeWrites++;return scroll.apply(this,args);};
                        });
                        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:290,y:100}]});
                        // Cross half the viewport even after native touch slop;
                        // do not depend on machine-dependent fling velocity.
                        for (let step=1;step<=12;step++) {
                            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:290-step*20,y:100}]});
                            await page.evaluate(()=>new Promise(requestAnimationFrame));
                        }
                        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
                        await aligned(page,'settings');
                        {
                            await page.evaluate(async()=>{
                                const until=performance.now()+1000;
                                while(performance.now()<until) {
                                    if(Tabs.current!=='settings') throw new Error('Original native returned after arrival');
                                    await new Promise(requestAnimationFrame);
                                }
                            });
                            assert.equal(await page.evaluate(()=>window.originalNativeWrites),0,'original native must not drive or complete a swipe with JS scroll commands');
                        }
                    } else {
                        // Desktop WebKit cannot emulate a physical iPhone drag.
                        await page.locator('.views-track').evaluate(n=>n.scrollTo({left:n.clientWidth*2,behavior:'smooth'}));
                        await aligned(page,'settings');
                    }
                    // Wait for the existing 400 ms ghost-click protection to expire.
                    const finished = await page.evaluate(()=>performance.now());
                    await page.waitForFunction(t=>performance.now()-t>=400,finished);
                    await page.locator('#advanced-settings summary').click();
                    assert.equal(await page.locator('#swipe-version-form, #swipe-version').count(),0);
                    assert.deepEqual(await page.evaluate(()=>({mode:localStorage.getItem('mykep_swipe_test'),blur:localStorage.getItem('mykep_swipe_blur')})),{mode:null,blur:null});
                    await page.reload();await aligned(page,'settings');
                    assert.equal(await page.locator('html').getAttribute('data-swipe'),'native');
                    await page.locator('#advanced-settings summary').click();
                    await page.screenshot({path:`.mykep-local/swipe-modes/${engine}-${platform}-${savedMode || 'fresh'}.png`});
                    assert.deepEqual(errors,[]);
                    console.log(`${engine} ${platform} ${savedMode || 'fresh'}: native taps, history, modal, swipe and retired-preference migration passed`);
                    await context.close();
                }
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
