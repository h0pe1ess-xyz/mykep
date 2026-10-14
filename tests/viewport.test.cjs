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

test('installed iOS caps lvh by layout height and updates on rotation/pageshow',()=>{
    const v=viewport();
    assert.equal(v.styles.get('--ios-layout-height'),'810px');
    v.root.clientHeight=390;v.listeners.resize();
    assert.equal(v.styles.get('--ios-layout-height'),'390px');
    v.root.clientHeight=844;v.listeners.pageshow();
    assert.equal(v.styles.get('--ios-layout-height'),'844px');
    v.navigator.standalone=false;v.listeners.pageshow();
    assert.equal(v.styles.has('--ios-layout-height'),false);
    assert.equal(v.classes.has('ios-standalone'),false);
});

test('keyboard focus cannot collapse iOS shell; zero measurement is ignored',()=>{
    const v=viewport({height:844});
    v.document.activeElement={matches:()=>true};v.root.clientHeight=450;v.listeners.resize();
    assert.equal(v.styles.get('--ios-layout-height'),'844px');
    v.document.activeElement=null;v.root.clientHeight=0;v.listeners.resize();
    assert.equal(v.styles.get('--ios-layout-height'),'844px');
});

test('fullscreen iOS is recognized; browser tabs and Android are unchanged',()=>{
    assert.equal(viewport({standalone:false,fullscreen:true}).classes.has('ios-standalone'),true);
    assert.equal(viewport({standalone:false}).styles.size,0);
    assert.equal(viewport({ua:'Android'}).styles.size,0);
});
