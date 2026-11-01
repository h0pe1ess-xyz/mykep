'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const {startFixtureServer}=require('./fixture-server.cjs');
async function flush(page){await page.waitForFunction(()=>!usageReceipts.sending&&!usageReceipts.scheduled&&!usageReceipts.pending.length);}
async function run(){
 const server=await startFixtureServer();
 try {for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch(name==='chromium'?{channel:'chrome'}:{});
  try {
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   await context.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');sessionStorage.setItem('mykep_browser_session','yes');});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const initial=server.usage.length;
   await page.goto(server.url+'/');await page.waitForFunction(()=>typeof usageReceipts!=='undefined');await flush(page);
   assert.deepEqual(server.usage.slice(initial).map(e=>e.page),['dashboard'],'prewarming must not generate page visits');
   const uid=server.usage[initial].uid;
   await page.locator('.bottom-nav [data-tab="settings"]').click();await page.waitForFunction(()=>Tabs.current==='settings');await flush(page);
   await page.locator('#advanced-settings summary').click();
   await page.locator('input[name="duration1"][value="80"]').locator('..').click();await page.locator('#confirm-ok-btn').click();await flush(page);
   assert.ok(server.usage.slice(initial).some(e=>e.page===null&&e.duration1===80&&e.duration2===60));
   await page.locator('.bottom-nav [data-tab="schedule"]').click();await page.waitForFunction(()=>Tabs.current==='schedule');await flush(page);
   await page.locator('#schedule-bells-tab').click();await flush(page);
   assert.ok(server.usage.slice(initial).some(e=>e.page==='bells'));
   const count=server.usage.length;await page.locator('#schedule-bells-tab').click();
   await page.evaluate(()=>{for(let i=0;i<100;i++)App.enter(Tabs.current);});await flush(page);
   assert.equal(server.usage.length,count,'background/unchanged refresh must not create telemetry');
   assert.ok(server.usage.slice(initial).every(e=>e.uid===uid));
   await context.setOffline(true);await page.evaluate(()=>recordUsage('dashboard'));assert.equal(await page.evaluate(()=>usageReceipts.pending.length),0);await context.setOffline(false);
   let held,block=true;
   await page.route('**/api/usage',r=>block?new Promise(resolve=>{held=()=>{r.fulfill({status:204}).then(resolve);};}):r.continue());
   await page.evaluate(()=>{usageReceipts.recent.clear();recordUsage('dashboard');});
   await page.waitForFunction(()=>usageReceipts.sending);
   while(!held)await new Promise(resolve => { setTimeout(resolve,5); });
   await page.evaluate(()=>{for(let i=0;i<100;i++){usageReceipts.recent.clear();recordUsage('settings');}});
   assert.equal(await page.evaluate(()=>usageReceipts.pending.length),8,'pending telemetry must be bounded');
   block=false;held();await flush(page);await page.unroute('**/api/usage');
   assert.deepEqual(errors,[]);await context.close();
   const admin=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
   const p=await admin.newPage(),adminErrors=[];p.on('pageerror',e=>adminErrors.push(e.message));
   await p.route('**/admin/**',route=>{
    const file=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
    const allowed=['index.html','admin.js','admin.css','charts.js','manifest.webmanifest','sw.js','icon-192.png'];
    if(!allowed.includes(file))return route.abort();
    return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.resolve('admin_static',file))});
   });
   const stats=JSON.parse(fs.readFileSync('.mykep-local/usage-admin-fixture.json','utf8'));
   await p.route('**/api/admin/**',route=>{
    const url=route.request().url();let data={};
    if(url.includes('/me'))data={csrf:'synthetic',user:{id:1,name:'QA',username:'qa'}};
    if(url.includes('/stats?'))data=stats;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'success',data})});
   });
   await p.goto(server.url+'/admin/#/stats');await p.getByRole('heading',{name:'Сторінки застосунку',exact:true}).waitFor();
   await p.getByRole('heading',{name:'Налаштування користувачів',exact:true}).waitFor();
   assert.equal(await p.locator('.usage-table').count(),3);
   assert.ok((await p.getByRole('table',{name:'Сторінки застосунку'}).innerText()).includes('100'));
   for(const width of [390,1280]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
   await p.getByRole('heading',{name:'Налаштування користувачів',exact:true}).scrollIntoViewIfNeeded();
   await p.screenshot({path:`.mykep-local/screens/usage-admin-${name}.png`});
   assert.deepEqual(adminErrors,[]);await admin.close();
   console.log(name+': settled-page telemetry, latest settings, no warmup/idle/duplicate receipts, stable UID, offline skip, bounded queue and admin tables passed');
  } finally {await browser.close();}
 }} finally {await server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
