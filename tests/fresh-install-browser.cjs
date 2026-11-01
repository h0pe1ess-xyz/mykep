'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {startFixtureServer}=require('./fixture-server.cjs');
async function run(){
    const server=await startFixtureServer();
    try {for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
        const browser=await type.launch();
        try {for(const platform of ['Android','iPhone']) {
            const context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,serviceWorkers:'block',
                userAgent:platform==='iPhone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
            try {
                await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
                const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
                await page.goto(server.url+'/');
                await page.locator('#ob-slide-1.active').waitFor();
                assert.equal(await page.locator('html').getAttribute('data-swipe'),'native');
                assert.equal(await page.evaluate(()=>document.getElementById('main-app').inert),true);
                for(const [slide,next] of [[1,2],[2,3]]){
                    await page.locator(`#ob-slide-${slide} [data-ob-step="${next}"]`).click();
                    await page.locator(`#ob-slide-${next}.active`).waitFor();
                    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.onboarding-slide:not(.active) button')].filter(n=>n.getClientRects().length&&!n.closest('[inert]')).length),0);
                }
                await page.locator('[data-ob-finish]').click();
                await page.locator('#ob-group-search').waitFor();
                assert.notEqual(await page.evaluate(()=>localStorage.getItem('mykep_onboarded')),'true');
                await page.locator('#ob-group-search').fill('Немає такої групи');
                await page.getByText('Груп не знайдено. Спробуйте інший пошук.',{exact:true}).waitFor();
                await page.locator('#ob-group-search').fill('ПІ-24');
                await page.locator('#ob-group-options button').filter({hasText:'ПІ-24-02'}).click();
                await Promise.all([page.waitForEvent('load'),page.locator('[data-ob-finish]').click()]);
                await page.waitForFunction(()=>typeof currentGlobalSchedule!=='undefined'&&currentGlobalSchedule);
                const stored=await page.evaluate(()=>({group:localStorage.getItem('mykep_group'),onboard:localStorage.getItem('mykep_onboarded'),mode:localStorage.getItem('mykep_swipe_test'),first:localStorage.getItem('mykep_duration1'),second:localStorage.getItem('mykep_duration2')}));
                assert.deepEqual(stored,{group:'ПІ-24-02',onboard:'true',mode:null,first:'60',second:'60'});
                await page.locator('.bottom-nav [data-tab="schedule"]').click();
                await page.waitForFunction(()=>Tabs.current==='schedule'&&schedulePickerState?.activeDay);
                assert.equal(await page.evaluate(()=>document.getElementById('main-app').inert),false);
                for(const width of [320,390,440]){
                    await page.setViewportSize({width,height:568});
                    const label=await page.locator('#schedule-week').evaluate(n=>{
                        const s=getComputedStyle(n),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font;
                        return {width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,font:parseFloat(s.fontSize),
                            text:ctx.measureText(n.selectedOptions[0].textContent).width,
                            room:n.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)};
                    });
                    assert.ok(Math.abs(label.width-Math.min(140,width*.42))<1);
                    // Native WebKit controls can exceed the CSS minimum height.
                    assert.ok(label.height>=44);
                    assert.equal(label.font,platform==='iPhone'?16:14);
                    if (label.text+24>label.room) await page.screenshot({path:`.mykep-local/screens/week-overflow-${engine}-${platform}-${width}.png`});
                    assert.ok(label.text+24<=label.room,'week label must leave room for the native arrow: '+JSON.stringify({engine,platform,viewport:width,...label}));
                }
                await page.setViewportSize({width:320,height:568});
                await page.screenshot({path:`.mykep-local/screens/fresh-${engine}-${platform}.png`});
                assert.deepEqual(errors,[]);
                console.log(`${engine} ${platform}: fresh native install, small-screen onboarding, missing/empty group validation, selection, completion and schedule passed`);
            } finally {await context.close();}
        }} finally {await browser.close();}
    }} finally {await server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
