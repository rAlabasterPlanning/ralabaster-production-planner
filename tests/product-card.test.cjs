const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

test('productenoverzicht toont één productfamilie met één productkaart',async t=>{
 const f=await fullApp(t),{w}=f,d=w.document;
 vm.runInContext(`state.productTemplates=[{id:'pc-v1',name:'NILA Flush',version:1,saleUnit:90,ops:[]},{id:'pc-v2',name:'NILA Flush',version:2,saleUnit:100,stockCategory:'slab',requiredStockLengthMm:1000,requiredStockWidthMm:45,requiredStockThicknessMm:50,ops:[{name:'Waterjetten (extern)',mode:'external',minutes:100,rate:0}]}]`,f.ctx);
 w.RALAB_ERP.show('products');await f.wait(120);
 assert.equal(d.querySelectorAll('#view-products tbody tr').length,1);
 const button=d.querySelector('[data-open-product-card="pc-v2"]');assert.ok(button);assert.equal(button.textContent,'Open productkaart');
 button.click();await f.wait(50);
 assert.match(d.getElementById('modalRoot').textContent,/NILA Flush/);assert.match(d.getElementById('modalRoot').textContent,/2 versies/);
 assert.ok(d.querySelector('[data-product-card-section="stock"]'));
 assert.ok(d.querySelector('[data-product-card-section="production"]'));
 assert.equal(d.querySelectorAll('[data-product-card-section="versions"] tbody tr').length,2);
});

test('productkaart opent de nieuwste versie in de volledige editor',async t=>{
 const f=await fullApp(t),{w}=f,d=w.document;
 vm.runInContext(`state.productTemplates=[{id:'card-edit',name:'Kreon Long',version:3,stockCategory:'semi',requiredSemiFinishedType:'Half-fabricaat X',ops:[]}]`,f.ctx);
 w.RALAB_PRODUCT_CARD.open('card-edit');d.querySelector('[data-product-card-edit="card-edit"]').click();await f.wait(350);
 assert.equal(d.getElementById('mpName').value,'Kreon Long');
 assert.equal(d.getElementById('mpRequiredSemiType').value,'Half-fabricaat X');
});

test('volledige productkaart wordt in één keer opgeslagen en opent compleet opnieuw',async t=>{
 const f=await fullApp(t),{w,ctx}=f,d=w.document;
 vm.runInContext(`state.productTemplates=[{id:'complete-card',name:'Ringen 6 sets',version:1,ops:[{name:'KUKA KR210 - Instellen',mode:'batch',minutes:30,rate:30}]}]`,ctx);
 w.RALAB_MASTER.productForm('complete-card');await f.wait(30);
 const set=(id,value)=>{d.getElementById(id).value=value};
 set('mpSku','R6');set('mpRef','KLANT-RINGEN');set('mpMaterial','Alabaster');set('mpMatCost','250');set('mpMatMode','unit');set('mpSaleUnit','975,50');set('mpMarginMode','factor');set('mpMargin','3');set('mpWeight','18.75');set('mpNotes','Complete productkaart');
 set('mpStockCategory','slab');set('mpRequiredLength','950');set('mpRequiredWidth','950');set('mpRequiredThickness','50');set('mpRequiredDiameter','950');set('mpStockAllowance','4');set('mpRequiredSemiType','Type X');
 const row=d.querySelector('#mpSteps .md-step');row.querySelector('.md-mode').value='batch';row.querySelector('.md-min').value='60';row.querySelector('.md-rate').value='31,5';row.querySelector('.md-employee').value='Ralph';row.querySelector('.md-parallel').value='B';row.querySelector('.md-extbatch').value='12,5';row.querySelector('.md-extunit').value='2,25';
 w.RALAB_MASTER.saveProduct();await f.wait(20);
 const p=f.state().productTemplates.find(x=>x.id==='complete-card');
 assert.deepEqual({sku:p.sku,customerRef:p.customerRef,materialCost:p.materialCost,saleUnit:p.saleUnit,weight:p.endUnitWeightKg,notes:p.notes,stock:p.stockCategory,length:p.requiredStockLengthMm,width:p.requiredStockWidthMm,thickness:p.requiredStockThicknessMm,diameter:p.requiredStockDiameterMm,allowance:p.stockAllowanceMm,semi:p.requiredSemiFinishedType},{sku:'R6',customerRef:'KLANT-RINGEN',materialCost:250,saleUnit:975.5,weight:18.75,notes:'Complete productkaart',stock:'slab',length:950,width:950,thickness:50,diameter:950,allowance:4,semi:'Type X'});
 assert.deepEqual({minutes:p.ops[0].minutes,rate:p.ops[0].rate,employee:p.ops[0].preferredEmployee,parallel:p.ops[0].parallelGroupId,externalBatch:p.ops[0].externalBatch,externalUnit:p.ops[0].externalUnit},{minutes:60,rate:31.5,employee:'Ralph',parallel:'B',externalBatch:12.5,externalUnit:2.25});
 const stored=JSON.parse(w.localStorage.getItem('ralabaster_planner_v1')).productTemplates.find(x=>x.id==='complete-card');assert.equal(stored.requiredStockLengthMm,950);assert.equal(stored.ops[0].minutes,60);
 w.RALAB_MASTER.productForm('complete-card');await f.wait(30);assert.equal(d.getElementById('mpRequiredLength').value,'950');assert.equal(d.getElementById('mpNotes').value,'Complete productkaart');assert.equal(d.querySelector('#mpSteps .md-min').value,'60');
});

test('nieuwe klant via plus Klant in calculatie blijft geselecteerd en opgeslagen',async t=>{
 const f=await fullApp(t),{w}=f,d=w.document,answers=['Nieuwe Calculatieklant','info@nieuweklant.nl','Mevrouw Test'];
 w.prompt=()=>answers.shift();
 d.querySelector('.navbtn[data-view="calculation"]').click();await f.wait(180);
 const add=[...d.querySelectorAll('#view-calculation button')].find(x=>x.textContent.trim()==='+ Klant');assert.ok(add);add.click();await f.wait(80);
 const c=f.state().customers.find(x=>x.name==='Nieuwe Calculatieklant');assert.ok(c);assert.equal(c.email,'info@nieuweklant.nl');assert.equal(c.contact,'Mevrouw Test');assert.equal(c.relationshipType,'customer');
 assert.equal(d.getElementById('cCustomer').value,c.id);
 const stored=JSON.parse(w.localStorage.getItem('ralabaster_planner_v1')).customers.find(x=>x.id===c.id);assert.ok(stored);assert.equal(stored.name,'Nieuwe Calculatieklant');
});
