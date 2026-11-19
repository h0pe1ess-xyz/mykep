const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/requests.js', 'utf8');

function requests(native) {
    const controllers = [], timers = new Map();
    let timerId = 0;
    const context = vm.createContext({
        AbortController, AbortSignal:native ? {timeout(ms) {
            const controller = new AbortController();
            controllers.push({ms,controller});
            return controller.signal;
        }} : {},
        setTimeout(callback,ms) { const id=++timerId; timers.set(id,{callback,ms}); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    vm.runInContext(source,context);
    return {run:context.withRequestTimeout,controllers,timers};
}

for (const native of [true,false]) {
    test(`request deadline covers a pending response body (${native?'native':'fallback'})`,async()=>{
        const s=requests(native);
        let reading=false;
        const request=s.run(10000,async signal=>{
            const response={json:()=>new Promise((resolve,reject)=>{
                reading=true;
                signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
            })};
            return response.json();
        });
        assert.equal(reading,true);
        if(native) {
            assert.equal(s.controllers[0].ms,10000);
            s.controllers[0].controller.abort(new DOMException('Timeout','TimeoutError'));
        } else {
            assert.equal([...s.timers.values()][0].ms,10000);
            [...s.timers.values()][0].callback();
        }
        await assert.rejects(request,error=>['AbortError','TimeoutError'].includes(error.name));
        assert.equal(s.timers.size,0);
    });
}

test('fallback deadlines are cleared on success and synchronous failure',async()=>{
    const s=requests(false);
    assert.equal(await s.run(1000,async()=>42),42);
    assert.equal(s.timers.size,0);
    await assert.rejects(s.run(1000,()=>{throw new Error('synthetic failure');}),/synthetic failure/);
    assert.equal(s.timers.size,0);
});
