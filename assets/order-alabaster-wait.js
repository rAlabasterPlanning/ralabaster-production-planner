// A material hold is an order flag, not a fabricated timed production task.
(()=>{'use strict';
 const S=()=>{try{return state}catch(_){return null}};
 const active=o=>o?.alabasterWait?.active===true;
 function next(o,enabled,reason){return{...(o.alabasterWait||{}),active:enabled,at:new Date().toISOString(),reason:String(reason||'').trim()||(enabled?'Wacht op binnenkomst Alabaster':'Wachtstatus opgeheven')}}
 async function verify(o){if(!(typeof cloudUser!=='undefined'&&cloudUser&&typeof supabaseClient!=='undefined'&&supabaseClient))return;
  window.RALAB_PERFORMANCE?.flushCloudSave?.(30000).catch(()=>{});const expected=o.alabasterWait,until=Date.now()+30000;
  while(Date.now()<until){let timer;try{const result=await Promise.race([supabaseClient.from('planner_orders_v2').select('data').eq('workspace_id','ralabaster').eq('order_id',o.id).maybeSingle(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Online bevestiging duurt te lang.')),Math.max(1,until-Date.now()))})]);if(result.error)throw Error(result.error.message);if(result.data?.data?.alabasterWait?.at===expected.at&&result.data.data.alabasterWait.active===expected.active)return;}finally{clearTimeout(timer)}await new Promise(resolve=>setTimeout(resolve,750))}
  throw Error('De wachtstatus is lokaal bewaard, maar nog niet online bevestigd. Controleer de verbinding en vernieuw.');
 }
 async function set(orderId,enabled,reason){const o=S()?.orders?.find(o=>o.id===orderId&&!o.deleted&&o.active!==false&&!o.closed&&o.status!=='completed');if(!o)throw Error('Deze order is niet beschikbaar voor een wachtstatus.');const before=o.alabasterWait;o.alabasterWait=next(o,enabled,reason);
  try{save()}catch(error){if(before===undefined)delete o.alabasterWait;else o.alabasterWait=before;throw error}
  window.RALAB_PERFORMANCE?.invalidate?.();await verify(o);window.RALAB_ERP?.renderOrderOverview?.();window.RALAB_WORKPLACE_QUEUE?.render?.();return true;
 }
 window.RALAB_ALABASTER_WAIT={active,next,set,verify};
})();
