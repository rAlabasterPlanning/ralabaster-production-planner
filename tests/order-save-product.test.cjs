const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

test('ordervenster bevat Product opslaan en bewaart actuele route',async t=>{
 const f=await fullApp(t),{w}=f,d=w.document;
 vm.runInContext(`state.productTemplates=[];state.orders.push({id:'save-product-order',orderNo:'ORD-P-1',product:'NILA Flush',qty:10,saleUnit:125,costing:{material:'Alabaster',materialCost:15,materialMode:'unit',marginMode:'factor',marginValue:3,ops:[{name:'Waterjetten (extern)',mode:'external',minutes:100,externalBatch:50,externalUnit:2}]},active:true,status:'confirmed'});state.tasks.push({id:'save-product-task-1',orderId:'save-product-order',seq:1,name:'Waterjetten (extern)',machine:'Waterjetten (extern)',estimate:100,orderCalcMinutes:100,type:'external',status:'open',expectedExternalCostBatch:50,expectedExternalCostUnit:2},{id:'save-product-task-2',orderId:'save-product-order',seq:2,name:'Doppen lijmen',machine:'Doppen lijmen',estimate:50,orderCalcMinutes:50,calcMode:'unit',type:'internal',status:'open'})`,f.ctx);
 w.showModal('<div class="modalhead"><h3>ORD-P-1 · NILA Flush</h3></div><div class="modalfoot"><button data-order-to-calc="save-product-order">Terug naar calculatie</button></div>');await f.wait(80);
 assert.ok(d.querySelector('[data-order-save-product="save-product-order"]'));
 const saved=w.RALAB_ORDER_PRODUCT.save('save-product-order');
 assert.equal(saved.name,'NILA Flush');assert.equal(saved.version,1);assert.equal(saved.saleUnit,125);assert.equal(saved.materialCost,15);
 assert.deepEqual(Array.from(saved.ops,x=>x.name),['Waterjetten (extern)','Doppen lijmen']);
 assert.equal(saved.ops[1].minutes,5);
});

test('dezelfde order maakt geen dubbele productversie',async t=>{
 const f=await fullApp(t),{w}=f;w.alert=()=>{};
 vm.runInContext(`state.productTemplates=[];state.orders.push({id:'same-order',product:'Kreon Long',qty:1,saleUnit:80,costing:{materialCost:10,materialMode:'unit'},active:true});state.tasks.push({id:'same-task',orderId:'same-order',seq:1,name:'Doppen lijmen',machine:'Doppen lijmen',estimate:5,type:'internal',status:'open'})`,f.ctx);
 w.RALAB_ORDER_PRODUCT.save('same-order');w.RALAB_ORDER_PRODUCT.save('same-order');
 assert.equal(f.state().productTemplates.length,1);
});

test('unit times survive legacy order totals and current per-unit metadata',async t=>{
 const f=await fullApp(t),{w}=f;
 vm.runInContext(`state.orders.push({id:'scale',product:'Kraal',qty:135,costing:{ops:[{id:'cut',name:'Mori',mode:'unit',minutes:8},{name:'Instellen',mode:'batch',minutes:30}]}});state.tasks.push({id:'a',orderId:'scale',seq:1,name:'Mori',estimate:1080,type:'internal'},{id:'b',orderId:'scale',seq:2,name:'Instellen',estimate:30,type:'internal'},{id:'c',orderId:'scale',seq:3,name:'Mori',estimate:1080,orderCalcMinutes:8,calcMode:'unit',type:'internal'});`,f.ctx);
 const ops=w.RALAB_ORDER_PRODUCT.build('scale').ops;
 assert.equal(ops[0].mode,'unit');assert.equal(ops[0].minutes,8);assert.equal(ops[1].mode,'batch');assert.equal(ops[1].minutes,30);assert.equal(ops[2].minutes,8);
 for(const qty of [1,135,200])assert.equal(ops.reduce((n,o)=>n+o.minutes*(o.mode==='unit'?qty:1),0),16*qty+30);
});
