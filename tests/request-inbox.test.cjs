const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

test('submitted web orders appear in the same inbox, badge and order filter without becoming quotation placeholders',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 const web={id:'4cee5978-eac0-4f79-a58a-7feb3b6cf25f',order_no:'WEB-20261112-4CEE59',customer_id:'nila',status:'submitted',source_order_id:null,internal_order_ids:[],created_at:'2026-11-12T07:55:29Z',customer_reference:'Lightboxx',requested_delivery_date:'2026-11-17',portal_order_lines:[{id:'line',description:'Ringen set',quantity:1,unit:'stuks',unit_price:4600,line_total:4600}]};
 const tables={portal_product_requests:[],acquisition_requests:[],planner_request_reviews:[],portal_customers:[{customer_id:'nila',company_name:'NILA Poetry of Light'}],portal_orders:[web,{...web,id:'processed',order_no:'WEB-PROCESSED',status:'processing',internal_order_ids:['existing-order']},{...web,id:'projection',order_no:'REGULAR-ORDER',source_order_id:'regular-order'}]};
 const writes=[];w.RALAB_ADMIN_AUTH={client:{from(table){const q={select(){return q},order(){return q},eq(){return q},range(){return Promise.resolve({data:tables[table]})},upsert(value){writes.push(value);return {error:null}}};return q},rpc:async()=>({data:1})}};
 d.querySelector('[data-view="requests"]').click();await f.wait(80);
 assert.match(d.querySelector('[data-request-count]').textContent,/1/);assert.match(d.getElementById('view-requests').textContent,/WEB-20261112-4CEE59/);assert.match(d.getElementById('view-requests').textContent,/Lightboxx/);assert.doesNotMatch(d.getElementById('view-requests').textContent,/REGULAR-ORDER|WEB-PROCESSED/);
 d.querySelector('[data-inbox-filter="quote"]').click();assert.equal(d.querySelectorAll('[data-inbox-open]').length,0);
 d.querySelector('[data-inbox-filter="order"]').click();assert.equal(d.querySelectorAll('[data-inbox-open]').length,2);
 d.querySelector('[data-inbox-open="web_order:'+web.id+'"]').click();assert.ok(d.querySelector('[data-inbox-web-order]'));assert.equal(d.querySelector('[data-inbox-form]'),null);assert.match(d.querySelector('[data-inbox-web-order]').textContent,/4.600,00/);assert.match(d.querySelector('[data-inbox-web-order]').textContent,/2026-11-17/);
 let opened;w.RALAB_PORTAL_ADMIN.openOrder=async id=>{opened=id;};d.querySelector('[data-inbox-process-web]').click();await f.wait(30);assert.equal(opened,web.id);assert.equal(writes.length,0);assert.equal(f.state().quotes.filter(q=>q.sourceRequest==='web_order:'+web.id).length,0);
 d.querySelector('[data-inbox-filter="all"]').click();assert.equal(d.querySelectorAll('[data-inbox-open]').length,2);
});

