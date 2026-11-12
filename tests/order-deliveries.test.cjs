const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
async function fixture(t){const f=await fullApp(t);vm.runInContext(`state.orders.push({id:'delivery-order',orderNo:'ORDER-25',product:'Ringen',qty:25,saleUnit:100,totalSale:2500,active:true,status:'confirmed'});state.tasks.push({id:'delivery-task',orderId:'delivery-order',name:'Polijsten',estimate:120,actual:30,doneQty:20,status:'partial',planSegments:[{date:'2026-11-02',start:'08:15',minutes:30}]})`,f.ctx);f.w.RALAB_PERFORMANCE.invalidate();return f;}

test('135 ordered can ship and invoice 139 only after explicitly confirming the four extra pieces',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;let calls=0;
 vm.runInContext("Object.assign(state.orders.find(o=>o.id==='delivery-order'),{qty:135,saleUnit:10.5,totalSale:1417.5})",f.ctx);
 w.RALAB_ADMIN_AUTH={client:{rpc:async(name,p)=>{
  assert.equal(name,'planner_record_delivery_v2');assert.equal(p.p_allow_overdelivery,true);assert.equal(p.p_qty,139);calls++;
  const o=f.state().orders.find(o=>o.id===p.p_order_id),packing={id:p.p_request_id,orderNo:'OVER-135-DL01',originalOrderNo:o.orderNo,product:o.product,qty:139,completedQty:139,orderedQty:135,backorderQty:0,overdeliveryQty:4,deliveryDate:'2026-11-12T10:00:00Z',deliveryNote:p.p_note};
  const delivery={id:p.p_request_id,qty:139,overdeliveryQty:4,packing};
  return {data:{order:{...o,deliveredQty:139,completedQty:139,overdeliveredQty:4,billableQty:139,billableRevenue:1459.5,overdeliveryAmount:42,deliveries:[delivery]},delivery}};
 }}};
 w.RALAB_DELIVERIES.open('delivery-order');
 const field=d.querySelector('[data-delivery-qty]');field.value='139';field.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.match(d.querySelector('[data-delivery-preview]').textContent,/4 extra stuks/);
 assert.equal(await w.RALAB_DELIVERIES.submit(d.querySelector('[data-delivery-form]')),false);assert.equal(calls,0);
 const allow=d.querySelector('[data-delivery-over]');allow.checked=true;allow.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(field.hasAttribute('max'),false);assert.match(d.querySelector('[data-delivery-preview]').textContent,/Te factureren totaal: 139/);assert.match(d.querySelector('[data-delivery-preview]').textContent,/42,00/);
 assert.equal(await w.RALAB_DELIVERIES.submit(d.querySelector('[data-delivery-form]')),true);
 const o=f.state().orders.find(o=>o.id==='delivery-order');assert.equal(o.qty,135);assert.equal(o.totalSale,1417.5);assert.equal(o.billableQty,139);assert.equal(o.billableRevenue,1459.5);
 const pdf=Buffer.from(w.RALAB_ORDER_CLOSEOUT.pdfBytes(o.deliveries[0].packing)).toString();assert.match(pdf,/139 \/ 135 besteld/);assert.match(pdf,/overlevering: 4 stuks/);assert.match(pdf,/backorder na deze levering: 0/);
 w.RALAB_ORDER_CLOSEOUT.open(o.id);assert.equal(d.getElementById('closeoutQty').value,'139');d.getElementById('closeoutChecked').checked=true;
 assert.equal(w.RALAB_ORDER_CLOSEOUT.finish(d.getElementById('orderCloseoutForm')),true);
 const completed=f.state().orders.find(o=>o.id==='delivery-order');assert.equal(completed.status,'completed');assert.equal(completed.qty,135);assert.equal(completed.completedQty,139);assert.equal(completed.completedRevenue,1459.5);assert.deepEqual(f.errors,[]);
});

