// rAlabaster performance layer: faster rendering/sync without changing planning rules.
(()=>{
  const VERSION='20260911-1';
  let installed=false;
  let renderActive=false;
  let taskIndex=new Map();
  let analysisCache=new Map();
  let lastTasksRef=null;
  let cloudStamp='';
  let cloudPrimed=false;

  function buildTaskIndex(){
    taskIndex=new Map();
    const tasks=Array.isArray(state?.tasks)?state.tasks:[];
    for(const t of tasks){
      if(!taskIndex.has(t.orderId))taskIndex.set(t.orderId,[]);
      taskIndex.get(t.orderId).push(t);
    }
    for(const arr of taskIndex.values())arr.sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
    lastTasksRef=tasks;
  }

  function install(){
    if(installed)return true;
    if(typeof render!=='function'||typeof orderTasks!=='function'||typeof orderAnalysis!=='function'||typeof loadCloudState!=='function')return false;

    const originalRender=render;
    const originalOrderTasks=orderTasks;
    const originalOrderAnalysis=orderAnalysis;
    const originalLoadCloudState=loadCloudState;
    const originalSaveCloudState=typeof saveCloudState==='function'?saveCloudState:null;

    orderTasks=function(orderId){
      if(renderActive){
        if(lastTasksRef!==state.tasks)buildTaskIndex();
        return taskIndex.get(orderId)||[];
      }
      return originalOrderTasks(orderId);
    };

    orderAnalysis=function(o){
      if(!renderActive)return originalOrderAnalysis(o);
      const key=o?.id||'';
      if(key&&analysisCache.has(key))return analysisCache.get(key);
      const result=originalOrderAnalysis(o);
      if(key)analysisCache.set(key,result);
      return result;
    };

    render=function(){
      buildTaskIndex();
      analysisCache.clear();
      renderActive=true;
      try{return originalRender.apply(this,arguments)}
      finally{renderActive=false}
    };

    // Silent cloud refreshes first check only the timestamp. If nothing changed,
    // no large JSON payload is pulled into the UI and no render is triggered.
    loadCloudState=async function(silent=false){
      if(!silent){
        const result=await originalLoadCloudState(false);
        try{
          if(supabaseClient&&cloudUser){
            const {data}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
            cloudStamp=data?.updated_at||cloudStamp;
            cloudPrimed=!!cloudStamp;
          }
        }catch(_){/* keep normal sync behaviour */}
        return result;
      }
      if(!supabaseClient||!cloudUser||cloudLoading)return;
      try{
        const {data,error}=await supabaseClient.from('planner_shared_state').select('updated_at').eq('workspace_id',WORKSPACE_ID).maybeSingle();
        if(error)throw error;
        const nextStamp=data?.updated_at||'';
        if(!cloudPrimed){cloudStamp=nextStamp;cloudPrimed=true;return}
        if(nextStamp&&nextStamp===cloudStamp)return;
        const result=await originalLoadCloudState(true);
        cloudStamp=nextStamp||cloudStamp;
        return result;
      }catch(e){
        console.warn('Snelle cloudcheck mislukt; normale synchronisatie gebruikt.',e);
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
        }catch(_){/* saving itself already succeeded/failed in original function */}
        return result;
      };
    }

    window.RALAB_PERFORMANCE={version:VERSION,rebuildTaskIndex:buildTaskIndex};
    installed=true;
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(install()||tries>80)clearInterval(timer);
  },100);
})();