test('opening a web order selects the correct customer and reveals the exact order beyond the first hundred rows',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,target={id:'older-web-order',order_no:'WEB-OLDER',customer_id:'nila',status:'submitted',created_at:'2026-10-16T10:00:00Z',portal_order_lines:[{description:'Ringen set',quantity:1}]};
 const tables={portal_customers:[{customer_id:'other',company_name:'Other customer'},{customer_id:'nila',company_name:'NILA'}],portal_products:[],portal_customer_users:[],portal_product_requests:[],portal_order_change_requests:[],planner_orders_v2:[],portal_orders:[...Array.from({length:105},(_,i)=>({...target,id:'web-'+i,order_no:'WEB-'+i,customer_id:'other'})),target]};
 w.RALAB_PORTAL_ACTIVITY_ADMIN={mount(){}};
 w.RALAB_ADMIN_AUTH={client:{from(table){const q={select(){return q},order(){return q},eq(){return q},limit(){return q},async maybeSingle(){return {data:target}},then(resolve,reject){return Promise.resolve({data:tables[table]||[]}).then(resolve,reject)}};return q}}};
 await w.RALAB_PORTAL_ADMIN.openOrder(target.id);
 assert.equal(d.getElementById('view-portaladmin').classList.contains('hidden'),false);assert.equal(d.querySelector('[data-portal-customer]').value,'nila');
 const row=d.querySelector('[data-admin-drawing-order="older-web-order"]');assert.ok(row);assert.ok(row.querySelector('[data-portal-convert="older-web-order"]'));assert.match(row.textContent,/WEB-OLDER/);
 assert.deepEqual(f.errors,[]);
});
test('request inbox keeps originals, persists additions, reuses quotation, and reaches confirmation/planning',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 const original={id:'11111111-1111-4111-8111-111111111111',customer_id:'customer-a',request_type:'quote',status:'new',product_name:'Lamp',description:'Customer description',quantity:10,created_at:'2026-10-19T10:00:00Z'};
 const tables={portal_product_requests:[original],acquisition_requests:[],planner_request_reviews:[],portal_customers:[{customer_id:'customer-a',company_name:'Customer A'}]};
 const writes=[];
 w.RALAB_ADMIN_AUTH={client:{from(table){const q={select(){return q},order(){return q},eq(){return q},range(){return Promise.resolve({data:tables[table]})},async upsert(value){writes.push(table);tables[table]=[structuredClone(value)];return {error:null}}};return q},rpc:async()=>({data:1})}};
 vm.runInContext("state.customers.push({id:'customer-a',name:'Customer A'});",f.ctx);
 d.querySelector('[data-view="requests"]').click();await f.wait(80);
 assert.equal(d.getElementById('view-requests').classList.contains('hidden'),false);
 assert.match(d.querySelector('[data-request-count]').textContent,/1/);
 d.querySelector('[data-inbox-open]').click();const form=d.querySelector('[data-inbox-form]');
 form.elements.product_name.value='Lamp revised';form.elements.quantity.value='20';form.elements.notes.value='INTERNAL ONLY';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await f.wait(30);
 assert.equal(tables.planner_request_reviews[0].data.quantity,20);assert.equal(original.quantity,10);
 w.__RALAB_LAST_SYNC_ERROR='existing order sync failed';d.querySelector('[data-inbox-calculate]').click();await f.wait(30);assert.match(d.querySelector('[data-inbox-message]').textContent,/niet synchroniseren/);assert.equal(f.state().quotes.filter(q=>q.sourceRequest).length,0);delete w.__RALAB_LAST_SYNC_ERROR;
 d.querySelector('[data-inbox-calculate]').click();await f.wait(250);
 const q=f.state().quotes.find(q=>q.sourceRequest);assert.equal(q.name,'Lamp revised');assert.equal(q.qty,20);assert.doesNotMatch(q.project,/INTERNAL ONLY/);
 assert.equal(d.querySelector('#cName').value,'Lamp revised');
 d.querySelector('[data-view="requests"]').click();await f.wait(50);d.querySelector('[data-inbox-open]').click();
 d.querySelector('[data-inbox-calculate]').click();await f.wait(250);assert.equal(f.state().quotes.filter(q=>q.sourceRequest).length,1);
 d.querySelector('[data-view="requests"]').click();await f.wait(50);d.querySelector('[data-inbox-open]').click();
 vm.runInContext(`Object.assign(state.quotes.find(q=>q.id===${JSON.stringify(q.id)}),{ops:[{name:'Mori SL25',minutes:1,mode:'unit',rate:60}],saleUnit:25,total:500})`,f.ctx);
 d.querySelector('[data-inbox-confirm]').click();await f.wait(100);
 const quoteBefore=structuredClone(f.state().quotes.find(v=>v.id===q.id));
 w.__acceptClient={rpc:async(name,args)=>({data:{orders:[{id:'accepted-request-order',sourceQuoteNo:q.quoteNo,sourceQuoteLineId:q.id,product:q.name,qty:args.p_choices[0].qty,saleUnit:25,totalSale:500,active:true}],tasks:[{id:'accepted-request-task',orderId:'accepted-request-order',name:'Mori SL25',estimate:20,status:'open'}]}})};
 vm.runInContext('supabaseClient=window.__acceptClient',f.ctx);w.RALAB_PERFORMANCE.flushCloudSave=async()=>{};
 const accept=d.querySelector('[data-accept-quote]');assert.ok(accept,'quotation document has confirmation control');accept.click();await f.wait(30);
 assert.ok(d.querySelector('[data-accept-submit]'));d.querySelector('[data-accept-submit]').click();await f.wait(200);
 const accepted=f.state().orders.find(v=>v.sourceQuoteLineId===q.id);assert.ok(accepted);assert.ok(f.state().tasks.some(t=>t.orderId===accepted.id));assert.deepEqual(f.state().quotes.find(v=>v.id===q.id),quoteBefore);
 d.querySelector('[data-view="requests"]').click();await f.wait(60);
 let order;w.RALAB_ERP.openOrder=id=>order=id;d.querySelector('[data-inbox-plan]').click();assert.equal(order,accepted.id);
 assert(writes.every(x=>x==='planner_request_reviews'));
});

