const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/js/pwa.js'), 'utf8');
function setup({secure=true, standalone=false, accepted=false}={}) {
    const events={}, nodes={}, values=new Map(accepted?[['mykep_browser_session','yes']]:[]);
    let overlay=null;
    const element=()=>({hidden:false,textContent:'',isConnected:true,focus(){},scrollIntoView(){},setAttribute(){},addEventListener(){},getClientRects(){return [1];}});
    const app=element();
    const document={referrer:'',activeElement:app,body:{children:[app],appendChild(el){overlay=el;this.children.push(el);}},getElementById(id){return id==='pwa-guide'?overlay:nodes['#'+id]||null;},createElement(){
        const el=element();el.querySelector=selector=>nodes[selector]||(nodes[selector]=element());
        el.querySelectorAll=()=>[];el.remove=()=>{overlay=null;};return el;
    }};
    const context={document,console,URLSearchParams,navigator:{userAgent:'Android Chrome/100 Safari/537.36'},sessionStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},window:{isSecureContext:secure,location:{search:'',hash:'',origin:secure?'https://example.test':'http://172.20.10.3:8000',pathname:'/index.html'},matchMedia:()=>({matches:standalone}),addEventListener:(n,f)=>events[n]=f}};
    vm.createContext(context);vm.runInContext(source,context);
    return {context,events,nodes,values,app,get overlay(){return overlay;}};
}
test('appinstalled does not resolve guide, remove overlay or unlock onboarding',async()=>{
    const s=setup();let resolved=false;s.context.showPWAGuide().then(()=>resolved=true);
    s.events.appinstalled();await Promise.resolve();
    assert.equal(resolved,false);assert.ok(s.overlay);assert.equal(s.app.inert,true);
    assert.equal(s.values.has('mykep_browser_session'),false);
    assert.equal(s.nodes['#pwa-title'].textContent,'MyKep встановлено');
    assert.equal(s.nodes['#pwa-install'].hidden,true);
});
test('only explicit browser confirmation resolves guide and saves tab choice',async()=>{
    const s=setup();const pending=s.context.showPWAGuide();s.events.appinstalled();
    s.nodes['#pwa-browser'].onclick();assert.ok(s.overlay);
    assert.equal(s.values.has('mykep_browser_session'),false);
    s.nodes['#pwa-confirm-browser'].onclick();await pending;
    assert.equal(s.overlay,null);assert.equal(s.app.inert,false);
    assert.equal(s.values.get('mykep_browser_session'),'yes');
});
test('standalone app bypasses browser guide',async()=>{const s=setup({standalone:true});await s.context.showPWAGuide();assert.equal(s.overlay,null);});
test('explicit browser choice survives navigation in this tab',async()=>{const s=setup({accepted:true});await s.context.showPWAGuide();assert.equal(s.overlay,null);});
test('HTTP guide explains shortcut limitation',()=>{const s=setup({secure:false});s.context.showPWAGuide();assert.ok(s.overlay.innerHTML.includes('За цією HTTP-адресою браузер може додати лише ярлик'));});
test('HTTPS guide retains normal install instructions',()=>{const s=setup();s.context.showPWAGuide();assert.ok(!s.overlay.innerHTML.includes('За цією HTTP-адресою'));});
test('install prompt acceptance alone does not dismiss browser guide',async()=>{
    const s=setup();s.context.showPWAGuide();
    s.events.beforeinstallprompt({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'accepted'})});
    assert.equal(s.nodes['#pwa-install'].hidden,false);
    await s.nodes['#pwa-install'].onclick();assert.ok(s.overlay);assert.equal(s.app.inert,true);
});
test('install event received before opening help is displayed without auto continuation',()=>{
    const s=setup();s.events.appinstalled();s.context.showPWAGuide();assert.ok(s.overlay);
    assert.equal(s.nodes['#pwa-title'].textContent,'MyKep встановлено');
});
