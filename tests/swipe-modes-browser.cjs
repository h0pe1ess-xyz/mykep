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
                for (const platform of ['Android','iPhone']) for (const mode of ['baseline','native','pointer']) {
                    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
                        serviceWorkers:'block',userAgent:platform === 'Android'
                            ? 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
                            : 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1'});
                    await context.addInitScript(mode => {
                        localStorage.setItem('mykep_onboarded','true');
                        sessionStorage.setItem('mykep_browser_session','yes');
                        if (!localStorage.getItem('mykep_swipe_test')) localStorage.setItem('mykep_swipe_test',mode);
                        Object.defineProperty(navigator,'standalone',{value:true});
                    }, mode);
                    const page = await context.newPage(), errors = [];
                    page.on('pageerror',e=>errors.push(e.message));
                    await page.goto(server.url);
                    await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule);
                    await aligned(page,'dashboard');
                    assert.equal(await page.locator('html').getAttribute('data-swipe'),mode);
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
                    if(platform==='iPhone' && mode!=='baseline') {
                        assert.equal(await page.evaluate(()=>history.length),historyLength,'iOS PWA tab changes do not create snapshot history');
                        // Actual history traversal remains supported, without a trap.
                        await page.evaluate(()=>history.pushState(null,'','/'));
                        await page.goBack();await aligned(page,'settings');
                    } else {
                        await page.goBack();await aligned(page,'dashboard');
                        await page.goForward();await aligned(page,'settings');
                    }
                    await page.locator('#open-group-modal').click();
                    await page.locator('#group-modal.active').waitFor();
                    await page.locator('#close-modal').click();
                    await page.locator('#group-modal.active').waitFor({state:'hidden'});
                    await page.locator('.bottom-nav [data-tab="schedule"]').click();
                    await aligned(page,'schedule');
                    const selectedDay = await page.locator('.day-picker .day-item').last().getAttribute('data-day');
                    await page.locator('.day-picker .day-item').last().click();
                    await page.waitForFunction(day=>document.querySelector(`.day-item[data-day="${day}"]`).getAttribute('aria-pressed')==='true',selectedDay);
                    assert.equal(await page.evaluate(()=>Tabs.current),'schedule');
                    await page.locator('.bottom-nav [data-tab="dashboard"]').click();
                    await aligned(page,'dashboard');
                    if (engine === 'chromium') {
                        // CDP sends real browser input, unlike dispatching DOM TouchEvents.
                        const cdp = await context.newCDPSession(page);
                        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:290,y:100}]});
                        // Cross half the viewport even after native touch slop;
                        // do not depend on machine-dependent fling velocity.
                        for (let step=1;step<=12;step++) {
                            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:290-step*20,y:100}]});
                            await page.evaluate(()=>new Promise(requestAnimationFrame));
                        }
                        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
                        await aligned(page,'settings');
                    } else if (mode === 'native') {
                        // Desktop WebKit cannot emulate a physical iPhone drag.
                        await page.locator('.views-track').evaluate(n=>n.scrollTo({left:n.clientWidth*2,behavior:'smooth'}));
                        await aligned(page,'settings');
                    } else if (mode === 'pointer') {
                        await page.mouse.move(290,100);
                        await page.mouse.down();
                        await page.mouse.move(90,100,{steps:8});
                        await page.mouse.up();
                        await aligned(page,'settings');
                    } else {
                        await page.evaluate(mode => {
                            const target=document.querySelector('.view-dashboard .app-title');
                            if (mode==='pointer') {
                                for(const [type,x] of [['pointerdown',290],['pointermove',90],['pointerup',90]])
                                    target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:7,pointerType:'touch',isPrimary:true,clientX:x,clientY:100}));
                            } else {
                                for(const [type,x] of [['touchstart',290],['touchmove',90],['touchend',90]]) {
                                    const touch={identifier:7,clientX:x,clientY:100};
                                    const e=new Event(type,{bubbles:true,cancelable:true});
                                    Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[touch]},changedTouches:{value:[touch]}});
                                    target.dispatchEvent(e);
                                }
                            }
                        },mode);
                        await aligned(page,'settings');
                    }
                    // Wait for the existing 400 ms ghost-click protection to expire.
                    const finished = await page.evaluate(()=>performance.now());
                    await page.waitForFunction(t=>performance.now()-t>=400,finished);
                    await page.locator('#swipe-test-panel summary').click();
                    await page.selectOption('#swipe-test-mode',mode==='native'?'pointer':'native');
                    await page.locator('#swipe-test-blur').uncheck();
                    await Promise.all([page.waitForEvent('load'),page.locator('#swipe-test-form button[type="submit"]').click()]);
                    await aligned(page,'settings');
                    assert.equal(await page.locator('html').getAttribute('data-swipe'),mode==='native'?'pointer':'native');
                    assert.equal(await page.locator('html').getAttribute('data-swipe-blur'),'off');
                    await page.locator('#swipe-test-panel summary').click();
                    await page.screenshot({path:`.mykep-local/swipe-modes/${engine}-${platform}-${mode}.png`});
                    assert.deepEqual(errors,[]);
                    console.log(`${engine} ${platform} ${mode}: taps, history, modal, swipe, persistent mode/blur passed`);
                    await context.close();
                }
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
