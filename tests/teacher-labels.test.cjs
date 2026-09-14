const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(fetcher){
    const events={};let fits=0;
    const nodes=[{dataset:{teacher:'Білан О.Я.'},textContent:'Білан О.Я.'},{dataset:{teacher:'Невідомий А.Б.'},textContent:'Невідомий А.Б.'}];
    const c={console,AbortController,setTimeout:()=>1,clearTimeout(){},fetch:fetcher,
        window:{requestDashboardFit(){fits++;}},
        document:{addEventListener:(n,f)=>events[n]=f,getElementById:()=>({}),querySelectorAll:()=>nodes}};
    vm.createContext(c);vm.runInContext(read('static/js/utils.js')+'\n'+read('static/js/teacher-hints.js'),c);
    return {c,events,nodes,get fits(){return fits;}};
}
const data=JSON.parse(read('static/data/teacher-hints.json'));
test('known teachers automatically expand both existing and later-rendered labels',async()=>{
    const s=setup(async()=>({ok:true,json:async()=>data}));
    assert.ok(s.c.renderTeacherLabel('Білан О.Я.').includes('>Білан О.Я.</span>'));
    s.events.DOMContentLoaded();await flush();
    assert.equal(s.nodes[0].textContent,'Білан Ольга Ярославівна');
    assert.equal(s.nodes[1].textContent,'Невідомий А.Б.');
    const html=s.c.renderTeacherLabel('Білан О.Я.');
    assert.ok(html.includes('>Білан Ольга Ярославівна</span>'));
    assert.ok(!html.includes('<button'));assert.ok(!html.includes('aria-haspopup'));
    assert.ok(s.fits>0);
});
test('unavailable directory leaves the original initials without warnings',async()=>{
    const s=setup(async()=>{throw Error('offline');});s.events.DOMContentLoaded();await flush();
    assert.equal(s.nodes[0].textContent,'Білан О.Я.');
    assert.ok(s.c.renderTeacherLabel('Невідомий А.Б.').includes('>Невідомий А.Б.</span>'));
});
test('bundled dictionary works when API is unavailable',async()=>{
    const s=setup(async url=>url.startsWith('/api/')?{ok:false}:{ok:true,json:async()=>data});
    s.events.DOMContentLoaded();await flush();
    assert.equal(s.nodes[0].textContent,'Білан Ольга Ярославівна');
});
test('late older dictionary cannot replace newer API names',async()=>{
    let release;
    const s=setup(url=>url.startsWith('/api/')?Promise.resolve({ok:true,json:async()=>({updated_at:200,teachers:{БІЛАНОЯ:'Оновлене повне ім’я'}})}):new Promise(r=>release=r));
    s.events.DOMContentLoaded();await flush();
    release({ok:true,json:async()=>({...data,updated_at:100})});await flush();
    assert.equal(s.nodes[0].textContent,'Оновлене повне ім’я');
});
test('full names from the directory are escaped in generated HTML',async()=>{
    const s=setup(async()=>({ok:true,json:async()=>({updated_at:100,teachers:{БІЛАНОЯ:'<img src=x onerror=alert(1)>'}})}));
    s.events.DOMContentLoaded();await flush();
    const html=s.c.renderTeacherLabel('Білан О.Я.');
    assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
    assert.equal(s.nodes[0].textContent,'<img src=x onerror=alert(1)>');
});
