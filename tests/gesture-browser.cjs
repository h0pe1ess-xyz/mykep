// Synthetic trajectories in real CSS engines, not physical-device touch latency.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {startFixtureServer}=require('./fixture-server.cjs');

async function run() {
    const baseline=process.argv.includes('--baseline');
    const server=await startFixtureServer(),results=[];
    try {
        for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch(engine==='chromium'&&process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
            try {
                const context=await browser.newContext({viewport:{width:440,height:956},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Version/27.0 Mobile Safari/605.1.15'});
                const page=await context.newPage();
                if(baseline)for(const name of ['boot','tabs','app','support'])await page.route(`**/js/${name}.js*`,route=>route.fulfill({contentType:'text/javascript',body:execFileSync('git',['show',`origin/main:static/js/${name}.js`],{encoding:'utf8'})}));
                if(baseline)await page.route('**/css/app.css*',route=>route.fulfill({contentType:'text/css',body:execFileSync('git',['show','origin/main:static/css/app.css'],{encoding:'utf8'})}));
                await page.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');
                    Object.defineProperty(navigator,'standalone',{value:true});
                });
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>typeof schedulePageData!=='undefined'&&schedulePageData);
                const cases=await page.evaluate(async()=>{
                    const track=document.querySelector('.views-track'),out=[];
                    const frame=()=>new Promise(requestAnimationFrame);
                    const x=()=>new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
                    const width=()=>document.getElementById('views').clientWidth;
                    let time=0,target;
                    function send(type,px,py=350,{cancelable=true,id=7,remaining=false,dt=20}={}) {
                        const point={identifier:id,clientX:px,clientY:py,target};
                        const event=new Event(type,{bubbles:true,cancelable});time+=dt;
                        Object.defineProperties(event,{timeStamp:{value:time},touches:{value:type==='touchend'||type==='touchcancel'?remaining?[point]:[]:[point]},changedTouches:{value:[point]}});
                        target.dispatchEvent(event);return event.defaultPrevented;
                    }
                    async function settle(tab='dashboard') {
                        Tabs.show(tab,{historyMode:'none'});
                        await Promise.all(track.getAnimations().map(a=>a.finished.catch(()=>{})));
                        await frame();target=document.querySelector(`[data-view="${tab}"] main`);
                    }
                    function close(actual,expected,message,tolerance=1) {if(Math.abs(actual-expected)>tolerance)throw Error(`${message}: ${actual} vs ${expected}`);}
                    async function check(name,fn) {
                        try {await settle();const detail=await fn();out.push({name,ok:true,...detail});}
                        catch(error){out.push({name,ok:false,error:error.message});}
                        finally {send('touchcancel',200);await settle();}
                    }
                    await check('ambiguous 11x10 then horizontal 140',async()=>{
                        const origin=x();send('touchstart',280);send('touchmove',269,360);await frame();
                        send('touchmove',140,360);await frame();close(x(),origin-140,'ambiguous start lost gesture');
                        send('touchend',140,360);if(Tabs.current!=='settings')throw Error('did not switch');
                    });
                    await check('slow fractional path, pause and reverse',async()=>{
                        const origin=x();send('touchstart',260);let maxError=0;
                        for(const dx of [-12,-12.7,-13.35,-14.05,-16.4,-19.8,-15.2,-12,-8,3,14]) {
                            send('touchmove',260+dx);await frame();maxError=Math.max(maxError,Math.abs(x()-origin-dx));
                        }
                        const paused=x();for(let i=0;i<4;i++)await frame();close(x(),paused,'stationary finger drifted');
                        if(maxError>1)throw Error(`path error ${maxError}`);send('touchend',274);return {maxError};
                    });
                    await check('interrupt animation at touchstart',async()=>{
                        await settle('schedule');Tabs.show('dashboard',{historyMode:'none'});await frame();await frame();
                        target=document.querySelector('[data-view="dashboard"] main');
                        const before=x();send('touchstart',280);const anchored=x();close(anchored,before,'touchstart jumped');
                        for(let i=0;i<3;i++)await frame();close(x(),anchored,'animation continued under finger');
                        send('touchmove',250);await frame();close(x(),anchored-30,'interrupted origin drift');send('touchend',250);
                    });
                    await check('release with a pending animation frame',async()=>{
                        send('touchstart',280);send('touchmove',240);await frame();const visible=x();
                        send('touchmove',130);send('touchend',130);close(x(),visible,'release jumped from last painted position');
                        await frame();const next=x();if(next>visible+1||next < -2*width()-1)throw Error('invalid settlement trajectory');
                    });
                    await check('touchcancel settles from visible position',async()=>{
                        send('touchstart',280);send('touchmove',190);await frame();const before=x();send('touchcancel',190);
                        close(x(),before,'cancel teleported');if(Tabs.current!=='dashboard')throw Error('cancel committed tab');
                    });
                    await check('browser-owned move cannot commit',async()=>{
                        send('touchstart',280);send('touchmove',230);await frame();send('touchmove',100,350,{cancelable:false});send('touchend',100);
                        if(Tabs.current!=='dashboard')throw Error('uncancelable move committed');
                    });
                    await check('slow release before and after threshold',async()=>{
                        for(const [distance,expected] of [[100,'dashboard'],[120,'settings']]) {
                            await settle();send('touchstart',280);send('touchmove',280-distance,350,{dt:600});await frame();
                            send('touchend',280-distance,350,{dt:600});if(Tabs.current!==expected)throw Error(`threshold ${distance} selected ${Tabs.current}`);
                        }
                    });
                    await check('short flick and paused release differ',async()=>{
                        send('touchstart',280);send('touchmove',235);await frame();send('touchend',235);
                        if(Tabs.current!=='settings')throw Error('short flick did not commit');
                        await settle();send('touchstart',280);send('touchmove',235);await frame();send('touchend',235,350,{dt:600});
                        if(Tabs.current!=='dashboard')throw Error('pause retained stale velocity');
                    });
                    await check('wrong identifier and remaining touches cancel',async()=>{
                        for(const options of [{id:8},{remaining:true}]) {
                            await settle();send('touchstart',280);send('touchmove',130);await frame();send('touchend',130,350,options);
                            if(Tabs.current!=='dashboard')throw Error('interrupted touch committed');
                        }
                    });
                    await check('background interruption keeps visible origin',async()=>{
                        send('touchstart',280);send('touchmove',190);await frame();const before=x();
                        document.dispatchEvent(new Event('visibilitychange'));close(x(),before,'visibility reset jumped');
                        send('touchend',130);if(Tabs.current!=='dashboard')throw Error('hidden gesture committed');
                    });
                    await check('modal inertness blocks the carousel',async()=>{
                        const app=document.getElementById('main-app'),origin=x();app.inert=true;
                        try {send('touchstart',280);send('touchmove',130);await frame();send('touchend',130);close(x(),origin,'modal moved background');}
                        finally {app.inert=false;}
                    });
                    await check('vertical list and day picker keep ownership',async()=>{
                        await settle('schedule');const origin=x();target=document.getElementById('dynamic-schedule-list');target.scrollTop=20;
                        send('touchstart',230);if(send('touchmove',231,320))throw Error('vertical scroll prevented');send('touchend',231,320);
                        target=document.querySelector('.day-picker');send('touchstart',230);send('touchmove',100);await frame();close(x(),origin,'day picker moved tabs');
                    });
                    await check('iOS edge back gesture remains blocked',async()=>{
                        send('touchstart',5);if(!send('touchmove',160))throw Error('edge swipe not prevented');send('touchend',160);
                        if(Tabs.current!=='dashboard')throw Error('edge switched tab');
                    });
                    await check('first and last tab bounds',async()=>{
                        for(const [tab,direction] of [['schedule',1],['settings',-1]]) {
                            await settle(tab);const origin=x();send('touchstart',220);send('touchmove',220+direction*170);await frame();close(x(),origin,'edge overshot');
                            send('touchend',220+direction*170);if(Tabs.current!==tab)throw Error('edge committed');
                        }
                    });
                    await check('navbar slots remain fixed',async()=>{
                        const positions=[];
                        for(const tab of ['schedule','dashboard','settings']) {
                            await settle(tab);positions.push([...document.querySelectorAll('.bottom-nav a')].map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
                        }
                        if(JSON.stringify(positions[0])!==JSON.stringify(positions[1])||JSON.stringify(positions[1])!==JSON.stringify(positions[2]))throw Error('navbar button boxes change with active tab');
                    });
                    return out;
                });
                if(engine==='chromium') {
                    const cdp=await context.newCDPSession(page);
                    const settle=async()=>{
                        await page.evaluate(()=>Tabs.show('schedule',{historyMode:'none'}));
                        await page.evaluate(()=>Promise.all(document.querySelector('.views-track').getAnimations().map(a=>a.finished.catch(()=>{}))));
                    };
                    await settle();
                    await page.evaluate(()=>{
                        const list=document.getElementById('dynamic-schedule-list');
                        for(let i=0;i<12;i++)list.append(list.firstElementChild.cloneNode(true));
                        window.nativeMoves=[];
                        document.addEventListener('touchmove',event=>nativeMoves.push({cancelable:event.cancelable,prevented:event.defaultPrevented}),{passive:true});
                    });
                    const send=async(type,x,y)=>{
                        await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
                        await page.evaluate(()=>new Promise(requestAnimationFrame));
                    };
                    await send('touchStart',280,500);await send('touchMove',269,510);await send('touchMove',140,510);
                    const position=await page.evaluate(()=>new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.views-track')).transform).m41);
                    assert.ok(Math.abs(position+140)<1);
                    await send('touchEnd');assert.equal(await page.evaluate(()=>Tabs.current),'dashboard');
                    await settle();
                    await page.evaluate(()=>{
                        window.nativeScrollDone=new Promise(resolve=>document.getElementById('dynamic-schedule-list').addEventListener('scrollend',resolve,{once:true}));
                    });
                    await send('touchStart',230,650);
                    for(const y of [620,580,540,500])await send('touchMove',230,y);
                    await send('touchEnd');
                    const vertical=await page.evaluate(()=>({scroll:document.getElementById('dynamic-schedule-list').scrollTop,tab:Tabs.current,native:nativeMoves.some(m=>!m.cancelable&&!m.prevented)}));
                    assert.ok(vertical.scroll>0);assert.equal(vertical.tab,'schedule');assert.ok(vertical.native);
                    await page.evaluate(()=>nativeScrollDone);
                    await send('touchStart',280,500);await send('touchMove',140,500);await send('touchEnd');
                    assert.equal(await page.evaluate(()=>Tabs.current),'dashboard');
                    cases.push({name:'CDP touch input: horizontal path, native list scrolling, then swipe',ok:true,position,scroll:vertical.scroll});
                }
                if(!baseline) {
                    assert.equal(await page.evaluate(()=>typeof window.mykepSwipeReport),'undefined');
                    await page.goto(server.url+'/schedule.html?swipe-debug=1');
                    await page.waitForFunction(()=>typeof window.mykepSwipeReport==='function');
                    const privacy=await page.evaluate(()=>{
                        const target=document.querySelector('[data-view=schedule] main');
                        for(let i=0;i<400;i++) {
                            const point={identifier:1,clientX:220+(i%40),clientY:350,target};
                            const event=new Event(i?'touchmove':'touchstart',{bubbles:true,cancelable:true});
                            Object.defineProperties(event,{touches:{value:[point]},changedTouches:{value:[point]}});target.dispatchEvent(event);
                        }
                        document.dispatchEvent(new Event('touchcancel'));
                        const report=getCurrentSupportReport(),uid=localStorage.getItem('mykep_uid'),group=localStorage.getItem('mykep_group');
                        return {hasTrace:report.includes('Рух вкладок:'),size:mykepSwipeReport().samples.length,uid:uid&&report.includes(uid),group:group&&report.includes(group)};
                    });
                    assert.equal(privacy.hasTrace,true);assert.equal(privacy.size,360);assert.ok(!privacy.uid&&!privacy.group);
                }
                results.push({engine,cases});await context.close();
            } finally {await browser.close();}
        }
    } finally {await server.close();}
    fs.mkdirSync('.mykep-local',{recursive:true});
    fs.writeFileSync(`.mykep-local/gesture-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));
    for(const result of results)console.log(JSON.stringify(result));
    const failed=results.flatMap(r=>r.cases.filter(c=>!c.ok));
    if(baseline)assert.ok(failed.length,'baseline should reproduce the reported defects');
    else assert.equal(failed.length,0,JSON.stringify(failed));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
