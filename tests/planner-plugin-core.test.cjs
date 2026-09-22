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

test('general planner preview supports metadata updates without writing',async()=>{
 const {previewRecordChanges}=await import('../api/_planner-core.mjs');
 const result=previewRecordChanges(fixture(),[{entity:'customer',operation:'update',id:'c1',fields:{email:'nieuw@example.nl'}}]);
 assert.equal(result.preview[0].bewerking,'wijzigen');assert.equal(result.preview[0].huidige_waarden.email,undefined);
 assert.equal(result.preview[0].nieuwe_waarden.email,'nieuw@example.nl');assert.equal(result.vereist_extra_bevestiging,false);
});

test('general planner preview requires extra confirmation for deletes and protected tasks',async()=>{
 const {previewRecordChanges}=await import('../api/_planner-core.mjs');
 const deletion=previewRecordChanges(fixture(),[{entity:'customer',operation:'delete',id:'c1'}]);
 assert.equal(deletion.vereist_extra_bevestiging,true);
 const protectedTask=previewRecordChanges(fixture(),[{entity:'task',operation:'update',id:'t1',fields:{name:'Nieuw'}}]);
 assert.equal(protectedTask.beschermde_records[0].id,'t1');
});

test('general planner preview blocks secrets and stale IDs',async()=>{
 const {previewRecordChanges}=await import('../api/_planner-core.mjs');
 assert.throws(()=>previewRecordChanges(fixture(),[{entity:'customer',operation:'update',id:'missing',fields:{name:'X'}}]),/bestaat niet/);
 assert.throws(()=>previewRecordChanges(fixture(),[{entity:'customer',operation:'update',id:'c1',fields:{apiKey:'x'}}]),/mag niet/);
});

test('schedule preview preserves fractional minutes',async()=>{
 const {previewScheduleChanges}=await import('../api/_planner-schedule.mjs');
 const result=previewScheduleChanges(fixture(),[{type:'schedule_task',orderId:'o1',taskId:'t2',machine:'Mori',segments:[{date:'2026-09-23',start:'08:15',minutes:72.5,elapsedMinutes:72.5,employee:'Kaan'}]}]);
 assert.equal(result.preview[0].segmenten[0].minutes,72.5);
 assert.equal(result.preview[0].segmenten[0].elapsedMinutes,72.5);
 assert.equal(result.kan_uitvoeren,true);
});
