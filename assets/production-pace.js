// Compare average production minutes per accepted piece with the operation calculation.
(function(root){
'use strict';
const C=root.RALAB_PRODUCTION_CORE||(typeof require==='function'?require('./production-core.js'):null);
const n=C.num,valid=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const setup=t=>/instellen/i.test(t.name||'')||/instellen/i.test(t.machine||'');
function configuration(order,w,snapshot){
 const tasks=(snapshot.costTasks||snapshot.tasks||[]).filter(t=>t.orderId===order.id&&!t.isStaffAbsence&&!['external','wait'].includes(t.type)&&C.matches(t,w));
 const ops=order.costing?.ops||order.templateOps||[];
 const resolve=t=>{const op=ops.find(o=>o.id===t.sourceOpId)||ops.find(o=>C.canonical(o.name)===C.canonical(t.name))||ops.find(o=>C.canonical(o.name)===C.canonical(t.machine));
 const mode=t.calcMode||op?.mode||'batch',baseline=(snapshot.baselines||[]).find(b=>b.task_id===t.id);
 const minutes=valid(t.orderCalcMinutes)?Number(t.orderCalcMinutes)*(mode==='unit'?n(order.qty):1):valid(baseline?.estimate)?Number(baseline.estimate):valid(t.estimate)?Number(t.estimate):n(op?.minutes)*(mode==='unit'?n(order.qty):1);
 return{task:t,minutes};};
 return{production:tasks.filter(t=>!setup(t)).map(resolve),setup:tasks.filter(setup).map(resolve)};
}
function liveRow(s,snapshot,at){
 const row={order_id:s.order_id,workplace_name:s.workplace_name,task_id:s.task_id,good:n(s.good),scrap:n(s.scrap),started_at:s.started_at,last_at:s.ended_at||s.started_at,production:0,setup:0,downtime:0,waiting:0,labor_production:0,labor_setup:0,labor_downtime:0,labor_waiting:0};
 for(const p of C.phasesFor(s,snapshot,at)){
  row[p.phase]+=p.minutes;
  for(const l of snapshot.labor||[]){if(l.superseded_at||!l.session_ids.includes(s.id))continue;
   const a=Math.max(+new Date(p.started_at),+new Date(l.started_at));
   const b=Math.min(+new Date(p.ended_at||at),+new Date(s.auto_end),+new Date(l.ended_at||at),+new Date(l.stop_at));
   row['labor_'+p.phase]+=C.minutes(a,b,true)/l.session_ids.length;
  }
 }
 return row;
}
function rows(snapshot,at){return[...(snapshot.openingBalances||[]).map(b=>({task_id:b.task_id,order_id:b.order_id,workplace_name:b.workplace_name,good:n(b.good_offset),scrap:n(b.scrap_offset),production:n(b.minutes_offset),labor_production:n(b.minutes_offset),setup:0,downtime:0,waiting:0,started_at:b.cutoff,last_at:b.cutoff,is_opening:true})),...(snapshot.costHistory||[]),...(snapshot.sessions||[]).filter(s=>!s.ended_at||!snapshot.costHistory).map(s=>{const measured=(snapshot.checkpointContext||[]).find(x=>x.session_id===s.id)?.last_report_at;return liveRow(s,snapshot,measured?Math.min(+new Date(at),+new Date(measured)):snapshot.checkpointContext?+new Date(s.started_at):at)})]}
function monitor(orderId,w,snapshot,at){
 const order=(snapshot.costOrders||snapshot.orders||[]).find(o=>o.id===orderId),data=rows(snapshot,at).filter(x=>x.order_id===orderId&&C.canonical(x.workplace_name)===C.canonical(w.name));
 const result={orderId,orderNo:order?.orderNo||'',good:0,scrap:0,actualMinutes:0,actualPerPiece:null,plannedPerPiece:null,percent:null,status:'unknown',note:'Calculatietijd ontbreekt'};
 if(!order||n(order.qty)<=0||!data.length)return result;
 const config=configuration(order,w,snapshot);
 // Order-only logging cannot disambiguate repeated operations on the same machine.
 if(config.production.length!==1)return result;
 const prod=config.production[0];
 if(prod.minutes<=0)return result;
 result.taskId=prod.task.id;result.plannedPerPiece=prod.minutes/n(order.qty);
 let setupSeen=0;
 for(const row of data){
  // Setup, waiting, breakdowns, tools and monetary rates do not alter cycle time.
  if(row.task_id&&row.task_id!==prod.task.id)continue;
  result.actualMinutes+=n(w.type==='machine'?row.production:row.labor_production);
  setupSeen+=n(row.setup);
  result.good+=n(row.good);result.scrap+=n(row.scrap);
 }
 if(result.good<=0){result.status='pending';result.note=setupSeen&&!result.actualMinutes?'Instellen · wacht op aantallen':'Wacht op aantallen';return result;}
 if(result.actualMinutes<=0){result.note='Werkelijke productietijd ontbreekt';return result;}
 result.actualPerPiece=result.actualMinutes/result.good;
 result.percent=(result.actualPerPiece/result.plannedPerPiece-1)*100;
 // Round the visible deviation before choosing its color: 0% is neutral.
 if(Math.abs(result.percent)<0.05)result.percent=0;
 result.status=result.percent>0?'over':result.percent<0?'under':'on';
 result.note=result.percent>0?'Langzamer dan calculatie':result.percent<0?'Sneller dan calculatie':'Volgens calculatie';
 return result;
}
function forWorkplace(w,snapshot,at){
 const open=(snapshot.sessions||[]).filter(s=>C.isOpen(s,at)&&C.canonical(s.workplace_name)===C.canonical(w.name)&&s.order_id);
 let ids=[...new Set(open.map(s=>s.order_id))];
 if(!ids.length){const last=rows(snapshot,at).filter(x=>x.order_id&&C.canonical(x.workplace_name)===C.canonical(w.name)).sort((a,b)=>+new Date(b.last_at)-+new Date(a.last_at))[0];if(last)ids=[last.order_id];}
 return ids.map(id=>({...monitor(id,w,snapshot,at),last:!open.length}));
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markup(w,snapshot,at){
 if(snapshot.costUnavailable)return '<div class="machine-pace unknown"><span>Tijd per stuk t.o.v. calculatie</span><small>Calculatiegegevens niet geladen</small></div>';
 const items=forWorkplace(w,snapshot,at);
 if(!items.length)return '<div class="machine-pace unknown"><span>Tijd per stuk t.o.v. calculatie</span><small>Nog geen productie geregistreerd</small></div>';
 const minutes=x=>Number(x).toLocaleString('nl-NL',{maximumFractionDigits:2});
 const percent=x=>(x>0?'+':x<0?'−':'')+Math.abs(x).toLocaleString('nl-NL',{maximumFractionDigits:1})+'%';
 return items.map(m=>`<div class="machine-pace ${m.status}" title="Gemiddelde geregistreerde productietijd per goed stuk voor deze order op deze machine, vergeleken met de calculatie. Instellen, storing, wachten en gereedschapskosten vallen buiten de productietijd."><span>Tijd per stuk${m.last?' · laatste order':''}</span><strong>${m.percent===null?'—':percent(m.percent)}</strong><small>${m.actualPerPiece===null?'':`${minutes(m.actualPerPiece)} min werkelijk · ${minutes(m.plannedPerPiece)} min begroot`}</small><small>${esc(m.orderNo)} · ${esc(m.note)}</small><small>${m.percent===null?'':`${m.good} goed · gemiddelde${snapshot.checkpointContext?' · laatste telling':''}${m.good<5?' · voorlopig':''}`}</small></div>`).join('');
}
const api={monitor,forWorkplace,markup,liveRow,rows};root.RALAB_PRODUCTION_PACE=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
