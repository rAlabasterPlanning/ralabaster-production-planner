const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {fullApp}=require('./full-app-fixture.cjs');
function safety(){
 const source=fs.readFileSync(path.join(__dirname,'../assets/performance-v1.js'),'utf8').replace('  let tries=0;', '  window.testSafety={seedHashes,collectChanges,mergeRows,mergeQuoteChanges,preserveMissing,markDeleted,cancelDeletion,loadNormalizedCloud,saveNormalizedCloud};\n  let tries=0;');
 const values=new Map(),ctx=vm.createContext({window:{},state:{orders:[{id:'old',active:true,status:'confirmed'}],tasks:[{id:'task',orderId:'old',status:'open',planSegments:[{date:'2026-10-01',start:'08:15',minutes:30,employee:'Ralph'}]}]},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},KEY:'cache',WORKSPACE_ID:'ralabaster',structuredClone,setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},requestAnimationFrame:fn=>fn(),console,isExternalTask:()=>false,isDryTask:()=>false,renderOnlineBadge:()=>{},cloudUser:{id:'user'},cloudStatus:'online',cloudLoading:false});
 vm.runInContext(source,ctx);ctx.window.testSafety.seedHashes();return ctx;
}
test('a partial local snapshot never becomes a bulk deletion',async()=>{
 const c=safety();c.state={orders:[{id:'new',active:true}],tasks:[]};
 const changes=await c.window.testSafety.collectChanges('2026-09-30T00:00:00Z');
 assert.equal(changes.changedOrders.length,1);assert.equal(changes.changedOrders[0].order_id,'new');assert.equal(changes.changedTasks.length,0);assert.equal(changes.changedOrders.some(x=>x.deleted),false);
});
test('only explicitly registered removals create recoverable deletion records',async()=>{
 const c=safety();c.window.testSafety.markDeleted('orders','old');c.state.orders=[];c.state.tasks=[];
 const changes=await c.window.testSafety.collectChanges('2026-09-30T00:00:00Z');
 assert.equal(changes.changedOrders.length,1);assert.equal(changes.changedTasks.length,1);assert.equal(changes.changedOrders[0].deleted,true);assert.ok(changes.changedOrders[0].data.deletedAt);assert.equal(changes.changedTasks[0].data.planSegments.length,1);
});
test('pending startup merges remote orders with a new local calculation order',async()=>{
 const c=safety(),remoteOrder={id:'remote',active:true},remoteTask={id:'remote-task',orderId:'remote',status:'open'};
 c.state={orders:[{id:'new',active:true}],tasks:[],customers:[{id:'customer'}]};c.localStorage.setItem('ralabaster_planner_pending_v1','pending');
 const rows={planner_shared_state:{data:{data:{normalizedVersion:2,orders:[],tasks:[]},updated_at:'stamp'},error:null},planner_orders_v2:{data:[{data:remoteOrder}],error:null},planner_tasks_v2:{data:[{data:remoteTask}],error:null}};
 c.supabaseClient={from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>Promise.resolve(rows[table]),maybeSingle:()=>Promise.resolve(rows[table])};return q}};
 assert.equal(await c.window.testSafety.loadNormalizedCloud(),true);assert.deepEqual(Array.from(c.state.orders,x=>x.id),['remote','new']);assert.equal(c.state.tasks[0].id,'remote-task');
 assert.equal((await c.window.testSafety.collectChanges('now')).changedOrders.some(x=>x.deleted),false);
});
test('pending order changes do not discard cloud quotations on startup',async()=>{
 const c=safety();c.state.quotes=[];c.localStorage.setItem('ralabaster_planner_pending_v1','pending');
 const quotes=[{id:'quote',quoteNo:'20260910-1',name:'Existing quotation'}];
 const rows={planner_shared_state:{data:{data:{normalizedVersion:2,quotes},updated_at:'stamp'},error:null},planner_orders_v2:{data:[],error:null},planner_tasks_v2:{data:[],error:null}};
 c.supabaseClient={from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>Promise.resolve(rows[table]),maybeSingle:()=>Promise.resolve(rows[table])};return q}};
 assert.equal(await c.window.testSafety.loadNormalizedCloud(),true);
 assert.equal(c.state.quotes.length,1);assert.equal(c.state.quotes[0].id,'quote');
 // After initialization a deliberate local removal remains authoritative.
 c.state.quotes=[];await c.window.testSafety.loadNormalizedCloud();assert.equal(c.state.quotes.length,0);
});
test('a stale quote list preserves remote additions, edits and deletions',()=>{
 const c=safety(),before=[{id:'a',name:'old'},{id:'deleted-remotely'},{id:'removed-locally'}];
 const remote=[{id:'a',name:'updated remotely'},{id:'new-remote'},{id:'removed-locally'}];
 const local=[{id:'a',name:'old'},{id:'deleted-remotely'},{id:'new-local'}];
 const result=c.window.testSafety.mergeQuoteChanges(remote,local,before);
 assert.deepEqual(Array.from(result,q=>q.id),['a','new-remote','new-local']);assert.equal(result[0].name,'updated remotely');
});
test('local quotation edits and status updates are retained',()=>{
 const c=safety(),before=[{id:'a',status:'concept',qty:10}],local=[{id:'a',status:'accepted',qty:20}];
 assert.equal(c.window.testSafety.mergeQuoteChanges(before,local,before)[0].status,'accepted');
 assert.equal(c.window.testSafety.mergeQuoteChanges(before,local,before)[0].qty,20);
});
test('an open quotation inbox refreshes after cloud loading and keeps filters',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 w.RALAB_ERP.show('quotes');await f.wait(50);
 const search=d.getElementById('quoteSearch');search.value='20260910';search.dispatchEvent(new w.Event('input',{bubbles:true}));
 vm.runInContext("state.quotes=[{id:'q1',quoteNo:'20260910-1',name:'Existing quotation',qty:100,saleUnit:25,status:'concept'},{id:'q2',quoteNo:'20260910-21',name:'Accepted quotation',qty:10,saleUnit:149.29,status:'accepted'}]",f.ctx);
 w.dispatchEvent(new w.Event('ralabaster:state-loaded'));await f.wait(30);
 assert.equal(d.querySelectorAll('[data-open-quote-row]').length,2);
 assert.equal(d.getElementById('quoteSearch').value,'20260910');
 d.getElementById('quoteStatusFilter').value='accepted';d.getElementById('quoteStatusFilter').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(d.querySelectorAll('[data-open-quote-row]').length,1);assert.match(d.getElementById('quoteInboxBody').textContent,/20260910-21/);
 assert.deepEqual(f.errors,[]);
});
test('quick order supports free text, sorts first, persists and links later',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.alert=()=>{};
 w.RALAB_ERP.show('orderoverview');await f.wait(60);const before=f.state();
 d.querySelector('[data-quick-order]').click();await f.wait(20);
 d.getElementById('quickCustomer').value='Nieuwe klant uit mijn hoofd';d.getElementById('quickProduct').value='Nieuwe lamp';d.getElementById('quickNote').value='Eerst tekening bekijken';
 d.getElementById('quickOrderForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await f.wait(120);
 const added=f.state().orders.find(o=>o.needsCalculation);assert.ok(added);assert.equal(added.customerId,'');assert.equal(added.customerName,'Nieuwe klant uit mijn hoofd');assert.equal(added.quantityPending,true);assert.equal(f.state().tasks.length,before.tasks.length);assert.equal(d.querySelector('[data-overview-order]').dataset.overviewOrder,added.id);assert.match(d.querySelector('[data-overview-order]').textContent,/Nog calculeren \/ aanvullen/);
 assert.ok(JSON.parse(w.localStorage.getItem('ralabaster_planner_v1')).orders.find(o=>o.id===added.id));
 assert.equal(w.RALAB_ORDER_CONTROLS.remainingOrders().some(o=>o.id===added.id),false);
 vm.runInContext("state.customers.push({id:'complete-customer',name:'Volledige klant'});",f.ctx);
 w.RALAB_ORDER_CALC.open(added.id);await f.wait(100);
 assert.match(d.querySelector('#ocCustomer').textContent,/Nieuwe klant uit mijn hoofd/);
 d.getElementById('ocCustomer').value='complete-customer';d.querySelector('[data-oc-add]').click();await f.wait(20);
 const name=d.querySelector('[data-oc-name]');name.value='Polijsten';name.dispatchEvent(new w.Event('change',{bubbles:true}));d.getElementById('ocQty').value='12';w.RALAB_ORDER_CALC.save(false,false);await f.wait(50);
 const complete=f.state().orders.find(o=>o.id===added.id);assert.equal(complete.customerId,'complete-customer');assert.equal(complete.customerName,'Volledige klant');assert.equal(complete.needsCalculation,false);assert.equal(complete.qty,12);assert.equal(f.state().orders.length,before.orders.length+1);assert.deepEqual(f.errors,[]);
});
test('quick order matches an existing customer without creating duplicates',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;w.alert=()=>{};vm.runInContext("state.customers.push({id:'existing',name:'Ztahl'});",f.ctx);const count=f.state().customers.length;
 w.RALAB_ERP.show('orderoverview');await f.wait(40);d.querySelector('[data-quick-order]').click();d.getElementById('quickCustomer').value=' ztahl ';d.getElementById('quickProduct').value='Lamp';d.getElementById('quickOrderForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await f.wait(70);
 assert.equal(f.state().orders.find(o=>o.needsCalculation).customerId,'existing');assert.equal(f.state().customers.length,count);
});
test('customer mode persists locally, protects details and keeps sale prices and quick orders',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 const style=d.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../assets/customer-mode.css'),'utf8');d.head.append(style);
 assert.equal(d.querySelector('header #customerModeToggle'),null);vm.runInContext('switchView("settings")',f.ctx);await f.wait(30);
 const before=JSON.stringify(f.state());d.getElementById('customerModeToggle').click();assert.equal(w.getComputedStyle(d.querySelector('[data-customer-mode-settings]')).display,'block');assert.equal(w.getComputedStyle(d.querySelector('#view-settings > .toolbar')).display,'none');d.getElementById('customerModeToggle').click();assert.equal(w.RALAB_CUSTOMER_MODE.active(),false);d.getElementById('customerModeToggle').click();
 assert.equal(w.RALAB_CUSTOMER_MODE.active(),true);assert.equal(w.localStorage.getItem('ralabaster_customer_mode_v1'),'on');assert.equal(d.getElementById('customerModeToggle').getAttribute('aria-pressed'),'true');assert.equal(JSON.stringify(f.state()),before);
 w.RALAB_ERP.show('dashboard');await f.wait(30);const card=d.querySelector('#view-dashboard > *');assert.equal(w.getComputedStyle(card).display,'none');
 await w.RALAB_ERP.openOrder(f.state().orders[0].id);await f.wait(30);
 assert.ok(d.querySelector('[data-customer-safe-modal]'));assert.equal(w.getComputedStyle(d.querySelector('[data-internal-finance]')).display,'none');assert.match(d.querySelector('.modalbody').textContent,/Verkoop\/st/);
 vm.runInContext("showModal('<div class=modalbody><div>Kostprijs: € 123</div></div>')",f.ctx);assert.equal(w.getComputedStyle(d.querySelector('.modalbody > div')).display,'none');assert.equal(w.getComputedStyle(d.querySelector('.customer-mode-close')).display,'block');d.querySelector('.customer-mode-close').click();
 w.RALAB_ERP.show('orderoverview');await f.wait(30);d.querySelector('[data-quick-order]').click();assert.ok(d.querySelector('#quickOrderForm[data-customer-safe-modal]'));
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/customer-mode.js'),'utf8'),f.ctx);assert.equal(w.RALAB_CUSTOMER_MODE.active(),true);
 w.RALAB_CUSTOMER_MODE.set(false);assert.equal(w.getComputedStyle(d.querySelector('#view-dashboard > *')).display==='none',false);assert.deepEqual(f.errors,[]);
});

test('settings are excluded from the generic blocked screen selector',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../assets/customer-mode.css'),'utf8');
 for(const selector of css.match(/html\[data-customer-mode="on"\] main > section[^\{]+/g)||[])assert.match(selector,/:not\(#view-settings\)/);
 assert.match(css,/#view-settings > :not\(\[data-customer-mode-settings\]\)/);
});

