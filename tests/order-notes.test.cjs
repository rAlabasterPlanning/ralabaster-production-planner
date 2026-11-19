const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');
test('confirmed production order shows complete escaped customer note in its dialog',async t=>{
 const f=await fullApp(t);
 const note='Graag apart verpakken.\nTweede regel <img src=x onerror=alert(1)>';
 vm.runInContext(`state.orders=[{id:'note-order',orderNo:'NOTE',customerName:'Klant',product:'Albast',qty:10,active:true,status:'confirmed',source:'customer_portal',note:${JSON.stringify(note)}}];state.tasks=[];RALAB_PERFORMANCE.invalidate()`,f.ctx);
 await f.w.RALAB_ERP.openOrder('note-order');
 const section=f.w.document.querySelector('#modalRoot [data-order-notes]');
 assert.ok(section);assert.equal(section.textContent,'Klantopmerking / bestelnotitie'+note);assert.equal(section.querySelector('img'),null);assert.equal(section.style.whiteSpace,'pre-wrap');
});

test('legacy accepted order displays original quotation description, customer fallback and missing route action',async t=>{
 const f=await fullApp(t),w=f.w;
 vm.runInContext(`state.customers.push({id:'note-customer',name:'NILA'});state.orders=[{id:'legacy-note',orderNo:'AAN-legacy',customerId:'note-customer',product:'Bakker',qty:2,active:true,status:'confirmed',project:'Ring 60 en 80 cm\\nBronzen afdekplaat',costing:{project:'Ring 60 en 80 cm\\nBronzen afdekplaat',quoteNote:'Volgens klanttekening'}}];state.tasks=[];RALAB_PERFORMANCE.invalidate()`,f.ctx);
 await w.RALAB_ERP.openOrder('legacy-note');const root=w.document.getElementById('modalRoot');assert.match(root.textContent,/NILA/);assert.match(root.querySelector('[data-order-notes]').textContent,/Ring 60 en 80 cm\nBronzen afdekplaat/);assert.match(root.textContent,/Volgens klanttekening/);assert.ok(root.querySelector('[data-order-route-missing] [data-order-to-calc="legacy-note"]'));
 w.RALAB_ERP.renderOrderOverview();assert.match(w.document.getElementById('view-orderoverview').textContent,/Bronzen afdekplaat/);
});
