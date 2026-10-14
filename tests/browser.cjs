const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {startFixtureServer}=require('./fixture-server.cjs');
async function run() {
    const server=await startFixtureServer();
    fs.mkdirSync('.mykep-local/screens',{recursive:true});
    try {
        for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch(engine==='chromium' && process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
            try {
                const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
                const page=await context.newPage(),errors=[];
                page.on('pageerror',e=>errors.push(e.message));
                await page.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');localStorage.setItem('mykep_uid','synthetic-browser-test');sessionStorage.setItem('mykep_browser_session','yes');
                });
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>typeof schedulePageData!=='undefined' && schedulePageData);
                assert.match(await page.locator('#schedule-week-label').textContent(),/(Поточний|Наступний).*тиждень/);
                assert.equal(await page.locator('.schedule-context,#schedule-group,#subgroup-choices').count(),0);
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                assert.ok((await page.locator('#schedule-data-time').textContent()).includes('Джерело перевірено'));
                const navStyle=await page.locator('.bottom-nav .active').evaluate(n=>({filter:getComputedStyle(n).filter,shadow:getComputedStyle(n).boxShadow,color:getComputedStyle(n).backgroundColor}));
                assert.deepEqual(navStyle,{filter:'none',shadow:'none',color:'rgb(255, 85, 0)'});
                await page.selectOption('#schedule-week','3');
                await page.waitForFunction(()=>document.getElementById('schedule-week-label').textContent.includes('без календарної дати'));
                async function choosePrimary(group) {
                    await page.evaluate(()=>Tabs.show('settings'));
                    await page.click('#open-group-modal');
                    await page.locator('#modal-group-list button').filter({hasText:group}).click();
                    await page.evaluate(()=>Tabs.show('schedule'));
                    await page.waitForFunction(g=>scheduleShareContext?.group===g,group);
                }
                await choosePrimary('ЕК(11)-24-03');
                assert.equal(await page.evaluate(()=>localStorage.getItem('mykep_group')),'ЕК(11)-24-03');
                assert.match(await page.locator('#dynamic-schedule-list').textContent(),/1 група/);
                assert.match(await page.locator('#dynamic-schedule-list').textContent(),/2 група/);
                // Offline all four cycles and both previously visited groups.
                await context.setOffline(true);
                for (const week of ['1','2','3','4']) {
                    await page.selectOption('#schedule-week',week);
                    await page.waitForFunction(w=>document.getElementById('dynamic-schedule-list').textContent.includes(`цикл ${w}`),week);
                    await page.waitForFunction(()=>/Офлайн|зв’язку/.test(document.getElementById('schedule-notice').textContent));
                }
                await choosePrimary('ПІ-24-02');
                assert.equal(await page.evaluate(()=>localStorage.getItem('mykep_uid')),'synthetic-browser-test');
                await context.setOffline(false);
                await page.selectOption('#schedule-week','current');
                await page.waitForFunction(()=>!document.getElementById('schedule-week-label').textContent.includes('без календарної дати'));
                // Hold the fetch at the JS boundary: WebKit worker-owned requests
                // can bypass page.route(), even when the worker does not cache API.
                await page.evaluate(()=>{const e=cachedScheduleForKey(scheduleRequestContext().key); saveScheduleEntry({...e,savedAt:Date.now()-180000});});
                await page.waitForFunction(()=>scheduleRequests.size===0);
                const otherDay=await page.evaluate(()=>schedulePickerState.activeDay === 'четвер' ? 'вівторок' : 'четвер');
                await page.evaluate(()=>{
                    const original=fetch;
                    const gate=new Promise(resolve=>{window.releaseDayRequests=resolve;});
                    window.restoreDayFetch=()=>{window.fetch=original;};
                    window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/schedule?')) await gate; return original(...args);};
                });
                const dayGeometry=await page.locator('.day-picker').boundingBox();
                const eventsBefore=server.events.length;
                await page.locator(`.day-item[data-day="${otherDay}"]`).click();
                await page.waitForFunction(()=>scheduleRequests.size>0);
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                const switchedGeometry=await page.locator('.day-picker').boundingBox();
                assert.equal(switchedGeometry.y,dayGeometry.y);
                await page.evaluate(()=>{window.dayRerenders=0;new MutationObserver(()=>dayRerenders++).observe(document.getElementById('dynamic-schedule-list'),{childList:true});});
                await page.evaluate(()=>releaseDayRequests());
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.ok(server.events.length>eventsBefore);
                assert.equal(await page.evaluate(()=>dayRerenders),0);
                await page.evaluate(()=>restoreDayFetch());
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                // File-only sharing is mocked at the platform boundary; PNG is real.
                await page.evaluate(()=>{
                    window.testShares=[];
                    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
                    Object.defineProperty(navigator,'share',{configurable:true,value:async options=>{const f=options.files?.[0];window.testShares.push({keys:Object.keys(options),type:f?.type,size:f?.size,active:navigator.userActivation.isActive});}});
                });
                await page.click('#schedule-share');
                await page.waitForFunction(()=>window.testShares.length===1);
                const share=await page.evaluate(()=>testShares[0]);
                assert.deepEqual(share.keys,['files']);assert.equal(share.type,'image/png');assert.ok(share.size>1000);
                await page.screenshot({path:`.mykep-local/screens/${engine}-schedule.png`});
                // Group modal: focus, background inertness, keyboard height and scroll.
                await page.evaluate(()=>Tabs.show('settings'));
                await page.click('#open-group-modal');
                await page.waitForFunction(()=>document.querySelectorAll('#modal-group-list button').length>10);
                assert.equal(await page.evaluate(()=>document.getElementById('main-app').inert),true);
                await page.locator('#modal-search').focus();
                await page.setViewportSize({width:390,height:450});
                await page.fill('#modal-search','ТЕСТ');
                await page.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--viewport-height'))-innerHeight)<1);
                const geometry=await page.evaluate(()=>{
                    const modal=document.querySelector('#group-modal .modal-container').getBoundingClientRect();
                    const list=document.getElementById('modal-group-list');
                    list.scrollTop=list.scrollHeight;
                    return {bottom:modal.bottom,height:innerHeight,scroll:list.scrollTop,active:document.activeElement.id};
                });
                assert.ok(geometry.bottom<=geometry.height+1);assert.ok(geometry.scroll>0);assert.equal(geometry.active,'modal-search');
                await page.keyboard.press('Escape');
                assert.equal(await page.evaluate(()=>document.getElementById('main-app').inert),false);
                assert.equal(await page.evaluate(()=>document.activeElement.id),'open-group-modal');
                await page.setViewportSize({width:390,height:844});
                await page.evaluate(()=>Tabs.show('dashboard'));
                // A same-time class is not the next class.
                await page.evaluate(()=>{ getKyivNow=()=>new Date(2026,9,14,8,20); const e=cachedScheduleForKey(scheduleRequestContext().key); startDashboard(scheduleOnDate(e,getKyivNow(),'ПІ-24-02')); });
                assert.match(await page.locator('#current-subject').textContent(),/1 група.*2 група/);
                assert.equal(await page.locator('#next-time').textContent(),'09:30 - 10:50');
                await page.evaluate(()=>renderDashboard([]));
                assert.equal(await page.locator('.progress-section').isVisible(),false);
                assert.equal(await page.locator('#day-progress-text').textContent(),'0%');
                // Full application carousel, including uncancelable browser-owned moves.
                await page.evaluate(()=>{
                    Tabs.show('dashboard');
                    const target=document.querySelector('.view-dashboard main');
                    const point=(x)=>({identifier:1,clientX:x,clientY:300,target});
                    for (const [type,x,cancelable] of [['touchstart',280,true],['touchmove',80,false],['touchend',80,true]]) {
                        const event=new Event(type,{bubbles:true,cancelable});
                        Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point(x)]},changedTouches:{value:[point(x)]}});target.dispatchEvent(event);
                    }
                });
                assert.equal(await page.evaluate(()=>Tabs.current),'dashboard');
                await page.evaluate(()=>{
                    const target=document.querySelector('.view-dashboard main');
                    const point=x=>({identifier:2,clientX:x,clientY:300,target});
                    for (const [type,x] of [['touchstart',280],['touchmove',80],['touchend',80]]) {
                        const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point(x)]},changedTouches:{value:[point(x)]}});target.dispatchEvent(event);
                    }
                });
                assert.equal(await page.evaluate(()=>Tabs.current),'settings');
                await page.goBack();
                await page.waitForFunction(()=>Tabs.current==='dashboard');
                for (const width of [320,390,768,1440]) {
                    await page.setViewportSize({width,height:844});
                    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
                }
                assert.deepEqual(errors,[]);
                await page.goto(server.url+'/settings.html');
                const disclosure=page.locator('.data-notice');
                assert.equal(await disclosure.getAttribute('open'),null);
                assert.equal(await disclosure.locator('summary svg').count(),1);
                await disclosure.locator('summary').click();
                assert.equal(await disclosure.evaluate(n=>n.open),true);
                await page.waitForFunction(()=>getComputedStyle(document.querySelector('.data-notice summary svg')).transform==='matrix(0, 1, -1, 0, 0, 0)');
                await disclosure.locator('summary').focus();await page.keyboard.press('Enter');
                assert.equal(await disclosure.evaluate(n=>n.open),false);
                console.log(`${engine}: offline cycles/group settings, all subgroup variants, modal/keyboard, PNG file, simultaneous lessons, empty progress, swipe/history, widths passed`);
                // Reproduce an installed-iOS lvh shell exceeding its layout viewport.
                const iosContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/143.0 Mobile/15E148'});
                const iosPage=await iosContext.newPage();
                await iosPage.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');
                    Object.defineProperty(navigator,'standalone',{value:true});
                    window.testLayoutHeight=810;
                    const clientHeight=Object.getOwnPropertyDescriptor(Element.prototype,'clientHeight').get;
                    Object.defineProperty(Element.prototype,'clientHeight',{get(){return this===document.documentElement?window.testLayoutHeight:clientHeight.call(this);}});
                    Object.defineProperty(window,'visualViewport',{value:{height:710,offsetTop:0,scale:1,addEventListener(){}}});
                });
                await iosPage.goto(server.url);
                await iosPage.waitForFunction(()=>document.documentElement.style.getPropertyValue('--ios-layout-height')==='810px');
                const navBottom=()=>iosPage.locator('.bottom-nav').evaluate(n=>n.getBoundingClientRect().bottom);
                // Removing the new cap reproduces the 34px overflow.
                await iosPage.locator('.app-container').evaluate(n=>n.style.maxHeight='none');
                assert.ok(await navBottom()>810);
                await iosPage.locator('.app-container').evaluate(n=>n.style.removeProperty('max-height'));
                assert.ok(await navBottom()<=811);
                await iosPage.evaluate(()=>{window.testLayoutHeight=844;window.dispatchEvent(new Event('resize'));});
                assert.ok(Math.abs(await navBottom()-844)<=1); // Smaller visualViewport must not shrink Safari.
                await iosPage.evaluate(()=>{const input=document.createElement('input');document.body.append(input);input.focus();window.testLayoutHeight=450;window.dispatchEvent(new Event('resize'));});
                assert.ok(Math.abs(await navBottom()-844)<=1);
                await iosPage.evaluate(()=>{document.activeElement.blur();window.testLayoutHeight=700;window.dispatchEvent(new Event('pageshow'));});
                assert.ok(await navBottom()<=701);
                await iosContext.close();
                console.log(`${engine}: data disclosure triangle and simulated installed-iOS viewport/keyboard regression passed`);
                const calendarContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
                const calendarPage=await calendarContext.newPage();
                await calendarPage.clock.install({time:new Date('2026-10-17T20:59:50Z')});
                await calendarPage.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
                await calendarPage.goto(server.url);
                await calendarPage.waitForFunction(()=>currentGlobalSchedule?.length>0);
                await calendarPage.clock.runFor(20000);
                await calendarPage.waitForFunction(()=>currentGlobalSchedule?.length===0);
                assert.equal(await calendarPage.locator('.progress-section').isVisible(),false);
                await calendarPage.evaluate(()=>Tabs.show('schedule'));
                await calendarPage.waitForFunction(()=>schedulePageData);
                assert.match(await calendarPage.locator('#schedule-week-label').textContent(),/Наступний/);
                await calendarPage.clock.setSystemTime(new Date('2026-10-18T20:59:50Z'));
                await calendarPage.clock.runFor(20000);
                await calendarPage.waitForFunction(()=>document.getElementById('schedule-week-label').textContent.includes('Поточний'));
                assert.equal(await calendarPage.locator('.day-item[aria-current="date"]').getAttribute('data-day'),'понеділок');
                await calendarContext.close();
                console.log(`${engine}: Kyiv midnight and Sunday-to-Monday week change without restart passed`);
                if (engine==='chromium') {
                    await context.setOffline(false);
                    await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.ready).active));
                    await page.reload();
                    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
                    const old=await page.evaluate(async()=> (await caches.keys()).find(n=>n.startsWith('mykep-cache-')));
                    server.setBuild('test-upgrade');
                    server.edgeHTML(true);
                    await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
                    await page.waitForFunction(async()=> (await caches.keys()).includes('mykep-cache-vtest-upgrade'));
                    await page.waitForFunction(async old=>!(await caches.keys()).includes(old),old);
                    await context.setOffline(true);await page.reload();
                    assert.ok(await page.locator('#main-app').count());
                    await context.setOffline(false);
                    server.setBuild('broken-upgrade');server.breakAsset(true);
                    await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
                    await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.installing;});
                    assert.ok(await page.evaluate(async()=> (await caches.keys()).includes('mykep-cache-vtest-upgrade')));
                    console.log('chromium: real worker upgrade, old cache eviction, offline reload and failed-shell fallback passed');
                    server.setBuild('');server.breakAsset(false);server.edgeHTML(false);
                }
                await context.close();
            } finally {await browser.close();}
        }
    } finally {await server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
