'use strict';
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function touch(page, type, x, y = 220, cancelable = true, identifier = 7, extraTouch = false) {
    return page.evaluate(({type,x,y,cancelable,identifier,extraTouch}) => {
        const event = new Event(type, {bubbles:true, cancelable});
        const point = {identifier, clientX:x, clientY:y};
        Object.defineProperties(event, {
            touches:{value:type === 'touchend' || type === 'touchcancel' ? [] : extraTouch ? [point, {...point,identifier:8}] : [point]},
            changedTouches:{value:[point]}
        });
        return document.querySelector('.day-picker').dispatchEvent(event);
    }, {type,x,y,cancelable,identifier,extraTouch});
}
async function assertCentered(page, message) {
    const error = await page.locator('.day-item.active').evaluate(item => {
        const a = item.getBoundingClientRect(), b = document.querySelector('.day-picker').getBoundingClientRect();
        return a.x + a.width / 2 - b.x - b.width / 2;
    });
    assert.ok(Math.abs(error) < 1, `${message}: center error ${error}px`);
}

async function finishLabelTransitions(page) {
    await page.evaluate(() => document.getAnimations().filter(animation =>
        animation.transitionProperty === 'font-weight').forEach(animation => animation.finish()));
}
async function run() {
    const server = await startFixtureServer();
    try {
        for (const [engine, type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser = await type.launch();
            try {
                for (const profile of [15,18,26,'Android 360','Android 393','Android 440']) {
                    const android = typeof profile === 'string';
                    const width = android ? Number(profile.split(' ')[1]) : profile === 15 ? 414 : profile === 26 ? 440 : 390;
                    const context = await browser.newContext({viewport:{width,height:profile === 15 ? 736 : 956},isMobile:true,hasTouch:true,serviceWorkers:'block',
                        userAgent:android ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' : `Mozilla/5.0 (iPhone; CPU iPhone OS ${profile}_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1`});
                    const page = await context.newPage();
                    await page.clock.install({time:new Date('2026-11-03T10:00:00Z')});
                    await page.clock.pauseAt(new Date('2026-11-03T10:00:01Z'));
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
                    // Exercise fallback-font metrics and finish CSS transitions independently
                    // of the mocked JS clock, as a real compositor does between frames.
                    const fallbackFont = await page.addStyleTag({content:'.day-item, .day-item * {font-family: Arial, sans-serif}'});
                    await items.nth(1).evaluate(item => item.click());
                    await finishLabelTransitions(page);
                    await page.clock.runFor(200);
                    await items.nth(2).evaluate(item => {
                        item.click();
                        document.getAnimations().filter(animation => animation.transitionProperty === 'font-weight')
                            .forEach(animation => { animation.pause(); animation.currentTime = 0; });
                    });
                    await page.clock.runFor(200);
                    await finishLabelTransitions(page);
                    await assertCentered(page, 'centering survives the selected label font change');
                    await fallbackFont.evaluate(style => style.remove());
                    await items.nth(2).click(); await page.clock.runFor(200);
                    await items.nth(3).evaluate(item => item.click());
                    await page.clock.runFor(48);
                    const interrupted = await page.evaluate(() => schedulePickerState.controlled.offset);
                    await touch(page, 'touchstart', 240);
                    await page.clock.runFor(200);
                    assert.equal(await page.evaluate(() => schedulePickerState.controlled.offset), interrupted, 'touch holds interrupted animation');
                    await touch(page, 'touchend', 240);
                    await page.clock.runFor(200);
                    await assertCentered(page, 'release without a drag resumes centering');
                    await items.nth(2).click(); await page.clock.runFor(200);
                    await page.locator('.day-picker').evaluate(picker => picker.dispatchEvent(new WheelEvent('wheel', {deltaX:20, bubbles:true, cancelable:true})));
                    await page.clock.runFor(140);
                    await items.nth(2).press('End');
                    await page.clock.runFor(200);
                    assert.equal(await items.last().getAttribute('aria-pressed'), 'true', 'pending wheel settle cannot replace keyboard selection');
                    await assertCentered(page, 'keyboard interrupts wheel settling');
                    await items.last().press('Home'); await page.clock.runFor(200);
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
                    await assertCentered(page, 'cancel restores visual centering');
                    for (const ending of ['browser-owned', 'multitouch', 'unrelated end', 'blur', 'pageshow']) {
                        await touch(page, 'touchstart', 240);
                        await page.clock.runFor(16);
                        await touch(page, 'touchmove', 200);
                        if (ending === 'browser-owned') await touch(page, 'touchmove', 180, 220, false);
                        else if (ending === 'multitouch') await touch(page, 'touchmove', 180, 220, true, 7, true);
                        else if (ending === 'unrelated end') await touch(page, 'touchend', 200, 220, true, 8);
                        else await page.evaluate(type => window.dispatchEvent(new Event(type)), ending);
                        await touch(page, 'touchend', 180);
                        await page.clock.runFor(200);
                        assert.equal(await items.nth(3).getAttribute('aria-pressed'), 'true', `${ending} preserves selection`);
                        assert.equal(await page.evaluate(() => schedulePickerState.controlled.offset), settled, `${ending} restores offset`);
                    }
                    await items.nth(4).evaluate(item => item.click());
                    await page.clock.runFor(48);
                    await touch(page, 'touchstart', 240);
                    assert.equal(await touch(page, 'touchmove', 241, 280), true, 'vertical gesture remains browser-owned');
                    await touch(page, 'touchend', 241, 280);
                    await page.clock.runFor(200);
                    await assertCentered(page, 'vertical gesture resumes interrupted centering');
                    // Chain gestures before the previous 180 ms settle can finish.
                    for (const direction of [1,1,1,1,1,1,-1,-1,-1,-1,-1,-1]) {
                        await touch(page, 'touchstart', 240);
                        await page.clock.runFor(16);
                        await touch(page, 'touchmove', 240 - direction * 20);
                        const nearest = await page.evaluate(() => {
                            const picker = document.querySelector('.day-picker');
                            const middle = schedulePickerState.controlled.offset + picker.clientWidth / 2;
                            const items = [...picker.querySelectorAll('.day-item')];
                            return items.reduce((best, item, i) => Math.abs(item.offsetLeft + item.clientWidth / 2 - middle) <
                                Math.abs(items[best].offsetLeft + items[best].clientWidth / 2 - middle) ? i : best, 0);
                        });
                        await touch(page, 'touchend', 240 - direction * 20);
                        const selected = await page.evaluate(() => [...document.querySelectorAll('.day-item')].findIndex(item => item.classList.contains('active')));
                        assert.ok(Math.abs(selected - nearest) <= 1, 'rapid flick adds at most one day');
                        await page.clock.runFor(32);
                    }
                    await page.clock.runFor(200);
                    await assertCentered(page, 'rapid alternating flicks finish centered');
                    const rapidOffset = await page.evaluate(() => schedulePickerState.controlled.offset);
                    await page.clock.runFor(1000);
                    assert.equal(await page.evaluate(() => schedulePickerState.controlled.offset), rapidOffset, 'rapid gestures leave no stale animation');
                    for (const [x, index] of [[-10000, 5], [10000, 0]]) {
                        await touch(page, 'touchstart', 240);
                        await page.clock.runFor(16);
                        await touch(page, 'touchmove', x);
                        await touch(page, 'touchend', x);
                        await page.clock.runFor(200);
                        assert.equal(await items.nth(index).getAttribute('aria-pressed'), 'true', 'drag clamps to the end day');
                        await assertCentered(page, 'end day remains reachable and centered');
                        assert.equal(await page.locator('.day-picker').evaluate(picker => picker.scrollLeft), 0, 'no competing native scroll');
                    }
                    await items.nth(3).press('Home');await page.clock.runFor(200);
                    await items.nth(0).press('End');await page.clock.runFor(200);
                    assert.equal(await items.last().getAttribute('aria-pressed'),'true');
                    await items.last().press('Home'); await page.clock.runFor(200);
                    await items.nth(0).press('ArrowLeft'); await page.clock.runFor(200);
                    assert.equal(await items.nth(0).getAttribute('aria-pressed'), 'true', 'left arrow clamps at first day');
                    await items.nth(0).press('ArrowRight'); await page.clock.runFor(200);
                    assert.equal(await items.nth(1).evaluate(item => item === document.activeElement), true, 'arrow key moves focus');
                    await items.nth(1).press('End'); await page.clock.runFor(200);
                    await items.last().press('ArrowRight'); await page.clock.runFor(200);
                    assert.equal(await items.last().getAttribute('aria-pressed'), 'true', 'right arrow clamps at last day');
                    await items.last().press('Home'); await page.clock.runFor(200);
                    await page.emulateMedia({reducedMotion:'reduce'});
                    await items.nth(1).click();
                    assert.equal(await items.nth(1).getAttribute('aria-pressed'),'true');
                    const centered = await items.nth(1).evaluate(item => {
                        const a=item.getBoundingClientRect(), b=document.querySelector('.day-picker').getBoundingClientRect();
                        return Math.abs(a.x+a.width/2-b.x-b.width/2);
                    });
                    assert.ok(centered<1,'selected day is centered');
                    await touch(page, 'touchstart', 240); await page.clock.runFor(16);
                    await touch(page, 'touchmove', 220); await touch(page, 'touchend', 220);
                    assert.equal(await items.nth(2).getAttribute('aria-pressed'), 'true', 'reduced motion preserves bounded flick selection');
                    await assertCentered(page, 'reduced motion settles immediately');
                    const reducedOffset = await page.evaluate(() => schedulePickerState.controlled.offset);
                    await page.clock.runFor(200);
                    assert.equal(await page.evaluate(() => schedulePickerState.controlled.offset), reducedOffset, 'reduced motion queues no settling animation');
                    await page.emulateMedia({reducedMotion:'no-preference'});
                    await page.locator('.day-picker').evaluate(picker => picker.dispatchEvent(new WheelEvent('wheel', {deltaX:20, bubbles:true, cancelable:true})));
                    await page.locator('.schedule-mode-switch button').nth(1).click();
                    await page.clock.runFor(200);
                    await page.locator('.schedule-mode-switch button').nth(0).click();
                    await page.clock.runFor(200);
                    assert.equal(await items.nth(2).getAttribute('aria-pressed'), 'true', 'hidden picker cannot commit a pending wheel selection');
                    await assertCentered(page, 'returning from bells restores selected day');
                    await touch(page, 'touchstart', 240); await page.clock.runFor(16);
                    await touch(page, 'touchmove', 180);
                    await page.setViewportSize({width:width - 80, height:956});
                    await page.waitForFunction(() => {
                        const picker = document.querySelector('.day-picker'), item = picker.querySelector('.active');
                        return Math.abs(schedulePickerState.controlled.offset - (item.offsetLeft + item.clientWidth / 2 - picker.clientWidth / 2)) < 1;
                    }, null, {polling:10});
                    await page.clock.runFor(200);
                    await touch(page, 'touchend', 180); await page.clock.runFor(200);
                    assert.equal(await items.nth(2).getAttribute('aria-pressed'), 'true', 'width change cancels the old gesture');
                    await assertCentered(page, 'resizing remeasures and recenters');
                    console.log(`${engine} ${android ? profile : 'iOS ' + profile}: font geometry, tracking, interrupted/rapid gestures, cancellation, bounds, keyboard and reduced motion passed`);
                    await context.close();
                }
                const page = await browser.newPage();
                await page.goto(server.url);
                assert.equal(await page.evaluate(() => needsControlledDayPicker({userAgent:'Android'})),true);
                assert.equal(await page.evaluate(() => needsControlledDayPicker({userAgent:'Macintosh',maxTouchPoints:5})),true);
                assert.equal(await page.evaluate(() => needsControlledDayPicker({userAgent:'Windows',maxTouchPoints:0})),false);
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
run().catch(error => { console.error(error); process.exitCode=1; });
