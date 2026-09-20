const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
function teacherContext() {
    const listeners = {};
    const context = {document: {addEventListener: (name,fn) => {listeners[name]=fn;}}, console};
    vm.createContext(context);
    vm.runInContext(read('static/js/utils.js')+'\n'+read('static/js/teacher-hints.js'),context);
    return context;
}
test('official name key handles spacing, dots and stars',()=>{
    const c=teacherContext(); assert.equal(c.teacherHintKey(' Білан О. Я.* '),'БІЛАНОЯ');
});
test('official latin lookalikes match college normalization',()=>{
    assert.equal(teacherContext().teacherHintKey('Бiлан O.Я.'),'БІЛАНОЯ');
});
test('bundled official record resolves the requested example',()=>{
    const data=JSON.parse(read('static/data/teacher-hints.json'));
    assert.equal(data.teachers[teacherContext().teacherHintKey('Білан О.Я.')],'Білан Ольга Ярославівна');
});
test('unknown names are not expanded heuristically',()=>{
    const data=JSON.parse(read('static/data/teacher-hints.json'));
    assert.equal(data.teachers[teacherContext().teacherHintKey('Невідомий А.Б.')],undefined);
});
test('teacher HTML escapes malicious strings in label and attribute',()=>{
    const s=teacherContext().renderTeacherLabel('\"><img src=x onerror=alert(1)>');
    assert.ok(!s.includes('<img')); assert.ok(s.includes('&lt;img')); assert.ok(s.includes('&quot;'));
});
test('multiple teachers get separate text labels',()=>{
    assert.equal((teacherContext().renderTeacherLabel('Білан О.Я.; Шмідт Л.М.').match(/class="teacher-label"/g)||[]).length,2);
});
test('placeholder is not a misleading teacher button',()=>{
    assert.equal(teacherContext().renderTeacherLabel('---'),'---');
});
for(const density of [0,1,2,3,4]) test(`fit chooses density ${density} with measured heights`,()=>{
    const callbacks=[];
    const main={clientHeight:500,dataset:{},children:[]};
    main.children=[{getBoundingClientRect:()=>({height:Number(main.dataset.density)>=density?450:550})}];
    const context={window:{addEventListener(){}},document:{getElementById:()=>main,addEventListener(){}},requestAnimationFrame:fn=>{callbacks.push(fn);return 1;},getComputedStyle:()=>({display:'block',marginTop:'0',marginBottom:'0',rowGap:'0',paddingTop:'0',paddingBottom:'0'})};
    vm.createContext(context);vm.runInContext(read('static/js/mobile-fit.js'),context);
    context.window.requestDashboardFit(); callbacks.shift()();
    assert.equal(main.dataset.density,String(density));
});
test('fitting coalesces calls into a single animation frame',()=>{
    let frames=0;
    const context={window:{addEventListener(){}},document:{addEventListener(){}},requestAnimationFrame:()=>++frames};
    vm.createContext(context);vm.runInContext(read('static/js/mobile-fit.js'),context);
    context.window.requestDashboardFit();context.window.requestDashboardFit();assert.equal(frames,1);
});
test('cache manifest files all exist and new scripts are precached',()=>{
    const context={self:{addEventListener(){}}};vm.createContext(context);
    vm.runInContext(read('static/sw.js')+'\nthis.shell=APP_SHELL;this.cache=CACHE_NAME;',context);
    for(const url of context.shell) assert.ok(fs.existsSync(path.join(root,'static',url==='/'?'index.html':url.split('?')[0])),url);
    assert.equal(context.cache,'mykep-cache-v2.6.8');
    for(const name of ['teacher-hints.js','mobile-fit.js','mobile-fit.css'])assert.ok(context.shell.some(s=>s.includes(name)));
});
test('all pages load teacher helpers before rendering modules',()=>{
    for(const name of ['index','schedule','settings']){
        const s=read(`static/${name}.html`);
        assert.ok(s.indexOf('js/teacher-hints.js')<s.indexOf('js/dashboard.js'));
        assert.ok(s.includes('viewport-fit=cover'));
    }
});
test('day centering only scrolls the day picker',()=>{
    const s=read('static/js/schedule.js');assert.ok(!s.includes('scrollIntoView'));assert.equal((s.match(/picker.scrollTo/g)||[]).length,2);
});
test('mobile CSS introduces no new safe area values or root fixed positioning',()=>{
    const s=read('static/css/mobile-fit.css');assert.ok(!s.includes('env('));assert.ok(!s.includes('position: fixed'));assert.ok(s.includes('minmax(0, 1fr)'));
});
test('offline notice has its own track, nav is explicitly placed on both layouts',()=>{
    const s=read('static/css/mobile-fit.css');
    assert.ok(s.includes('.app-container > .schedule-notice { grid-area: 2 / 1; }'));
    assert.ok(s.includes('.page-schedule .app-container > .bottom-nav { grid-area: 5 / 1; }'));
});
test('CSS sources contain no mixed-encoding NUL bytes',()=>{
    for(const name of ['static/settings.css', ...fs.readdirSync(path.join(root,'static/css')).map(n=>'static/css/'+n)])
        assert.ok(!fs.readFileSync(path.join(root,name)).includes(0), name);
});
