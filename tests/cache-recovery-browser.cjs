const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {startFixtureServer}=require('./fixture-server.cjs');
async function run(){
    const server=await startFixtureServer();
    try{
        for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
            const browser=await type.launch();
            try{
                const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
                const page=await context.newPage(),errors=[];
                page.on('pageerror',error=>errors.push(error.message));
                await page.clock.install({time:new Date('2026-10-14T05:20:00Z')});
                await page.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');
                    localStorage.setItem('mykep_group','ПІ-24-02');
                    localStorage.setItem('mykep_uid','keep-synthetic-uid');
                    sessionStorage.setItem('mykep_browser_session','yes');
                    const days=['понеділок','вівторок','середа','четвер',"п'ятниця",'субота'];
                    const data=Object.fromEntries(days.map(day=>[day,[]]));
                    const cycle=Object.fromEntries([1,2,3,4].map(week=>[week,data]));
                    localStorage.setItem('mykep_schedule',JSON.stringify({version:3,entries:[
                        {key:'ПІ-24-02|60|60',cycle:{1:null},data},
                        {key:'ІНША|60|60',cycle}
                    ]}));
                });
                await page.goto(server.url);
                await page.waitForFunction(()=>document.getElementById('current-subject').textContent.includes('Захист України'));
                const cache=await page.evaluate(()=>({entries:JSON.parse(localStorage.getItem('mykep_schedule')).entries,uid:localStorage.getItem('mykep_uid')}));
                assert.equal(cache.uid,'keep-synthetic-uid');
                assert.ok(cache.entries.some(e=>e.key==='ІНША|60|60'));
                assert.ok(cache.entries.find(e=>e.key==='ПІ-24-02|60|60').cycle[4]);
                assert.deepEqual(errors,[]);
                console.log(`${name}: startup with valid data/corrupt cycle recovers from server and preserves other group/UID`);
            }finally{await browser.close();}
        }
    }finally{await server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
