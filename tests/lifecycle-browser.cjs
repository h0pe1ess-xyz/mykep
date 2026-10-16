const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {startFixtureServer}=require('./fixture-server.cjs');
async function run() {
    const baseline=process.argv.includes('--baseline'),results=[];
    const server=await startFixtureServer();
    try {
        for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch(engine==='chromium'&&process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{});
            try {
                const context=await browser.newContext({viewport:{width:440,height:956},isMobile:true,hasTouch:true,serviceWorkers:'block'});
                const page=await context.newPage(),gates=[];
                if(baseline)for(const name of ['boot','tabs','app','support'])await page.route(`**/js/${name}.js*`,route=>route.fulfill({contentType:'text/javascript',body:execFileSync('git',['show',`origin/main:static/js/${name}.js`],{encoding:'utf8'})}));
                await page.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');sessionStorage.setItem('mykep_browser_session','yes');
                    window.testVisibility='visible';window.testActions=[];
                    Object.defineProperty(document,'visibilityState',{get:()=>window.testVisibility});
                    const original=window.fetch;
                    window.fetch=(url,options)=>{
                        if(String(url)==='/api/activity')testActions.push(JSON.parse(options.body).event);
                        return original(url,options);
                    };
                });
                await page.route('**/api/schedule?**',route=>gates.push(route));
                await page.goto(server.url+'/schedule.html');
                await page.waitForFunction(()=>document.querySelector('[data-view=schedule] main').getAttribute('aria-busy')==='true');
                assert.equal(gates.length,1);
                await page.evaluate(()=>Tabs.show('settings'));
                await gates.shift().fulfill({status:503,contentType:'application/json',body:'{}'});
                await page.waitForFunction(()=>scheduleRequests.size===0);
                await page.evaluate(()=>Tabs.show('schedule'));
                const failure=await page.evaluate(()=>({loading:document.getElementById('dynamic-schedule-list').textContent.includes('Завантаження'),retry:!!document.querySelector('#schedule-notice button'),notice:document.getElementById('schedule-notice').textContent}));
                results.push({engine,case:'cold request fails while another tab is active',ok:!failure.loading&&failure.retry,...failure});
                if(!baseline) {
                    const retryRequest=page.waitForRequest(request=>request.url().includes('/api/schedule?'));
                    await page.locator('#schedule-notice button').click();await retryRequest;
                    for(const route of gates.splice(0))await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'success',cycle:require('./fixture-server.cjs').cycleFixture(),data:{},meta:{stale:false}})});
                    await page.waitForFunction(()=>schedulePageData&&scheduleRequests.size===0);
                    assert.equal(await page.locator('#schedule-notice').isVisible(),false);
                    assert.equal(await page.locator('[data-view=schedule] main').getAttribute('aria-busy'),'false');
                }
                const returns=await page.evaluate(()=>{
                    const visibility=value=>{testVisibility=value;document.dispatchEvent(new Event('visibilitychange'));};
                    const show=()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
                    testActions.length=0;
                    visibility('hidden');visibility('visible');show();
                    const first=testActions.filter(e=>e==='view').length;
                    visibility('hidden');getKyivNow=()=>new Date(2026,9,17,10);show();visibility('visible');show();
                    const nextDay=testActions.filter(e=>e==='view').length-first;
                    const before=testActions.length;App.enter('schedule');window.dispatchEvent(new Event('online'));
                    return {first,nextDay,technical:testActions.length-before};
                });
                results.push({engine,case:'one view per visible return, including next day',ok:returns.first===1&&returns.nextDay===1&&returns.technical===0,...returns});
                const restored=await page.evaluate(()=>{
                    testVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'));
                    Tabs.show('dashboard',{historyMode:'none'});testActions.length=0;
                    testVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));
                    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
                    return testActions.filter(e=>e==='view').length;
                });
                results.push({engine,case:'pageshow restores a different tab without duplicating the visible return',ok:restored===1,views:restored});
                for(const route of gates.splice(0))await route.abort();
                await context.close();
            } finally {await browser.close();}
        }
    } finally {await server.close();}
    fs.mkdirSync('.mykep-local',{recursive:true});
    fs.writeFileSync(`.mykep-local/lifecycle-${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
    if(baseline)assert.ok(results.some(r=>!r.ok),'baseline must reproduce a defect');
    else assert.ok(results.every(r=>r.ok),JSON.stringify(results));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
