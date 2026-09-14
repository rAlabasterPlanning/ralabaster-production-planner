const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require(process.env.PLANNER_JSDOM_PATH||'jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function fullApp(t,{loadBaseLast=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e.message)));vc.on('error',e=>errors.push(String(e)));
 const source=read('index.html');
 const dom=new JSDOM(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://planner.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,ctx=dom.getInternalVMContext(),observers=[];
 const OriginalObserver=w.MutationObserver;w.MutationObserver=class extends OriginalObserver{constructor(fn){super(fn);observers.push(this)}};
 const close=async()=>{observers.forEach(o=>o.disconnect());await new Promise(r=>setImmediate(r));dom.window.close()};t?.after(close);
 w.structuredClone=structuredClone;w.alert=m=>errors.push('ALERT: '+m);w.confirm=()=>true;
 w.fetch=()=>Promise.reject(Error('Network disabled in synthetic app fixture'));
 w.document.elementsFromPoint=()=>[];
 Object.defineProperty(w.navigator,'maxTouchPoints',{value:5});
 const seed=read('tests/editor-fixture.js');
 const seedContext=vm.createContext({localStorage:{getItem:()=>null}});vm.runInContext(seed.split('let state=')[0],seedContext);
 const initial=vm.runInContext('JSON.stringify({...initial,version:11})',seedContext);w.localStorage.setItem('ralabaster_planner_v1',initial);
 const base=Array.from({length:7},(_,i)=>read('assets/app.part0'+(i+1)+'.txt')).join('');
 const run=(code,name)=>{try{vm.runInContext(code,ctx,{filename:name})}catch(e){errors.push(name+': '+e.message)}};
 if(!loadBaseLast)run(base,'base-app');
 for(const m of source.matchAll(/<script src="(assets\/[^?" ]+)(?:[^" ]*)"/g)){
  if(['assets/config.js','assets/admin-auth.js','assets/app-loader.js'].includes(m[1]))continue;
  run(read(m[1]),m[1]);
 }
 if(loadBaseLast)run(base,'base-app');
 const wait=ms=>new Promise(r=>w.setTimeout(r,ms));
 await wait(1400);
 w.RALAB_ERP.show('orders');await wait(100);
 const state=()=>JSON.parse(vm.runInContext('JSON.stringify(state)',ctx));
 return {dom,w,ctx,errors,state,wait,close};
}
module.exports={fullApp};
