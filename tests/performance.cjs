const {chromium}=require('playwright');
const {startFixtureServer}=require('./fixture-server.cjs');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
async function main() {
    const server=await startFixtureServer(),browser=await chromium.launch(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
    const baseline=execFileSync('git',['show','cf85856:static/js/boot.js'],{encoding:'utf8'});
    const results=[];
    try {
        const modes=process.argv.includes('--baseline-only')?['baseline']:['baseline','candidate'];
        for (const mode of modes) for (let run=0;run<3;run++) {
            const context=await browser.newContext({viewport:{width:390,height:700},serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
            const page=await context.newPage();
            if (mode==='baseline') await page.route('**/js/boot.js*',route=>route.fulfill({contentType:'text/javascript',body:baseline}));
            await page.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');});
            const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
            await page.goto(server.url);
            await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined' && currentGlobalSchedule);
            const result=await page.evaluate(async()=>{
                getKyivNow=()=>new Date(2026,9,14,8,20);
                const e=cachedScheduleForKey(scheduleRequestContext().key);
                startDashboard(scheduleOnDate(e,getKyivNow(),'ПІ-24-02'));
                for(let i=0;i<70;i++) await new Promise(requestAnimationFrame);
                let styleReads=0,rectReads=0;
                const style=window.getComputedStyle,rect=Element.prototype.getBoundingClientRect;
                window.getComputedStyle=function(...args){styleReads++;return style.apply(this,args);};
                Element.prototype.getBoundingClientRect=function(...args){rectReads++;return rect.apply(this,args);};
                const frames=[],start=performance.now();let last=start;
                for(let i=0;i<50;i++) {
                    requestDashboardFit();
                    await new Promise(requestAnimationFrame);
                    const now=performance.now();frames.push(now-last);last=now;
                }
                window.getComputedStyle=style;Element.prototype.getBoundingClientRect=rect;
                frames.sort((a,b)=>a-b);
                return {styleReads,rectReads,elapsed:performance.now()-start,p95:frames[Math.floor(frames.length*.95)],density:document.getElementById('dashboard-main').dataset.density};
            });
            results.push({mode,run,...result});await context.close();
        }
        fs.mkdirSync('.mykep-local',{recursive:true});fs.writeFileSync('.mykep-local/performance.json',JSON.stringify({cpuThrottling:6,synthetic:true,results},null,2));
        console.log(JSON.stringify(results));
    } finally {await browser.close();await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
