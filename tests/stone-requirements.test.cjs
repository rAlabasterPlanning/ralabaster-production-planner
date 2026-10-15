const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
test('steenronde bewaart eindmaten, nul procent aders en marge eenmaal; blokvoorraad past daarop',async t=>{
 const f=await fullApp(t),w=f.w;
 vm.runInContext("state.productTemplates=[{id:'stone',name:'Steen test',version:1}];state.orders=[{id:'order',orderNo:'TEST',product:'Steen test',qty:10}]",f.ctx);
 w.RALAB_PRODUCT_REQUIREMENTS.open();
 const put=(id,v)=>{w.document.getElementById(id).value=v};
 put('pwCategory','raw');put('pwLength','100');put('pwWidth','50');put('pwThickness','20');put('pwAllowance','2');put('pwVeins','0');
 w.document.querySelector('[data-pw-next]').click();
 const p=f.state().productTemplates[0];assert.equal(p.requiredVeinPct,0);assert.equal(p.requiredStockLengthMm,104);assert.equal(p.requiredStockWidthMm,54);assert.equal(p.requiredStockThicknessMm,24);assert.equal(p.stockAllowanceMm,0);assert.equal(p.stoneAllowanceMm,2);
 const stock={category:'raw',length_mm:208,width_mm:108,height_mm:48,quantity:3,vein_pct:0};
 assert.equal(w.RALAB_INVENTORY.productYield(stock,p),8);
 assert.equal(w.RALAB_INVENTORY_ECONOMICS.units(stock,p),24);
 assert.equal(w.RALAB_INVENTORY.productYield({...stock,vein_pct:20},p),0);
 assert.equal(w.RALAB_INVENTORY.productYield({...stock,vein_pct:null},p),0);
 w.RALAB_PRODUCT_REQUIREMENTS.open();assert.equal(w.document.getElementById('pwAllowance').value,'2');
 put('pwVeins','101');w.document.querySelector('[data-pw-next]').click();assert.equal(f.state().productTemplates[0].requiredVeinPct,0);assert.match(w.document.getElementById('pwError').textContent,/Controleer/);
 assert.equal(f.state().orders[0].qty,10);
});
test('orders zonder productkaart verschijnen en worden pas na opslaan een product',async t=>{
 const f=await fullApp(t),w=f.w;vm.runInContext("state.productTemplates=[];state.orders=[{id:'one',product:'Nieuw',qty:4},{id:'two',product:'Ander',qty:7}]",f.ctx);
 const api=w.RALAB_PRODUCT_REQUIREMENTS,products=api.latest();assert.equal(api.quantity({qty:0,quickDraftQty:10,quantityPending:true}),10);assert.equal(products.length,2);assert.equal(api.orders(products.find(p=>p.name==='Nieuw')).length,1);assert.equal(f.state().productTemplates.length,0);
 w.RALAB_PRODUCT_REQUIREMENTS.open();assert.ok(w.document.getElementById('pwCategory'));
});
