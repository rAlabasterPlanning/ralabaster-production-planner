const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {fullApp}=require('./full-app-fixture.cjs');

test('small bead loads unit operations and scales when quantity changes',async t=>{
 const f=await fullApp(t),{w}=f,d=w.document;
 vm.runInContext(`state.productTemplates=[{id:'small-bead',name:'A-1100-00-008 (kraal klein)',version:1,materialCost:5,materialMode:'unit',saleUnit:41,manualSalePrice:41,ops:[{name:'Alabaster klaarzetten',mode:'batch',minutes:30,rate:11},{name:'Doppen lijmen',mode:'unit',minutes:1,rate:11},{name:'Mori - Instellen',mode:'batch',minutes:30,rate:60},{name:'Mori ZL15 #1',mode:'unit',minutes:8,rate:20.5},{name:'Schuren',mode:'unit',minutes:10,rate:26},{name:'Inpakken',mode:'unit',minutes:1,rate:11}]}];`,f.ctx);
 d.querySelector('.navbtn[data-view="calculation"]').click();await f.wait(250);
 const choice=d.getElementById('cuiTemplateChoice');choice.value='small-bead';choice.dispatchEvent(new w.Event('change',{bubbles:true}));await f.wait(100);
 const read=()=>w.RALAB_OPERATION_INSTANCES.read();
 assert.equal(read().find(o=>o.name==='Mori ZL15 #1').mode,'unit');
 assert.equal(read().find(o=>o.name==='Mori ZL15 #1').minutes,8);
 for(const quantity of [1,135,200]){
  const input=d.getElementById('cQty');input.value=String(quantity);input.dispatchEvent(new w.Event('change',{bubbles:true}));await f.wait(60);
  const ops=read();assert.equal(ops.filter(o=>o.mode==='unit').length,4);
  assert.equal(ops.reduce((sum,o)=>sum+o.minutes*(o.mode==='unit'?quantity:1),0),60+20*quantity);
 }
});
