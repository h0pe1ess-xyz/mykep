const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const boot=fs.readFileSync('static/js/boot.js','utf8').split('/* Run in <head>')[0];
function mode(saved,unavailable=false){
    const document={documentElement:{dataset:{}}};
    vm.runInNewContext(boot,{document,location:{pathname:'/'},localStorage:{getItem:key=>{
        if(unavailable)throw new Error('Storage unavailable');
        return key==='mykep_swipe_test'?saved:null;
    }}});
    return document.documentElement.dataset;
}
test('fresh, invalid and unavailable storage use original native scrolling',()=>{
    for(const data of [mode(null),mode('unknown'),mode(null,true)]) {
        assert.equal(data.swipe,'native');assert.equal(data.swipeChoice,'native');
    }
});
test('released swipe versions preserve explicit choices',()=>{
    for(const selected of ['baseline','native']) {
        const data=mode(selected);
        assert.equal(data.swipeChoice,selected);
        assert.equal(data.swipe,selected);

    }
});
test('retired experiment preferences fall back to the new version',()=>{
    for(const selected of ['native-controlled','pointer'])assert.equal(mode(selected).swipeChoice,'native');
});
