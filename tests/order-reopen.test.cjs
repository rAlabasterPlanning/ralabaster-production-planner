const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
async function fixture(t){
 const f=await fullApp(t);
 vm.runInContext(`state.orders.push({id:'reopen-order',orderNo:'REOPEN-1',product:'Lamp',qty:10,status:'completed',active:false,closed:true,completedAt:'2026-11-10T10:00:00Z',orderCompletionUpdatedAt:'2026-11-10T10:00:00Z',invoiceSent:true,deliveredQty:10,deliveries:[{id:'delivery',qty:10}]});state.completedOrders=['reopen-order'];state.tasks.push({id:'reopen-task',orderId:'reopen-order',name:'Polijsten',seq:1,status:'done',actual:42,doneQty:10});`,f.ctx);
 f.w.RALAB_PERFORMANCE.invalidate();return f;
}
test('completed orders expose reopening; reason is required and archived task history is preserved on success',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;let calls=0;
 w.RALAB_ADMIN_AUTH={client:{rpc:async(name,p)=>{
  calls++;assert.equal(name,'planner_reopen_order_v1');assert.equal(p.p_reason,'Beschadiging herstellen');assert.equal(p.p_task_id,'reopen-task');assert.equal(p.p_expected_revision,'2026-11-10T10:00:00Z');
  const o=f.state().orders.find(o=>o.id==='reopen-order'),task=f.state().tasks.find(t=>t.id==='reopen-task');
  return {data:{order:{...o,active:true,closed:false,status:'in_progress',reopenedAt:'2026-11-16T10:00:00Z',reopenReason:p.p_reason,completedAt:null,orderCompletionUpdatedAt:'2026-11-16T10:00:00Z'},tasks:[{...task,status:'open'}]}};
 }}};
 await w.RALAB_ERP.renderCompleted();assert.ok(d.querySelector('[data-reopen-order="reopen-order"]'));
 await w.RALAB_COMPLETED_ORDER_ACTIONS.openReopen('reopen-order');const form=d.querySelector('[data-reopen-form]');
 assert.equal(await w.RALAB_COMPLETED_ORDER_ACTIONS.submitReopen(form),false);assert.equal(calls,0);
 d.querySelector('[data-reopen-reason]').value='Beschadiging herstellen';d.querySelector('[data-reopen-task]').value='reopen-task';
 assert.equal(await w.RALAB_COMPLETED_ORDER_ACTIONS.submitReopen(form),true);
 const saved=f.state().orders.find(o=>o.id==='reopen-order'),task=f.state().tasks.find(t=>t.id==='reopen-task');
 assert.equal(saved.active,true);assert.equal(saved.invoiceSent,true);assert.equal(saved.deliveredQty,10);assert.equal(saved.deliveries[0].id,'delivery');
 assert.equal(task.status,'open');assert.equal(task.actual,42);assert.equal(task.doneQty,10);assert.equal(f.state().completedOrders.includes(saved.id),false);
 assert.deepEqual(f.errors,[]);
});
test('failed reopen retains the reason and request ID for retry; duplicate submit sends only one request',async t=>{
 const f=await fixture(t),w=f.w,d=w.document;let release;const calls=[];
 w.RALAB_ADMIN_AUTH={client:{rpc:(name,args)=>{calls.push(args);return new Promise(r=>release=r)}}};
 await w.RALAB_COMPLETED_ORDER_ACTIONS.openReopen('reopen-order');const form=d.querySelector('[data-reopen-form]');d.querySelector('[data-reopen-reason]').value='Administratie corrigeren';
 const pending=w.RALAB_COMPLETED_ORDER_ACTIONS.submitReopen(form);
 assert.equal(await w.RALAB_COMPLETED_ORDER_ACTIONS.submitReopen(form),false);assert.equal(calls.length,1);
 release({error:{message:'Verbinding verbroken'}});assert.equal(await pending,false);
 assert.equal(f.state().orders.find(o=>o.id==='reopen-order').status,'completed');assert.equal(d.querySelector('[data-reopen-reason]').value,'Administratie corrigeren');assert.match(d.querySelector('[data-reopen-status]').textContent,/Verbinding verbroken/);
 const retry=w.RALAB_COMPLETED_ORDER_ACTIONS.submitReopen(form);assert.equal(calls[1].p_request_id,calls[0].p_request_id);release({error:{message:'Nog geen verbinding'}});await retry;
 assert.equal(d.querySelector('[data-reopen-reason]').disabled,false);assert.deepEqual(f.errors,[]);
});
