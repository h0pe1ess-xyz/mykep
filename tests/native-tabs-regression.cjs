'use strict';
const assert = require('node:assert/strict');
const {chromium,webkit} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function aligned(page,tab) {
    // WebKit can briefly match the old geometry before processing resize/snap.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.waitForFunction(tab => Tabs.current === tab &&
        Math.abs(document.querySelector(`[data-view="${tab}"]`).getBoundingClientRect().left -
            document.querySelector('.views').getBoundingClientRect().left)<1,tab);
}
async function remainsAligned(page,tab) {
    // The supplied phone video reaches its destination, then returns about
    // 600ms later. A single aligned frame must not count as a passing swipe.
    await page.evaluate(async tab=>{
        const until=performance.now()+1000;
        while(performance.now()<until) {
            const view=document.querySelector(`[data-view="${tab}"]`),viewport=document.querySelector('.views');
            if(Tabs.current!==tab || Math.abs(view.getBoundingClientRect().left-viewport.getBoundingClientRect().left)>viewport.clientWidth*.1)
                throw new Error(`Late swipe return: expected ${tab}, got ${Tabs.current}`);
            await new Promise(requestAnimationFrame);
        }
    },tab);
    await aligned(page,tab);
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
                    assert.equal(await page.locator('.views-track').evaluate(n=>getComputedStyle(n).scrollSnapType),'none',
                        'native panning and JS settling must not compete with CSS snapping');
                    await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule && schedulePageData && document.querySelector('#dashboard-main').dataset.ready==='true');
                    assert.ok(await page.locator('#dynamic-schedule-list .lesson-card').count());
                    // A reload into settings must paint both neighbours from persistent cache,
                    // even if revalidation fails. No request is allowed to mask missing preload.
                    await page.route('**/api/schedule*',route=>route.abort());
                    await page.reload();await aligned(page,'settings');
                    assert.equal(await page.locator('#dashboard-main').getAttribute('data-ready'),'true');
                    assert.ok(await page.locator('#dynamic-schedule-list .lesson-card').count());
                    assert.doesNotMatch(await page.locator('#dashboard-main').textContent(),/Завантаження розкладу/);
                    await page.emulateMedia({reducedMotion:'no-preference'});
                    for(const origin of [0,2]) {
                        const motion=await page.evaluate(async origin=>{
                            Tabs.show(['schedule','dashboard','settings'][origin],{immediate:true});
                            const track=document.querySelector('.views-track'),width=track.clientWidth;
                            function send(type,x) {
                                const point={identifier:12,clientX:x,clientY:450},event=new Event(type,{bubbles:true});
                                Object.defineProperties(event,{touches:{value:type==='touchstart'?[point]:[]},changedTouches:{value:[point]}});
                                track.dispatchEvent(event);
                            }
                            send('touchstart',200);
                            const start=(origin===0?.25:1.75)*width;
                            track.scrollTo({left:start,behavior:'instant'});
                            for(let frame=0;frame<4;frame++) await new Promise(requestAnimationFrame);
                            const held=track.scrollLeft;
                            send('touchend',origin===0?0:400);
                            const positions=[],until=performance.now()+800;
                            while(performance.now()<until) {
                                await new Promise(requestAnimationFrame);positions.push(track.scrollLeft);
                            }
                            const low=Math.min(start,width),high=Math.max(start,width);
                            return {held,start,intermediate:new Set(positions.filter(x=>x>low+1&&x<high-1).map(Math.round)).size};
                        },origin);
                        assert.ok(Math.abs(motion.held-motion.start)<1,'a held swipe must not jump to a snap point');
                        assert.ok(motion.intermediate>=2,'release must render intermediate positions instead of jumping instantly');
                        await aligned(page,'dashboard');
                    }
                    // Deliberately cross two tabs. While a finger is down, JS must
                    // not fight the browser's scroll position; constrain the final tab.
                    await page.evaluate(()=>Tabs.show('schedule',{immediate:true}));await aligned(page,'schedule');
                    await page.evaluate(async()=>{
                        const track=document.querySelector('.views-track');
                        window.testScrollWrites=0;
                        const scrollTo=track.scrollTo;
                        track.scrollTo=function(...args){window.testScrollWrites++;return scrollTo.apply(this,args);};
                        const touch={identifier:7,clientX:390,clientY:180};
                        const e=new Event('touchstart',{bubbles:true,cancelable:true});
                        Object.defineProperties(e,{touches:{value:[touch]},changedTouches:{value:[touch]}});
                        track.dispatchEvent(e);track.scrollTo({left:track.clientWidth*2,behavior:'instant'});
                        await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
                    });
                    assert.equal(await page.evaluate(()=>window.testScrollWrites),1,'scroll handler must not rewrite a held gesture');
                    assert.equal(await page.evaluate(()=>Tabs.current),'schedule','held gesture must not commit navigation');
                    await page.evaluate(()=>{
                        const e=new Event('touchend',{bubbles:true});Object.defineProperties(e,{touches:{value:[]},changedTouches:{value:[]}});
                        document.querySelector('.views-track').dispatchEvent(e);
                    });
                    await aligned(page,'dashboard');
                    // Reproduce an interrupted native snap leaving a fractional
                    // scroll offset. Previously settlement changed metadata only.
                    await page.evaluate(()=>{
                        Tabs.show('schedule',{immediate:true});
                        const track=document.querySelector('.views-track');
                        // Emulate the reported browser failure to finish snapping.
                        // A normal desktop browser would otherwise auto-correct it.
                        track.style.scrollSnapType='none';
                        const e=new Event('touchstart',{bubbles:true});
                        Object.defineProperty(e,'touches',{value:[{identifier:8,clientX:350,clientY:180}]});
                        track.dispatchEvent(e);
                        track.scrollTo({left:track.clientWidth*.42,behavior:'instant'});
                        const end=new Event('touchend',{bubbles:true});
                        Object.defineProperty(end,'touches',{value:[]});track.dispatchEvent(end);
                    });
                    await aligned(page,'schedule');
                    await page.evaluate(()=>{
                        const track=document.querySelector('.views-track');
                        for(let i=0;i<20;i++) {
                            const start=new Event('touchstart',{bubbles:true});
                            Object.defineProperty(start,'touches',{value:[{identifier:8,clientX:350,clientY:180}]});
                            track.dispatchEvent(start);
                            track.scrollTo({left:track.clientWidth*(i%2?.63:.37),behavior:'instant'});
                            const end=new Event('touchend',{bubbles:true});
                            Object.defineProperty(end,'touches',{value:[]});track.dispatchEvent(end);
                            // A new gesture arrives before either snap/settlement ends.
                        }
                    });
                    await aligned(page,'dashboard');
                    await page.locator('.views-track').evaluate(n=>n.style.scrollSnapType='');
                    await page.evaluate(()=>Tabs.show('dashboard',{immediate:true}));await aligned(page,'dashboard');
                    await page.setViewportSize({width:932,height:430});await aligned(page,'dashboard');
                    await page.setViewportSize({width:430,height:932});await aligned(page,'dashboard');
                    for(const [origin,partial,target] of [[2,1.7,0],[0,.3,2]]) {
                        await page.evaluate(({origin,partial,target})=>{
                            Tabs.show(['schedule','dashboard','settings'][origin],{immediate:true});
                            const track=document.querySelector('.views-track');track.style.scrollSnapType='none';
                            function send(type) {
                                const e=new Event(type,{bubbles:true});
                                Object.defineProperty(e,'touches',{value:type==='touchstart'?[{identifier:9,clientX:200,clientY:180}]:[]});
                                track.dispatchEvent(e);
                            }
                            send('touchstart');track.scrollTo({left:partial*track.clientWidth,behavior:'instant'});send('touchend');
                            send('touchstart');track.scrollTo({left:target*track.clientWidth,behavior:'instant'});send('touchend');
                        },{origin,partial,target});
                        await aligned(page,['schedule','dashboard','settings'][target]);
                        await page.locator('.views-track').evaluate(n=>n.style.scrollSnapType='');
                        await aligned(page,['schedule','dashboard','settings'][target]);
                    }
                    // The browser can snap to the middle even after two valid
                    // gestures. Test direction/intent without forcing the final
                    // endpoint, including non-swipes that must not add a step.
                    for(const [origin,dx,kind,target] of [
                        [2,150,'swipe',0],[0,-150,'swipe',2],[2,150,'retarget',0],
                        [2,150,'tap',1],[2,150,'vertical',1],
                        [2,150,'cancel',1],[2,150,'day-picker',1]
                    ]) {
                        await page.evaluate(({origin,dx,kind})=>{
                            Tabs.show(['schedule','dashboard','settings'][origin],{immediate:true});
                            const track=document.querySelector('.views-track');track.style.scrollSnapType='none';
                            function send(type,x,y=180,target=track) {
                                const e=new Event(type,{bubbles:true});
                                const point={identifier:10,clientX:x,clientY:y};
                                Object.defineProperties(e,{touches:{value:type==='touchstart'?[point]:[]},changedTouches:{value:[point]}});
                                target.dispatchEvent(e);
                            }
                            send('touchstart',200);track.scrollTo({left:(origin===2?1.7:.3)*track.clientWidth,behavior:'instant'});
                            send('touchend',200+dx);
                            const target=kind==='day-picker'?document.querySelector('.day-picker'):
                                kind==='retarget'?document.querySelector('.views'):track;
                            send('touchstart',200,180,target);
                            track.scrollTo({left:track.clientWidth,behavior:'instant'});
                            send(kind==='cancel'?'touchcancel':'touchend',kind==='tap'?204:200+dx,kind==='vertical'?480:180,target);
                            // Emulate the browser selecting its old middle snap.
                            track.scrollTo({left:track.clientWidth,behavior:'instant'});
                        },{origin,dx,kind});
                        await aligned(page,['schedule','dashboard','settings'][target]);
                        if(kind==='swipe') await remainsAligned(page,['schedule','dashboard','settings'][target]);
                        await page.locator('.views-track').evaluate(n=>n.style.scrollSnapType='');
                        await aligned(page,['schedule','dashboard','settings'][target]);
                    }
                    if(engine==='chromium') {
                        const cdp=await context.newCDPSession(page);
                        for(const [origin,directions,target] of [
                            ['settings',[1,1],'schedule'],['schedule',[-1,-1],'settings'],
                            ['settings',[1,-1],'settings']
                        ]) {
                            await page.evaluate(tab=>Tabs.show(tab,{immediate:true}),origin);await aligned(page,origin);
                            for(const direction of directions) {
                                const x=direction>0?90:330;
                                await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:180}]});
                                for(let step=1;step<=10;step++) {
                                    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+direction*24*step,y:180}]});
                                    await page.evaluate(()=>new Promise(requestAnimationFrame));
                                }
                                await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
                                // Immediately grab the still-settling native scroller again.
                            }
                            await aligned(page,target);
                            await remainsAligned(page,target);
                        }
                    }
                    await page.evaluate(()=>{
                        Tabs.show('settings',{immediate:true});
                        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedSwipeReport=JSON.parse(text);}}});
                    });
                    await aligned(page,'settings');
                    await page.locator('#swipe-test-panel summary').click();
                    await page.locator('#copy-swipe-diagnostics').click();
                    await page.waitForFunction(()=>document.getElementById('swipe-test-status').textContent==='Діагностику скопійовано');
                    const report=await page.evaluate(()=>window.copiedSwipeReport);
                    assert.equal(report.mode,'native');assert.equal(report.snap,'none');
                    assert.ok(report.events.length>0 && report.events.length<=120);
                    if(platform==='iPhone') {
                        assert.equal(await page.locator('.swipe-edge-guard').count(),2);
                        assert.ok(await page.locator('.swipe-edge-left').evaluate(n=>{
                            const e=new Event('touchstart',{bubbles:true,cancelable:true});n.dispatchEvent(e);return e.defaultPrevented;
                        }));
                    } else assert.equal(await page.locator('.swipe-edge-guard').count(),0);
                    await page.screenshot({path:`.mykep-local/screens/${engine}-${platform}-native-cached.png`});
                    assert.deepEqual(errors,[]);await context.close();
                    console.log(`${engine} ${platform}: cache, failed revalidation, idle-only correction, interrupted snaps, chained swipes, rotation and edge guard passed`);
                }
            } finally {await browser.close();}
        }
    } finally {await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
