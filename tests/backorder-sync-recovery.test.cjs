const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(client){const source=fs.readFileSync(require.resolve('../assets/performance-v1.js'),'utf8').replace('  let tries=0;','  window.testApi={upsertChunks,acceptSavedDeadlines,seedHashes,mergeOperationalRows};\n  let tries=0;');const c=vm.createContext({window:{},state:{orders:[],tasks:[]},structuredClone,WORKSPACE_ID:'ralabaster',supabaseClient:client,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:f=>f(),console});vm.runInContext(source,c);return c;}
test('a backorder closure is kept as a draft while valid order changes in the batch are saved',async()=>{
 const server={id:'partial',qty:19,deliveredQty:5,backorderQty:14,deliveries:[{id:'dl1',qty:5}],active:true,status:'confirmed',orderCompletionUpdatedAt:'2026-11-18'};
 const attempted={...server,active:false,status:'completed',closed:true,completedAt:'2026-11-19',completedQty:19,orderCompletionUpdatedAt:'2026-11-19',projectCartNumber:'24'};
 const rows=[{workspace_id:'ralabaster',order_id:'partial',active:false,status:'completed',data:structuredClone(attempted)},{workspace_id:'ralabaster',order_id:'valid',active:true,status:'confirmed',data:{id:'valid',projectCartNumber:'10'}}];
 let writes=0,saved;
 const client={from(table){assert.equal(table,'planner_orders_v2');return{upsert(values){writes++;saved=structuredClone(values);return{select:async()=>writes===1?{error:{code:'P0001',message:'Er staat nog een backorder open. Registreer eerst de resterende levering'}}:{data:values.map(r=>({data:r.data}))}}},select(){return this},eq(){return this},in:async()=>({data:[{order_id:'partial',data:server}]})}}};
 const c=fixture(client);c.state.orders=[structuredClone(attempted),{id:'valid',projectCartNumber:'10'}];
 const result=await c.window.testApi.upsertChunks('planner_orders_v2',rows,true);assert.equal(writes,2);assert.equal(saved[0].active,true);assert.equal(saved[0].status,'confirmed');assert.equal(saved[0].data.deliveredQty,5);assert.equal(saved[0].data.pendingBackorderCloseout.attempted.completedQty,19);assert.equal(saved[0].data.projectCartNumber,'24');assert.equal(saved[1].data.projectCartNumber,'10');assert.equal(saved[0].data.completedAt,undefined);
 c.window.testApi.acceptSavedDeadlines(result,{orders:rows.map(r=>r.data)});assert.equal(c.state.orders[0].active,true);assert.equal(c.state.orders[0].status,'confirmed');assert.equal(c.state.orders[0].pendingBackorderCloseout.attempted.closed,true);
});
test('unrelated database errors are not masked or retried as backorder recovery',async()=>{let writes=0;const c=fixture({from(){writes++;return{upsert(){return{select:async()=>({error:{message:'permission denied',code:'42501'}})}}}}});await assert.rejects(c.window.testApi.upsertChunks('planner_orders_v2',[{order_id:'x',data:{id:'x'}}],true),/permission denied/);assert.equal(writes,1)});
test('recovery combines an iPad cloud note and latest cart with independent PC edits',async()=>{
 const base={id:'partial',qty:19,active:true,status:'confirmed',deliveredQty:5,note:'Old note',project:'Old project',projectCartNumber:'18',projectCartUpdatedAt:'2026-11-19T10:00:00Z'};
 const ipad={...base,note:'Latest iPad note',projectCartNumber:'24',projectCartUpdatedAt:'2026-11-19T12:00:00Z'};
 const pc={...base,active:false,status:'completed',closed:true,project:'PC project edit',actualWeight:7,completedQty:19,orderCompletionUpdatedAt:'2026-11-19T11:00:00Z'};
 let writes=0,stored;const c=fixture({from(){return{upsert(rows){stored=structuredClone(rows);writes++;return{select:async()=>writes===1?{error:{message:'Er staat nog een backorder open'}}:{data:rows.map(r=>({data:r.data}))}}},select(){return this},eq(){return this},in:async()=>({data:[{order_id:'partial',data:ipad}]})}}});
 c.state.orders=[structuredClone(base)];c.window.testApi.seedHashes();c.state.orders=[structuredClone(pc)];const snapshot={orders:[structuredClone(pc)]};
 const result=await c.window.testApi.upsertChunks('planner_orders_v2',[{order_id:'partial',workspace_id:'ralabaster',active:false,status:'completed',data:snapshot.orders[0]}],true);c.window.testApi.acceptSavedDeadlines(result,snapshot);
 assert.equal(stored[0].data.note,'Latest iPad note');assert.equal(stored[0].data.project,'PC project edit');assert.equal(stored[0].data.projectCartNumber,'24');assert.equal(stored[0].data.actualWeight,7);assert.equal(stored[0].data.completedQty,19);assert.equal(c.state.orders[0].note,'Latest iPad note');assert.equal(c.state.orders[0].project,'PC project edit');assert.equal(c.state.orders[0].projectCartNumber,'24');
});
test('latest cached iPad cart survives startup and beats an older cloud cart',()=>{
 const c=fixture({}),server={id:'o',projectCartNumber:'18',projectCartUpdatedAt:'2026-11-19T10:00:00Z'},ipad={id:'o',projectCartNumber:'24',projectCartUpdatedAt:'2026-11-19T12:00:00Z'};
 const result=c.window.testApi.mergeOperationalRows([server],[ipad],new Map(),[[['projectCartNumber'],'projectCartUpdatedAt']]);assert.equal(result[0].projectCartNumber,'24');
 const pc=c.window.testApi.mergeOperationalRows([ipad],[server],new Map(),[[['projectCartNumber'],'projectCartUpdatedAt']]);assert.equal(pc[0].projectCartNumber,'24');
});
for(const archived of [false,true])test('recovery handles '+(archived?'an archived order with a stale larger quantity':'a string-valued closed flag'),async()=>{
 const server={id:'o',qty:5,deliveredQty:archived?5:2,active:!archived,status:archived?'completed':'confirmed',completedQty:5};
 const local={...server,qty:10,active:!archived,status:archived?'completed':'confirmed',closed:'true',note:'iPad details'};let writes=0,saved;
 const c=fixture({from(){return{upsert(rows){writes++;saved=structuredClone(rows);return{select:async()=>writes===1?{error:{message:'Er staat nog een backorder open'}}:{data:rows.map(r=>({data:r.data}))}}},select(){return this},eq(){return this},in:async()=>({data:[{order_id:'o',data:server}]})}}});
 await c.window.testApi.upsertChunks('planner_orders_v2',[{order_id:'o',active:!archived,status:local.status,data:local}],true);assert.equal(writes,2);assert.equal(saved[0].data.pendingBackorderCloseout.attempted.note,'iPad details');assert.equal(saved[0].data.pendingBackorderCloseout.attempted.qty,10);assert.equal(saved[0].data.qty,archived?5:10);assert.equal(saved[0].active,!archived);
});
test('remaining failed batch is split and names the exact conflicting order while saving other rows',async()=>{
 const accepted=[];const c=fixture({from(){return{upsert(rows){return{select:async()=>{if(rows.some(r=>r.order_id==='bad'))return{error:{message:'Er staat nog een backorder open'}};accepted.push(...rows.map(r=>r.order_id));return{data:rows.map(r=>({data:r.data}))}}}},select(){return this},eq(){return this},in:async()=>({data:[]})}}});
 await assert.rejects(c.window.testApi.upsertChunks('planner_orders_v2',[{order_id:'good',order_no:'GOOD',data:{id:'good'}},{order_id:'bad',order_no:'BAD-123',data:{id:'bad'}}],true),/BAD-123/);assert.deepEqual(accepted,['good']);
});
