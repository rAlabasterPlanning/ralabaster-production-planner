const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

function change(w,el,value){
 el.value=value;
 el.dispatchEvent(new w.Event('change',{bubbles:true}));
}

function selectStep(w,d,name){
 const row=[...d.querySelectorAll('#view-calculation tbody tr')].find(x=>x.querySelector('td:nth-child(2) b')?.textContent.trim()===name);
 assert.ok(row,`processtap ${name} ontbreekt`);
 const box=row.querySelector('[data-opcheck]');
 box.checked=true;
 box.dispatchEvent(new w.Event('change',{bubbles:true}));
}

test('iedere productregel bewaart zijn eigen verwachte klantdatum bij losse productieorders',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document,alerts=[];
 w.alert=x=>alerts.push(String(x));
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 d.querySelector('.navbtn[data-view="calculation"]').click();
 await f.wait(180);
 const customer=d.querySelector('#cCustomer');
 const customerId='product-date-customer';
 vm.runInContext("state.customers.push({id:'product-date-customer',name:'Datumklant'})",f.ctx);
 customer.insertAdjacentHTML('beforeend','<option value="product-date-customer">Datumklant</option>');
 change(w,customer,customerId);
 change(w,d.querySelector('#cName'),'Schaal A');
 change(w,d.querySelector('#cQty'),'4');
 change(w,d.querySelector('#cProductCustomerDate'),'2026-11-10');
 selectStep(w,d,'Schuren');
 d.querySelector('#cuiLoadSteps').click();
 await f.wait(30);
 d.querySelector('#cuiAddProduct').click();
 await f.wait(30);
 change(w,d.querySelector('#cName'),'Schaal B');
 change(w,d.querySelector('#cQty'),'7');
 change(w,d.querySelector('#cProductCustomerDate'),'2026-12-05');
 selectStep(w,d,'Polijsten');
 d.querySelector('#cuiLoadSteps').click();
 await f.wait(30);
 const before=f.state().orders.length;
 assert.equal(w.RALAB_CALC_UI.products.length,2,JSON.stringify(w.RALAB_CALC_UI.products));
 w.RALAB_CALC.confirmPlan();
 await f.wait(80);
 const created=f.state().orders.slice(before);
 assert.equal(created.length,2,JSON.stringify({alerts,products:w.RALAB_CALC_UI.products,errors:f.errors}));
 assert.deepEqual(created.map(x=>x.product),['Schaal A','Schaal B']);
 assert.deepEqual(created.map(x=>x.deadline),['2026-11-10','2026-12-05']);
 assert.deepEqual(created.map(x=>x.communicatedDeadline),['2026-11-10','2026-12-05']);
 assert.match(created[0].orderNo,/-01$/);
 assert.match(created[1].orderNo,/-02$/);
 assert.deepEqual(f.errors,[]);
});

test('productoverzicht en calculatiekeuze tonen alleen de nieuwste productversie',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 vm.runInContext("state.productTemplates.push({id:'version-old',name:'Maya Pendant',version:1,sku:'OUD',updated:'2026-01-01',ops:[]},{id:'version-new',name:'Maya Pendant',version:3,sku:'NIEUW',updated:'2026-09-01',ops:[]},{id:'version-other',name:'Alabaster Bowl',version:2,sku:'BOWL',updated:'2026-08-01',ops:[]})",f.ctx);
 w.RALAB_MASTER.renderProducts();
 const productView=d.querySelector('#view-products');
 assert.match(productView.textContent,/NIEUW/);
 assert.doesNotMatch(productView.textContent,/OUD/);
 assert.equal([...productView.querySelectorAll('tbody tr')].filter(x=>/Maya Pendant/.test(x.textContent)).length,1);
 d.querySelector('.navbtn[data-view="calculation"]').click();
 await f.wait(180);
 const values=[...d.querySelectorAll('#cuiTemplateChoice option')].map(x=>x.value);
 assert.ok(values.includes('version-new'));
 assert.ok(values.includes('version-other'));
 assert.ok(!values.includes('version-old'));
 assert.deepEqual(f.errors,[]);
});

test('vaste productverkoopprijs wordt geladen en punt en komma werken in prijsvelden',async t=>{
 const f=await fullApp(t),w=f.w,d=w.document;
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 vm.runInContext("state.productTemplates.push({id:'fixed-price-template',name:'Vaste prijs lamp',version:4,materialCost:12.5,materialMode:'unit',marginMode:'factor',marginValue:3,manualSalePrice:'149,95',saleUnit:'149,95',ops:[{id:'op20',name:'Schuren',rate:26,mode:'unit',minutes:5,externalBatch:0,externalUnit:0}],updated:'2026-10-07'})",f.ctx);
 d.querySelector('.navbtn[data-view="calculation"]').click();await f.wait(220);
 const choice=d.getElementById('cuiTemplateChoice');choice.value='fixed-price-template';choice.dispatchEvent(new w.Event('change',{bubbles:true}));await f.wait(100);
 assert.equal(d.getElementById('cManualSalePrice').value,'149.95');assert.match(d.getElementById('cLiveSale').textContent,/149,95/);
 const price=d.getElementById('cManualSalePrice');price.value='123,45';price.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(d.getElementById('cLiveSale').textContent,/123,45/);
 price.value='124.75';price.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(d.getElementById('cLiveSale').textContent,/124,75/);
 w.RALAB_MASTER.productForm('fixed-price-template');await f.wait(20);assert.equal(d.getElementById('mpSaleUnit').value,'149,95');d.getElementById('mpSaleUnit').value='151,75';d.getElementById('mpMatCost').value='13,25';w.RALAB_MASTER.saveProduct();
 const saved=f.state().productTemplates.find(x=>x.id==='fixed-price-template');assert.equal(saved.saleUnit,151.75);assert.equal(saved.manualSalePrice,151.75);assert.equal(saved.materialCost,13.25);assert.deepEqual(f.errors,[]);
});
