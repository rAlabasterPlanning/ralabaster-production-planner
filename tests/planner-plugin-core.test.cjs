const {test}=require('node:test'),assert=require('node:assert/strict');

function fixture(){return{moment:'2026-09-22T12:00:00Z',rechten:{lezen:'alles',schrijven:'na akkoord'},databronnen:[],gegevens:{
 orders:[{id:'o1',orderNo:'ORD-101',product:'Shelby',customerName:'Klant A',active:true,status:'confirmed'}],
 tasks:[
  {id:'t1',orderId:'o1',seq:1,name:'Boren',machine:'Boor',estimate:30,status:'done',lockedPlanning:true},
  {id:'t2',orderId:'o1',seq:2,name:'Draaien',machine:'Mori',estimate:120,status:'open',planSegments:[]},
 ],customers:[{id:'c1',name:'Klant A'}],history:[]
}}}

test('plugin resolves an order and returns its exact task route',async()=>{
 const {orderRoute}=await import('../api/_planner-core.mjs'),result=orderRoute(fixture(),'ORD-101');
 assert.equal(result.gevonden,true);assert.equal(result.order.id,'o1');assert.deepEqual(result.taken.map(x=>x.id),['t1','t2']);
 assert.equal(result.taken[0].vastgezet,true);
});

test('plugin asks for clarification when an order is not unique or absent',async()=>{
 const {orderRoute}=await import('../api/_planner-core.mjs'),result=orderRoute(fixture(),'onbekend');
 assert.equal(result.gevonden,false);assert.deepEqual(result.matches,[]);
});

test('task preview is read-only and flags protected work',async()=>{
 const {previewTaskChanges}=await import('../api/_planner-core.mjs');
 const result=previewTaskChanges(fixture(),[{type:'link_tasks',orderId:'o1',firstTaskId:'t1',nextTaskId:'t2'}]);
 assert.equal(result.preview[0].actie,'koppelen');assert.equal(result.vereist_extra_bevestiging,true);assert.equal(result.beschermde_taken[0].id,'t1');
});

test('task preview rejects guessed or stale identifiers',async()=>{
 const {previewTaskChanges}=await import('../api/_planner-core.mjs');
 assert.throws(()=>previewTaskChanges(fixture(),[{type:'remove_task',orderId:'o1',taskId:'missing'}]),/bestaat niet/);
 assert.throws(()=>previewTaskChanges(fixture(),[{type:'add_task',orderId:'missing',name:'Polijsten'}]),/Order/);
});

test('scoped reads filter planner data without exposing unrelated sections',async()=>{
 const {readScope}=await import('../api/_planner-core.mjs'),result=readScope(fixture(),'customers','klant',10);
 assert.equal(result.customers.length,1);assert.equal(result.orders,undefined);
});
