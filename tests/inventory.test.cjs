const test=require('node:test');
const assert=require('node:assert/strict');
const {fullApp}=require('./full-app-fixture.cjs');

test('voorraad heeft drie vaste categorieën en procesinstappen',async t=>{
 const f=await fullApp(t),api=f.w.RALAB_INVENTORY;
 assert.ok(f.w.document.querySelector('[data-view="inventory"]'));
 assert.ok(f.w.document.getElementById('view-inventory'));
 assert.equal(api.routeStart('raw'),'Ruw materiaal boren');
 assert.equal(api.routeStart('slab'),'Waterjetten (extern)');
 assert.equal(api.routeStart('semi'),'Doppen lijmen');
});

test('opbrengst uit plaat houdt rekening met draaien van product',async t=>{
 const {w}=await fullApp(t),api=w.RALAB_INVENTORY;
 const item={category:'slab',length_mm:1000,width_mm:600,height_mm:50};
 const product={requiredStockLengthMm:300,requiredStockWidthMm:200,requiredStockThicknessMm:50,stockAllowanceMm:0};
 assert.equal(api.productYield(item,product),10);
});

test('NILA Flush vereist een plaat van minimaal 1000 x 45 x 50 mm',async t=>{
 const {w}=await fullApp(t),api=w.RALAB_INVENTORY,product={stockCategory:'slab',requiredStockLengthMm:1000,requiredStockWidthMm:45,requiredStockThicknessMm:50};
 assert.equal(api.productYield({category:'slab',length_mm:2000,width_mm:1000,height_mm:50},product),44);
 assert.equal(api.productYield({category:'slab',length_mm:2000,width_mm:1000,height_mm:40},product),0);
});

test('materiaalnaam alleen maakt een product niet automatisch geschikt',async t=>{
 const f=await fullApp(t),api=f.w.RALAB_INVENTORY;
 f.state().productTemplates.push({id:'zonder-maten',name:'Zonder maten',material:'Alabaster',version:1});
 assert.equal(api.suggestions({category:'slab',material:'Alabaster',length_mm:1000,width_mm:600}).length,0);
});

test('productkaart bevat magazijnmaatvoering',async t=>{
 const f=await fullApp(t),{w}=f;
 w.RALAB_MASTER.productForm();await f.wait(120);
 assert.ok(w.document.getElementById('mpStockCategory'));
 assert.ok(w.document.getElementById('mpRequiredLength'));
 assert.ok(w.document.getElementById('mpRequiredSemiType'));
 assert.match(w.document.getElementById('mpStockRoute').textContent,/Vaste route/);
});

test('Kreon Long koppelt alleen aan exact half-fabricaattype X',async t=>{
 const {w}=await fullApp(t),api=w.RALAB_INVENTORY,product={stockCategory:'semi',requiredSemiFinishedType:'Half-fabricaat X'};
 assert.equal(api.productYield({category:'semi',semi_finished_type:'Half-fabricaat X',quantity:35},product),35);
 assert.equal(api.productYield({category:'semi',semi_finished_type:'Half-fabricaat Y',quantity:35},product),0);
});

test('NILA Flush berekent albastgewicht en rendement in kg en euro',async t=>{
 const {w}=await fullApp(t),calc=w.RALAB_INVENTORY_ECONOMICS,product={name:'NILA Flush',stockCategory:'slab',requiredStockLengthMm:1000,requiredStockWidthMm:45,requiredStockThicknessMm:50,stockDensityKgDm3:2.7},item={category:'slab',quantity:1,unit:'platen',length_mm:2000,width_mm:1000,height_mm:50,density_kg_dm3:2.7,purchase_total_eur:540};
 assert.equal(calc.kgPerProduct(product),6.075);
 const result=calc.economics(item,product);
 assert.equal(result.possible,44);
 assert.equal(Math.round(result.usedKg*10)/10,267.3);
 assert.equal(Math.round(result.wasteKg*10)/10,2.7);
 assert.equal(Math.round(result.wasteValue*10)/10,5.4);
 assert.equal(Math.round(result.costPerProduct*100)/100,12.27);
});
