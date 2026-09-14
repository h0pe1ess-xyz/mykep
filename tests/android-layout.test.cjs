const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function setup({ua='Android Chrome',inner=800,visual=760,scale=1,nav=68}={}) {
    const values={},classes=new Set(),events={},frames=[];
    const c={navigator:{userAgent:ua},document:{documentElement:{classList:{add:n=>classes.add(n)},style:{getPropertyValue:n=>values[n]||'',setProperty:(n,v)=>values[n]=v}},querySelector:()=>({getBoundingClientRect:()=>({height:nav})}),addEventListener:(n,f)=>events[n]=f},window:{innerHeight:inner,visualViewport:visual===null?null:{height:visual,scale,addEventListener:(n,f)=>events['visual-'+n]=f},addEventListener:(n,f)=>events[n]=f,requestAnimationFrame:f=>(frames.push(f),frames.length)}};
    vm.createContext(c);vm.runInContext(read('static/js/android-layout.js'),c);
    return {c,values,classes,events,frames};
}
test('Android shell uses visible height without guessing system-bar size',()=>{
    const s=setup();assert.equal(s.values['--android-viewport-height'],'760px');
    assert.equal(s.values['--android-nav-height'],'68px');assert.ok(s.classes.has('android-viewport'));
});
test('layout never exceeds innerHeight when visualViewport is larger',()=>{
    assert.equal(setup({inner:720,visual:780}).values['--android-viewport-height'],'720px');
});
test('older Android without visualViewport uses innerHeight',()=>{
    assert.equal(setup({inner:690,visual:null}).values['--android-viewport-height'],'690px');
});
test('pinch zoom does not shrink layout height',()=>{
    assert.equal(setup({inner:800,visual:400,scale:2}).values['--android-viewport-height'],'800px');
});
test('iPhone and desktop remain entirely untouched',()=>{
    for(const ua of ['iPhone Safari','Macintosh Safari','Windows Chrome']){
        const s=setup({ua});assert.deepEqual(s.values,{});assert.equal(s.classes.size,0);assert.equal(Object.keys(s.events).length,0);
    }
});
test('returning to the app refreshes viewport and reserves measured nav height',()=>{
    const s=setup({nav:78});s.c.window.innerHeight=600;s.c.window.visualViewport.height=590;
    s.events.pageshow();s.events.resize();assert.equal(s.frames.length,1);s.frames[0]();
    assert.equal(s.values['--android-viewport-height'],'590px');assert.equal(s.values['--android-nav-height'],'78px');
});
test('all three pages load Android setup in head and CSS loads last',()=>{
    for(const page of ['index','schedule','settings']){
        const html=read('static/'+page+'.html');assert.ok(html.indexOf('js/android-layout.js')<html.indexOf('</head>'));
    }
    const css=read('static/style.css');assert.ok(css.indexOf('android-layout.css')>css.indexOf('mobile-fit.css'));
    const android=read('static/css/android-layout.css');assert.ok(android.includes('position: absolute'));assert.ok(android.includes('grid-area: auto'));assert.ok(android.includes('padding-bottom: var(--android-nav-height, 68px)'));
});
test('manifest references a new maskable URL while retaining normal icons',()=>{
    const icons=JSON.parse(read('static/manifest.json')).icons;
    assert.equal(icons.find(i=>i.purpose==='maskable').src,'icons/maskable-orange-512.png');
    assert.equal(icons.filter(i=>i.purpose==='any').length,2);
    assert.ok(fs.existsSync(path.join(__dirname,'../static/icons/maskable-orange-512.png')));
});
