const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(initial={orders:[],tasks:[],quotes:[]}){
 const values=new Map(),source=fs.readFileSync(require.resolve('../assets/performance-v1.js'),'utf8').replace('  let tries=0;','  window.testApi={seedHashes,compactLocalState,loadNormalizedCloud,saveNormalizedCloud};\n  let tries=0;');
 const c=vm.createContext({window:{},state:structuredClone(initial),structuredClone,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},KEY:'cache',WORKSPACE_ID:'ralabaster',setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},requestAnimationFrame:f=>f(),console,cloudUser:{id:'admin'},cloudStatus:'online',cloudLoading:false,renderOnlineBadge:()=>{},isExternalTask:()=>false,isDryTask:()=>false});
 vm.runInContext(source,c);return c;
}
test('completed quick order survives reload before sync, then persists order and task completion',async()=>{
 const original={id:'o_quick_test',orderNo:'SNEL-123',active:true,status:'confirmed',qty:5},task={id:'t1',orderId:original.id,status:'open',actual:0};
 const first=fixture({orders:[original],tasks:[task],quotes:[]});first.window.testApi.seedHashes();
 Object.assign(first.state.orders[0],{active:false,closed:true,status:'completed',completedAt:'2026-10-20T17:00:00Z',completedQty:5,orderCompletionUpdatedAt:'2026-10-20T17:00:00Z'});
 Object.assign(first.state.tasks[0],{status:'done',doneQty:5,actual:90,planSegments:[],taskProgressUpdatedAt:'2026-10-20T17:00:00Z'});
 const cached=JSON.parse(first.window.testApi.compactLocalState());assert.equal(cached.orders[0].status,'completed');assert.equal(cached.tasks[0].actual,90);
 const reloaded=fixture(cached);reloaded.localStorage.setItem('ralabaster_planner_pending_v1','pending');
 let serverOrder=structuredClone(original),serverTask=structuredClone(task),metadata={quotes:[]};const writes=[];
 reloaded.supabaseClient={from(table){let archived=false,deleted=false,payload;const q={select:()=>q,eq:(k,v)=>{if(k==='active'&&v===false)archived=true;if(k==='deleted')deleted=v;return q},order:()=>q,range:()=>Promise.resolve({data:table==='planner_orders_v2'?(deleted?[]:archived?(serverOrder.active?[]:[{order_id:serverOrder.id}]):(serverOrder.active?[{data:serverOrder}]:[])):serverOrder.active?[{data:serverTask}]:[],error:null}),maybeSingle:()=>Promise.resolve({data:{data:metadata,updated_at:'stamp'},error:null}),upsert:value=>{payload=value;writes.push(table);if(table==='planner_orders_v2')serverOrder=structuredClone(value[0].data);if(table==='planner_tasks_v2')serverTask=structuredClone(value[0].data);if(table==='planner_shared_state')metadata=value.data;return q},then:(resolve,reject)=>Promise.resolve({data:(Array.isArray(payload)?payload:[]).map(x=>({data:x.data})),error:null}).then(resolve,reject)};return q}};
 assert.equal(await reloaded.window.testApi.loadNormalizedCloud(),true);assert.equal(reloaded.state.orders[0].status,'completed');assert.equal(reloaded.state.tasks[0].doneQty,5);
 await reloaded.window.testApi.saveNormalizedCloud();assert.equal(serverOrder.active,false);assert.equal(serverOrder.closed,true);assert.equal(serverTask.status,'done');assert.equal(serverTask.actual,90);assert.ok(writes.includes('planner_orders_v2'));assert.ok(writes.includes('planner_tasks_v2'));assert.equal(reloaded.localStorage.getItem('ralabaster_planner_pending_v1'),undefined);
 const savedCache=JSON.parse(reloaded.window.testApi.compactLocalState());assert.equal(savedCache.orders.length,0);assert.equal(savedCache.tasks.length,0);
 await reloaded.window.testApi.loadNormalizedCloud();assert.equal(reloaded.state.orders.length,0);assert.equal(reloaded.state.tasks.length,0);
});
test('cache size fallback preserves pending completion and quantities',()=>{
 const c=fixture({orders:[{id:'active',active:true,note:'x'.repeat(3900000)},{id:'closed',active:true}],tasks:[{id:'t',orderId:'closed',status:'open'}]});c.window.testApi.seedHashes();Object.assign(c.state.orders[1],{active:false,status:'completed',completedQty:12});Object.assign(c.state.tasks[0],{status:'done',doneQty:12});
 const cache=JSON.parse(c.window.testApi.compactLocalState());assert.deepEqual(cache.orders.map(o=>o.id),['closed']);assert.equal(cache.tasks[0].doneQty,12);
});
test('duplicate reconciliation cannot reopen or remove a completed order',()=>{
 const source=fs.readFileSync(require.resolve('../assets/quick-order-calculation-v1.js'),'utf8');
 for(const completedSide of ['quick','created']){
  const quick={id:'quick',orderNo:'SNEL-42',needsCalculation:true,active:true},created={id:'created',orderNo:'SNEL-42',needsCalculation:false,active:true,status:'confirmed'};
  Object.assign(completedSide==='quick'?quick:created,{active:false,closed:true,status:'completed',completedAt:'2026-10-20'});
  const state={orders:[quick,created],tasks:[]},before=structuredClone(state);let saves=0;
  const c=vm.createContext({state,window:{RALAB_CALC:{}},document:{addEventListener:()=>{},querySelector:()=>null,body:{}},setTimeout:()=>1,MutationObserver:class{observe(){}},save:()=>saves++,console});c.window.addEventListener=()=>{};
  vm.runInContext(source,c);assert.equal(c.window.RALAB_QUICK_CALC.reconcile(),false);assert.deepEqual(state,before);assert.equal(saves,0);
 }
});
