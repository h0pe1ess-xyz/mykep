const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {startFixtureServer}=require('./fixture-server.cjs');
const bells=JSON.parse(fs.readFileSync('static/data/bells.json','utf8'));
async function run() {
    const server=await startFixtureServer();
    fs.mkdirSync('.mykep-local/screens',{recursive:true});
    try {
        for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch();
            try {
                const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
                await context.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');sessionStorage.setItem('mykep_browser_session','yes');});
                const page=await context.newPage(),errors=[];
                page.on('pageerror',error=>errors.push(error.message));
                await page.clock.install({time:new Date('2026-10-14T05:05:00Z')});
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>schedulePageData);
                await page.selectOption('#schedule-week','2');
                await page.locator('[data-day="четвер"]').click();
                const day=await page.evaluate(()=>schedulePickerState.activeDay);
                await page.locator('#schedule-lessons-tab').focus();
                await page.keyboard.press('ArrowRight');
                assert.equal(await page.locator('#schedule-bells-tab').evaluate(n=>n===document.activeElement),true);
                await page.waitForFunction(()=>!document.getElementById('bells-table').hidden);
                assert.equal(await page.locator('#bells-table .bell-row').count(),8);
                assert.deepEqual(await page.locator('.bells-shift-label > span:first-child').allTextContents(),['Перша зміна','Друга зміна']);
                for (const selector of ['.day-picker','.schedule-header-actions','#dynamic-schedule-list','#schedule-notice','#schedule-share-status']) assert.equal(await page.locator(selector).isVisible(),false);
                assert.equal(await page.locator('.bottom-nav a').count(),3);
                assert.equal(await page.locator('#bells-table [aria-current="time"] th').innerText(),'1 Зараз');
                const bellsHeader=await page.locator('.view-schedule .app-header').evaluate(n=>n.getBoundingClientRect().height);
                await page.keyboard.press('Home');
                assert.equal(await page.evaluate(()=>schedulePickerState.activeDay),day);
                assert.equal(await page.locator('.view-schedule .app-header').evaluate(n=>n.getBoundingClientRect().height),bellsHeader);
                await page.locator('#schedule-bells-tab').click();
                for (const first of ['60','80']) for (const second of ['60','80']) {
                    await page.evaluate(({first,second})=>{storage.set('mykep_duration1',first);storage.set('mykep_duration2',second);BellSchedule.render();},{first,second});
                    const expected=Array.from({length:8},(_,i)=>bells[i<4?first:second][i]);
                    await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('#bells-table .bell-row')].map(row=>[...row.querySelectorAll('.bell-start,.bell-end')].map(n=>n.textContent)))===JSON.stringify(expected),expected);
                    const times=await page.locator('#bells-table .bell-row').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('.bell-start,.bell-end')].map(n=>n.textContent)));
                    assert.deepEqual(times,expected);
                    assert.deepEqual(await page.locator('.bells-duration').allTextContents(),[`${first} хв`,`${second} хв`]);
                }
                await page.clock.setSystemTime(new Date('2026-10-14T06:20:00Z'));
                await page.evaluate(()=>BellSchedule.render());
                await page.waitForFunction(()=>!document.querySelector('#bells-table [aria-current]'));
                await page.clock.setSystemTime(new Date('2026-10-14T06:30:00Z'));
                await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
                await page.waitForFunction(()=>document.querySelector('#bells-table [aria-current] th').textContent.startsWith('2'));
                await page.evaluate(()=>{Tabs.show('settings');});
                await page.locator('input[name="duration1"][value="60"]').locator('..').click();
                await page.locator('#confirm-ok-btn').click();
                await page.evaluate(()=>Tabs.show('schedule'));
                await page.waitForFunction(()=>document.querySelector('#bells-table .bell-end').textContent==='09:00');
                await page.locator('#schedule-bells-tab').focus();
                await page.keyboard.press('Home');
                assert.equal(await page.locator('#dynamic-schedule-list').isVisible(),true);
                assert.equal(await page.locator('#schedule-week').inputValue(),'2');
                // A normal subview switch preserves the day; changing durations may rebuild it.
                const selected=await page.evaluate(()=>schedulePickerState.activeDay);
                await page.locator('#schedule-bells-tab').click();
                await page.locator('#schedule-lessons-tab').click();
                assert.equal(await page.evaluate(()=>schedulePickerState.activeDay),selected);
                for (const [width,height] of [[320,568],[390,844],[1280,900]]) {
                    await page.setViewportSize({width,height});
                    await page.locator('#schedule-bells-tab').click();
                    await page.screenshot({path:`.mykep-local/screens/${engine}-bells-${width}.png`});
                    assert.equal(await page.locator('.bells-panel').evaluate(n=>n.scrollWidth>n.clientWidth),false);
                    await page.locator('#bells-table .bell-row').last().scrollIntoViewIfNeeded();
                    const visible=await page.locator('#bells-table .bell-row').last().boundingBox();
                    assert.ok(visible.y+visible.height<=height);
                    await page.locator('#schedule-lessons-tab').click();
                    await page.screenshot({path:`.mykep-local/screens/${engine}-lessons-${width}.png`});
                }
                assert.deepEqual(errors,[]);
                await context.close();
                const failure=await browser.newContext({serviceWorkers:'block'});
                await failure.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
                const broken=await failure.newPage();
                let fail=true;
                await broken.route('**/data/bells.json*',route=>fail?route.fulfill({status:503,body:'unavailable'}):route.continue());
                await broken.goto(server.url+'/schedule.html');
                await broken.locator('#schedule-bells-tab').click();
                await broken.locator('#bells-retry').waitFor({state:'visible'});
                assert.equal(await broken.locator('#bells-table').isVisible(),false);
                fail=false;
                await broken.locator('#bells-retry').click();
                await broken.locator('#bells-table').waitFor({state:'visible'});
                assert.equal(await broken.locator('#bells-retry').isVisible(),false);
                await failure.close();
                const delayed=await browser.newContext({serviceWorkers:'block'});
                await delayed.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
                const late=await delayed.newPage();
                let release;
                const gate=new Promise(resolve=>release=resolve);
                await late.route('**/data/bells.json*',async route=>{await gate;await route.continue();});
                await late.goto(server.url+'/schedule.html');
                await late.locator('#schedule-bells-tab').click();
                await late.locator('#bells-status').filter({hasText:'Завантаження'}).waitFor({state:'visible'});
                await late.locator('#schedule-lessons-tab').click();
                release();
                await late.locator('#schedule-bells-tab').click();
                await late.locator('#bells-table').waitFor({state:'visible'});
                assert.equal(await late.locator('#bells-table .bell-row').count(),8);
                await delayed.close();
                if (engine==='chromium') {
                    const offline=await browser.newContext();
                    await offline.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
                    const cached=await offline.newPage();
                    await cached.goto(server.url+'/schedule.html');
                    await cached.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
                    await offline.setOffline(true);
                    await cached.reload();
                    await cached.locator('#schedule-bells-tab').click();
                    await cached.locator('#bells-table').waitFor({state:'visible'});
                    assert.equal(await cached.locator('#bells-table .bell-row').count(),8);
                    await offline.close();
                }
                console.log(`${engine}: 8 bells, all durations, keyboard, time boundaries, settings, preserved week/day, responsive scrolling, retry and delayed replies${engine==='chromium'?', offline cache':''} passed`);
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
