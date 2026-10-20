const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../assets/order-closeout-v1.js'),'utf8');
function fixture(){
 const listeners={},fields=new Map(),order={id:'quick',orderNo:'SNEL-1',customerName:'NILA',product:'Ringen 6 sets',qty:0,quantityPending:true,needsCalculation:true,active:true,status:'needs_calculation'},state={orders:[order],tasks:[],completedOrders:[]};let html='',saves=0;
 const document={addEventListener:(name,fn,options)=>(listeners[name]||=[]).push({fn,options}),getElementById:id=>fields.get(id)||null,querySelector:()=>null,createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
 const c=vm.createContext({window:{RALAB_CUSTOMER_MODE:{active:()=>false},RALAB_PERFORMANCE:{invalidate(){}},RALAB_ERP:{renderOrderOverview(){}},RALAB_COMPLETED_ORDER_ACTIONS:{open(){}}},document,state,fetch:()=>Promise.reject(Error('offline')),atob,structuredClone,File:class{},Blob:class{},URL:{createObjectURL:()=>'',revokeObjectURL(){}},navigator:{},TextEncoder,Date,console,showModal:value=>{html=value},closeModal(){},save:()=>saves++,clearTaskPlanning(){},alert(){}});vm.runInContext(source,c);
 return{c,state,order,listeners,fields,get html(){return html},get saves(){return saves}};
}
test('iPad touch opens closeout for a quick order with unknown quantity',()=>{
 const f=fixture(),button={dataset:{closeoutOrderButton:'quick'},hasAttribute:()=>false},event={target:{closest:()=>button},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};
 const touch=f.listeners.touchend[0];assert.equal(touch.options.capture,true);assert.equal(touch.options.passive,false);touch.fn(event);
 assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.match(f.html,/Order afronden · SNEL-1/);assert.match(f.html,/id="closeoutQty"[^>]*required value=""/);assert.doesNotMatch(f.html,/id="closeoutQty"[^>]*max="0"/);
});
test('unknown quick-order quantity is saved while completing the order',()=>{
 const f=fixture(),value=v=>({value:v}),checked={checked:true};
 for(const [id,el] of Object.entries({closeoutQty:value('6'),closeoutStartWeightMode:value('batch'),closeoutStartWeight:value('0'),closeoutUnitWeight:value('0'),closeoutSaleUnit:value('0'),closeoutMaterialPriceKg:value('0'),closeoutExternalCost:value('0'),closeoutDeliveryNote:value(''),closeoutChecked:checked}))f.fields.set(id,el);
 const form={dataset:{closeoutOrder:'quick'},reportValidity:()=>true,querySelectorAll:()=>[]};assert.equal(f.c.window.RALAB_ORDER_CLOSEOUT.finish(form),true);
 assert.equal(f.order.qty,6);assert.equal(f.order.completedQty,6);assert.equal(f.order.quantityPending,false);assert.equal(f.order.needsCalculation,false);assert.equal(f.order.active,false);assert.equal(f.order.closed,true);assert.equal(f.order.status,'completed');assert.equal(f.saves,1);
});
