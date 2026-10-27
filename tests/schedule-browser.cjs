const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {startFixtureServer,cycleFixture}=require('./fixture-server.cjs');

async function run() {
    const server=await startFixtureServer();
    try {
        for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch(engine==='chromium' && process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
            try {
                const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
                const page=await context.newPage(),errors=[];
                page.on('pageerror',error=>errors.push(error.message));
                await page.clock.install({time:new Date('2026-10-14T10:00:00Z')});
                await page.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_uid','preserved-test-uid');
                    localStorage.setItem('mykep_group','ПІ-24-02');localStorage.setItem('mykep_schedule_week','next');
                    sessionStorage.setItem('mykep_browser_session','yes');
                });
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>typeof schedulePageData!=='undefined' && schedulePageData);
                assert.equal(await page.locator('#schedule-week').inputValue(),'auto');
                assert.equal(await page.evaluate(()=>localStorage.getItem('mykep_schedule_week')),null);
                await page.selectOption('#schedule-week','next');
                await page.waitForFunction(()=>currentScheduleCalendar.monday==='2026-10-19');
                assert.equal(await page.locator('#schedule-week').inputValue(),'next');
                assert.equal(await page.evaluate(()=>currentScheduleCalendar.monday),'2026-10-19');
                assert.equal(await page.evaluate(()=>getScheduleWeekSelection()),'next');
                await page.evaluate(()=>{Tabs.show('settings');Tabs.show('schedule');});
                assert.equal(await page.locator('#schedule-week').inputValue(),'next');
                await page.reload();
                await page.waitForFunction(()=>typeof schedulePageData!=='undefined' && schedulePageData);
                assert.equal(await page.locator('#schedule-week').inputValue(),'auto');
                assert.equal(await page.evaluate(()=>storage.get('mykep_uid')),'preserved-test-uid');
                assert.equal(await page.evaluate(()=>storage.get('mykep_group')),'ПІ-24-02');
                await page.selectOption('#schedule-week','next');
                await page.waitForFunction(()=>currentScheduleCalendar.monday==='2026-10-19');
                await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
                await page.waitForFunction(()=>currentScheduleCalendar.monday==='2026-10-12');
                assert.equal(await page.locator('#schedule-week').inputValue(),'auto');
                await page.selectOption('#schedule-week','auto');
                await page.waitForFunction(()=>currentScheduleCalendar.monday==='2026-10-12' && scheduleRequests.size===0);
                // Keep requests pending at fetch, so response order is deterministic.
                await page.evaluate(()=>{
                    const original=fetch;
                    window.scheduleGates=[];
                    window.fetch=(url,...args)=>String(url).startsWith('/api/schedule?')
                        ? new Promise(resolve=>scheduleGates.push({url,resolve})) : original(url,...args);
                    window.savedCard=document.querySelector('.lesson-card');
                });
                async function pending() {await page.waitForFunction(()=>scheduleGates.length>0);}
                async function respond(cycle,checked='2026-10-14T14:00:00+03:00',status=200,index=0) {
                    await page.evaluate(({cycle,checked,status,index})=>{
                        const gate=scheduleGates.splice(index,1)[0];
                        gate.resolve(new Response(status===304?null:JSON.stringify({status:'success',cycle,meta:{updated_at:checked,stale:false}}),
                            {status,headers:{ETag:'"test"','X-Source-Checked-At':checked,'X-Source-Stale':'false'}}));
                    },{cycle,checked,status,index});
                }
                const pickerBefore=await page.locator('.day-picker').boundingBox();
                await page.clock.setSystemTime(new Date('2026-10-14T10:06:00Z'));
                await page.evaluate(()=>App.noteInteraction());
                await pending();
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                const changed=cycleFixture();
                for(const week of Object.values(changed)) for(const day of Object.values(week)) day[0].subject='Оновлений предмет';
                await respond(changed);
                await page.waitForFunction(()=>document.querySelector('.lesson-title').textContent==='Оновлений предмет');
                assert.match(await page.locator('#schedule-data-time').textContent(),/14:00/);
                assert.equal((await page.locator('.day-picker').boundingBox()).y,pickerBefore.y);
                // 304 and a new checked timestamp must preserve the actual cards.
                await page.evaluate(()=>{window.savedCard=document.querySelector('.lesson-card');App.load('schedule');});
                await pending();await respond(null,'2026-10-14T14:01:00+03:00',304);
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.equal(await page.evaluate(()=>savedCard===document.querySelector('.lesson-card')),true);
                assert.equal(await page.locator('.lesson-card').first().evaluate(n=>getComputedStyle(n).animationName),'none');
                // A 200 with edits only outside the visible day also preserves cards.
                const otherDayChange=structuredClone(changed);
                otherDayChange[1]['понеділок'][0].room='999';
                await page.evaluate(()=>{App.load('schedule');});await pending();await respond(otherDayChange);
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.equal(await page.evaluate(()=>savedCard===document.querySelector('.lesson-card')),true);
                // Server failure keeps the last good cards and reports stale data.
                await page.evaluate(()=>{App.load('schedule');});await pending();await respond(null,'2026-10-14T14:00:00+03:00',503);
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.match(await page.locator('#schedule-notice').textContent(),/Офлайн|застарілими/);
                assert.equal(await page.evaluate(()=>savedCard===document.querySelector('.lesson-card')),true);
                await page.evaluate(()=>window.dispatchEvent(new Event('online')));
                await pending();await respond(changed);
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                // An old week response cannot replace the current selection.
                await page.evaluate(()=>{App.load('schedule');});await pending();
                await page.selectOption('#schedule-week','4');
                await page.waitForFunction(()=>currentScheduleCalendar.cycle===4);
                await respond(changed);await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.equal(await page.evaluate(()=>currentScheduleCalendar.cycle),4);
                // An old group response cannot overwrite the new group's view/time.
                await page.evaluate(()=>{App.load('schedule');});await pending();
                await page.evaluate(()=>{storage.set('mykep_group','ЕК(11)-24-03');App.reload();});
                await page.waitForFunction(()=>scheduleGates.length===2);
                const other=cycleFixture();
                for(const week of Object.values(other)) for(const day of Object.values(week)) day[0].subject='Інша група';
                await respond(other,'2026-10-14T15:00:00+03:00',200,1);
                await page.waitForFunction(()=>scheduleShareContext.group==='ЕК(11)-24-03' && document.querySelector('.lesson-title').textContent==='Інша група');
                await respond(changed,'2026-10-14T12:00:00+03:00');
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.match(await page.locator('#schedule-data-time').textContent(),/15:00/);
                assert.equal(await page.locator('.lesson-title').first().textContent(),'Інша група');
                // Leaving the tab suppresses late DOM work; re-entry consumes cache.
                await page.evaluate(()=>{window.savedCard=document.querySelector('.lesson-card');App.load('schedule');Tabs.show('settings');});
                await pending();await respond(changed);
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.equal(await page.evaluate(()=>savedCard===document.querySelector('.lesson-card')),true);
                await page.evaluate(()=>Tabs.show('schedule'));
                await page.waitForFunction(()=>document.querySelector('.lesson-title').textContent==='Оновлений предмет');
                // Idle checks and day changes do not re-read/validate/materialize data.
                await page.evaluate(()=>{
                    window.cacheWork={parse:0,validate:0,materialize:0};
                    const parse=JSON.parse,validate=validCycle,materialize=materializeSchedule;
                    JSON.parse=(...args)=>{if(String(args[0]).includes('"entries"'))cacheWork.parse++;return parse(...args);};
                    validCycle=(...args)=>{cacheWork.validate++;return validate(...args);};
                    materializeSchedule=(...args)=>{cacheWork.materialize++;return materialize(...args);};
                    for(let i=0;i<20;i++)App.enter('schedule');
                });
                assert.deepEqual(await page.evaluate(()=>cacheWork),{parse:0,validate:0,materialize:0});
                const before=server.requests.filter(path=>path==='/api/schedule').length;
                await page.locator('.day-item[data-day="четвер"]').click();
                assert.equal(await page.evaluate(()=>scheduleGates.length),0);
                assert.equal(server.requests.filter(path=>path==='/api/schedule').length,before);
                await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
                await page.evaluate(()=>App.enter('schedule'));
                assert.match(await page.locator('#schedule-notice').textContent(),/Офлайн/);
                await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});
                await pending();await respond(changed);
                await page.waitForFunction(()=>scheduleRequests.size===0);
                assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                assert.equal(await page.evaluate(()=>storage.get('mykep_uid')),'preserved-test-uid');
                // Explicit next always points to the next calendar Monday.
                for(const [date,monday,option] of [['2026-10-17T16:00:00Z','2026-10-19','next'],['2026-10-18T10:00:00Z','2026-10-19','next'],['2026-10-19T10:00:00Z','2026-10-26','next']]) {
                    await page.clock.setSystemTime(new Date(date));
                    await page.evaluate(()=>{setScheduleWeekSelection('next');App.enter('schedule');});
                    await page.waitForFunction(day=>currentScheduleCalendar.monday===day,monday);
                    assert.equal(await page.locator('#schedule-week').inputValue(),option);
                    const labels=await page.locator('#schedule-week option').allTextContents();
                    assert.equal(new Set(labels).size,labels.length);
                    if(await page.evaluate(()=>scheduleGates.length)) {await respond(changed);await page.waitForFunction(()=>scheduleRequests.size===0);}
                }
                assert.deepEqual(errors,[]);
                await context.close();
                console.log(`${engine}: coherent data/time, stable 304 DOM, stale week/group/tab responses, idle cache, activity-only days, offline/online, legacy next passed`);
            } finally {await browser.close();}
        }
    } finally {await server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
