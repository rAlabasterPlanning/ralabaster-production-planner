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
 const item={category:'slab',length_mm:1000,width_mm:600};
 const product={finishedLengthMm:300,finishedWidthMm:200,stockAllowanceMm:0};
 assert.equal(api.productYield(item,product),10);
});

test('productkaart bevat magazijnmaatvoering',async t=>{
 const f=await fullApp(t),{w}=f;
 w.RALAB_MASTER.productForm();await f.wait(120);
 assert.ok(w.document.getElementById('mpStockCategory'));
 assert.ok(w.document.getElementById('mpFinishedLength'));
 assert.match(w.document.getElementById('mpStockRoute').textContent,/Vaste route/);
});
