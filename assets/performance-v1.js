// rAlabaster scalable performance/data layer.
// UI reads indexed/lightweight data. Cloud sync is background-only and never blocks navigation.
(()=>{
  const VERSION='20260912-6';
  const PAGE_SIZE=1000;
  const BACKLOG_ORDER_LIMIT=120;
  const DIFF_CHUNK=500;
  let installed=false,indexesValid=false,normalizedReady=false,normalizedInitBusy=false;
  let taskIndex=new Map(),orderIndex=new Map(),dateEmpIndex=new Map(),uniqueMachines=[];
  let analysisCache=new Map(),lastOrderHashes=new Map(),lastTaskHashes=new Map();
  let pendingViewFrame=0,cloudStamp='',exactMode=false,localPersistTimer=0;
  let syncInFlight=false,syncQueued=false;

  const hash=x=>JSON.stringify(x);
  const yieldUI=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

  function buildIndexes(){
    taskIndex=new Map();orderIndex=new Map();dateEmpIndex=new Map();const machines=new Set();
    const orders=Array.isArray(state?.orders)?state.orders:[],tasks=Array.isArray(state?.tasks)?state.tasks:[];
    for(const o of orders)orderIndex.set(o.id,o);
    for(const t of tasks){
      if(!taskIndex.has(t.orderId))taskIndex.set(t.orderId,[]);
      taskIndex.get(t.orderId).push(t);if(t.machine)machines.add(t.machine);
      if(t.status==='done'||isExternalTask(t)||isDryTask(t))continue;
      const segs=Array.isArray(t.planSegments)&&t.planSegments.length?t.planSegments:(t.date&&t.employee?[{date:t.date,employee:t.employee,start:t.start||'',minutes:Number(t.estimate)||0}]:[]);
      for(const seg of segs){const k=(seg.date||'')+'|'+(seg.employee||'');if(!dateEmpIndex.has(k))dateEmpIndex.set(k,[]);dateEmpIndex.get(k).push({task:t,seg})}
    }
    for(const arr of taskIndex.values())arr.sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
    for(const arr of dateEmpIndex.values())arr.sort((a,b)=>(a.seg.start||'99:99').localeCompare(b.seg.start||'99:99')||(Number(a.task.seq)||0)-(Number(b.task.seq)||0));
    uniqueMachines=[...machines].sort();indexesValid=true;
  }
  function ensureIndexes(){if(!indexesValid)buildIndexes()}
  function invalidate(){indexesValid=false;analysisCache.clear()}
  function getOrder(id){ensureIndexes();return orderIndex.get(id)||null}
  function getOrderTasks(id){ensureIndexes();return taskIndex.get(id)||[]}
  function activeOrders(){return (state.orders||[]).filter(o=>!o.deleted&&o.active!==false&&o.status!=='completed')}

  function lightweightAnalysis(o){
    const ts=getOrderTasks(o?.id),today=isoDate(new Date());let rem=0,unp=0,last='';
    for(const t of ts){
      if(t.status==='done'||isExternalTask(t)||isDryTask(t))continue;
      rem+=Number(t.estimate)||0;if(!hasPlanning(t))unp+=Number(t.estimate)||0;
      for(const s of taskSegments(t)){if((s.date||'')>last)last=s.date||''}
      if(!t.planSegments?.length&&(t.date||'')>last)last=t.date||'';
    }
    let status='ok',label='Haalbaar';
    if(!o?.deadline){status='risk';label='Geen deadline'}
    else if(last&&last>o.deadline){status='bad';label='Niet haalbaar'}
    else if(workdaysBetween(today,o.deadline)<=3){status='risk';label='Deze week plannen'}
    return {status,label,remaining:rem,unplanned:unp,finish:last,finishOT:last,slackDays:o?.deadline&&last?workdaysBetween(last,o.deadline):null,_light:true};
  }

  function compactLocalState(){
    const ids=new Set(activeOrders().map(o=>o.id));
    const compact={...state,orders:(state.orders||[]).filter(o=>ids.has(o.id)),tasks:(state.tasks||[]).filter(t=>ids.has(t.orderId)||t.orderId==='__workshop_general__'),normalizedVersion:2};
    try{let txt=JSON.stringify(compact);if(txt.length>3800000){compact.orders=[];compact.tasks=[];txt=JSON.stringify(compact)}return txt}catch(_){return null}
  }
  function scheduleLocalPersist(){
    clearTimeout(localPersistTimer);
    localPersistTimer=setTimeout(()=>{const txt=compactLocalState();if(txt)try{localStorage.setItem(KEY,txt)}catch(_){}},50);
  }
  async function fetchPaged(makeQuery){const out=[];let from=0;while(true){const {data,error}=await makeQuery(from,from+PAGE_SIZE-1);if(error)throw error;const rows=data||[];out.push(...rows);if(rows.length<PAGE_SIZE)break;from+=PAGE_SIZE;if(from>200000)break;await yieldUI()}return out}
  function seedHashes(){lastOrderHashes=new Map((state.orders||[]).map(o=>[o.id,hash(o)]));lastTaskHashes=new Map((state.tasks||[]).map(t=>[t.id,hash(t)]))}

  async function loadNormalizedCloud(silent=false){
    if(!supabaseClient||!cloudUser||normalizedInitBusy)return false;normalizedInitBusy=true;
    try{
      const metaReq=supabaseClient.from('planner_shared_state').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
      const orderReq=fetchPaged((a,b)=>supabaseClient.from('planner_orders_v2').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).eq('deleted',false).eq('active',true).order('deadline',{ascending:true,nullsFirst:false}).range(a,b));
      const taskReq=fetchPaged((a,b)=>supabaseClient.from('planner_tasks_v2').select('data,updated_at').eq('workspace_id',WORKSPACE_ID).eq('deleted',false).eq('order_active',true).range(a,b));
      const [metaRes,orderRows,taskRows]=await Promise.all([metaReq,orderReq,taskReq]);if(metaRes.error)throw metaRes.error;
      const meta=metaRes.data?.data||{};
      state={...state,...meta,orders:orderRows.map(r=>r.data),tasks:taskRows.map(r=>r.data)};
      if(!Array.isArray(state.deletedTasks))state.deletedTasks=[];if(!Array.isArray(state.history))state.history=[];
      cloudStamp=metaRes.data?.updated_at||cloudStamp;normalizedReady=true;invalidate();seedHashes();scheduleLocalPersist();
      cloudStatus='online';renderOnlineBadge();
      // Do not force a render here. The currently visible UI keeps responding; the next user action reads fresh state.
      return true;
    }catch(e){console.warn('Genormaliseerde plannerdata laden mislukt; lokale planner blijft actief.',e);cloudStatus='error';renderOnlineBadge();return false}
    finally{normalizedInitBusy=false}
  }

  function orderRow(o,now){const del=!!o.deleted;return {workspace_id:WORKSPACE_ID,order_id:o.id,order_no:o.orderNo||'',active:!del&&o.active!==false&&o.status!=='completed',status:o.status||'',deadline:/^\d{4}-\d{2}-\d{2}$/.test(o.deadline||'')?o.deadline:null,completed_at:/^\d{4}-\d{2}-\d{2}$/.test(o.completedAt||'')?o.completedAt:null,data:o,deleted:del,updated_at:now}}
  function taskRow(t,active,now){const del=!!t.deleted;return {workspace_id:WORKSPACE_ID,task_id:t.id,order_id:t.orderId,seq:Number(t.seq)||null,status:t.status||'',task_date:/^\d{4}-\d{2}-\d{2}$/.test(t.date||'')?t.date:null,employee:t.employee||null,machine:t.machine||null,task_type:t.type||(isExternalTask(t)?'external':isDryTask(t)?'wait':'internal'),order_active:!!active&&!del,data:t,deleted:del,updated_at:now}}
  async function upsertChunks(table,rows){for(let i=0;i<rows.length;i+=300){const {error}=await supabaseClient.from(table).upsert(rows.slice(i,i+300));if(error)throw error;await yieldUI()}}

  async function collectChanges(now){
    const orders=state.orders||[],tasks=state.tasks||[],activeByOrder=new Map(orders.map(o=>[o.id,o.active!==false&&o.status!=='completed']));
    const changedOrders=[],changedTasks=[];
    for(let i=0;i<orders.length;i++){const o=orders[i],h=hash(o);if(lastOrderHashes.get(o.id)!==h)changedOrders.push(orderRow(o,now));if(i&&i%DIFF_CHUNK===0)await yieldUI()}
    for(let i=0;i<tasks.length;i++){const t=tasks[i],h=hash(t);if(lastTaskHashes.get(t.id)!==h)changedTasks.push(taskRow(t,activeByOrder.get(t.orderId)!==false,now));if(i&&i%DIFF_CHUNK===0)await yieldUI()}
    return {changedOrders,changedTasks};
  }

  async function saveNormalizedCloud(){
    if(!supabaseClient||!cloudUser||cloudLoading)return;
    if(!normalizedReady)return window.__RALAB_ORIGINAL_SAVE_CLOUD_STATE?.();
    if(syncInFlight){syncQueued=true;return}
    syncInFlight=true;syncQueued=false;
    const now=new Date().toISOString();
    try{
      const {changedOrders,changedTasks}=await collectChanges(now);
      if(changedOrders.length)await upsertChunks('planner_orders_v2',changedOrders);
      if(changedTasks.length)await upsertChunks('planner_tasks_v2',changedTasks);
      const meta={...state,orders:[],tasks:[],normalizedVersion:2};
      const {error}=await supabaseClient.from('planner_shared_state').upsert({workspace_id:WORKSPACE_ID,data:meta,updated_at:now},{onConflict:'workspace_id'});if(error)throw error;
      cloudStamp=now;seedHashes();cloudStatus='online';renderOnlineBadge();
    }catch(e){cloudStatus='error';renderOnlineBadge();console.error(e)}
    finally{
      syncInFlight=false;
      if(syncQueued){syncQueued=false;setTimeout(saveNormalizedCloud,100)}
    }
  }

  async function loadArchivedOrders(page=0,pageSize=100,search=''){
    if(!supabaseClient||!cloudUser||!normalizedReady)return (state.orders||[]).filter(o=>o.active===false||o.status==='completed').slice(page*pageSize,(page+1)*pageSize);
    let q=supabaseClient.from('planner_orders_v2').select('data',{count:'exact'}).eq('workspace_id',WORKSPACE_ID).eq('deleted',false).eq('active',false).order('updated_at',{ascending:false}).range(page*pageSize,page*pageSize+pageSize-1);
    if(search)q=q.ilike('order_no','%'+search.replace(/[%_]/g,'')+'%');const {data,error,count}=await q;if(error)throw error;const arr=(data||[]).map(r=>r.data);arr.total=count||arr.length;return arr;
  }
  async function loadOrderBundle(id){const local=getOrder(id);if(local)return {order:local,tasks:getOrderTasks(id)};if(!supabaseClient||!cloudUser||!normalizedReady)return null;const [oRes,tRes]=await Promise.all([supabaseClient.from('planner_orders_v2').select('data').eq('workspace_id',WORKSPACE_ID).eq('order_id',id).eq('deleted',false).maybeSingle(),supabaseClient.from('planner_tasks_v2').select('data').eq('workspace_id',WORKSPACE_ID).eq('order_id',id).eq('deleted',false).order('seq')]);if(oRes.error||tRes.error)throw(oRes.error||tRes.error);return oRes.data?.data?{order:oRes.data.data,tasks:(tRes.data||[]).map(r=>r.data)}:null}

  function install(){
    if(installed)return true;if(typeof render!=='function'||typeof orderAnalysis!=='function'||typeof loadCloudState!=='function'||typeof save!=='function'||typeof switchView!=='function')return false;
    const originalRender=render,originalOrderAnalysis=orderAnalysis,originalLoadCloudState=loadCloudState,originalSaveCloudState=saveCloudState;
    window.__RALAB_ORIGINAL_ORDER_ANALYSIS=originalOrderAnalysis;window.__RALAB_ORIGINAL_SAVE_CLOUD_STATE=originalSaveCloudState;
    order=id=>getOrder(id);orderTasks=id=>getOrderTasks(id);prevTask=t=>!t?null:getOrderTasks(t.orderId).find(x=>(Number(x.seq)||0)===(Number(t.seq)||0)-1)||null;
    scheduledEntries=function(date,emp=''){ensureIndexes();if(emp)return (dateEmpIndex.get(date+'|'+emp)||[]).slice();const out=[];for(const e of EMPLOYEES)out.push(...(dateEmpIndex.get(date+'|'+e)||[]));return out};
    employeePlannedMinutes=function(date,emp,excludeOrderId='',excludeTaskId=''){ensureIndexes();let total=0;for(const x of dateEmpIndex.get(date+'|'+emp)||[]){const t=x.task;if((excludeOrderId&&t.orderId===excludeOrderId)||(excludeTaskId&&t.id===excludeTaskId))continue;total+=Number(x.seg.minutes)||0}return total};
    machineOptions=sel=>{ensureIndexes();return uniqueMachines.map(m=>`<option ${m===sel?'selected':''}>${esc(m)}</option>`).join('')};

    orderAnalysis=function(o){if(!o)return originalOrderAnalysis(o);if(exactMode){const r=originalOrderAnalysis(o);analysisCache.set(o.id,r);return r}return analysisCache.get(o.id)||lightweightAnalysis(o)};
    window.RALAB_EXACT_ORDER_ANALYSIS=function(o){exactMode=true;try{return originalOrderAnalysis(o)}finally{exactMode=false}};

    const originalBacklogGroups=typeof backlogGroups==='function'?backlogGroups:null;
    if(originalBacklogGroups)backlogGroups=function(tasks){if((tasks||[]).length<500)return originalBacklogGroups(tasks);const by=new Map();for(const t of tasks){if(!by.has(t.orderId))by.set(t.orderId,[]);by.get(t.orderId).push(t)}const ids=[...by.keys()].sort((a,b)=>(getOrder(a)?.deadline||'9999').localeCompare(getOrder(b)?.deadline||'9999')).slice(0,BACKLOG_ORDER_LIMIT);return originalBacklogGroups(ids.flatMap(id=>by.get(id)||[]))};

    if(typeof confirmPlanEntireOrder==='function'){const originalConfirm=confirmPlanEntireOrder;confirmPlanEntireOrder=function(){exactMode=true;try{return originalConfirm.apply(this,arguments)}finally{exactMode=false}}}

    render=function(){ensureIndexes();return originalRender.apply(this,arguments)};
    save=function(){invalidate();scheduleLocalPersist();scheduleCloudSave()};
    saveCloudState=saveNormalizedCloud;
    loadCloudState=async function(silent=false){
      if(!normalizedReady)return originalLoadCloudState(silent);
      if(!supabaseClient||!cloudUser||cloudLoading)return;
      try{const {data,error}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();if(error)throw error;const next=data?.updated_at||'';if(next&&next===cloudStamp)return;return loadNormalizedCloud(true)}catch(e){console.warn(e)}
    };
    switchView=function(v){currentView=v;document.querySelectorAll('section[id^="view-"]').forEach(x=>x.classList.add('hidden'));document.getElementById('view-'+v)?.classList.remove('hidden');document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(pendingViewFrame)cancelAnimationFrame(pendingViewFrame);pendingViewFrame=requestAnimationFrame(()=>{pendingViewFrame=0;render()})};

    window.RALAB_PERFORMANCE={version:VERSION,invalidate,rebuild:()=>{invalidate();ensureIndexes()},getOrder,getOrderTasks,getActiveOrders:activeOrders,loadArchivedOrders,loadOrderBundle,isNormalized:()=>normalizedReady,exactOrderAnalysis:window.RALAB_EXACT_ORDER_ANALYSIS};
    installed=true;ensureIndexes();return true;
  }
  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(timer)},100);
  const normTimer=setInterval(async()=>{if(!installed||normalizedReady||normalizedInitBusy)return;if(typeof supabaseClient!=='undefined'&&supabaseClient&&typeof cloudUser!=='undefined'&&cloudUser){const ok=await loadNormalizedCloud(true);if(ok)clearInterval(normTimer)}},350);
})();
