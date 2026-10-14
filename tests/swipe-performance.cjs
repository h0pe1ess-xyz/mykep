// Synthetic carousel gestures on a throttled desktop, not physical-phone FPS.
const {chromium}=require('playwright');
const {startFixtureServer}=require('./fixture-server.cjs');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
async function main() {
    const server=await startFixtureServer();
    const browser=await chromium.launch(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
    const results=[];
    try {
        for (const mode of process.argv.includes('--baseline-only')?['baseline']:['baseline','candidate']) {
            for(let run=0;run<3;run++) {
                const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
                const page=await context.newPage();
                if(mode==='baseline') for(const name of ['api','app','schedule','tabs','boot']) {
                    const body=execFileSync('git',['show',`d2cfdc4:static/js/${name}.js`],{encoding:'utf8'});
                    await page.route(`**/js/${name}.js*`,route=>route.fulfill({contentType:'text/javascript',body}));
                }
                await page.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
                const cdp=await context.newCDPSession(page);
                await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>typeof schedulePageData!=='undefined' && schedulePageData);
                await page.evaluate(()=>Tabs.show('dashboard'));
                await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule);
                await page.evaluate(()=>Tabs.show('schedule'));
                await page.evaluate(()=>Promise.all(document.querySelector('.views-track').getAnimations().map(a=>a.finished.catch(()=>{}))));
                const requestsBefore=server.requests.filter(p=>p==='/api/schedule').length;
                await cdp.send('Performance.enable');
                const before=(await cdp.send('Performance.getMetrics')).metrics;
                const result=await page.evaluate(async()=>{
                    const counts={styleReads:0,rectReads:0,cacheParses:0,cacheWrites:0,scheduleRenders:0};
                    const style=getComputedStyle,rect=Element.prototype.getBoundingClientRect,parse=JSON.parse,set=Storage.prototype.setItem,render=renderScheduleList;
                    window.getComputedStyle=(...args)=>{counts.styleReads++;return style(...args);};
                    Element.prototype.getBoundingClientRect=function(...args){counts.rectReads++;return rect.apply(this,args);};
                    JSON.parse=function(value,...args){if(typeof value==='string' && value.includes('"entries"')) counts.cacheParses++;return parse(value,...args);};
                    Storage.prototype.setItem=function(key,value){if(key==='mykep_schedule') counts.cacheWrites++;return set.call(this,key,value);};
                    renderScheduleList=(...args)=>{counts.scheduleRenders++;return render(...args);};
                    const frames=[],ends=[],longTasks=[];
                    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));
                    observer.observe({type:'longtask'});
                    let last=performance.now(),running=true;
                    function frame(now){frames.push(now-last);last=now;if(running)requestAnimationFrame(frame);}
                    requestAnimationFrame(frame);
                    const start=performance.now();
                    for(const direction of [-1,-1,1,1,-1,-1,1,1]) {
                        const target=document.querySelector(`[data-view="${Tabs.current}"] main`);
                        const point=x=>({identifier:7,clientX:x,clientY:350,target});
                        function send(type,x){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point(x)]},changedTouches:{value:[point(x)]}});target.dispatchEvent(event);}
                        const x=direction<0?290:100;
                        send('touchstart',x);
                        for(let step=1;step<=8;step++) {send('touchmove',x+direction*25*step);await new Promise(requestAnimationFrame);}
                        const endStart=performance.now();send('touchend',x+direction*200);ends.push(performance.now()-endStart);
                        await Promise.all(document.querySelector('.views-track').getAnimations().map(animation=>animation.finished.catch(()=>{})));
                        await new Promise(requestAnimationFrame);
                    }
                    running=false;observer.disconnect();
                    frames.sort((a,b)=>a-b);
                    return {...counts,elapsedMs:performance.now()-start,frameP95Ms:frames[Math.floor(frames.length*.95)],touchEndTotalMs:ends.reduce((a,b)=>a+b,0),longTaskMs:longTasks.reduce((a,b)=>a+b,0)};
                });
                const after=(await cdp.send('Performance.getMetrics')).metrics;
                for(const key of ['LayoutCount','RecalcStyleCount','ScriptDuration','LayoutDuration']) result[key]=after.find(m=>m.name===key).value-before.find(m=>m.name===key).value;
                results.push({mode,run,scheduleRequests:server.requests.filter(p=>p==='/api/schedule').length-requestsBefore,...result});
                await context.close();
            }
        }
        fs.mkdirSync('.mykep-local',{recursive:true});
        fs.writeFileSync('.mykep-local/swipe-performance.json',JSON.stringify({cpuThrottling:6,gestures:8,baseline:'d2cfdc4',synthetic:true,results},null,2));
        console.log(JSON.stringify(results));
    } finally {await browser.close();await server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
