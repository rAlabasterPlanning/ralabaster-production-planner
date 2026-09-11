// rAlabaster scalable performance/data layer.
// Goal: instant navigation with large history, exact planning calculations on actions,
// indexed in-memory planning and normalized Supabase persistence for orders/tasks.
(()=>{
  const VERSION='20260911-3';
  const PAGE_SIZE=1000;
  const BACKLOG_ORDER_LIMIT=120;
  let installed=false;
  let indexesValid=false;
  let taskIndex=new Map(),orderIndex=new Map(),dateEmpIndex=new Map();
  let uniqueMachines=[];
  let renderMode=false;
  let analysisCache=new Map();
  let warmToken=0;
  let pendingViewFrame=0;
  let cloudStamp='';
  let normalizedReady=false;
  let normalizedInitBusy=false;
  let lastOrderHashes=new Map(),lastTaskHashes=new Map();

  const stable=x=>JSON.stringify(x);
  const hash=x=>stable(x);
  const idle=cb=>(window.requestIdleCallback||((f)=>setTimeout(()=>f({timeRemaining:()=>8,didTimeout:false}),1)))(cb,{timeout:80});

  function buildIndexes(){
    taskIndex=new Map();orderIndex=new Map();dateEmpIndex=new Map();const machines=new Set();
    const orders=Array.isArray(state?.orders)?state.orders:[];
    const tasks=Array.isArray(state?.tasks)?state.tasks:[];
    for(const o of orders)orderIndex.set(o.id,o);
    for(const t of tasks){
      if(!taskIndex.has(t.orderId))taskIndex.set(t.orderId,[]);
      taskIndex.get(t.orderId).push(t);
      if(t.machine)machines.add(t.machine);
      if(t.status==='done'||isExternalTask(t)||isDryTask(t))continue;
      const segs=Array.isArray(t.planSegments)&&t.planSegments.length?t.planSegments:(t.date&&t.employee?[{date:t.date,employee:t.employee,start:t.start||'',minutes:Number(t.estimate)||0}]:[]);
      for(const seg of segs){
        const k=(seg.date||'')+'|'+(seg.employee||'');
        if(!dateEmpIndex.has(k))dateEmpIndex.set(k,[]);
        dateEmpIndex.get(k).push({task:t,seg});
      }
    }
    for(const arr of taskIndex.values())arr.sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
    for(const arr of dateEmpIndex.values())arr.sort((a,b)=>(a.seg.start||'99:99').localeCompare(b.seg.start||'99:99')||(Number(a.task.seq)||0)-(Number(b.task.seq)||0));
    uniqueMachines=[...machines].sort();indexesValid=true;
  }
  function ensureIndexes(){if(!indexesValid)buildIndexes()}
  function invalidate(){indexesValid=false;analysisCache.clear();warmToken++;}
  function getOrder(id){ensureIndexes();return orderIndex.get(id)||null}
  function getOrderTasks(id){ensureIndexes();return taskIndex.get(id)||[]}
  function activeOrders(){return (state.orders||[]).filter(o=>o.active!==false&&o.status!=='completed')}

  function lightweightAnalysis(o){
    const ts=getOrderTasks(o?.id);let rem=0,unp=0,last='';
    for(const t of ts){
      if(t.status==='done'||isExternalTask(t)||isDryTask(t))continue;
      rem+=Number(t.estimate)||0;if(!hasPlanning(t))unp+=Number(t.estimate)||0;
      const d=t.date||'';if(d>last)last=d;
    }
    let status='ok',label='Haalbaar';
    if(!o?.deadline){status='risk';label='Geen deadline'}
    else if(last&&last>o.deadline){status='bad';label='Niet haalbaar'}
    else if(workdaysBetween(isoDate(new Date()),o.deadline)<=3){status='risk';label='Deze week plannen'}
    return {status,label,remaining:rem,unplanned:unp,finish:last,finishOT:last,slackDays:o?.deadline&&last?workdaysBetween(last,o.deadline):null,_light:true};
  }

  function warmAnalyses(originalOrderAnalysis){
    const token=++warmToken;
    const arr=activeOrders().slice().sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999')).slice(0,400);
    let i=0;
    const run=deadline=>{
      if(token!==warmToken)return;
      let n=0;
      while(i<arr.length&&n<4&&(deadline.didTimeout||deadline.timeRemaining()>2)){
        const o=arr[i++];
        try{analysisCache.set(o.id,originalOrderAnalysis(o))}catch(_){/* exact calc remains available on demand */}
        n++;
      }
      if(i<arr.length)idle(run);
    };
    idle(run);
  }

  function compactLocalState(){
    const activeIds=new Set((state.orders||[]).filter(o=>o.active!==false&&o.status!=='completed').map(o=>o.id));
    const compact={...state,orders:(state.orders||[]).filter(o=>activeIds.has(o.id)),tasks:(state.tasks||[]).filter(t=>activeIds.has(t.orderId)||t.orderId==='__workshop_general__'),normalizedVersion:2};
    let txt='';try{txt=JSON.stringify(compact)}catch(_){return null}
    if(txt.length>3800000){compact.orders=[];compact.tasks=[];txt=JSON.stringify(compact)}
    return txt;
  }

  async function fetchPaged(makeQuery){
    const out=[];let from=0;
    while(true){
      const {data,error}=await makeQuery(from,from+PAGE_SIZE-1);
      if(error)throw error;
      const rows=data||[];out.push(...rows);
      if(rows.length<PAGE_SIZE)break;
      from+=PAGE_SIZE;
      if(from>200000)break;
    }
    return out;
  }

  function seedHashes(){
    lastOrderHashes=new Map((state.orders||[]).map(o=>[o.id,hash(o)]));
    lastTaskHashes=new Map((state.tasks||[]).map(t=>[t.id,hash(t)]));
  }

  async function loadNormalizedCloud(silent=false){
    if(!supabaseClient||!cloudUser)return false;
    if(normalizedInitBusy)return false;normalizedInitBusy=true;
    try{
      if(!silent){cloudStatus='syncing';renderOnlineBadge()}
      const metaReq=supabaseClient.from('planner_shared_state').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
      const orderReq=fetchPaged((a,b)=>supabaseClient.from('planner_orders_v2').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).eq('deleted',false).eq('active',true).order('deadline',{ascending:true,nullsFirst:false}).range(a,b));
      const taskReq=fetchPaged((a,b)=>supabaseClient.from('planner_tasks_v2').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).eq('deleted',false).eq('order_active',true).range(a,b));
      const [metaRes,orderRows,taskRows]=await Promise.all([metaReq,orderReq,taskReq]);
      if(metaRes.error)throw metaRes.error;
      const meta=metaRes.data?.data||{};
      const currentWorkshop=(state.orders||[]).filter(o=>o.orderId==='__workshop_general__'||o.id==='__workshop_general__');
      state={...state,...meta,orders:orderRows.map(r=>r.data),tasks:taskRows.map(r=>r.data)};
      if(currentWorkshop.length&&!state.orders.some(o=>o.id==='__workshop_general__'))state.orders.push(...currentWorkshop);
      if(!Array.isArray(state.deletedTasks))state.deletedTasks=[];
      if(!Array.isArray(state.history))state.history=[];
      cloudStamp=metaRes.data?.updated_at||cloudStamp;
      normalizedReady=true;invalidate();seedHashes();
      const local=compactLocalState();if(local)try{localStorage.setItem(KEY,local)}catch(_){ }
      cloudStatus='online';
      if(!silent)render();
      renderOnlineBadge();
      warmAnalyses(window.__RALAB_ORIGINAL_ORDER_ANALYSIS||orderAnalysis);
      return true;
    }catch(e){
      console.warn('Genormaliseerde plannerdata laden mislukt; snapshot blijft actief.',e);
      cloudStatus='error';renderOnlineBadge();return false;
    }finally{normalizedInitBusy=false}
  }

  function orderRow(o,now){return {workspace_id:WORKSPACE_ID,order_id:o.id,order_no:o.orderNo||'',active:o.active!==false&&o.status!=='completed',status:o.status||'',deadline:/^\d{4}-\d{2}-\d{2}$/.test(o.deadline||'')?o.deadline:null,completed_at:/^\d{4}-\d{2}-\d{2}$/.test(o.completedAt||'')?o.completedAt:null,data:o,deleted:false,updated_at:now}}
  function taskRow(t,orderActive,now){return {workspace_id:WORKSPACE_ID,task_id:t.id,order_id:t.orderId,seq:Number(t.seq)||null,status:t.status||'',task_date:/^\d{4}-\d{2}-\d{2}$/.test(t.date||'')?t.date:null,employee:t.employee||null,machine:t.machine||null,task_type:t.type||(isExternalTask(t)?'external':isDryTask(t)?'wait':'internal'),order_active:!!orderActive,data:t,deleted:false,updated_at:now}}
  async function upsertChunks(table,rows){for(let i=0;i<rows.length;i+=300){const {error}=await supabaseClient.from(table).upsert(rows.slice(i,i+300));if(error)throw error}}

  async function saveNormalizedCloud(){
    if(!supabaseClient||!cloudUser||cloudLoading)return;
    if(!normalizedReady)return window.__RALAB_ORIGINAL_SAVE_CLOUD_STATE?.();
    cloudStatus='syncing';renderOnlineBadge();
    const now=new Date().toISOString(),orders=state.orders||[],tasks=state.tasks||[];
    const activeByOrder=new Map(orders.map(o=>[o.id,o.active!==false&&o.status!=='completed']));
    const changedOrders=[],changedTasks=[];
    const currentOrderIds=new Set(),currentTaskIds=new Set();
    for(const o of orders){currentOrderIds.add(o.id);const h=hash(o);if(lastOrderHashes.get(o.id)!==h)changedOrders.push(orderRow(o,now))}
    for(const t of tasks){currentTaskIds.add(t.id);const h=hash(t);if(lastTaskHashes.get(t.id)!==h)changedTasks.push(taskRow(t,activeByOrder.get(t.orderId)!==false,now))}
    const deletedOrders=[];for(const id of lastOrderHashes.keys())if(!currentOrderIds.has(id))deletedOrders.push({workspace_id:WORKSPACE_ID,order_id:id,active:false,deleted:true,data:{id},updated_at:now});
    const deletedTasks=[];for(const id of lastTaskHashes.keys())if(!currentTaskIds.has(id))deletedTasks.push({workspace_id:WORKSPACE_ID,task_id:id,order_id:'',order_active:false,deleted:true,data:{id},updated_at:now});
    try{
      if(changedOrders.length)await upsertChunks('planner_orders_v2',changedOrders);
      if(changedTasks.length)await upsertChunks('planner_tasks_v2',changedTasks);
      if(deletedOrders.length)await upsertChunks('planner_orders_v2',deletedOrders);
      // Removed tasks are normally tracked in deletedTasks by the app; avoid invalid empty order_id tombstones.
      const meta={...state,orders:[],tasks:[],normalizedVersion:2};
      const {error}=await supabaseClient.from('planner_shared_state').upsert({workspace_id:WORKSPACE_ID,data:meta,updated_at:now},{onConflict:'workspace_id'});
      if(error)throw error;
      cloudStamp=now;seedHashes();cloudStatus='online';renderOnlineBadge();
    }catch(e){cloudStatus='error';renderOnlineBadge();console.error(e)}
  }

  async function loadArchivedOrders(page=0,pageSize=100,search=''){
    if(!supabaseClient||!cloudUser||!normalizedReady)return (state.orders||[]).filter(o=>o.active===false||o.status==='completed').slice(page*pageSize,(page+1)*pageSize);
    let q=supabaseClient.from('planner_orders_v2').select('data',{count:'exact'}).eq('workspace_id',WORKSPACE_ID).eq('deleted',false).eq('active',false).order('updated_at',{ascending:false}).range(page*pageSize,page*pageSize+pageSize-1);
    if(search)q=q.ilike('order_no','%'+search.replace(/[%_]/g,'')+'%');
    const {data,error,count}=await q;if(error)throw error;const arr=(data||[]).map(r=>r.data);arr.total=count||arr.length;return arr;
  }

  async function loadOrderBundle(id){
    const local=getOrder(id);if(local)return {order:local,tasks:getOrderTasks(id)};
    if(!supabaseClient||!cloudUser||!normalizedReady)return null;
    const [oRes,tRes]=await Promise.all([
      supabaseClient.from('planner_orders_v2').select('data').eq('workspace_id',WORKSPACE_ID).eq('order_id',id).eq('deleted',false).maybeSingle(),
      supabaseClient.from('planner_tasks_v2').select('data').eq('workspace_id',WORKSPACE_ID).eq('order_id',id).eq('deleted',false).order('seq')
    ]);
    if(oRes.error||tRes.error)throw(oRes.error||tRes.error);
    return oRes.data?.data?{order:oRes.data.data,tasks:(tRes.data||[]).map(r=>r.data)}:null;
  }

  function install(){
    if(installed)return true;
    if(typeof render!=='function'||typeof orderTasks!=='function'||typeof orderAnalysis!=='function'||typeof loadCloudState!=='function'||typeof save!=='function'||typeof switchView!=='function')return false;
    const originalRender=render,originalOrderAnalysis=orderAnalysis,originalLoadCloudState=loadCloudState,originalSave=save,originalSaveCloudState=saveCloudState;
    window.__RALAB_ORIGINAL_ORDER_ANALYSIS=originalOrderAnalysis;
    window.__RALAB_ORIGINAL_SAVE_CLOUD_STATE=originalSaveCloudState;

    order=function(id){return getOrder(id)};
    orderTasks=function(id){return getOrderTasks(id)};
    prevTask=function(t){if(!t)return null;return getOrderTasks(t.orderId).find(x=>(Number(x.seq)||0)===(Number(t.seq)||0)-1)||null};
    scheduledEntries=function(date,emp=''){ensureIndexes();if(emp)return (dateEmpIndex.get(date+'|'+emp)||[]).slice();const out=[];for(const e of EMPLOYEES)out.push(...(dateEmpIndex.get(date+'|'+e)||[]));return out};
    employeePlannedMinutes=function(date,emp,excludeOrderId='',excludeTaskId=''){ensureIndexes();let total=0;for(const x of dateEmpIndex.get(date+'|'+emp)||[]){const t=x.task;if((excludeOrderId&&t.orderId===excludeOrderId)||(excludeTaskId&&t.id===excludeTaskId))continue;total+=Number(x.seg.minutes)||0}return total};
    machineOptions=function(sel){ensureIndexes();return uniqueMachines.map(m=>`<option ${m===sel?'selected':''}>${esc(m)}</option>`).join('')};

    orderAnalysis=function(o){
      if(!o)return originalOrderAnalysis(o);
      const cached=analysisCache.get(o.id);if(cached)return cached;
      if(renderMode)return lightweightAnalysis(o);
      const exact=originalOrderAnalysis(o);analysisCache.set(o.id,exact);return exact;
    };

    // Limit the visible backlog to the most relevant orders; all data stays available in Orders/search.
    const originalBacklogGroups=typeof backlogGroups==='function'?backlogGroups:null;
    if(originalBacklogGroups){backlogGroups=function(tasks){
      if((tasks||[]).length<500)return originalBacklogGroups(tasks);
      const by=new Map();for(const t of tasks){if(!by.has(t.orderId))by.set(t.orderId,[]);by.get(t.orderId).push(t)}
      const ids=[...by.keys()].sort((a,b)=>{const A=getOrder(a),B=getOrder(b);return (A?.deadline||'9999').localeCompare(B?.deadline||'9999')}).slice(0,BACKLOG_ORDER_LIMIT);
      return originalBacklogGroups(ids.flatMap(id=>by.get(id)||[]));
    }}

    function withRender(fn){return function(){renderMode=true;try{return fn.apply(this,arguments)}finally{renderMode=false}}}
    if(typeof renderToday==='function')renderToday=withRender(renderToday);
    if(typeof renderWeeks==='function')renderWeeks=withRender(renderWeeks);
    if(typeof renderOrders==='function')renderOrders=withRender(renderOrders);
    if(typeof renderExternal==='function')renderExternal=withRender(renderExternal);
    render=function(){ensureIndexes();renderMode=true;try{return originalRender.apply(this,arguments)}finally{renderMode=false}};

    save=function(){
      invalidate();
      const txt=compactLocalState();if(txt)try{localStorage.setItem(KEY,txt)}catch(_){ }
      scheduleCloudSave();
      warmAnalyses(originalOrderAnalysis);
    };
    saveCloudState=saveNormalizedCloud;

    loadCloudState=async function(silent=false){
      if(!normalizedReady)return originalLoadCloudState(silent);
      if(!silent)return loadNormalizedCloud(false);
      if(!supabaseClient||!cloudUser||cloudLoading)return;
      try{const {data,error}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();if(error)throw error;const next=data?.updated_at||'';if(next&&next===cloudStamp)return;return loadNormalizedCloud(true)}catch(e){console.warn(e)}
    };

    switchView=function(v){
      currentView=v;document.querySelectorAll('section[id^="view-"]').forEach(x=>x.classList.add('hidden'));document.getElementById('view-'+v)?.classList.remove('hidden');document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
      if(pendingViewFrame)cancelAnimationFrame(pendingViewFrame);pendingViewFrame=requestAnimationFrame(()=>{pendingViewFrame=0;render()});
    };

    window.RALAB_PERFORMANCE={version:VERSION,invalidate,rebuild:()=>{invalidate();ensureIndexes()},getOrder,getOrderTasks,getActiveOrders:activeOrders,loadArchivedOrders,loadOrderBundle,isNormalized:()=>normalizedReady};
    installed=true;ensureIndexes();warmAnalyses(originalOrderAnalysis);
    return true;
  }

  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},100);
  const normTimer=setInterval(async()=>{
    if(!installed||normalizedReady||normalizedInitBusy)return;
    if(typeof supabaseClient!=='undefined'&&supabaseClient&&typeof cloudUser!=='undefined'&&cloudUser){const ok=await loadNormalizedCloud(false);if(ok)clearInterval(normTimer)}
  },350);
})();
