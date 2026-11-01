const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {startFixtureServer}=require('./fixture-server.cjs');
const names=['schedule','dashboard','settings'];
(async()=>{const server=await startFixtureServer(),browser=await chromium.launch();fs.mkdirSync('.mykep-local/android-native',{recursive:true});try{
for(const width of [360,393,440]) {
 const context=await browser.newContext({viewport:{width,height:851},hasTouch:true,isMobile:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'});
 await context.addInitScript(()=>{localStorage.setItem('mykep_onboarded','true');localStorage.setItem('mykep_group','ПІ-24-02');sessionStorage.setItem('mykep_browser_session','yes');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(server.url+'/schedule.html');await page.waitForFunction(()=>typeof schedulePageData!=='undefined'&&schedulePageData);
 const cdp=await context.newCDPSession(page);if(process.env.ANDROID_CPU)await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.ANDROID_CPU)});
 await page.evaluate(()=>{const n=document.querySelector('.views-track'),scroll=n.scrollTo.bind(n);window.androidProbe={writes:[],snaps:[],frames:[],events:[],touching:false,stableFrames:0,lastLeft:NaN};window.addEventListener("touchstart",e=>{androidProbe.touching=e.touches.length>0;},{capture:true,passive:true});for(const kind of ["touchend","touchcancel"])window.addEventListener(kind,e=>{androidProbe.touching=e.touches.length>0;},{capture:true,passive:true});for(const kind of ["resize","blur","pagehide","pageshow","visibilitychange"])window.addEventListener(kind,e=>androidProbe.events.push({kind:e.type,t:performance.now(),scale:visualViewport.scale,width:innerWidth,height:innerHeight}));n.scrollTo=options=>{androidProbe.writes.push({...options,from:n.scrollLeft,width:n.clientWidth,touching:androidProbe.touching,stableFrames:androidProbe.stableFrames});return scroll(options);};new MutationObserver(()=>{if(n.style.scrollSnapType==='none')androidProbe.snaps.push(n.scrollLeft);}).observe(n,{attributes:true,attributeFilter:['style']});requestAnimationFrame(function sample(t){androidProbe.stableFrames=Math.abs(n.scrollLeft-androidProbe.lastLeft)<.1?androidProbe.stableFrames+1:0;androidProbe.lastLeft=n.scrollLeft;androidProbe.frames.push({t,left:n.scrollLeft});requestAnimationFrame(sample);});});
 async function aligned(){try{await page.waitForFunction(()=>{const n=document.querySelector('.views-track'),index=['schedule','dashboard','settings'].indexOf(Tabs.current);return Math.abs(n.scrollLeft-index*n.clientWidth)<1&&getComputedStyle(n).scrollSnapType==='x mandatory';},null,{timeout:3000});}catch(e){console.log('MISALIGNED',await page.evaluate(()=>({diag:Tabs.diagnostics(),left:document.querySelector('.views-track').scrollLeft,width:document.querySelector('.views-track').clientWidth,writes:androidProbe.writes,frames:androidProbe.frames.slice(-4)})));throw e;}}
 async function prepare(tab){await page.evaluate(tab=>Tabs.show(tab,{immediate:true}),tab);await aligned();await page.waitForTimeout(250);await page.evaluate(()=>{androidProbe.writes=[];androidProbe.snaps=[];androidProbe.frames=[];});}
 async function drag(dx,dy=0,y=430,steps=3,cancel=false){const x=dx<0?width-40:40;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/steps,y:y+dy*i/steps}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
 for(const count of [2,6,12])for(const distance of [100,Math.round(width*.62)]) {
  await prepare('schedule');
  for(let i=0;i<count;i++)await drag((i%4<2?-1:1)*distance);
  await aligned();await page.waitForTimeout(350);
  const result=await page.evaluate(()=>({writes:androidProbe.writes,snaps:androidProbe.snaps,frames:androidProbe.frames,events:androidProbe.events}));
  assert.equal(result.snaps.length,0,'Android native snap was disabled during a rapid chain');
  assert.ok(result.writes.length<=1,'script repeatedly restarted Android completion: '+JSON.stringify(result.writes));
  for(const write of result.writes) {
   assert.equal(write.touching,false,'script competed with a held native pan');
   assert.ok(write.stableFrames>=2,'script interrupted moving native momentum: '+JSON.stringify(write));
   assert.equal(write.left,Math.round(write.from/write.width)*write.width,'idle repair used a stale destination');
   assert.equal(write.behavior,'smooth','idle repair jumped instantly');
  }
  assert.ok(new Set(result.frames.map(f=>Math.round(f.left))).size>3,'burst did not render intermediate positions');
 }
 // Long deliberate gestures must actually reach every neighbour in both directions
 await prepare('schedule');
 for(const target of ['dashboard','settings','dashboard','schedule']) {
  const index=await page.evaluate(()=>['schedule','dashboard','settings'].indexOf(Tabs.current));
  await drag((names.indexOf(target)>index?-1:1)*Math.round(width*.7),0,50,6);
  await page.waitForFunction(target=>Tabs.current===target,target,{timeout:3000});await aligned();
 }
 await prepare('dashboard');await drag(-70,0,50,3,true);await aligned();
 // A redundant viewport event during a held pan must not jump to current
 await prepare('dashboard');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width-40,y:50}]});
 for(let step=1;step<=4;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width-40-width*.3*step/4,y:50}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 const resizeProbe=await page.evaluate(()=>{const n=document.querySelector('.views-track'),before=n.scrollLeft;window.dispatchEvent(new Event('resize'));return {before,after:n.scrollLeft,width:n.clientWidth};});
 assert.ok(Math.abs(resizeProbe.before-resizeProbe.width)>10,'resize probe did not hold a partial pan');
 assert.ok(Math.abs(resizeProbe.after-resizeProbe.before)<1,'redundant Android resize rewound a held pan');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await aligned();
 await page.setViewportSize({width:width+20,height:851});await aligned();
 await page.setViewportSize({width,height:851});await aligned();
 // Nested day scrolling remains independent of tab panning
 await prepare('schedule');
 const picker=await page.locator('.day-picker').boundingBox();
 await drag(-100,0,picker.y+picker.height/2,8);await page.waitForTimeout(400);await aligned();
 assert.equal(await page.evaluate(()=>Tabs.current),'schedule');
 await page.locator('[data-tab="settings"]').click();await page.waitForFunction(()=>Tabs.current==='settings');await aligned();
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-tab="dashboard"]').click();await page.waitForFunction(()=>Tabs.current==='dashboard');await aligned();
 assert.deepEqual(errors,[]);
 await page.screenshot({path:`.mykep-local/android-native/${width}.png`});
 console.log(`Android ${width}px: 6 rapid bursts (2/6/12 contacts), no competing snap/scroll writes, all neighbours, cancellation, nested days, nav buttons and reduced motion passed`);
 await context.close();
}
}finally{await browser.close();await server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