test('grouped order request becomes one quotation containing every product and shared reference/date',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 const original={id:'22222222-1111-4111-8111-111111111111',customer_id:'customer-a',request_type:'order',status:'new',product_name:'2 producten',description:'First original',quantity:2,unit:'stuks',customer_reference:'PO-456',requested_delivery_date:'2026-12-10',product_lines:[{product_name:'First',description:'First description',dimensions:'100 mm',material:'Albast',quantity:2,unit:'stuks'},{product_name:'Second',description:'Second description',dimensions:'200 mm',material:'Stone',quantity:3,unit:'sets',attachment_path:'customer-a/file.pdf'}],created_at:'2026-10-23T10:00:00Z'};
 const tables={portal_product_requests:[original],acquisition_requests:[],planner_request_reviews:[],portal_customers:[{customer_id:'customer-a',company_name:'Customer A'}]};
 w.RALAB_ADMIN_AUTH={client:{from(table){const q={select(){return q},order(){return q},eq(){return q},range(){return Promise.resolve({data:tables[table]})},async upsert(value){tables[table]=[structuredClone(value)];return {error:null}}};return q},rpc:async()=>({data:1})}};
 vm.runInContext("state.customers.push({id:'customer-a',name:'Customer A'});",f.ctx);
 d.querySelector('[data-view="requests"]').click();await f.wait(80);assert.equal(d.querySelectorAll('[data-inbox-open]').length,1);assert.match(d.getElementById('view-requests').textContent,/PO-456/);
 d.querySelector('[data-inbox-open]').click();assert.match(d.querySelector('details').textContent,/Second description/);assert.ok(d.querySelector('[data-request-attachment]'));
 d.querySelector('[data-inbox-calculate]').click();await f.wait(250);
 const quotes=f.state().quotes.filter(q=>q.sourceRequest);assert.equal(quotes.length,2);assert.equal(quotes[0].quoteNo,quotes[1].quoteNo);assert.equal(quotes[1].name,'Second');assert.equal(quotes[1].qty,3);assert.equal(quotes[1].customerReference,'PO-456');assert.equal(quotes[1].deadline,'2026-12-10');assert.match(quotes[1].project,/200 mm/);
 d.querySelector('[data-view="requests"]').click();await f.wait(60);d.querySelector('[data-inbox-open]').click();d.querySelector('[data-inbox-calculate]').click();await f.wait(250);assert.equal(f.state().quotes.filter(q=>q.sourceRequest).length,2);assert.equal(original.product_lines[1].quantity,3);
});
