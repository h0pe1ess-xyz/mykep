const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function gestures(scale = 1) {
    const source = fs.readFileSync('static/js/boot.js','utf8');
    const listeners = new Map();
    const body = {}, target = {parentElement:body, closest:()=>null};
    vm.runInNewContext(source.slice(source.indexOf('/* App gestures:'),source.indexOf('/* Fit contents')), {
        navigator:{userAgent:'iPhone'}, window:{visualViewport:{scale},addEventListener(){}},
        document:{body,documentElement:{clientWidth:390,dataset:{swipe:'baseline'}},addEventListener:(name,callback)=>listeners.set(name,callback)},
        getComputedStyle:()=>({overflowX:'hidden',overflowY:'hidden',overscrollBehaviorX:'none',overscrollBehaviorY:'none'})
    });
    function fire(name,touches) {
        const event = {target,touches,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
        listeners.get(name)?.(event);
        return event;
    }
    return {fire,listeners};
}
const touch = (id,x,y) => ({identifier:id,clientX:x,clientY:y});

test('multitouch remains browser-owned and has no global gesture cancellation',()=>{
    const s=gestures();
    assert.equal(s.fire('touchstart',[touch(1,100,200),touch(2,200,200)]).defaultPrevented,false);
    assert.equal(s.fire('touchmove',[touch(1,90,200),touch(2,210,200)]).defaultPrevented,false);
    for(const name of ['gesturestart','gesturechange','gestureend']) assert.equal(s.listeners.has(name),false);
});

test('a zoomed page can pan while single-finger overscroll is still contained at normal scale',()=>{
    for(const scale of [1,2]) {
        const s=gestures(scale);
        s.fire('touchstart',[touch(1,100,200)]);
        assert.equal(s.fire('touchmove',[touch(1,100,230)]).defaultPrevented,scale===1);
    }
});
