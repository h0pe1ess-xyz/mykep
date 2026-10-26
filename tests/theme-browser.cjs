// Chromium auto-dark is a regression check, not Samsung Internet emulation.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {startFixtureServer}=require('./fixture-server.cjs');

async function run() {
    const server=await startFixtureServer();
    const baselineOnly=process.argv.includes('--baseline-only');
    const results=[];
    fs.mkdirSync('.mykep-local/screens',{recursive:true});
    try {
        for(const [name,type,forceDark] of [['chrome',chromium,false],['chrome-auto-dark',chromium,true],['webkit',webkit,false]]) {
            const options=type===chromium && process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{};
            if(forceDark) options.args=['--enable-features=WebContentsForceDark'];
            const browser=await type.launch(options);
            try {
                for(const preference of ['light','dark']) {
                    const context=await browser.newContext({viewport:{width:394,height:820},deviceScaleFactor:1,hasTouch:true,isMobile:true,colorScheme:preference,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 SamsungBrowser/29.0 Chrome/130.0 Mobile Safari/537.36'});
                    const page=await context.newPage(),errors=[];
                    page.on('pageerror',error=>errors.push(error.message));
                    if(baselineOnly) for(const [url,file] of [['**/schedule.html','static/index.html'],['**/css/app.css*','static/css/app.css']]) {
                        const body=execFileSync('git',['show',`7843eba:${file}`],{encoding:'utf8'});
                        await page.route(url,route=>route.fulfill({contentType:file.endsWith('.html')?'text/html':'text/css',body}));
                    }
                    await page.clock.install({time:new Date('2026-10-14T10:00:00Z')});
                    await page.addInitScript(()=>{
                        localStorage.setItem('mykep_onboarded','true');
                        sessionStorage.setItem('mykep_browser_session','yes');
                        Object.defineProperty(navigator,'standalone',{value:true});
                    });
                    await page.goto(server.url+'/schedule.html');
                    await page.waitForFunction(()=>typeof schedulePageData!=='undefined' && schedulePageData);
                    for(const tab of ['schedule','dashboard','settings']) {
                        await page.evaluate(tab=>Tabs.show(tab),tab);
                        await page.waitForFunction(()=>scheduleRequests.size===0);
                        await page.locator('.bottom-nav .active').waitFor({state:'visible'});
                        await page.locator('.bottom-nav .active').evaluate(node=>Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished)));
                        const info=await page.evaluate(()=>{
                            const button=document.querySelector('.bottom-nav .active');
                            const rect=button.getBoundingClientRect();
                            const card=[...document.querySelectorAll(`[data-view="${Tabs.current}"] .lesson-card, [data-view="${Tabs.current}"] .lesson-card-detailed, [data-view="${Tabs.current}"] .settings-card`)]
                                .find(node=>node.getBoundingClientRect().width>0);
                            return {scheme:getComputedStyle(document.documentElement).colorScheme,
                                meta:document.querySelector('meta[name="color-scheme"]')?.content,
                                cardBackground:getComputedStyle(card).backgroundColor,
                                accent:getComputedStyle(button).backgroundColor,
                                iconColor:getComputedStyle(button.querySelector('svg')).color,
                                glow:getComputedStyle(button).boxShadow,
                                sample:{x:Math.round(rect.left+6),y:Math.round(rect.top+rect.height/2)}};
                        });
                        // Sample the painted pixel: computed CSS misses compositor recoloring.
                        const file=`.mykep-local/screens/${name}-${preference}-${tab}${baselineOnly?'-baseline':''}.png`;
                        const png=await page.screenshot({path:file,animations:'disabled'});
                        const pixel=await page.evaluate(async({encoded,x,y})=>{
                            const bytes=Uint8Array.from(atob(encoded),value=>value.charCodeAt(0));
                            const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
                            const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
                            const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
                            return [...ctx.getImageData(x,y,1,1).data];
                        },{encoded:png.toString('base64'),...info.sample});
                        results.push({engine:name,preference,tab,...info,pixel});
                        if(!baselineOnly) {
                            assert.equal(info.scheme,'dark only');
                            assert.equal(info.meta,'dark');
                            assert.equal(info.accent,'rgb(31, 23, 20)');
                            assert.equal(info.iconColor,'rgb(255, 85, 0)');
                            assert.equal(info.glow,'none');
                            assert.equal(info.cardBackground,'rgba(36, 28, 24, 0.65)');
                            assert.deepEqual(pixel,[31,23,20,255]);
                        }
                    }
                    if(!baselineOnly) {
                        await page.goto(server.url+'/about.html');
                        assert.equal(await page.locator('meta[name="color-scheme"]').getAttribute('content'),'dark');
                        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark only');
                    }
                    assert.deepEqual(errors,[]);
                    await context.close();
                }
                console.log(`${name}: light/dark preferences, three tabs and painted selected-navigation pixels ${baselineOnly?'captured':'passed'}`);
            } finally {await browser.close();}
        }
        fs.writeFileSync(`.mykep-local/theme${baselineOnly?'-baseline':''}.json`,JSON.stringify(results,null,2));
    } finally {await server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
