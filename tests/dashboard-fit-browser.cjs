const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const {startFixtureServer} = require('./fixture-server.cjs');

async function run() {
    const server = await startFixtureServer();
    try {
        for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
            const browser = await engine.launch();
            try {
                const context = await browser.newContext({viewport:{width:390,height:844}, serviceWorkers:'block', reducedMotion:'reduce'});
                const page = await context.newPage();
                await page.clock.install({time:new Date('2026-10-26T06:40:00Z')});
                await page.addInitScript(() => {
                    localStorage.setItem('mykep_onboarded','true');
                    localStorage.setItem('mykep_group','ПІ-24-02');
                    sessionStorage.setItem('mykep_browser_session','yes');
                });
                await page.goto(server.url);
                await page.locator('#current-lesson-room .room-cue-number').first().waitFor();
                for (const [width,height] of [[844,390],[667,375],[568,320],[640,360],[320,568],[360,500],[390,844],[440,956]]) {
                    await page.setViewportSize({width,height});
                    for (const [state,hour,minute] of [['active',8,40],['before',7,0],['break',9,5],['ended',18,0],['empty',8,40]]) {
                        await page.evaluate(({state,hour,minute}) => {
                            getKyivNow = () => new Date(2026,9,26,hour,minute);
                            renderDashboard(state === 'empty' ? [] : [
                                {lesson:1,time:'08:00 - 09:00',subject:'Фізичне виховання',teacher:'Викладач',room:'спортивний зал'},
                                {lesson:2,time:'09:10 - 10:10',subject:'Іноземна мова професійного спрямування',teacher:'Викладач',room:'313'}
                            ]);
                        }, {state,hour,minute});
                        await page.clock.runFor(500);
                        const layout = await page.locator('#dashboard-main').evaluate(main => {
                            const rect = main.getBoundingClientRect();
                            const clipped = [...main.children].filter(node => {
                                const box = node.getBoundingClientRect();
                                return getComputedStyle(node).display !== 'none' && (box.top < rect.top - 1 || box.bottom > rect.bottom + 1);
                            }).map(node => node.id || node.className);
                            main.scrollTop = 100;
                            return {overflow:Math.max(0,main.scrollHeight-main.clientHeight),clipped,scroll:main.scrollTop};
                        });
                        assert.ok(layout.overflow <= 1 && !layout.clipped.length && layout.scroll === 0, `${name} ${width}x${height} ${state}: ${JSON.stringify(layout)}`);
                        const nav = await page.locator('.bottom-nav').evaluate(n=>({bottom:n.getBoundingClientRect().bottom,heights:[...n.querySelectorAll('.nav-btn')].map(b=>b.getBoundingClientRect().height)}));
                        assert.ok(nav.bottom<=height+1 && nav.heights.every(h=>h>=(width>=560&&height<=400?48:56)));
                    }
                }
                await page.evaluate(() => Tabs.show('schedule',{historyMode:'none'}));
                await page.clock.runFor(500);
                await page.waitForFunction(()=>!document.getElementById('schedule-week').disabled);
                await page.locator('#schedule-week').focus();
                await page.locator('#schedule-week').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished)));
                assert.equal(await page.locator('.week-control').evaluate(n=>getComputedStyle(n).boxShadow),'none');
                const focus = await page.locator('#schedule-week').evaluate(n=>({width:getComputedStyle(n).outlineWidth,style:getComputedStyle(n).outlineStyle,color:getComputedStyle(n).outlineColor}));
                assert.deepEqual(focus,{width:'2px',style:'solid',color:'rgb(255, 85, 0)'});
                console.log(`${name}: 40 dashboard size/state combinations fit without clipping or scrolling; week focus excludes label`);
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
run().catch(error => {console.error(error); process.exitCode=1;});
