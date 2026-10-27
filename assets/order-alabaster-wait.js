// A material hold is an order flag, not a fabricated timed production task.
(()=>{'use strict';
 const S=()=>{try{return state}catch(_){return null}};
 const active=o=>o?.alabasterWait?.active===true;
 function label(o){return o?.alabasterWait?.kind==='external'?'Extern':'Wacht op binnenkomst Alabaster'}
 function displayName(value){return /^(?:extern|wacht op binnenkomst\s*\(?extern\)?)$/i.test(String(value||'').trim())?'Extern':value}
 function detail(o){return o?.alabasterWait?.kind==='external'?o.alabasterWait.externalStatus==='ready'?'Ligt klaar voor extern':o.alabasterWait.externalStatus==='return'?'Wacht op retour':'Externe status nog niet gekozen':o?.alabasterWait?.purchaseStatus==='ordered'?'Besteld':o?.alabasterWait?.purchaseStatus==='pending'?'Nog bestellen':'Bestelstatus nog niet gekozen'}
 function next(o,enabled,reason,kind,externalStatus,purchaseStatus){const type=kind||o.alabasterWait?.kind||'alabaster',status=externalStatus??(o.alabasterWait?.kind==='external'&&(o.alabasterWait.active||!enabled)?o.alabasterWait.externalStatus||'':'');if(!['','ready','return'].includes(status))throw Error('Kies een geldige externe status.');const purchase=purchaseStatus??((o.alabasterWait?.kind||'alabaster')==='alabaster'&&(o.alabasterWait?.active||!enabled)?o.alabasterWait?.purchaseStatus||'':'');if(!['','ordered','pending'].includes(purchase))throw Error('Kies een geldige bestelstatus.');return{...(o.alabasterWait||{}),kind:type,externalStatus:type==='external'?status:'',purchaseStatus:type==='alabaster'?purchase:'',active:enabled,at:new Date().toISOString(),reason:String(reason||'').trim()||(enabled?label({alabasterWait:{kind:type}}):'Wachtstatus opgeheven')}}
 async function verify(o){if(!(typeof cloudUser!=='undefined'&&cloudUser&&typeof supabaseClient!=='undefined'&&supabaseClient))return;
  window.RALAB_PERFORMANCE?.flushCloudSave?.(30000).catch(()=>{});const expected=o.alabasterWait,until=Date.now()+30000;
  while(Date.now()<until){let timer;try{const result=await Promise.race([supabaseClient.from('planner_orders_v2').select('data').eq('workspace_id','ralabaster').eq('order_id',o.id).maybeSingle(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Online bevestiging duurt te lang.')),Math.max(1,until-Date.now()))})]);if(result.error)throw Error(result.error.message);const saved=result.data?.data?.alabasterWait;if(saved?.at===expected.at&&saved.active===expected.active&&saved.kind===expected.kind&&(expected.kind!=='external'||(saved.externalStatus||'')===(expected.externalStatus||''))&&(expected.kind!=='alabaster'||(saved.purchaseStatus||'')===(expected.purchaseStatus||'')))return;}finally{clearTimeout(timer)}await new Promise(resolve=>setTimeout(resolve,750))}
  throw Error('De wachtstatus is lokaal bewaard, maar nog niet online bevestigd. Controleer de verbinding en vernieuw.');
 }
 async function set(orderId,enabled,reason,kind,externalStatus,purchaseStatus){const o=S()?.orders?.find(o=>o.id===orderId&&!o.deleted&&o.active!==false&&!o.closed&&o.status!=='completed');if(!o)throw Error('Deze order is niet beschikbaar voor een wachtstatus.');const before=o.alabasterWait;o.alabasterWait=next(o,enabled,reason,kind,externalStatus,purchaseStatus);
  try{save()}catch(error){if(before===undefined)delete o.alabasterWait;else o.alabasterWait=before;throw error}
  window.RALAB_PERFORMANCE?.invalidate?.();await verify(o);window.RALAB_ERP?.renderOrderOverview?.();window.RALAB_WORKPLACE_QUEUE?.render?.();return true;
 }
 window.RALAB_ALABASTER_WAIT={active,label,displayName,detail,next,set,verify};
})();
