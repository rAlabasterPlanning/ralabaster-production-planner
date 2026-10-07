const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

test('accepted order can switch to another quoted quantity tier',async t=>{
 const f=await fullApp(t),{w,ctx}=f;
 vm.runInContext(`state.orders=[{id:'o-tier',orderNo:'20261007-1',sourceQuoteNo:'Q-1',product:'Pendant',qty:10,saleUnit:100,totalSale:1000,active:true,status:'confirmed',costing:{materialCost:10,materialMode:'unit',ops:[{name:'Schuren',mode:'unit',minutes:5,rate:30},{name:'Instellen',mode:'batch',minutes:60,rate:30}],priceTiers:[{qty:10,saleUnit:100},{qty:25,saleUnit:85}]}}];state.quotes=[{id:'q-tier',quoteNo:'Q-1',orderId:'o-tier',name:'Pendant',qty:10,saleUnit:100,materialCost:10,materialMode:'unit',ops:[{name:'Schuren',mode:'unit',minutes:5,rate:30},{name:'Instellen',mode:'batch',minutes:60,rate:30}],priceTiers:[{qty:10,saleUnit:100},{qty:25,saleUnit:85}]}];state.tasks=[{id:'t-unit',orderId:'o-tier',name:'Schuren',machine:'Schuren',estimate:50,status:'open',date:'2026-10-08',planSegments:[{date:'2026-10-08'}]},{id:'t-batch',orderId:'o-tier',name:'Instellen',machine:'Instellen',estimate:60,status:'open',date:'2026-10-08',planSegments:[{date:'2026-10-08'}]}]`,ctx);
 w.RALAB_ORDER_TIER.open('o-tier');
 const option=w.document.querySelector('input[name="orderTierQty"][value="25"]');assert.ok(option);option.click();
 w.document.querySelector('[data-tier-apply="o-tier"]').click();await f.wait(30);
 const s=f.state(),o=s.orders[0],unit=s.tasks.find(x=>x.id==='t-unit'),batch=s.tasks.find(x=>x.id==='t-batch');
 assert.equal(o.qty,25);assert.equal(o.saleUnit,85);assert.equal(o.totalSale,2125);
 assert.equal(unit.calcMode,'unit');assert.equal(unit.orderCalcMinutes,5);assert.equal(unit.estimate,125);
 assert.equal(batch.calcMode,'batch');assert.equal(batch.estimate,60);
 assert.equal(unit.date,null);assert.deepEqual(unit.planSegments,[]);
 assert.equal(o.totalCost,342.5);assert.equal(o.costUnit,13.7);assert.equal(o.marginTotal,1782.5);
 assert.equal(o.quantityHistory.at(-1).fromQty,10);assert.equal(o.quantityHistory.at(-1).toQty,25);
});

test('started production is never silently overwritten',async t=>{
 const f=await fullApp(t),{w,ctx}=f;
 vm.runInContext(`state.orders=[{id:'o-started',orderNo:'2',sourceQuoteNo:'Q-2',product:'Lamp',qty:10,saleUnit:50,costing:{priceTiers:[{qty:10,saleUnit:50},{qty:25,saleUnit:40}]}}];state.tasks=[{id:'t-started',orderId:'o-started',name:'Schuren',estimate:50,status:'in_progress',actual:10,doneQty:2}]`,ctx);
 w.RALAB_ORDER_TIER.open('o-started');
 assert.equal(w.document.querySelector('[data-tier-apply]'),null);
 assert.ok(w.document.querySelector('[data-tier-to-calc="o-started"]'));
 assert.match(w.document.querySelector('#modalRoot').textContent,/Productie is al gestart/);
});
