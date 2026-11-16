const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {startFixtureServer}=require('./fixture-server.cjs');

async function run() {
    const server=await startFixtureServer();
    fs.mkdirSync('.mykep-local/screens',{recursive:true});
    try {
        for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser=await type.launch();
            try {
                const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
                await context.addInitScript(()=>{
                    localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');
                    sessionStorage.setItem('mykep_browser_session','yes');
                });
                const page=await context.newPage(),errors=[];
                page.on('pageerror',error=>errors.push(error.message));
                await page.goto(server.url+'/settings.html');
                for(const [width,height] of [[390,844],[320,568],[390,450]]) {
                    await page.setViewportSize({width,height});
                    await page.click('#open-group-modal');
                    await page.locator('#modal-group-list button').first().waitFor();
                    assert.equal(await page.locator('#group-modal').evaluate(n=>n.matches(':modal')),true);
                    assert.equal(await page.evaluate(()=>document.activeElement.id),'close-modal');
                    await page.locator('.bottom-nav a').first().evaluate(n=>n.focus());
                    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#group-modal')),true);
                    const box=await page.locator('#group-modal').boundingBox();
                    assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=width+1 && box.y+box.height<=height+1,JSON.stringify(box));
                    await page.screenshot({path:`.mykep-local/screens/${name}-dialog-${width}x${height}.png`});
                    await page.keyboard.press('Escape');
                    await page.locator('#group-modal').waitFor({state:'hidden'});
                    assert.equal(await page.evaluate(()=>document.activeElement.id),'open-group-modal');
                }
                await page.setViewportSize({width:390,height:844});
                await page.click('#open-group-modal');
                const heading=await page.locator('#group-modal h3').boundingBox();
                await page.mouse.move(heading.x+heading.width/2,heading.y+heading.height/2);
                await page.mouse.down();await page.mouse.move(4,800);await page.mouse.up();
                assert.equal(await page.locator('#group-modal').evaluate(n=>n.open),true,'dragging from the panel must not dismiss it');
                await page.mouse.click(4,800);
                await page.locator('#group-modal').waitFor({state:'hidden'});
                assert.equal(await page.evaluate(()=>document.activeElement.id),'open-group-modal');
                await page.locator('#advanced-settings > summary').click();
                await page.locator('label.duration-choice').filter({has:page.locator('input[name="duration1"][value="80"]')}).click();
                assert.equal(await page.locator('#confirm-modal').evaluate(n=>n.matches(':modal')),true);
                assert.equal(await page.evaluate(()=>document.activeElement.id),'confirm-cancel-btn');
                await page.screenshot({path:`.mykep-local/screens/${name}-dialog-confirm.png`});
                await page.keyboard.press('Escape');
                await page.locator('#confirm-modal').waitFor({state:'hidden'});
                assert.equal(await page.evaluate(()=>document.querySelector('input[name="duration1"][value="80"]')===document.activeElement),true);
                assert.equal(await page.evaluate(()=>getLessonDuration(1)),'60');
                await page.addStyleTag({content:'.modal-overlay { --dialog-top-space: 62px; --dialog-bottom-space: 34px; }'});
                await page.click('#open-group-modal');
                const safeBox=await page.locator('#group-modal').boundingBox();
                assert.ok(safeBox.y>=70 && safeBox.y+safeBox.height<=810+1,JSON.stringify(safeBox));
                await page.keyboard.press('Escape');
                await page.locator('#group-modal').waitFor({state:'hidden'});
                await page.evaluate(()=>{
                    const modal=document.getElementById('group-modal');window.reviewCloses=0;
                    Dialogs.open(modal,()=>reviewCloses++);Dialogs.close(modal);
                    Dialogs.open(modal,()=>reviewCloses++);
                });
                await page.evaluate(()=>new Promise(requestAnimationFrame));
                assert.equal(await page.evaluate(()=>reviewCloses),1);
                assert.equal(await page.locator('#group-modal').evaluate(n=>n.open),true);
                await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
                await page.locator('#group-modal').waitFor({state:'hidden'});
                assert.equal(await page.evaluate(()=>reviewCloses),2);
                assert.deepEqual(errors,[]);
                console.log(`${name}: native dialog focus, Escape, backdrop, drag, short viewports, confirmation and reopen/history passed`);
                await context.close();
            } finally { await browser.close(); }
        }
    } finally { await server.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
