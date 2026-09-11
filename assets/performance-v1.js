// rAlabaster performance layer: faster navigation/rendering without changing planning rules.
(()=>{
  const VERSION='20260911-2';
  let installed=false;
  let taskIndex=new Map();
  let orderIndex=new Map();
  let indexesValid=false;
  let analysisCache=new Map();
  let cloudStamp='';
  let cloudPrimed=false;
  let pendingViewFrame=0;
  let dataGeneration=0;

  function buildIndexes(){
    taskIndex=new Map();
    orderIndex=new Map();
    const orders=Array.isArray(state?.orders)?state.orders:[];
    const tasks=Array.isArray(state?.tasks)?state.tasks:[];
    for(const o of orders)orderIndex.set(o.id,o);
    for(const t of tasks){
      if(!taskIndex.has(t.orderId))taskIndex.set(t.orderId,[]);
      taskIndex.get(t.orderId).push(t);
    }
    for(const arr of taskIndex.values())arr.sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
    indexesValid=true;
  }

  function ensureIndexes(){if(!indexesValid)buildIndexes()}
  function invalidateData(){
    indexesValid=false;
    analysisCache.clear();
    dataGeneration++;
  }

  function install(){
    if(installed)return true;
    if(typeof render!=='function'||typeof orderTasks!=='function'||typeof orderAnalysis!=='function'||typeof loadCloudState!=='function'||typeof save!=='function'||typeof switchView!=='function')return false;

    const originalRender=render;
    const originalOrder=typeof order==='function'?order:null;
    const originalOrderTasks=orderTasks;
    const originalPrevTask=typeof prevTask==='function'?prevTask:null;
    const originalOrderAnalysis=orderAnalysis;
    const originalLoadCloudState=loadCloudState;
    const originalSave=save;
    const originalSaveCloudState=typeof saveCloudState==='function'?saveCloudState:null;

    if(originalOrder){
      order=function(id){ensureIndexes();return orderIndex.get(id)||null};
    }

    orderTasks=function(orderId){
      ensureIndexes();
      return taskIndex.get(orderId)||[];
    };

    if(originalPrevTask){
      prevTask=function(t){
        if(!t)return null;
        const arr=orderTasks(t.orderId);
        const seq=Number(t.seq)||0;
        for(let i=0;i<arr.length;i++)if((Number(arr[i].seq)||0)===seq-1)return arr[i];
        return null;
      };
    }

    // Expensive feasibility/deadline calculation is retained until real data changes.
    // A save/action invalidates this immediately, so automatic planning always recalculates.
    orderAnalysis=function(o){
      if(!o)return originalOrderAnalysis(o);
      const key=(o.id||'')+'|'+dataGeneration+'|'+isoDate(new Date());
      if(analysisCache.has(key))return analysisCache.get(key);
      const result=originalOrderAnalysis(o);
      analysisCache.set(key,result);
      return result;
    };

    render=function(){
      ensureIndexes();
      return originalRender.apply(this,arguments);
    };

    save=function(){
      invalidateData();
      return originalSave.apply(this,arguments);
    };

    // Make the selected tab react visually first. Heavy rendering happens on the next frame.
    switchView=function(v){
      currentView=v;
      document.querySelectorAll('section[id^="view-"]').forEach(x=>x.classList.add('hidden'));
      document.getElementById('view-'+v)?.classList.remove('hidden');
      document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
      if(pendingViewFrame)cancelAnimationFrame(pendingViewFrame);
      pendingViewFrame=requestAnimationFrame(()=>{
        pendingViewFrame=0;
        render();
      });
    };

    // Silent cloud refreshes only fetch the large state when updated_at changed.
    loadCloudState=async function(silent=false){
      if(!silent){
        invalidateData();
        const result=await originalLoadCloudState(false);
        try{
          if(supabaseClient&&cloudUser){
            const {data}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
            cloudStamp=data?.updated_at||cloudStamp;
            cloudPrimed=!!cloudStamp;
          }
        }catch(_){/* normal sync already handled errors */}
        return result;
      }
      if(!supabaseClient||!cloudUser||cloudLoading)return;
      try{
        const {data,error}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
        if(error)throw error;
        const nextStamp=data?.updated_at||'';
        if(!cloudPrimed){cloudStamp=nextStamp;cloudPrimed=true;return}
        if(nextStamp&&nextStamp===cloudStamp)return;
        invalidateData();
        const result=await originalLoadCloudState(true);
        cloudStamp=nextStamp||cloudStamp;
        return result;
      }catch(e){
        console.warn('Snelle cloudcheck mislukt; normale synchronisatie gebruikt.',e);
        invalidateData();
        return originalLoadCloudState(true);
      }
    };

    if(originalSaveCloudState){
      saveCloudState=async function(){
        const result=await originalSaveCloudState.apply(this,arguments);
        try{
          if(supabaseClient&&cloudUser){
            const {data}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
            if(data?.updated_at){cloudStamp=data.updated_at;cloudPrimed=true}
          }
        }catch(_){/* saving itself already handled its status */}
        return result;
      };
    }

    window.RALAB_PERFORMANCE={
      version:VERSION,
      rebuildTaskIndex:()=>{invalidateData();ensureIndexes()},
      invalidate:invalidateData,
      generation:()=>dataGeneration
    };
    installed=true;
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(install()||tries>80)clearInterval(timer);
  },100);
})();
