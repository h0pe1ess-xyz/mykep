const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');

function viewport({ua='iPhone',standalone=true,fullscreen=false,height=810}={}) {
    const classes=new Set(),styles=new Map(),listeners={};
    const root={dataset:{},clientHeight:height,classList:{
        toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
        style:{getPropertyValue:name=>styles.get(name)||'',setProperty:(name,value)=>styles.set(name,value),removeProperty:name=>styles.delete(name)}};
    const document={documentElement:root,activeElement:null,addEventListener:(name,fn)=>listeners[name]=fn};
    const navigator={userAgent:ua,standalone,maxTouchPoints:5};
    const window={matchMedia:query=>({matches:fullscreen&&query.includes('fullscreen'),addEventListener(){}}),addEventListener:(name,fn)=>listeners[name]=fn};
    vm.runInNewContext(fs.readFileSync('static/js/boot.js','utf8').split('/* Optional local diagnosis')[0],{document,navigator,window,location:{pathname:'/'}});
    return {root,styles,classes,listeners,document,navigator};
}

test('installed iOS selects its shell and pageshow updates the display mode',()=>{
    const v=viewport();
    assert.equal(v.classes.has('ios-standalone'),true);
    v.navigator.standalone=false;v.listeners.pageshow();
    assert.equal(v.classes.has('ios-standalone'),false);
});

test('iPad desktop user agent with touch selects the installed iOS shell',()=>{
    assert.equal(viewport({ua:'Macintosh'}).classes.has('ios-standalone'),true);
});

test('fullscreen iOS is recognized; browser tabs and Android are unchanged',()=>{
    assert.equal(viewport({standalone:false,fullscreen:true}).classes.has('ios-standalone'),true);
    assert.equal(viewport({standalone:false}).styles.size,0);
    assert.equal(viewport({ua:'Android'}).styles.size,0);
});