test('entering an excess quantity at closeout opens the explicit delivery confirmation instead of silently billing extras',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;w.RALAB_ORDER_CLOSEOUT.open('delivery-order');d.getElementById('closeoutQty').value='29';d.getElementById('closeoutChecked').checked=true;
 assert.equal(w.RALAB_ORDER_CLOSEOUT.finish(d.getElementById('orderCloseoutForm')),false);
 assert.equal(d.querySelector('[data-delivery-qty]').value,'29');assert.equal(d.querySelector('[data-delivery-over]').checked,false);assert.equal(f.state().orders.find(o=>o.id==='delivery-order').active,true);
});
test('20 of 25 makes a 20-piece packing snapshot and leaves the same order open for 5; then 5 has a separate slip',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;let calls=0;const taskBefore=JSON.stringify(f.state().tasks.find(t=>t.id==='delivery-task'));
 w.RALAB_ADMIN_AUTH={client:{rpc:async(name,p)=>{assert.equal(name,'planner_record_delivery_v2');calls++;const o=f.state().orders.find(o=>o.id===p.p_order_id),n=(o.deliveredQty||0)+p.p_qty,delivery={id:p.p_request_id,qty:p.p_qty,packing:{id:p.p_request_id,orderNo:o.orderNo+'-DL0'+calls,originalOrderNo:o.orderNo,product:o.product,qty:p.p_qty,completedQty:p.p_qty,orderedQty:25,backorderQty:25-n,deliveryDate:'2026-10-26T10:00:00Z',deliveryNote:p.p_note}};return{data:{order:{...o,deliveries:[...(o.deliveries||[]),delivery],deliveredQty:n,backorderQty:25-n,completedQty:n},delivery}}}}};
 await w.RALAB_ERP.openOrder('delivery-order');d.querySelector('#modalRoot [data-deliver-order="delivery-order"]').click();assert.match(d.querySelector('[data-delivery-preview]').textContent,/25 stuks/);
 d.querySelector('[data-delivery-qty]').value='20';d.querySelector('[data-delivery-qty]').dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(d.querySelector('[data-delivery-preview]').textContent,/5 stuks in backorder/);
 assert.equal(await w.RALAB_DELIVERIES.submit(d.querySelector('[data-delivery-form]')),true);const first=f.state().orders.find(o=>o.id==='delivery-order');assert.equal(first.qty,25);assert.equal(first.deliveredQty,20);assert.equal(first.active,true);assert.equal(first.totalSale,2500);assert.equal(d.querySelector('[data-delivery-qty]'),null);assert.equal(await w.RALAB_DELIVERIES.submit(d.querySelector('[data-delivery-form]')),false);assert.equal(calls,1);d.querySelector('[data-delivery-new]').click();assert.equal(d.querySelector('[data-delivery-qty]').value,'5');const actualTask=f.state().tasks.find(t=>t.id==='delivery-task');delete actualTask.taskProgressUpdatedAt;assert.equal(JSON.stringify(actualTask),taskBefore);
 const firstPdf=Buffer.from(w.RALAB_ORDER_CLOSEOUT.pdfBytes(first.deliveries[0].packing)).toString();assert.match(firstPdf,/20 \/ 25 besteld/);assert.match(firstPdf,/backorder na deze levering: 5/);assert.match(firstPdf,/ORDER-25-DL01/);
 assert.equal(await w.RALAB_DELIVERIES.submit(d.querySelector('[data-delivery-form]')),true);const last=f.state().orders.find(o=>o.id==='delivery-order');assert.equal(last.deliveredQty,25);assert.equal(last.deliveries[1].qty,5);assert.equal(last.deliveries[0].qty,20);assert.equal(d.querySelector('[data-delivery-qty]'),null);assert.equal(d.querySelectorAll('[data-delivery-pdf]').length,2);assert.deepEqual(f.errors,[]);
});
test('database errors retain input and make no local delivery; duplicate clicks make one request',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;let release,calls=0;w.RALAB_ADMIN_AUTH={client:{rpc:()=>{calls++;return new Promise(r=>release=r)}}};w.RALAB_DELIVERIES.open('delivery-order');d.querySelector('[data-delivery-qty]').value='20';const form=d.querySelector('[data-delivery-form]'),pending=w.RALAB_DELIVERIES.submit(form);assert.equal(await w.RALAB_DELIVERIES.submit(form),false);assert.equal(calls,1);release({error:{message:'Verbinding verbroken'}});assert.equal(await pending,false);assert.equal(f.state().orders.find(o=>o.id==='delivery-order').deliveries,undefined);assert.equal(d.querySelector('[data-delivery-qty]').value,'20');assert.match(d.querySelector('[data-delivery-status]').textContent,/Verbinding verbroken/);assert.equal(d.querySelector('button[type="submit"]').disabled,false);
});
test('partial quantity in the old closeout opens deliveries instead of archiving remaining production',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;w.RALAB_ORDER_CLOSEOUT.open('delivery-order');d.getElementById('closeoutQty').value='20';d.getElementById('closeoutChecked').checked=true;assert.equal(w.RALAB_ORDER_CLOSEOUT.finish(d.getElementById('orderCloseoutForm')),false);assert.ok(d.querySelector('[data-delivery-form]'));assert.equal(d.querySelector('[data-delivery-qty]').value,'20');assert.equal(f.state().orders.find(o=>o.id==='delivery-order').active,true);assert.equal(f.state().tasks.find(t=>t.id==='delivery-task').status,'partial');
});
test('opening delivery controls reloads the saved delivery count before allowing another shipment',async t=>{
 const f=await fixture(t),w=f.w,d=w.document,stored={...f.state().orders.find(o=>o.id==='delivery-order'),deliveredQty:20,backorderQty:5,deliveries:[]};
 w.RALAB_ADMIN_AUTH={client:{from(){const q={select(){return q},eq(){return q},async maybeSingle(){return{data:{data:stored}}}};return q}}};w.RALAB_DELIVERIES.open('delivery-order');await f.wait(20);assert.equal(d.querySelector('[data-delivery-qty]').value,'5');assert.match(d.querySelector('[data-delivery-preview]').textContent,/Pakbon voor 5/);
});

 test('cancelled delivery stays visible as history without a downloadable valid packing slip',async t=>{const f=await fixture(t),w=f.w,d=w.document;vm.runInContext("state.orders.find(o=>o.id==='delivery-order').deliveries=[{id:'void',qty:5,voidedAt:'2026-10-26',packing:{orderNo:'ORDER-25-DL02'}}]",f.ctx);w.RALAB_DELIVERIES.open('delivery-order');const b=d.querySelector('[data-delivery-pdf]');assert.equal(b.disabled,true);assert.match(b.textContent,/Geannuleerd/);});
