const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const values=new Map(),source=fs.readFileSync(require.resolve('../assets/performance-v1.js'),'utf8').replace('  let tries=0;','  window.recoveryTest={preserveDeletedOrderConflicts,loadNormalizedCloud,saveNormalizedCloud};\n  let tries=0;');
 const c=vm.createContext({window:{},state:{orders:[],tasks:[],quotes:[{id:'q1',qty:10,priceTiers:[{qty:10,saleUnit:100},{qty:25,saleUnit:80}]}]},structuredClone,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},KEY:'cache',WORKSPACE_ID:'ralabaster',setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},requestAnimationFrame:f=>f(),console,cloudUser:{id:'admin'},cloudStatus:'error',cloudLoading:false,renderOnlineBadge:()=>{},isExternalTask:()=>false,isDryTask:()=>false});
 vm.runInContext(source,c);return c;
}
test('stale deleted-order copies and their pending tasks are preserved before active merge',()=>{
 const c=fixture(),local={orders:[{id:'old',active:true,status:'needs_calculation',note:'Unsaved note'},{id:'keep',qty:7}],tasks:[{id:'pending',orderId:'old',note:'Pending task edit'},{id:'keep-task',orderId:'keep'}]},before=structuredClone(local);
 c.window.recoveryTest.preserveDeletedOrderConflicts(local,[{order_id:'old',deleted:true,data:{id:'old',deleted:true,deletionBackup:{note:'Server original'}}}]);
 assert.deepEqual(local.orders,[before.orders[1]]);assert.deepEqual(local.tasks,[before.tasks[1]]);
 const saved=JSON.parse(c.localStorage.getItem('ralabaster_sync_recovery_v1'));assert.deepEqual(saved[0].localOrder,before.orders[0]);assert.deepEqual(saved[0].localTasks,[before.tasks[0]]);assert.equal(saved[0].serverOrder.deletionBackup.note,'Server original');assert.equal(local.syncRecoveryRecords[0].orderId,'old');
});
test('full storage stops recovery without removing any local orders or tasks',()=>{
 const c=fixture(),local={orders:[{id:'old',note:'Only local copy'}],tasks:[{id:'t',orderId:'old'}]},before=structuredClone(local);c.localStorage.setItem=()=>{throw Error('Quota exceeded')};
 assert.throws(()=>c.window.recoveryTest.preserveDeletedOrderConflicts(local,[{order_id:'old',deleted:true,data:{id:'old'}}]),/Quota/);assert.deepEqual(local,before);
});
test('normal orders remain untouched and repeated recovery does not duplicate copies',()=>{
 const c=fixture(),local={orders:[{id:'normal'}],tasks:[]};c.window.recoveryTest.preserveDeletedOrderConflicts(local,[{order_id:'normal',deleted:false,data:{id:'normal'}}]);assert.equal(local.orders.length,1);assert.equal(c.localStorage.getItem('ralabaster_sync_recovery_v1'),undefined);
 const rows=[{order_id:'normal',deleted:true,data:{id:'normal'}}];c.window.recoveryTest.preserveDeletedOrderConflicts(local,rows);c.window.recoveryTest.preserveDeletedOrderConflicts(local,rows);assert.equal(JSON.parse(c.localStorage.getItem('ralabaster_sync_recovery_v1')).length,1);
});
test('pending startup and save recover two tombstones, preserve quotes and save unrelated edits',async()=>{
 const c=fixture(),quotes=structuredClone(c.state.quotes),server={id:'live',active:true,status:'confirmed',note:'Before'},tombstones=['deleted-a','deleted-b'].map(id=>({order_id:id,deleted:true,data:{id,deleted:true,active:true,status:'needs_calculation',deletedAt:'2026-10-19'}}));
 c.state.orders=[{...server,note:'Legitimate local edit'},...tombstones.map(x=>({id:x.order_id,active:true,status:'needs_calculation',note:'Keep pending text'}))];c.state.tasks=[{id:'pending-task',orderId:'deleted-a',actual:15}];c.localStorage.setItem('ralabaster_planner_pending_v1','pending');
 // A fresh startup has no baseline for ordinary cached fields, so put the real
 // pending edit in a new local order; unrelated cached server fields stay safe.
 c.state.orders.push({id:'new-local',active:true,status:'confirmed',note:'New pending order'});
 let metadata={quotes},writes=[];c.supabaseClient={from(table){let deleted=false,archived=false,payload;const q={select:()=>q,eq:(k,v)=>{if(k==='deleted')deleted=v;if(k==='active'&&v===false)archived=true;return q},order:()=>q,range:()=>Promise.resolve({data:table==='planner_orders_v2'?(deleted?tombstones:archived?[]:[{data:server}]):[],error:null}),maybeSingle:()=>Promise.resolve({data:{data:payload?.data||metadata,updated_at:'stamp'},error:null}),upsert:v=>{payload=v;writes.push({table,value:structuredClone(v)});if(table==='planner_shared_state')metadata=v.data;return q},then:(resolve,reject)=>Promise.resolve({data:(Array.isArray(payload)?payload:[]).map(x=>({data:x.data})),error:null}).then(resolve,reject)};return q}};
 c.window.__RALAB_LAST_SYNC_ERROR='Previous tombstone upsert error';assert.equal(await c.window.recoveryTest.loadNormalizedCloud(),true);assert.deepEqual(Array.from(c.state.orders,o=>o.id),['live','new-local']);assert.equal(c.state.tasks.length,0);assert.equal(c.state.syncRecoveryRecords.length,2);
 await c.window.recoveryTest.saveNormalizedCloud();
 assert.equal(c.window.__RALAB_LAST_SYNC_ERROR,undefined);assert.equal(c.cloudStatus,'online');assert.equal(c.localStorage.getItem('ralabaster_planner_pending_v1'),undefined);
 const orders=writes.filter(x=>x.table==='planner_orders_v2').flatMap(x=>x.value);assert.deepEqual(orders.map(x=>x.order_id),['new-local']);assert.equal(orders[0].data.note,'New pending order');assert.equal(metadata.syncRecoveryRecords.length,2);assert.deepEqual(JSON.parse(JSON.stringify(metadata.quotes)),quotes);
 assert.equal(metadata.syncRecoveryRecords.find(x=>x.orderId==='deleted-a').localTasks[0].actual,15);
});
