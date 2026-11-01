'use strict';
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash, createHmac} = require('node:crypto');
const {existsSync, mkdirSync} = require('node:fs');
const {chromium, webkit} = require('playwright');

async function run() {
    const python = process.env.PYTHON || (process.platform === 'win32' && existsSync('.venv/Scripts/python.exe') ? '.venv/Scripts/python.exe' : 'python');
    const server = spawn(python, ['tests/admin_fixture.py'], {stdio:['ignore','pipe','pipe']});
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    try {
        const port = await new Promise((resolve,reject) => {
            let output = '';
            server.stdout.on('data', chunk => {
                output += chunk;
                if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]).port);
            });
            server.on('error', reject);
            server.on('exit', code => reject(new Error(`Fixture exited: ${code}`)));
        });
        const base = `http://127.0.0.1:${port}`;
        mkdirSync('.mykep-local/screens', {recursive:true});
        for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
            const browser = await type.launch();
            try {
                const context = await browser.newContext({viewport:{width:390,height:844}});
                const page = await context.newPage(), errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(base + '/admin/');
                await page.locator('#login').waitFor({state:'visible'});
                assert.equal(await page.locator('#dev-box').count(), 0);
                const payload = {id:1125085502,first_name:'<img src=x onerror=alert(1)>',auth_date:Math.floor(Date.now()/1000),last_name:engine};
                const secret = createHash('sha256').update('123456:synthetic-test-key').digest();
                payload.hash = createHmac('sha256',secret).update(Object.keys(payload).sort().map(key=>`${key}=${payload[key]}`).join('\n')).digest('hex');
                const login = await context.request.post(base + '/api/admin/auth/telegram', {headers:{Origin:base},data:payload});
                assert.equal(login.status(),200);
                await page.reload();
                await page.locator('#app').waitFor({state:'visible'});
                await page.locator('#page-overview .kpi').first().waitFor();
                assert.equal(await page.locator('#side-user img').count(),0);
                assert.ok((await page.locator('#side-user').textContent()).includes('<img'));
                await page.screenshot({path:`.mykep-local/screens/${engine}-admin-mobile.png`,fullPage:true});
                for (const view of ['stats','server','security']) {
                    await page.locator(`[data-view="${view}"]:visible`).click();
                    await page.locator(`#page-${view}[aria-busy="true"]`).waitFor({state:'detached'});
                    assert.ok(await page.locator(`#page-${view}`).textContent());
                }
                await page.setViewportSize({width:1440,height:900});
                await page.screenshot({path:`.mykep-local/screens/${engine}-admin-desktop.png`,fullPage:true});
                page.on('dialog', dialog => dialog.accept());
                await page.route('**/api/admin/logout', route => route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Unavailable"}'}));
                await page.locator('#side-user button').click();
                await page.locator('#toast').filter({hasText:'Не вдалося завершити сесію'}).waitFor();
                assert.equal(await page.locator('#app').isVisible(),true);
                await page.unroute('**/api/admin/logout');
                await page.locator('#side-user button').click();
                await page.locator('#login').waitFor({state:'visible'});
                assert.equal(await page.locator('.page > *').count(),0);
                assert.equal(await page.locator('#side-user').textContent(),'');
                assert.equal((await context.request.get(base+'/api/admin/me')).status(),401);
                const cached = await page.evaluate(async()=>{
                    const names=await caches.keys(), urls=[];
                    for(const name of names) for(const request of await (await caches.open(name)).keys()) urls.push(request.url);
                    return urls;
                });
                assert.ok(cached.every(url=>!new URL(url).pathname.startsWith('/api/')));
                assert.deepEqual(errors,[]);
                console.log(`${engine}: real admin API, signed login, escaped identity, all pages, failed/successful logout and private cache isolation passed`);
                await context.close();
            } finally { await browser.close(); }
        }
    } finally {
        server.kill();
        await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
    }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
