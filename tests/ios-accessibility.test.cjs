/* Historical filename; 2.6.8 explicitly rolls back the 2.6.7 zoom/iOS geometry changes. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function setup({ua='iPhone FxiOS/140',standalone=true,media=false,touch=5,inner=844,visual=710}={}) {
    const classes = new Set(), events = {}, writes=[];
    const context = {
        navigator: {userAgent: ua, standalone, maxTouchPoints: touch},
        document: {documentElement: {
            classList: {toggle(n,on) {on ? classes.add(n) : classes.delete(n);}, contains: n=>classes.has(n)},
            style: {setProperty: (...args)=>writes.push(args)},
        }},
        window: {innerHeight: inner, visualViewport: {height: visual, scale: 1},
            matchMedia: ()=>({matches: media, addEventListener: (n,f)=>events['media-'+n]=f}),
            addEventListener: (n,f)=>events[n]=f},
    };
    vm.createContext(context);vm.runInContext(read('static/js/display-mode.js'), context);
    return {context,classes,events,writes};
}
for(const ua of ['iPhone FxiOS/140','iPhone Version/18 Safari','iPhone CriOS/140','Macintosh Safari']) {
    test('Home Screen keeps iOS classification: '+ua,()=>{
        const s=setup({ua});assert.ok(s.classes.has('ios-standalone'));assert.deepEqual(s.writes,[]);
    });
}
test('display-mode standalone and pageshow update iOS class without measured height',()=>{
    assert.ok(setup({standalone:false,media:true}).classes.has('ios-standalone'));
    const s=setup();s.context.navigator.standalone=false;s.events.pageshow();
    assert.equal(s.classes.size,0);assert.deepEqual(s.writes,[]);
});
test('browser tabs, desktop and Android do not use iOS shell',()=>{
    for(const options of [{standalone:false},{ua:'Android Chrome'},{ua:'Macintosh Safari',touch:0}]) {
        assert.equal(setup(options).classes.size,0);
    }
});
test('iOS nav is anchored to shell bottom, no 2.6.7 visual-height/grid override',()=>{
    const css=read('static/css/ios-standalone.css');
    assert.ok(css.includes('height: 100lvh;'));
    assert.ok(css.includes('position: absolute;'));assert.ok(css.includes('bottom: 0;'));
    assert.ok(css.includes('padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px))'));
    assert.ok(!css.includes('--ios-viewport-height'));assert.ok(!css.includes('display: grid'));
    assert.ok(!read('static/js/display-mode.js').includes("setProperty('--ios-viewport-height'"));
    assert.ok(read('static/css/mobile-fit.css').includes('html:not(.ios-standalone) .app-container'));
});
test('requested gesture/CSS rollback restores the previous zoom restriction',()=>{
    assert.ok(read('static/css/base.css').includes('touch-action: pan-x pan-y;'));
    assert.ok(read('static/js/gesture-guard.js').includes("['gesturestart', 'gesturechange', 'gestureend']"));
});
test('short-screen scroll fallback from 2.6.7 remains available',()=>{
    const main={clientHeight:200,dataset:{},children:[{getBoundingClientRect:()=>({height:500})}]};
    const frames=[];
    const c={window:{addEventListener(){}},document:{getElementById:()=>main,addEventListener(){}},
        requestAnimationFrame:f=>(frames.push(f),frames.length),
        getComputedStyle:()=>({display:'block',marginTop:'0',marginBottom:'0',rowGap:'0',paddingTop:'0',paddingBottom:'0'})};
    vm.runInNewContext(read('static/js/mobile-fit.js'),c);
    c.window.requestDashboardFit();frames.shift()();assert.equal(main.dataset.overflow,'true');
    main.clientHeight=600;c.window.requestDashboardFit();frames.shift()();assert.equal(main.dataset.overflow,'false');
});
