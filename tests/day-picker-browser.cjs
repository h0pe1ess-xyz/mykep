'use strict';
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function touch(page, type, x, y = 220, cancelable = true) {
    await page.evaluate(({type,x,y,cancelable}) => {
        const event = new Event(type, {bubbles:true, cancelable});
        const point = {identifier:7, clientX:x, clientY:y};
        Object.defineProperties(event, {
            touches:{value:type === 'touchend' || type === 'touchcancel' ? [] : [point]},
            changedTouches:{value:[point]}
        });
        document.querySelector('.day-picker').dispatchEvent(event);
    }, {type,x,y,cancelable});
}
async function run() {
    const server = await startFixtureServer();
    try {
        for (const [engine, type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser = await type.launch();
            try {
                for (const ios of [15,18,26]) {
                    const context = await browser.newContext({viewport:{width:ios === 15 ? 414 : ios === 26 ? 440 : 390,height:ios === 15 ? 736 : 956},isMobile:true,hasTouch:true,serviceWorkers:'block',
                        userAgent:`Mozilla/5.0 (iPhone; CPU iPhone OS ${ios}_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1`});
                    const page = await context.newPage();
                    await page.clock.install({time:new Date('2026-11-03T10:00:00Z')});
                    await page.addInitScript(() => {
                        Object.defineProperty(navigator,'standalone',{value:true});
                        localStorage.setItem('mykep_onboarded','true');
                        localStorage.setItem('mykep_group','ПІ-24-02');
                        sessionStorage.setItem('mykep_browser_session','yes');
                    });
                    await page.goto(server.url + '/schedule.html');
                    await page.waitForFunction(() => Boolean(schedulePickerState?.controlled));
                    await page.evaluate(() => Tabs.show('schedule'));
                    await page.clock.runFor(400);
                    assert.equal(await page.locator('.day-picker').getAttribute('data-scroll-engine'),'controlled');
                    const items = page.locator('.day-item');
                    await items.nth(2).click(); await page.clock.runFor(200);
                    const start = await page.evaluate(() => schedulePickerState.controlled.offset);
                    await touch(page,'touchstart',240);
                    await page.clock.runFor(16);
                    await touch(page,'touchmove',220);
                    const during = await page.evaluate(() => schedulePickerState.controlled.offset);
                    assert.ok(Math.abs(during - start - 20) < 1, 'strip follows finger without native momentum');
                    await touch(page,'touchend',220);
                    await page.clock.runFor(200);
                    assert.equal(await items.nth(3).getAttribute('aria-pressed'),'true','short flick advances one day');
                    const settled = await page.evaluate(() => schedulePickerState.controlled.offset);
                    await page.clock.runFor(1000);
                    assert.equal(await page.evaluate(() => schedulePickerState.controlled.offset), settled,'no long fling after release');
                    await touch(page,'touchstart',240); await page.clock.runFor(16);
                    await touch(page,'touchmove',220); await page.clock.runFor(100);
                    await touch(page,'touchend',220); await page.clock.runFor(200);
                    assert.equal(await items.nth(3).getAttribute('aria-pressed'),'true','paused short drag returns to same day');
                    await touch(page,'touchstart',240); await page.clock.runFor(16);
                    await touch(page,'touchmove',120); await touch(page,'touchcancel',120);
                    await page.clock.runFor(200);
                    assert.equal(await page.evaluate(() => schedulePickerState.controlled.offset),settled,'cancel restores selected day');
                    await items.nth(3).press('Home');await page.clock.runFor(200);
                    await items.nth(0).press('End');await page.clock.runFor(200);
                    assert.equal(await items.last().getAttribute('aria-pressed'),'true');
                    await items.last().press('Home'); await page.clock.runFor(200);
                    await page.emulateMedia({reducedMotion:'reduce'});
                    await items.nth(1).click();
                    assert.equal(await items.nth(1).getAttribute('aria-pressed'),'true');
                    const centered = await items.nth(1).evaluate(item => {
                        const a=item.getBoundingClientRect(), b=document.querySelector('.day-picker').getBoundingClientRect();
                        return Math.abs(a.x+a.width/2-b.x-b.width/2);
                    });
                    assert.ok(centered<1,'selected day is centered');
                    console.log(`${engine} iOS ${ios}: finger tracking, bounded flick, pause, cancel, keyboard and reduced motion passed`);
                    await context.close();
                }
                const page = await browser.newPage();
                await page.goto(server.url);
                assert.equal(await page.evaluate(() => needsControlledDayPicker({userAgent:'Android'})),false);
                assert.equal(await page.evaluate(() => needsControlledDayPicker({userAgent:'Macintosh',maxTouchPoints:5})),true);
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
run().catch(error => { console.error(error); process.exitCode=1; });
