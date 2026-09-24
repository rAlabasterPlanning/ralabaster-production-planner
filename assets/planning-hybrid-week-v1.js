// Hybrid planner: exact next 5 workdays, weekly capacity reservations after that.
(()=>{
const VERSION='20260924-9';
const clone=x=>JSON.parse(JSON.stringify(x));
const S=()=>{try{return state}catch(_){return null}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>d.toISOString().slice(0,10);
const parse=d=>new Date(String(d).slice(0,10)+'T12:00:00');
function addWorkdays(date,count){
  let d=parse(date),n=0;
  while(n<count){d.setDate(d.getDate()+1);const day=d.getDay();if(day!==0&&day!==6)n++}
  return iso(d);
}
function weekKey(date){
  const d=parse(date);d.setHours(0,0,0,0);d.setDate(d.getDate()+3-((d.getDay()+6)%7));
  const y=d.getFullYear(),w1=new Date(y,0,4);const w=1+Math.round(((d-w1)/86400000-3+((w1.getDay()+6)%7))/7);
  return y+'-W'+String(w).padStart(2,'0');
}
function finishOf(t){
  const segs=Array.isArray(t?.planSegments)?t.planSegments.slice():[];
  if(segs.length){
    segs.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||''));
    const g=segs.at(-1);return g.date||'';
  }
  return t?.expectedReturnDate||String(t?.waitEndAt||'').slice(0,10)||t?.date||'';
}
function exactExisting(t){
  return !!(t?.status==='done'||t?.status==='completed'||t?.status==='in_progress'||t?.status==='started'||t?.actual>0||t?.doneQty>0||t?.lockedPlanning);
}
function buildHybrid(preview){
  const live=clone(S()),next=clone(preview.state),today=iso(new Date()),horizon=addWorkdays(today,4);
  const baseline=new Map((live.tasks||[]).map(t=>[t.id,t]));
  const orders=new Map((next.orders||[]).map(o=>[o.id,o]));
  const weekly=new Map(),exactTaskIds=new Set(),futureTaskIds=new Set();
  const futureFinish=new Map();

  for(const t of next.tasks||[]){
    const before=baseline.get(t.id),newlyPlanned=before&&!((before.planSegments||[]).length||before.date||before.waitStartAt||before.externalSentDate);
    if(!newlyPlanned||exactExisting(before))continue;
    const o=orders.get(t.orderId);if(!o)continue;
    const simulatedFinish=finishOf(t);if(simulatedFinish&&simulatedFinish>(futureFinish.get(t.orderId)||''))futureFinish.set(t.orderId,simulatedFinish);
    const segs=Array.isArray(t.planSegments)?t.planSegments:[];
    const keep=[],later=[];
    for(const g of segs){
      if(g.date&&g.date<=horizon){keep.push(g);exactTaskIds.add(t.id)}
      else if(g.date){later.push(g);futureTaskIds.add(t.id);const k=t.orderId+'|'+weekKey(g.date);weekly.set(k,(weekly.get(k)||0)+(Number(g.minutes)||0))}
    }
    if(later.length){
      t.planSegments=keep;
      if(keep.length){t.date=keep[0].date;t.start=keep[0].start||'';t.employee=keep[0].employee||t.employee;t.planningOrigin='hybrid-week'}
      else{t.planSegments=[];t.date=null;t.start='';t.employee=null;delete t.assignedMachine;t.lockedPlanning=false}
    }
    const specialDate=t.expectedReturnDate||String(t.waitEndAt||'').slice(0,10)||t.date||'';
    if(!segs.length&&specialDate&&specialDate>horizon){
      futureTaskIds.add(t.id);t.date=null;t.start='';t.employee=null;t.waitStartAt='';t.waitEndAt='';t.externalSentDate='';t.expectedReturnDate='';t.lockedPlanning=false;
    }
  }

  const byOrder=new Map();
  for(const [key,minutes] of weekly){const [orderId,week]=key.split('|');if(!byOrder.has(orderId))byOrder.set(orderId,[]);byOrder.get(orderId).push({week,minutes})}
  for(const o of next.orders||[]){
    const reservations=(byOrder.get(o.id)||[]).sort((a,b)=>a.week.localeCompare(b.week));
    if(reservations.length||futureFinish.has(o.id)){
      o.weekCapacityReservations=reservations;
      o.expectedReadyDate=futureFinish.get(o.id)||o.expectedReadyDate||'';
      o.expectedReadyWeek=o.expectedReadyDate?weekKey(o.expectedReadyDate):'';
      o.hybridPlanningUpdatedAt=new Date().toISOString();
    }
  }
  return {state:next,horizon,today,weekly:[...byOrder.entries()].map(([orderId,weeks])=>({orderId,weeks})),exactTasks:exactTaskIds.size,futureTasks:futureTaskIds.size,orders:preview.orders||[],late:preview.late||[]};
}
function ready(){
  return !!(window.RALAB_ORDER_CONTROLS?.simulateRemaining&&window.RALAB_DEADLINE_PLANNER?.planOrderStrict);
}
async function ensureReady(){
  try{await window.RALAB_CORE_READY}catch(_){}
  for(let i=0;i<20&&!ready();i++)await new Promise(r=>setTimeout(r,50));
  return ready();
}
function openMissingData(preview){
 const root=document.getElementById('modalRoot');if(!root)return false;
 let invalid=(preview.invalid||[]).filter(x=>x.id!=='__planner__'),auto=preview.autoDeadlines||[];
 if(!invalid.length&&preview.invalid?.some(x=>x.id==='__planner__')){
   try{invalid=window.RALAB_ORDER_CONTROLS?.diagnosePlanningOrders?.()||[]}catch(_){}
 }
 const s=S();
 const cardFor=x=>{
   const o=(s?.orders||[]).find(y=>y.id===x.id),tasks=(s?.tasks||[]).filter(t=>t.orderId===x.id&&!t.deleted&&!['done','completed'].includes(String(t.status||'').toLowerCase())).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
   const fallback=window.RALAB_ORDER_CONTROLS?.automaticPlanningDeadline?.(o);
   const deadline=o?.communicatedDeadline||o?.deadline||o?.planningFallbackDeadline||fallback?.date||'';
   const deadlineLabel=(o?.communicatedDeadline||o?.deadline)?'Klantdeadline':'Interne planningsdeadline';
   const taskRows=tasks.map(t=>{
     const hours=(Number(t.estimate)||0)/60;
     return `<div style="display:grid;grid-template-columns:minmax(200px,1fr) 120px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid rgba(0,0,0,.08)"><div><b>${esc(t.name||'Taak')}</b><div class="muted">${esc(t.machine||'')}</div></div><div style="display:flex;align-items:center;gap:5px"><input class="input" type="number" min="0.01" step="0.05" data-inline-task-duration="${esc(t.id)}" value="${hours>0?String(Math.round(hours*100)/100):''}" placeholder="uren"> uur</div></div>`;
   }).join('');
   const notices=(x.details||[]).map(d=>d.type==='planning_error'?'<div class="notice" style="margin-top:8px"><b>'+esc(d.label||'Planningsfout')+'</b></div>':d.type==='no_process'?'<div class="notice" style="margin-top:8px">Deze order heeft nog geen processtappen en kan daarom niet automatisch worden gepland.</div>':'').join('');
   return `<div class="panel" style="padding:14px;margin:12px 0" data-inline-order="${esc(x.id)}"><div style="display:flex;gap:12px;align-items:flex-start"><div style="flex:1"><b style="font-size:16px">${esc(o?.orderNo||x.orderNo||x.id)} · ${esc(o?.product||x.product||'')}</b><div class="muted">${esc(o?.customerName||'')}</div></div><label style="min-width:180px"><span class="muted">${deadlineLabel}</span><input class="input" type="date" data-inline-order-deadline="${esc(x.id)}" value="${esc(deadline)}"></label></div>${notices}<div style="margin-top:10px"><b>Open processtappen</b>${taskRows||'<div class="muted" style="margin-top:6px">Geen open processtappen.</div>'}</div></div>`;
 };
 const cards=invalid.map(cardFor).join('');
 const autoOnly=auto.filter(x=>!invalid.some(y=>y.id===x.id));
 const autoHtml=autoOnly.length?`<h3 style="margin-top:18px">Automatische planningsdeadlines</h3>${autoOnly.map(x=>`<label style="display:grid;grid-template-columns:minmax(220px,1fr) 170px;gap:10px;align-items:center;margin:8px 0"><span><b>${esc(x.orderNo)}</b> · min. doorlooptijd ${x.leadDays} dag(en) + 4 weken</span><input class="input" type="date" data-fallback-deadline="${esc(x.id)}" value="${esc(x.date)}"></label>`).join('')}`:'';
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(860px,96vw)"><div class="modalhead"><h3>Ordergegevens aanvullen</h3></div><div class="modalbody"><p>Pas hier direct de probleemorders aan. Daarna rekent de planner opnieuw en gaat verder.</p>${cards||'<div class="notice">Ik kon nog geen specifieke probleemorder aanwijzen. Controleer hieronder de automatische planningsdeadlines.</div>'}${autoHtml}<div id="missingPlanningError" style="color:#b42318;margin-top:10px"></div></div><div class="modalfoot"><button class="btn" type="button" data-missing-cancel>Annuleren</button><div class="spacer"></div><button class="btn primary" type="button" data-missing-save>Opslaan en doorgaan</button></div></div></div>`;
 return true;
}
function saveMissingData(){
 const error=document.getElementById('missingPlanningError');if(error)error.textContent='';
 const s=S();if(!s)return false;
 let bad='';
 for(const input of document.querySelectorAll('[data-inline-task-duration]')){
   const hours=Number(String(input.value||'').replace(',','.'));
   if(!(hours>0)){bad='Vul bij alle ontbrekende taken een duur groter dan 0 uur in.';break}
   const t=(s.tasks||[]).find(x=>x.id===input.dataset.inlineTaskDuration);
   if(t)t.estimate=Math.max(1,Math.round(hours*60));
 }
 if(bad){if(error)error.textContent=bad;return false}
 for(const input of document.querySelectorAll('[data-inline-order-deadline]')){
   if(!input.value)continue;
   const o=(s.orders||[]).find(x=>x.id===input.dataset.inlineOrderDeadline);
   if(o){
     if(o.communicatedDeadline||o.deadline){o.communicatedDeadline=input.value;o.deadline=input.value}
     else{o.planningFallbackDeadline=input.value;o.planningDeadlineSource='manual_planning_fallback'}
   }
 }
 for(const input of document.querySelectorAll('[data-fallback-deadline]')){
   if(!input.value)continue;
   const o=(s.orders||[]).find(x=>x.id===input.dataset.fallbackDeadline);
   if(o){o.planningFallbackDeadline=input.value;o.planningDeadlineSource='manual_planning_fallback'}
 }
 try{save()}catch(e){if(error)error.textContent='Opslaan mislukt: '+String(e?.message||e);return false}
 document.getElementById('modalRoot').innerHTML='';
 setTimeout(()=>plan(),50);
 return true;
}
function resetGeneratedPlanning(){
 const s=S();if(!s)return;
 for(const t of s.tasks||[]){
  if(t.deleted||['done','completed','in_progress','started','partial','partly','external'].includes(String(t.status||'').toLowerCase())||Number(t.actual)>0||Number(t.doneQty)>0)continue;
  if(!['automatic','hybrid-week','week-auto'].includes(String(t.planningOrigin||'')))continue;
  t.planSegments=[];t.date=null;t.start='';t.employee=null;t.waitStartAt='';t.waitEndAt='';t.externalSentDate='';t.expectedReturnDate='';t.lockedPlanning=false;delete t.assignedMachine;delete t.planningOrigin;
 }
 for(const o of s.orders||[]){if(o?.planningDecision==='hybrid_week_capacity'){delete o.weekCapacityReservations;delete o.expectedReadyWeek;delete o.expectedReadyDate}}
}
async function plan(){
  const btn=document.querySelector('[data-hybrid-plan]');
  if(!ready()){if(btn){btn.disabled=true;btn.textContent='Planner starten…'};await ensureReady();if(btn){btn.disabled=false;btn.textContent='Plan komende week'}}
  const controls=window.RALAB_ORDER_CONTROLS;
  if(!ready())return alert('De planningsengine kon niet starten. Gebruik Ververs app; als dit terugkomt is er een laadfout die we moeten oplossen.');
  resetGeneratedPlanning();
  const preview=controls.simulateRemaining();
  if(!preview){
    return openMissingData({invalid:[{id:'__planner__',orderNo:'Planner',product:'',issues:['De berekening gaf geen resultaat terug.'],details:[{type:'planning_error',label:'De berekening gaf geen resultaat terug.'}]}],autoDeadlines:[]});
  }
  if(preview.invalid?.length)return openMissingData(preview);if(!preview.orders?.length)return alert('Er is geen ongepland werk meer.');
  const hybrid=buildHybrid(preview),count=hybrid.weekly.length;hybrid.autoDeadlines=preview.autoDeadlines||[];hybrid.invalid=preview.invalid||[];
  const autoText=hybrid.autoDeadlines.length?`\n\n${hybrid.autoDeadlines.length} order(s) zonder klantdeadline krijgen alleen voor planning automatisch: minimale doorlooptijd + 4 weken.`:'';const invalidText=hybrid.invalid.length?`\n\n${hybrid.invalid.length} onvolledige order(s) worden overgeslagen en hieronder gemeld.`:'';const msg=`Komende 5 werkdagen exact plannen tot en met ${hybrid.horizon}. Daarna worden ${count} order(s) alleen op weekcapaciteit gereserveerd voor levertijdinschatting. Bestaande gestarte en vastgezette planning blijft staan.${autoText}${invalidText}\n\nDoorgaan?`;
  if(!confirm(msg))return;
  state=hybrid.state;
  const now=new Date().toISOString();
  for(const o of state.orders||[])if(o.weekCapacityReservations){o.planningDecision='hybrid_week_capacity';o.planningDecisionAt=now}
  if(typeof save==='function')save();
  if(typeof renderWeeks==='function')renderWeeks();
  let done=`Planning bijgewerkt. ${hybrid.exactTasks} taak/taken staan exact in de komende 5 werkdagen. Later werk is alleen per week gereserveerd.`;if(hybrid.autoDeadlines.length)done+=`\n\nAutomatische planningsdeadline gebruikt voor:\n`+hybrid.autoDeadlines.map(x=>`${x.orderNo}: ${x.date}`).join('\n');if(hybrid.invalid.length)done+=`\n\nNiet ingepland omdat gegevens ontbreken:\n`+hybrid.invalid.map(x=>`${x.orderNo}: ${x.issues.join(', ')}`).join('\n');if(hybrid.late.length)done+=`\n\n${hybrid.late.length} order(s) blijven aandacht vragen voor hun deadline.`;alert(done);
}
function decorate(){
  const panel=document.querySelector('#view-weeks .production-sequence-panel');if(!panel)return;
  if(panel.querySelector('[data-hybrid-plan]'))return;
  const head=panel.querySelector('.prod-seq-head');if(!head)return;
  const btn=document.createElement('button');btn.type='button';btn.className='btn primary small';btn.dataset.hybridPlan='';btn.textContent=ready()?'Plan komende week':'Planner laden…';btn.disabled=!ready();
  head.appendChild(btn);
  if(!ready())setTimeout(()=>{if(ready()&&btn.isConnected){btn.disabled=false;btn.textContent='Plan komende week'}},500);
}
async function install(){
  try{await window.RALAB_CORE_READY}catch(_){}
  if(typeof window.renderWeeks!=='function'||!window.RALAB_ORDER_CONTROLS||!window.RALAB_DEADLINE_PLANNER)return setTimeout(install,100);
  const old=window.renderWeeks;window.renderWeeks=function(){const r=old.apply(this,arguments);setTimeout(decorate,0);return r};
  document.addEventListener('click',e=>{
    const saveBtn=e.target.closest?.('[data-missing-save]');if(saveBtn){e.preventDefault();return saveMissingData()}
    const cancel=e.target.closest?.('[data-missing-cancel]');if(cancel){e.preventDefault();document.getElementById('modalRoot').innerHTML='';return}
    const b=e.target.closest?.('[data-hybrid-plan]');if(!b)return;e.preventDefault();plan()
  },true);
  window.RALAB_HYBRID_PLANNER={version:VERSION,plan,buildHybrid,openMissingData};
  setTimeout(decorate,0);
}
install();
})();