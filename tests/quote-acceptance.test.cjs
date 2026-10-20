const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {fullApp}=require('./full-app-fixture.cjs');
const quote={id:'q1',quoteNo:'Q-TEST',lineNo:1,name:'Pendant',qty:10,saleUnit:100,adjustmentPct:-10,includeTierPricing:true,priceTiers:[{qty:50,saleUnit:70},{qty:25,saleUnit:85},{qty:10,saleUnit:100},{qty:100,saleUnit:60}],tierVisibility:{100:false},ops:[{name:'Schuren',mode:'unit',minutes:5,rate:30},{name:'Instellen',mode:'batch',minutes:60,rate:30}]};
function fixture(t,{rpc,flush}={}){
 const dom=new JSDOM('<div id="modalRoot"></div>',{runScripts:'outside-only',url:'https://planner.test/'}),w=dom.window,ctx=dom.getInternalVMContext();t.after(()=>w.close());
 w.state={quotes:[structuredClone(quote)],orders:[],tasks:[]};w.structuredClone=structuredClone;w.showModal=html=>w.document.getElementById('modalRoot').innerHTML=html;w.closeModal=()=>w.document.getElementById('modalRoot').innerHTML='';w.save=()=>{};w.alert=()=>{};
 w.RALAB_PERFORMANCE={flushCloudSave:flush||(()=>Promise.resolve()),invalidate:()=>{}};w.supabaseClient={rpc:rpc||(()=>Promise.reject(Error('test unavailable')))};
 vm.runInContext(fs.readFileSync(require.resolve('../assets/quote-acceptance-v1.js'),'utf8'),ctx);
 const el=s=>w.document.querySelector(s),change=(s,v,type='input')=>{el(s).value=v;el(s).dispatchEvent(new w.Event(type,{bubbles:true}))};
 return{w,el,change,open:()=>w.RALAB_QUOTE_ACCEPT.open('Q-TEST'),wait:()=>new Promise(r=>setTimeout(r,15))};
}
test('staffel selection updates quantity and discounted total without changing original quotation',t=>{
 const f=fixture(t),before=JSON.stringify(f.w.state.quotes);f.open();
 assert.equal(f.el('[data-accept-tier] option[value="100"]'),null);
 f.change('[data-accept-tier]','25','change');assert.equal(f.el('[data-accept-qty]').value,'25');
 assert.match(f.el('[data-accept-total]').textContent,/1.912,50/);assert.equal(f.el('[data-accept-submit]').disabled,false);
 assert.equal(JSON.stringify(f.w.state.quotes),before);
});
test('zero, decimals, negative and oversized quantities are rejected; deviations need agreement and explanation',t=>{
 const f=fixture(t);f.open();for(const v of ['','0','-1','1.5','2147483648']){f.change('[data-accept-qty]',v);assert.equal(f.el('[data-accept-submit]').disabled,true)}
 f.change('[data-accept-qty]','20');assert.equal(f.el('[data-accept-deviation]').hidden,false);
 f.el('[data-accept-confirm]').click();assert.equal(f.el('[data-accept-submit]').disabled,true);
 f.change('[data-accept-reason]','Klantakkoord per e-mail');assert.equal(f.el('[data-accept-submit]').disabled,false);
 f.change('[data-accept-qty]','21');assert.equal(f.el('[data-accept-confirm]').checked,false);assert.equal(f.el('[data-accept-submit]').disabled,true);
});
test('atomic RPC success merges orders/tasks once and leaves all quote fields untouched',async t=>{
 let calls=0,args;const f=fixture(t,{rpc:async(name,p)=>{calls++;args=p;await new Promise(r=>setTimeout(r,3));return{data:{orders:[{id:'o1',sourceQuoteNo:'Q-TEST',sourceQuoteLineId:'q1',qty:25,saleUnit:76.5,totalSale:1912.5}],tasks:[{id:'t1',orderId:'o1',estimate:125}]}}}}),before=JSON.stringify(f.w.state.quotes);
 f.open();f.change('[data-accept-tier]','25','change');f.el('[data-accept-submit]').click();f.el('[data-accept-submit]').click();await f.wait();
 assert.equal(calls,1);assert.equal(args.p_choices[0].qty,25);assert.equal(args.p_choices[0].saleUnit,undefined);
 assert.equal(f.w.state.orders.length,1);assert.equal(f.w.state.tasks[0].estimate,125);assert.equal(JSON.stringify(f.w.state.quotes),before);
});
test('sync and database errors keep dialog open, create nothing locally and permit retry',async t=>{
 let calls=0;const f=fixture(t,{flush:()=>Promise.reject(Error('Synchronisatie mislukt')),rpc:()=>{calls++}});f.open();f.el('[data-accept-submit]').click();await f.wait();
 assert.equal(calls,0);assert.equal(f.w.state.orders.length,0);assert.match(f.el('[data-accept-error]').textContent,/Synchronisatie/);assert.equal(f.el('[data-accept-submit]').disabled,false);
 f.w.RALAB_PERFORMANCE.flushCloudSave=()=>Promise.resolve();f.w.supabaseClient.rpc=async()=>({error:{message:'De offerte is intussen gewijzigd'}});f.el('[data-accept-submit]').click();await f.wait();assert.match(f.el('[data-accept-error]').textContent,/intussen gewijzigd/);assert.equal(f.w.state.orders.length,0);
});
test('multiple products have independent tiers and quantities',t=>{
 const f=fixture(t);f.w.state.quotes.push({...structuredClone(quote),id:'q2',lineNo:2,name:'Base'});f.open();f.change('[data-accept-tier="0"]','25','change');f.change('[data-accept-tier="1"]','50','change');
 assert.equal(f.el('[data-accept-qty="0"]').value,'25');assert.equal(f.el('[data-accept-qty="1"]').value,'50');assert.match(f.el('[data-accept-total]').textContent,/5.062,50/);
});
test('full app Accept → Order opens selection, does not save unsaved quote edits or sort source tiers',async t=>{
 const f=await fullApp(t);vm.runInContext(`state.quotes=${JSON.stringify([quote])};state.orders=[];state.tasks=[]`,f.ctx);const before=JSON.stringify(f.state().quotes);
 f.w.RALAB_DOCS.openQuote('Q-TEST');f.w.document.querySelector('[data-q-qty]').value='999';f.w.document.querySelector('[data-accept-quote]').click();
 assert.ok(f.w.document.querySelector('[data-accept-tier]'));assert.equal(f.w.document.querySelector('[data-accept-qty]').value,'10');assert.equal(JSON.stringify(f.state().quotes),before);assert.equal(f.state().orders.length,0);
});
