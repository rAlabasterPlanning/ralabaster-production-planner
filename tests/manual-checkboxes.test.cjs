const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture(file,rpc){
 const listeners={},alerts=[],elements={};
 for(const id of ['view-quotes','quoteInboxBody','quotePeriodCount','quotePeriodValue','quotePeriodLabel','quoteMarginKpi','quotePeriodMargin','quotePeriodMarginPct','quoteSearch','quoteStatusFilter','quotePeriodFilter','quoteSentFilter','quoteMarginToggle'])elements[id]={innerHTML:'',value:id.includes('Filter')?'all':'',style:{},checked:false,addEventListener(){}};
 const ctx={console,Intl,Date,Map,Set,JSON,Number,String,Array,Object,structuredClone,setTimeout(){},clearTimeout(){},alert:m=>alerts.push(m),state:{orders:[],customers:[],quotes:[],tasks:[]},window:{addEventListener(){},RALAB_ADMIN_AUTH:{client:{rpc}},RALAB_PERFORMANCE:{invalidate(){}}},document:{getElementById:id=>elements[id]||null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn)}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),ctx);
 return {ctx,listeners,alerts,elements};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('portal request placeholders have no misleading quote visibility checkbox',async()=>{
 const calls=[];const f=fixture('quote-overview-v5.js',async(...args)=>{calls.push(args);return {}});
 f.ctx.state.quotes=[{id:'request',customerId:'nila',quoteNo:'AAN-request',sourceRequest:'portal:request',status:'concept',total:0},{id:'quote',customerId:'nila',quoteNo:'20261111-1',status:'concept',total:100}];
 f.ctx.window.RALAB_QUOTE_INBOX.render();
 const html=f.elements.quoteInboxBody.innerHTML;
 assert.match(html,/Aanvraag – nog geen offerte/);
 assert.doesNotMatch(html,/data-quote-portal-visible="AAN-request"/);
 assert.match(html,/data-quote-portal-visible="20261111-1"/);
 const input={dataset:{quotePortalVisible:'AAN-request',customerId:'nila'},checked:false,closest:selector=>selector==='[data-quote-portal-visible]'?input:null};
 for(const listener of f.listeners.change)listener({target:input,stopPropagation(){}});await tick();
 assert.equal(calls.length,0);assert.equal(f.ctx.state.quotes[0].portalVisible,undefined);
});
test('quote checkbox is customer scoped, updates every line, keeps statuses and rolls back failed saves',async()=>{
 let fail=false;const calls=[];
 const f=fixture('quote-overview-v5.js',async(name,args)=>{calls.push({name,args});return fail?{error:{message:'offline'}}:{data:{customerId:args.p_customer_id,quoteNo:args.p_quote_no,visible:args.p_visible}}});
 f.ctx.state.quotes=[{id:'a1',customerId:'a',quoteNo:'123',status:'concept',lineNo:1},{id:'a2',customerId:'a',quoteNo:'123',status:'concept',lineNo:2},{id:'b1',customerId:'b',quoteNo:'123',status:'accepted',lineNo:1}];
 f.ctx.window.RALAB_QUOTE_INBOX.render();
 assert.equal((f.elements.quoteInboxBody.innerHTML.match(/data-quote-portal-visible=/g)||[]).length,2);
 const input={dataset:{quotePortalVisible:'123',customerId:'a'},checked:false,disabled:false,closest:selector=>selector==='[data-quote-portal-visible]'?input:null};
 for(const listener of f.listeners.change)listener({target:input,stopPropagation(){}});await tick();
 assert.equal(calls[0].name,'portal_set_quote_visibility');assert.equal(calls[0].args.p_customer_id,'a');
 assert.equal(f.ctx.state.quotes[0].portalVisible,false);assert.equal(f.ctx.state.quotes[1].portalVisible,false);assert.equal(f.ctx.state.quotes[2].portalVisible,undefined);
 assert.deepEqual(f.ctx.state.quotes.map(q=>q.status),['concept','concept','accepted']);
 fail=true;input.checked=true;
 for(const listener of f.listeners.change)listener({target:input,stopPropagation(){}});await tick();
 assert.equal(input.checked,false);assert.equal(input.disabled,false);assert.equal(f.ctx.state.quotes[0].portalVisible,false);assert.equal(f.alerts.length,1);
});
test('invoice checkbox saves only bookkeeping, handles archived orders and reverses failed updates',async()=>{
 let fail=false;const calls=[];
 const f=fixture('completed-order-actions-v1.js',async(name,args)=>{calls.push({name,args});return fail?{error:{message:'offline'}}:{data:{id:args.p_order_id,invoiceSent:args.p_sent,invoiceSentAt:args.p_sent?'2026-11-11T16:00:00Z':null,invoiceStatusUpdatedAt:'2026-11-11T16:00:00Z'}}});
 const api=f.ctx.window.RALAB_COMPLETED_ORDER_ACTIONS;
 const order={id:'o1',status:'completed',active:false,qty:10};f.ctx.state.orders=[order];
 assert.match(api.invoiceCheckbox(order),/Factuur verstuurd\?/);
 const input={dataset:{invoiceSent:'o1'},checked:true,disabled:false};
 await api.setInvoiceSent(input);assert.equal(order.invoiceSent,true);assert.equal(order.status,'completed');assert.equal(order.qty,10);assert.equal(calls[0].name,'planner_set_invoice_sent');
 input.checked=false;await api.setInvoiceSent(input);assert.equal(order.invoiceSent,false);assert.equal(order.invoiceSentAt,null);
 fail=true;input.checked=true;await api.setInvoiceSent(input);assert.equal(input.checked,false);assert.equal(order.invoiceSent,false);assert.equal(input.disabled,false);
 // Archived orders need not be loaded into the active in-memory order list.
 fail=false;input.dataset.invoiceSent='archived';input.checked=true;await api.setInvoiceSent(input);assert.equal(input.disabled,false);assert.equal(calls.at(-1).args.p_order_id,'archived');
});
