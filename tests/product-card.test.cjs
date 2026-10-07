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
