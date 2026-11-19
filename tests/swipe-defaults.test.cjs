const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const boot=fs.readFileSync('static/js/boot.js','utf8').split('/* Run in <head>')[0];
function mode(saved,unavailable=false){
    const document={documentElement:{dataset:{}}};
    const values=new Map([['mykep_swipe_test',saved],['mykep_swipe_blur','off'],['mykep_group','ПІ-24-02'],['mykep_uid','existing-user'],['mykep_duration1','80']]);
    vm.runInNewContext(boot,{document,location:{pathname:'/'},localStorage:{removeItem:key=>{
        if(unavailable)throw new Error('Storage unavailable');
        values.delete(key);
    }}});
    return {data:document.documentElement.dataset,values};
}
test('fresh and unavailable storage always use native scrolling',()=>{
    for(const {data} of [mode(null),mode(null,true)]) {
        assert.equal(data.swipe,'native');
        assert.equal(data.swipeChoice,undefined);
        assert.equal(data.swipeBlur,undefined);
    }
});
test('retired preferences cannot reactivate old scrolling or blur modes',()=>{
    for(const selected of ['baseline','native','native-controlled','pointer','unknown']) {
        const {data,values}=mode(selected);
        assert.equal(data.swipe,'native');
        assert.equal(values.has('mykep_swipe_test'),false);
        assert.equal(values.has('mykep_swipe_blur'),false);
    }
});
test('retiring carousel preferences preserves unrelated user settings',()=>{
    const {values}=mode('baseline');
    assert.deepEqual([...values],[['mykep_group','ПІ-24-02'],['mykep_uid','existing-user'],['mykep_duration1','80']]);
});
