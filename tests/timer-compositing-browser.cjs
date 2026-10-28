const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startFixtureServer}=require('./fixture-server.cjs');
async function run(){
    const server=await startFixtureServer({transformCycle(cycle){
        for(const week of Object.values(cycle))for(const lessons of Object.values(week)){
            lessons.push({lesson:6,time:'14:00 - 15:00',subject:'Основи філософських знань',teacher:'Викладач',room:'305',starts_on:null});
        }
        return cycle;
    }});
    fs.mkdirSync('.mykep-local/screens',{recursive:true});
    try{
        for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
            const browser=await type.launch({headless:true});
            try{
                const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',hasTouch:true,isMobile:true,
                    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'});
                const page=await context.newPage(),errors=[];
                page.on('pageerror',e=>errors.push(e.message));
                await page.clock.install({time:new Date('2026-10-28T12:01:00Z')});
                await page.addInitScript(()=>{
                    Object.defineProperty(navigator,'standalone',{value:true,configurable:true});
                    localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');
                    sessionStorage.setItem('mykep_browser_session','yes');
                });
                await page.goto(server.url);
                await page.waitForFunction(()=>document.getElementById('current-subject').textContent==='Основи філософських знань');
                for(let i=0;i<12;i++){
                    await page.evaluate(tab=>Tabs.show(tab),i%2?'settings':'schedule');
                    await page.evaluate(()=>Tabs.show('dashboard'));
                    await page.locator('.views-track').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
                    await page.clock.runFor(1000);
                    const paint=await page.locator('.timer-widget').evaluate(n=>({
                        glow:getComputedStyle(n,'::before').filter,svg:getComputedStyle(n.querySelector('svg')).filter,
                        display:getComputedStyle(n.querySelector('.timer-display')).backgroundColor,
                        countdown:getComputedStyle(n.querySelector('.timer-sub')).backgroundColor,
                        isolated:getComputedStyle(n).isolation,text:n.querySelector('.timer-main').textContent
                    }));
                    assert.deepEqual(paint,{glow:'none',svg:'none',display:'rgba(0, 0, 0, 0)',countdown:'rgba(0, 0, 0, 0)',isolated:'isolate',text:'59хв'});
                }
                await page.screenshot({path:`.mykep-local/screens/${name}-timer-compositing.png`});
                await page.evaluate(()=>Tabs.show('schedule'));
                const today=page.locator('.day-item[aria-current="date"]');
                await today.locator('.day-name').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
                const label=await today.evaluate(n=>({name:getComputedStyle(n.querySelector('.day-name')).color,date:getComputedStyle(n.querySelector('.day-date')).color,line:getComputedStyle(n.querySelector('.day-name')).textDecorationLine}));
                assert.equal(label.name,label.date);
                assert.equal(label.line,'none');
                await page.locator('.views-track').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
                await page.screenshot({path:`.mykep-local/screens/${name}-day-color.png`});
                assert.deepEqual(errors,[]);
                console.log(`${name}: headless simulated installed iOS, 12 interrupted tab returns, transparent timer surfaces, countdown and today's name/date colour passed`);
            }finally{await browser.close();}
        }
    }finally{await server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
