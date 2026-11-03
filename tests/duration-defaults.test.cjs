const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const utils=fs.readFileSync('static/js/utils.js','utf8');
function preferences(values={}) {
    const data=new Map(Object.entries(values));
    const context=vm.createContext({Intl,Date,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});
    vm.runInContext(utils,context);
    return {data,run:code=>vm.runInContext(code,context)};
}
test('fresh and invalid duration preferences default to 60/60',()=>{
    for(const value of [undefined,'invalid']) {
        const {run}=preferences(value?{mykep_duration1:value,mykep_duration2:value}:{});
        assert.equal(run('getLessonDuration(1)'),'60');
        assert.equal(run('getLessonDuration(2)'),'60');
    }
});
test('old onboarding defaults migrate once without touching independent user data',()=>{
    const {data,run}=preferences({mykep_duration1:'80',mykep_duration2:'60',mykep_uid:'test-uid',mykep_group:'test-group',mykep_schedule:'saved-cache',mykep_onboarded:'true'});
    assert.equal(run('getLessonDuration(1)'),'60');
    assert.equal(run('getLessonDuration(2)'),'60');
    assert.equal(data.get('mykep_schedule'),'saved-cache');
    assert.equal(data.get('mykep_uid'),'test-uid');
    assert.equal(data.get('mykep_group'),'test-group');
    assert.equal(data.get('mykep_onboarded'),'true');
    run("storage.set('mykep_duration1','80'); migrateDurationDefaults();");
    assert.equal(run('getLessonDuration(1)'),'80');
});
test('other saved duration combinations remain unchanged',()=>{
    for (const [first,second] of [['60','60'],['60','80'],['80','80']]) {
        const {run}=preferences({mykep_duration1:first,mykep_duration2:second});
        assert.equal(run('getLessonDuration(1)'),first);
        assert.equal(run('getLessonDuration(2)'),second);
    }
});
test('unavailable storage does not break duration defaults',()=>{
    const context=vm.createContext({Intl,Date,localStorage:{getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}}});
    vm.runInContext(utils,context);
    assert.equal(vm.runInContext('getLessonDuration(1)',context),'60');
});
