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
                await page.clock.install({time:new Date('2026-10-14T10:00:00Z')});
                page.on('pageerror',e=>errors.push(e.message));
                await page.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');localStorage.setItem('mykep_uid','synthetic-browser-test');localStorage.setItem('mykep_schedule_week','current');sessionStorage.setItem('mykep_browser_session','yes');
                });
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>typeof schedulePageData!=='undefined' && schedulePageData);
                const weekOptions=await page.locator('#schedule-week option').allTextContents();
                assert.equal(new Set(weekOptions).size,weekOptions.length);
                assert.equal(await page.locator('#schedule-week option[value=current]').count(),0);
                assert.equal(await page.locator('#schedule-week').inputValue(),'auto');
                assert.equal(await page.evaluate(()=>getScheduleWeekSelection()),'current');
                await page.locator('#schedule-week').focus();
                await page.locator('#schedule-week').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
                const focusRing=await page.locator('#schedule-week').evaluate(n=>({radius:getComputedStyle(n).borderRadius,shadow:getComputedStyle(n).boxShadow,outline:getComputedStyle(n).outlineStyle}));
                assert.equal(focusRing.radius,'10px');
                assert.equal(focusRing.outline,'solid');
                assert.equal(await page.locator('#schedule-week').evaluate(n=>getComputedStyle(n).outlineWidth),'2px');
                assert.equal(await page.locator('.week-control').evaluate(n=>getComputedStyle(n).boxShadow),'none');
                await page.screenshot({path:`.mykep-local/screens/${engine}-week-focus.png`});
                assert.match(await page.locator('#schedule-week-label').textContent(),/12–17 жовтня Тиждень 3/);
                assert.equal(await page.locator('.schedule-context,#schedule-group,#subgroup-choices').count(),0);
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                assert.ok((await page.locator('#schedule-data-time').textContent()).includes('Перевірено 14 жовтня о 10:00'));
                const navStyle=await page.locator('.bottom-nav .active').evaluate(n=>({filter:getComputedStyle(n).filter,shadow:getComputedStyle(n).boxShadow,color:getComputedStyle(n).backgroundColor}));
                assert.deepEqual(navStyle,{filter:'none',shadow:'none',color:'rgb(31, 23, 20)'});
                assert.deepEqual(await page.locator('.bottom-nav .nav-label').allTextContents(),['Розклад','Головна','Налаштування']);
                assert.equal(await page.locator('.bottom-nav [aria-current=page]').count(),1);
                assert.equal(await page.locator('.bottom-nav .active svg').evaluate(n=>getComputedStyle(n).color),'rgb(255, 85, 0)');
                assert.equal(await page.locator('.schedule-toolbar .week-control-label').innerText(),'Тиждень');
                const controls=await page.locator('.schedule-toolbar').evaluate(row=>{const tabs=row.querySelector('.schedule-mode-switch').getBoundingClientRect();const week=row.querySelector('.week-select').getBoundingClientRect();return {separate:tabs.right<=week.left,bottom:Math.abs(tabs.bottom-week.bottom),touch:week.height>=44};});
                assert.deepEqual(controls,{separate:true,bottom:0,touch:true});
                for (const week of ['1','2','3','4']) {
                    await page.selectOption('#schedule-week',week);
                    await page.waitForFunction(()=>document.getElementById('schedule-week-label').hidden);
                    assert.equal(await page.locator('#schedule-week-label').textContent(),'');
                }
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
                await page.selectOption('#schedule-week','auto');
                await page.waitForFunction(()=>!document.getElementById('schedule-week-label').hidden);
                assert.match(await page.locator('#schedule-week-label').textContent(),/жовтня Тиждень/);
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
                await page.waitForFunction(()=>schedulePickerState.activeDay===document.querySelector('.day-item.active').dataset.day);
                assert.equal(await page.evaluate(()=>scheduleRequests.size),0);
                await page.evaluate(()=>{App.load('schedule');});
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
                await page.waitForFunction(()=>!schedulePickerState.programmatic);
                // File-only sharing is mocked at the platform boundary; PNG is real.
                await page.evaluate(()=>{
                    window.testShares=[];
                    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
                    Object.defineProperty(navigator,'share',{configurable:true,value:async options=>{const f=options.files?.[0];window.testShares.push({keys:Object.keys(options),type:f?.type,size:f?.size,active:navigator.userActivation.isActive});}});
                });
                await page.click('#schedule-share');
                await page.waitForFunction(()=>window.testShares.length===1 || (scheduleExportFile && !scheduleShareInFlight)).catch(async error=>{
                    const state=await page.evaluate(()=>({status:document.getElementById('schedule-share-status').textContent,preparing:scheduleSharePreparing,inFlight:scheduleShareInFlight,tab:Tabs.current})).catch(()=>null);
                    throw new Error(`${error.message}\nShare state: ${JSON.stringify(state)}`);
                });
                if(!await page.evaluate(()=>window.testShares.length)) await page.click('#schedule-share');
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
                assert.equal(await page.locator('#next-time').textContent(),'09:10 - 10:10');
                assert.equal(await page.locator('#current-room').textContent(),'до кінця пари');
                assert.equal(await page.locator('.view-dashboard .status-section').isVisible(),false);
                assert.deepEqual(await page.locator('#current-lesson-room .room-cue-number').allTextContents(),['101','102']);
                assert.equal(await page.locator('#current-lesson-room .room-cue-number').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize)),22);
                assert.ok(await page.locator('.room-badge .room-cue-number').count()>0);
                await page.setViewportSize({width:320,height:568});
                await page.waitForFunction(()=>document.getElementById('dashboard-main').scrollHeight<=document.getElementById('dashboard-main').clientHeight+1);
                assert.equal(await page.locator('#current-lesson-room').isVisible(),true);
                await page.setViewportSize({width:390,height:844});
                await page.evaluate(()=>renderDashboard([{lesson:1,time:'08:00 - 09:00',subject:'Тест',teacher:'Викладач',room:''}]));
                assert.equal(await page.locator('#current-lesson-room .room-cue-missing').textContent(),'Не вказано');
                assert.equal(await page.locator('#current-room.is-room').count(),0);
                await page.evaluate(()=>renderDashboard([{lesson:1,time:'08:00 - 09:00',subject:'Тест',teacher:'Викладач',room:'<b>101</b>'}]));
                assert.equal(await page.locator('#current-lesson-room .room-cue-number').textContent(),'<b>101</b>');
                assert.equal(await page.locator('#current-lesson-room b').count(),0);
                await page.evaluate(()=>renderDashboard([]));
                assert.equal(await page.locator('#current-room.is-room').count(),0);
                assert.equal(await page.locator('#current-lesson-room').isVisible(),false);
                assert.equal(await page.locator('.view-dashboard .status-section').isVisible(),true);
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
                // A smaller clientHeight must not leave a gap below the installed app.
                const iosContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/143.0 Mobile/15E148'});
                const iosPage=await iosContext.newPage();
                await iosPage.route('**/css/app.css*',async route=>{
                    const response=await route.fetch();
                    await route.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-bottom, 0px)','var(--test-safe-bottom, 0px)').replaceAll('env(safe-area-inset-top, 0px)','var(--test-safe-top, 0px)')});
                });
                await iosPage.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');
                    Object.defineProperty(navigator,'standalone',{value:true});
                    window.testLayoutHeight=810;
                    const clientHeight=Object.getOwnPropertyDescriptor(Element.prototype,'clientHeight').get;
                    Object.defineProperty(Element.prototype,'clientHeight',{get(){return this===document.documentElement?window.testLayoutHeight:clientHeight.call(this);}});
                    Object.defineProperty(window,'visualViewport',{value:{height:710,offsetTop:0,scale:1,addEventListener(){}}});
                });
                await iosPage.goto(server.url);
                await iosPage.waitForFunction(()=>typeof Tabs!=='undefined' && document.documentElement.classList.contains('ios-standalone'));
                const diagnostics=await iosPage.evaluate(()=>{
                    const count=document.body.childElementCount;
                    const report=getCurrentSupportReport();
                    return {report,countBefore:count,countAfter:document.body.childElementCount,uid:localStorage.getItem('mykep_uid'),group:localStorage.getItem('mykep_group')};
                });
                const viewportDiagnostics=JSON.parse(diagnostics.report.split('Геометрія екрана: ')[1]);
                assert.equal(viewportDiagnostics.innerHeight,844);
                assert.equal(viewportDiagnostics.clientHeight,810);
                assert.equal(viewportDiagnostics.fixedBottom,844);
                assert.equal(viewportDiagnostics.buttons.length,3);
                assert.ok(Math.abs(viewportDiagnostics.nav.bottom-844)<0.1);
                assert.ok(viewportDiagnostics.screen.height>0);
                assert.equal(diagnostics.countBefore,diagnostics.countAfter);
                if(diagnostics.uid) assert.ok(!diagnostics.report.includes(diagnostics.uid));
                if(diagnostics.group) assert.ok(!diagnostics.report.includes(diagnostics.group));
                assert.ok(!diagnostics.report.includes(server.url));
                await iosPage.evaluate(()=>{
                    Tabs.show('settings');
                    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedViewportSupport=text;}}});
                });
                await iosPage.click('#support-copy');
                await iosPage.waitForFunction(()=>Boolean(window.copiedViewportSupport));
                assert.ok((await iosPage.evaluate(()=>window.copiedViewportSupport)).includes('Геометрія екрана: '));
                // Substitute only the environment input. Exercise production padding
                // with both normal home-indicator space and an inflated browser inset.
                await iosPage.addStyleTag({content:'html{--test-safe-bottom:34px;--test-safe-top:47px;}'});
                const checkEdges=async()=>{
                    await iosPage.waitForFunction(()=>document.querySelector('.views-track').getAnimations().every(a=>a.playState==='finished'));
                    const bounds=await iosPage.evaluate(()=>{
                        const app=document.querySelector('.app-container').getBoundingClientRect();
                        const nav=document.querySelector('.bottom-nav').getBoundingClientRect();
                        const last=document.querySelector(`[data-view="${Tabs.current}"] main`).getBoundingClientRect();
                        const buttonsBottom=Math.max(...Array.from(document.querySelectorAll('.bottom-nav a'),n=>n.getBoundingClientRect().bottom));
                        const inset=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--test-safe-bottom'));
                        return {appTop:app.top,appBottom:app.bottom,navBottom:nav.bottom,navTop:nav.top,buttonsBottom,contentBottom:last.bottom,viewport:innerHeight,expectedBottomSpace:Math.max(10,inset)};
                    });
                    assert.ok(Math.abs(bounds.appTop)<=1,JSON.stringify(bounds));
                    assert.ok(Math.abs(bounds.appBottom-bounds.viewport)<=1,JSON.stringify(bounds));
                    assert.ok(Math.abs(bounds.navBottom-bounds.viewport)<=1,JSON.stringify(bounds));
                    assert.ok(Math.abs(bounds.viewport-bounds.buttonsBottom-bounds.expectedBottomSpace)<=1,JSON.stringify(bounds));
                    assert.ok(bounds.contentBottom<=bounds.navTop+1,JSON.stringify(bounds));
                    if(!await iosPage.locator('#main-app').evaluate(n=>n.inert)) {
                        assert.ok(await iosPage.locator('.bottom-nav').evaluate(nav=>Array.from(nav.querySelectorAll('a')).every(n=>{
                            const r=n.getBoundingClientRect();
                            return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===n;
                        })),'all navbar buttons remain exposed to touch');
                    }
                };
                for(const tab of ['schedule','dashboard','settings']) {
                    await iosPage.evaluate(tab=>Tabs.show(tab),tab);
                    await checkEdges();
                }
                for(const inset of [0,21,34,83,110]) {
                    await iosPage.evaluate(inset=>document.documentElement.style.setProperty('--test-safe-bottom',`${inset}px`),inset);
                    await checkEdges();
                }
                await iosPage.evaluate(()=>document.documentElement.style.setProperty('--test-safe-bottom','34px'));
                // Both underreported and oversized layout measurements are ignored.
                for(const height of [878,844,700]) {
                    await iosPage.evaluate(height=>{window.testLayoutHeight=height;window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('pageshow'));},height);
                    await checkEdges();
                }
                await iosPage.click('#open-group-modal');
                await iosPage.locator('#modal-search').focus();
                await iosPage.evaluate(()=>{window.testLayoutHeight=450;window.dispatchEvent(new Event('resize'));});
                await checkEdges();
                assert.equal(await iosPage.locator('#modal-search').evaluate(n=>n===document.activeElement),true);
                await iosPage.keyboard.press('Escape');
                assert.match(await iosPage.evaluate(()=>getSupportDevice().browser),/Firefox/);
                for(const [width,height,top,bottom] of [[320,568,0,0],[375,667,0,0],[390,844,47,34],[440,956,62,34],[956,440,0,21]]) {
                    await iosPage.setViewportSize({width,height});
                    await iosPage.evaluate(({top,bottom})=>{document.documentElement.style.setProperty('--test-safe-top',`${top}px`);document.documentElement.style.setProperty('--test-safe-bottom',`${bottom}px`);},{top,bottom});
                    await checkEdges();
                }
                await iosPage.setViewportSize({width:390,height:844});
                await iosPage.evaluate(()=>{document.documentElement.style.setProperty('--test-safe-top','47px');document.documentElement.style.setProperty('--test-safe-bottom','34px');});
                await checkEdges();
                await iosPage.evaluate(()=>Tabs.show('schedule'));
                await iosPage.waitForFunction(()=>schedulePageData);
                await checkEdges();
                await iosPage.screenshot({path:`.mykep-local/screens/${engine}-ios-navbar.png`});
                await iosContext.close();
                console.log(`${engine}: data disclosure triangle and simulated installed-iOS viewport/keyboard regression passed`);
                // Replay the supplied iPhone report: physical/lvh 956, fixed/dvh 894.
                // Desktop engines need a CSS shim for that WebKit containing-block bug.
                const replayContext=await browser.newContext({viewport:{width:440,height:956},serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Version/27.0 Mobile Safari/605.1.15'});
                const replayPage=await replayContext.newPage();
                await replayPage.route('**/css/app.css*',async route=>{
                    const response=await route.fetch();
                    const css=(await response.text()).replaceAll('100dvh','894px').replaceAll('100svh','894px')
                        .replaceAll('env(safe-area-inset-top, 0px)','62px').replaceAll('env(safe-area-inset-bottom, 0px)','34px')
                        .replace(/position:\s*fixed;\s*inset:\s*0;/g,'position:fixed;inset:0 0 62px;')
                        .replace(/position:\s*fixed;\s*bottom:\s*0;/g,'position:fixed;bottom:62px;');
                    await route.fulfill({response,body:css+'\nhtml{height:894px;}[style*="position: fixed"][style*="bottom: 0"]{bottom:62px!important;}[style*="height: 100dvh"],[style*="height: 100svh"]{height:894px!important;}[style*="safe-area-inset-top"]{padding-top:62px!important;padding-bottom:34px!important;}'});
                });
                await replayPage.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');
                    Object.defineProperty(navigator,'standalone',{value:true});
                    window.replayViewport={width:440,height:894,offsetTop:0,pageTop:0,scale:1,addEventListener(){}};
                    Object.defineProperty(window,'visualViewport',{value:window.replayViewport});
                    Object.defineProperty(window,'innerHeight',{get:()=>window.replayViewport.height});
                    const clientHeight=Object.getOwnPropertyDescriptor(Element.prototype,'clientHeight').get;
                    Object.defineProperty(Element.prototype,'clientHeight',{get(){return this===document.documentElement?window.replayViewport.height:clientHeight.call(this);}});
                });
                await replayPage.goto(server.url+'/schedule.html');
                await replayPage.waitForFunction(()=>schedulePageData);
                const checkReplay=async()=>{
                    await replayPage.waitForFunction(()=>document.querySelector('.views-track').getAnimations().every(a=>a.playState==='finished'));
                    const report=await replayPage.evaluate(()=>window.mykepViewportReport());
                    assert.ok(Math.abs(report.units.lvh-956)<0.1);
                    assert.equal(report.units.dvh,894);
                    assert.deepEqual(report.safeArea,{top:'62px',bottom:'34px'});
                    assert.equal(report.fixedBottom,894);
                    assert.ok(Math.abs(report.app.bottom-956)<0.1,JSON.stringify(report));
                    assert.ok(Math.abs(report.nav.bottom-956)<0.1,JSON.stringify(report));
                    assert.ok(Math.abs(Math.max(...report.buttons.map(b=>b.bottom))-922)<0.1,JSON.stringify(report));
                    assert.ok(await replayPage.locator('.bottom-nav').evaluate(nav=>Array.from(nav.querySelectorAll('a')).every(n=>{
                        const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===n;
                    })));
                };
                for(const tab of ['schedule','dashboard','settings']) {
                    await replayPage.evaluate(tab=>Tabs.show(tab),tab);await checkReplay();
                }
                await replayPage.click('#open-group-modal');
                await replayPage.locator('#modal-search').focus();
                await replayPage.evaluate(()=>{window.replayViewport.height=450;window.dispatchEvent(new Event('resize'));});
                assert.ok(Math.abs(await replayPage.locator('.app-container').evaluate(n=>n.getBoundingClientRect().bottom)-956)<0.1);
                await replayPage.keyboard.press('Escape');
                await replayPage.evaluate(()=>{window.replayViewport.height=894;window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('pageshow'));Tabs.show('schedule');});
                await checkReplay();
                await replayPage.screenshot({path:`.mykep-local/screens/${engine}-iphone-440x956-replay.png`});
                await replayContext.close();
                console.log(`${engine}: supplied 440x956 / 894 fixed-viewport report replay passed`);
                // Firefox-installed PWA report: native status bar outside the web
                // layer, screen/lvh 926, drawable viewport 879, safe-area-top 0.
                const containedContext=await browser.newContext({viewport:{width:428,height:879},screen:{width:428,height:926},serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile Safari/605.1.15'});
                const containedPage=await containedContext.newPage();
                await containedPage.route('**/css/app.css*',async route=>{
                    const response=await route.fetch();
                    const css=(await response.text()).replaceAll('100lvh','926px').replaceAll('100vh','926px')
                        .replaceAll('env(safe-area-inset-top, 0px)','0px').replaceAll('env(safe-area-inset-bottom, 0px)','34px');
                    await route.fulfill({response,body:css+'\n[style*="height: 100lvh"],[style*="height: 100vh"]{height:926px!important;}[style*="safe-area-inset-top"]{padding-top:0!important;padding-bottom:34px!important;}'});
                });
                await containedPage.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');
                    Object.defineProperty(navigator,'standalone',{value:true});
                    window.containedViewport={width:428,height:879,offsetTop:0,pageTop:0,scale:1,addEventListener(){}};
                    Object.defineProperty(window,'visualViewport',{value:window.containedViewport});
                });
                await containedPage.goto(server.url);
                await containedPage.waitForFunction(()=>currentGlobalSchedule);
                const checkContained=async()=>{
                    await containedPage.waitForFunction(()=>document.querySelector('.views-track').getAnimations().every(a=>a.playState==='finished'));
                    const report=await containedPage.evaluate(()=>window.mykepViewportReport());
                    assert.equal(report.screen.height,926);
                    assert.ok(Math.abs(report.units.lvh-926)<0.1);
                    assert.ok(Math.abs(report.units.svh-879)<0.1);
                    assert.deepEqual(report.safeArea,{top:'0px',bottom:'34px'});
                    for(const key of ['root','body','app','nav']) assert.ok(Math.abs(report[key].bottom-879)<0.1,JSON.stringify(report));
                    assert.ok(Math.abs(Math.max(...report.buttons.map(b=>b.bottom))-845)<0.1,JSON.stringify(report));
                    assert.ok(await containedPage.locator('.bottom-nav').evaluate(nav=>Array.from(nav.querySelectorAll('a')).every(n=>{
                        const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===n;
                    })));
                };
                for(const tab of ['dashboard','schedule','settings']) {
                    await containedPage.evaluate(tab=>Tabs.show(tab),tab);await checkContained();
                }
                await containedPage.click('#open-group-modal');
                await containedPage.locator('#modal-search').focus();
                await containedPage.evaluate(()=>{window.containedViewport.height=450;window.dispatchEvent(new Event('resize'));});
                assert.ok(Math.abs(await containedPage.locator('.app-container').evaluate(n=>n.getBoundingClientRect().bottom)-879)<0.1);
                await containedPage.keyboard.press('Escape');
                await containedPage.evaluate(()=>{window.containedViewport.height=879;window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('pageshow'));Tabs.show('dashboard');});
                await checkContained();
                await containedPage.screenshot({path:`.mykep-local/screens/${engine}-iphone-contained-428x879.png`});
                await containedContext.close();
                console.log(`${engine}: supplied Firefox-installed 428x879 / lvh 926 report replay passed`);
                const calendarContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
                const calendarPage=await calendarContext.newPage();
                await calendarPage.clock.install({time:new Date('2026-10-17T20:59:50Z')});
                await calendarPage.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
                await calendarPage.goto(server.url);
                await calendarPage.waitForFunction(()=>currentGlobalSchedule?.length>0);
                await calendarPage.clock.runFor(20000);
                await calendarPage.waitForFunction(()=>currentGlobalSchedule?.length===0);
                assert.equal(await calendarPage.locator('.progress-section').isVisible(),false);
                assert.equal(await calendarPage.locator('#dashboard-status-title').textContent(),'Найближчі пари');
                assert.match(await calendarPage.locator('#status-text').innerText(),/Понеділок, 19 жовтня\n08:00–17:20/);
                await calendarPage.evaluate(()=>tickDashboard(true));
                assert.equal(await calendarPage.locator('#status-text .next-day-time').count(),1);
                await calendarPage.evaluate(()=>Tabs.show('schedule'));
                await calendarPage.waitForFunction(()=>schedulePageData);
                assert.equal(await calendarPage.locator('#schedule-week-label').textContent(),'19–24 жовтня Тиждень 4');
                assert.equal(await calendarPage.locator('#schedule-week option[value=auto]').textContent(),'Наступний');
                assert.equal(await calendarPage.locator('#schedule-week option[value=current]').textContent(),'Цей тиждень');
                await calendarPage.selectOption('#schedule-week','current');
                await calendarPage.waitForFunction(()=>currentScheduleCalendar?.label==='Поточний тиждень');
                assert.equal(await calendarPage.locator('#schedule-week option[value=auto]').textContent(),'Наступний');
                const sundayOptions=await calendarPage.locator('#schedule-week option').allTextContents();
                assert.equal(new Set(sundayOptions).size,sundayOptions.length);
                await calendarPage.clock.setSystemTime(new Date('2026-10-18T20:59:50Z'));
                await calendarPage.clock.runFor(20000);
                await calendarPage.waitForFunction(()=>currentScheduleCalendar?.monday==='2026-10-19');
                assert.equal(await calendarPage.locator('.day-item[aria-current="date"]').getAttribute('data-day'),'понеділок');
                assert.equal(await calendarPage.locator('#schedule-week option[value=current]').count(),0);
                assert.equal(await calendarPage.locator('#schedule-week').inputValue(),'auto');
                await calendarPage.evaluate(()=>Tabs.show('dashboard'));
                await calendarPage.waitForFunction(()=>document.getElementById('dashboard-status-title').textContent==='Розклад на сьогодні');
                assert.equal(await calendarPage.locator('#status-text .next-day-time').count(),0);
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
                    await page.locator('#main-app').waitFor({state:'attached'});
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
