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
