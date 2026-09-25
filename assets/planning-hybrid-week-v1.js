// Week-only planner: automatically allocate work to weeks; exact day/time planning stays manual.
(()=>{
const VERSION='20260925-10';
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
function nextDetailedWeeks(){
 const now=new Date(),d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12),dow=(d.getDay()+6)%7,days=7-dow;
 d.setDate(d.getDate()+days);
 const start=iso(d),endDate=new Date(d);endDate.setDate(endDate.getDate()+11);
 return {start,end:iso(endDate),week:weekKey(start),endWeek:weekKey(iso(endDate))};
}
function weekKey(date){
  const d=parse(date);d.setHours(0,0,0,0);d.setDate(d.getDate()+3-((d.getDay()+6)%7));
  const y=d.getFullYear(),w1=new Date(y,0,4);const w=1+Math.round(((d-w1)/86400000-3+((w1.getDay()+6)%7))/7);
  return y+'-W'+String(w).padStart(2,'0');
}
function weekMonday(key){const m=String(key||'').match(/^(\d{4})-W(\d{2})$/);if(!m)return'';const y=Number(m[1]),w=Number(m[2]),jan4=new Date(y,0,4,12),dow=(jan4.getDay()+6)%7;jan4.setDate(jan4.getDate()-dow+(w-1)*7);return iso(jan4)}
function shiftWeekKey(key,n){const d=weekMonday(key);if(!d)return key;const x=parse(d);x.setDate(x.getDate()+7*n);return weekKey(iso(x))}
function weekDistance(a,b){const da=weekMonday(a),db=weekMonday(b);if(!da||!db)return 0;return Math.round((parse(db)-parse(da))/(7*86400000))}
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
function buildWeekOnly(preview){
  const live=clone(S()),sim=clone(preview.state),next=clone(live),weekly=new Map(),futureFinish=new Map(),taskWeeks=new Map();
  const baseline=new Map((live.tasks||[]).map(t=>[t.id,t])),comingWeek=nextDetailedWeeks().week;
  const earlyPrep=t=>/materiaal\s+bestellen|verpakking\s+bestellen|alabaster\s+klaarzetten|klaarzetten.*waterjet|waterjet.*klaarzetten/i.test((t?.name||'')+' '+(t?.machine||''));
  for(const t of sim.tasks||[]){
    const before=baseline.get(t.id);if(!before)continue;
    const hadExact=!!((before.planSegments||[]).length||before.date||before.waitStartAt||before.externalSentDate);
    if(hadExact||exactExisting(before))continue;
    const finish=finishOf(t);if(finish&&finish>(futureFinish.get(t.orderId)||''))futureFinish.set(t.orderId,finish);
    let firstWeek='',firstDate='',lastDate='';
    for(const g of Array.isArray(t.planSegments)?t.planSegments:[]){
      if(!g?.date)continue;
      const wk=weekKey(g.date);if(!firstWeek||wk<firstWeek)firstWeek=wk;if(!firstDate||g.date<firstDate)firstDate=g.date;if(!lastDate||g.date>lastDate)lastDate=g.date;
      const key=t.orderId+'|'+wk;weekly.set(key,(weekly.get(key)||0)+(Number(g.minutes)||0));
    }
    if(firstWeek){
      const early=earlyPrep(before)&&firstWeek>comingWeek,assigned=early?comingWeek:firstWeek;
      if(early){
        let moved=0;
        for(const g of Array.isArray(t.planSegments)?t.planSegments:[]){
          if(!g?.date)continue;const wk=weekKey(g.date),key=t.orderId+'|'+wk,m=Number(g.minutes)||0;
          weekly.set(key,Math.max(0,(weekly.get(key)||0)-m));moved+=m;
        }
        const target=t.orderId+'|'+comingWeek;weekly.set(target,(weekly.get(target)||0)+moved);
      }
      taskWeeks.set(t.id,{week:assigned,simulatedWeek:firstWeek,simulatedFirstDate:firstDate,simulatedLastDate:lastDate||firstDate,early});
    }
  }
  for(const o of next.orders||[]){
    const target=targetReadyDate(o),entries=[];
    for(const t of next.tasks||[]){if(t.orderId!==o.id)continue;const x=taskWeeks.get(t.id);if(x&&!x.early)entries.push([t,x])}
    const latestDate=entries.map(x=>x[1].simulatedLastDate||'').filter(Boolean).sort().at(-1)||'';
    if(target&&latestDate){
      const deltaDays=Math.round((parse(target)-parse(latestDate))/86400000);
      for(const [t,x] of entries){
        const base=x.simulatedFirstDate||weekMonday(x.simulatedWeek||x.week);
        if(base){const d=parse(base);d.setDate(d.getDate()+deltaDays);x.week=weekKey(iso(d));x.latestStartDate=iso(d)}
        taskWeeks.set(t.id,x);
      }
    }
  }
  weekly.clear();
  for(const t of next.tasks||[]){
    const x=taskWeeks.get(t.id);if(!x)continue;
    const key=t.orderId+'|'+x.week;weekly.set(key,(weekly.get(key)||0)+Math.max(0,Number(t.estimate)||0));
  }
  const byOrder=new Map();
  for(const [key,minutes] of weekly){const [orderId,week]=key.split('|');if(!byOrder.has(orderId))byOrder.set(orderId,[]);byOrder.get(orderId).push({week,minutes})}
  for(const t of next.tasks||[]){const x=taskWeeks.get(t.id);if(x){t.planningWeek=x.week;t.planningSimulatedWeek=x.simulatedWeek;t.planningWeekEarly=!!x.early;if(x.latestStartDate)t.planningLatestStartDate=x.latestStartDate;else delete t.planningLatestStartDate}else if(!((t.planSegments||[]).length||t.date)){delete t.planningWeek;delete t.planningSimulatedWeek;delete t.planningWeekEarly}}
  for(const o of next.orders||[]){
    const productionWeeks=(next.tasks||[]).filter(t=>t.orderId===o.id&&!preparationTask(t)&&t.planningWeek).map(t=>t.planningWeek).sort();
    o.productionStartWeek=productionWeeks[0]||'';
    o.productionFinishWeek=productionWeeks.at(-1)||'';
    const prodDates=(next.tasks||[]).filter(t=>t.orderId===o.id&&!preparationTask(t)&&t.planningLatestStartDate).map(t=>t.planningLatestStartDate).sort();
    o.productionLatestStartDate=prodDates[0]||'';
    o.productionLatestWorkDate=targetReadyDate(o)||'';
    o.productionLatestStartWeek=o.productionLatestStartDate?weekKey(o.productionLatestStartDate):o.productionStartWeek||'';
    const reservations=(byOrder.get(o.id)||[]).sort((a,b)=>a.week.localeCompare(b.week));
    if(reservations.length||futureFinish.has(o.id)){
      o.weekCapacityReservations=reservations;
      o.expectedReadyDate=futureFinish.get(o.id)||'';
      o.expectedReadyWeek=o.expectedReadyDate?weekKey(o.expectedReadyDate):'';
      o.planningDecision='week_capacity_only';
      o.planningDecisionAt=new Date().toISOString();
      o.weekPlanningUpdatedAt=new Date().toISOString();
    }
  }
  next.weekPlanningMode='manual_exact';
  next.weekPlanningUpdatedAt=new Date().toISOString();
  return {state:next,weekly:[...byOrder.entries()].map(([orderId,weeks])=>({orderId,weeks})),orders:preview.orders||[],late:preview.late||[],autoDeadlines:preview.autoDeadlines||[],invalid:preview.invalid||[]};
}
function preparationTask(t){return /stenen?\s+bestellen|steen\s+bestellen|materiaal\s+bestellen|technisch\s+uitwerken|verpakking\s+bestellen|alabaster\s+klaarzetten|klaarzetten.*waterjet|waterjet.*klaarzetten/i.test((t?.name||'')+' '+(t?.machine||''))}
function autoPlanPreparation(next){
 const todayDate=iso(new Date()),tasks=(next.tasks||[]).filter(t=>!t.deleted&&!exactExisting(t)&&preparationTask(t)).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 const used={};
 for(const t of next.tasks||[])for(const g of Array.isArray(t.planSegments)?t.planSegments:[])if(g?.employee==='Ralph'&&g?.date)used[g.date]=(used[g.date]||0)+(Number(g.minutes)||0);
 for(const t of tasks){
   let need=Math.max(1,Number(t.estimate)||30),d=todayDate,guard=0,segs=[];
   while(need>0&&guard++<45){
     let cap=0;try{cap=Math.max(0,Number(employeeCapacity(d,'Ralph',false))||0)}catch(_){cap=390}
     const limit=Math.floor(cap*0.5),left=Math.max(0,limit-(used[d]||0));
     if(left>0){const take=Math.min(need,left);let start='08:15';try{const existing=(next.tasks||[]).flatMap(x=>(x.planSegments||[]).filter(g=>g.employee==='Ralph'&&g.date===d)).sort((a,b)=>(a.start||'').localeCompare(b.start||''));if(existing.length){const z=existing.at(-1),m=(String(z.start||'08:15').split(':').map(Number));const end=(m[0]||8)*60+(m[1]||15)+(Number(z.minutes)||0);start=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0')}}catch(_){}
       segs.push({date:d,employee:'Ralph',start,minutes:take});used[d]=(used[d]||0)+take;need-=take;
     }
     if(need>0){const x=parse(d);x.setDate(x.getDate()+1);while([0,6].includes(x.getDay()))x.setDate(x.getDate()+1);d=iso(x)}
   }
   if(segs.length){t.planSegments=segs;t.employee='Ralph';t.date=segs[0].date;t.start=segs[0].start;t.planningOrigin='auto-preparation';t.lockedPlanning=true;t.manualPlanning=false;t.planningWeek=weekKey(segs[0].date)}
 }
}
function targetReadyDate(o){const d=o?.communicatedDeadline||o?.deadline||o?.maximumReadyDate||'';if(!d)return'';const x=parse(d);x.setDate(x.getDate()-7);return iso(x)}
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
 const editable=document.querySelectorAll('[data-inline-task-duration],[data-inline-order-deadline],[data-fallback-deadline]');
 if(!editable.length){
   document.getElementById('modalRoot').innerHTML='';
   setTimeout(()=>plan(),50);
   return true;
 }
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
  if(!['automatic','hybrid-week','week-auto','auto-preparation'].includes(String(t.planningOrigin||'')))continue;
  t.planSegments=[];t.date=null;t.start='';t.employee=null;t.waitStartAt='';t.waitEndAt='';t.externalSentDate='';t.expectedReturnDate='';t.lockedPlanning=false;delete t.assignedMachine;delete t.planningOrigin;
 }
 for(const o of s.orders||[]){
  if(!o?.productionEmployeeOverride)delete o.productionEmployee;
  if(o?.planningDecision==='hybrid_week_capacity'){delete o.weekCapacityReservations;delete o.expectedReadyWeek;delete o.expectedReadyDate}
 }
}
function needsWeekAssignment(){
 const s=S();if(!s)return false;
 const active=new Set((s.orders||[]).filter(o=>o&&!o.deleted&&o.active!==false&&!o.isGeneralWork&&o.status!=='completed').map(o=>o.id));
 return (s.tasks||[]).some(t=>active.has(t.orderId)&&!t.deleted&&!['done','completed','external','in_progress','partial','partly'].includes(String(t.status||'').toLowerCase())&&!t.planningWeek&&!((t.planSegments||[]).length||t.date||t.waitStartAt||t.externalSentDate));
}
let autoAssignBusy=false;
async function ensureWeekAssignments(force=false){
 if(autoAssignBusy)return false;
 if(!force&&!needsWeekAssignment())return false;
 autoAssignBusy=true;
 try{
   if(!ready())await ensureReady();
   const controls=window.RALAB_ORDER_CONTROLS;if(!controls||!ready())return false;
   resetGeneratedPlanning();
   const weekStart=nextDetailedWeeks().start;
   let preview=controls.simulateRemaining({planningStart:weekStart});
   const expectedCount=controls.remainingOrders?.().length||0;
   const incomplete=p=>expectedCount>0&&((p?.orders?.length||0)+(p?.invalid||[]).filter(x=>x.id!=='__planner__').length)<expectedCount;
   if(!preview?.orders?.length||incomplete(preview))preview=controls.simulateSequentialRemaining?.({planningStart:weekStart})||preview;
   if((preview?.invalid||[]).some(x=>x.id!=='__planner__'))return false;
   if(!preview?.orders?.length)return false;
   const weekPlan=buildWeekOnly(preview);
   state=weekPlan.state;
   if(typeof save==='function')save();
   try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
   return true;
 }catch(e){console.error('Automatische weektoewijzing mislukt',e);return false}
 finally{autoAssignBusy=false}
}
async function plan(){
  const btn=document.querySelector('[data-hybrid-plan]');
  if(!ready()){if(btn){btn.disabled=true;btn.textContent='Planner starten…'};await ensureReady();if(btn){btn.disabled=false;btn.textContent='Herbereken weekplanning'}}
  const controls=window.RALAB_ORDER_CONTROLS;
  if(!ready())return alert('De planningsengine kon niet starten.');
  resetGeneratedPlanning();
  const weekStart=nextDetailedWeeks().start;
  let preview=controls.simulateRemaining({planningStart:weekStart});
  const expectedCount=controls.remainingOrders?.().length||0;
  const onlyGenericProblem=p=>!p||(!p.orders?.length&&(p.invalid||[]).length>0&&(p.invalid||[]).every(x=>x.id==='__planner__'));
  const incompleteCoverage=p=>expectedCount>0&&((p?.orders?.length||0)+(p?.invalid||[]).filter(x=>x.id!=='__planner__').length)<expectedCount;
  if(onlyGenericProblem(preview)||incompleteCoverage(preview))preview=controls.simulateSequentialRemaining?.({planningStart:weekStart})||preview;
  const specificInvalid=(preview?.invalid||[]).filter(x=>x.id!=='__planner__');
  if(specificInvalid.length)return openMissingData({...preview,invalid:specificInvalid});
  if(!preview?.orders?.length)return alert('Er is geen ongepland werk meer.');
  const weekPlan=buildWeekOnly(preview),count=weekPlan.weekly.length;
  if(!confirm(`Orders worden alleen over weken verdeeld. Er wordt niets automatisch op dag, tijd, medewerker of machine gezet. Daarna plan je de eerste week zelf door taken te slepen.\n\n${count} order(s) krijgen een weekreservering. Doorgaan?`))return;
  state=weekPlan.state;
  if(typeof save==='function')save();
  if(typeof renderWeeks==='function')renderWeeks();
  alert('Weekverdeling bijgewerkt. Exacte dag/tijdplanning blijft volledig handmatig.');
}
function exactMinutesForWeek(orderId,week){
 let n=0;for(const t of S()?.tasks||[]){if(t.orderId!==orderId)continue;for(const g of Array.isArray(t.planSegments)?t.planSegments:[])if(g?.date&&weekKey(g.date)===week)n+=Number(g.minutes)||0}return n;
}
function futureWeekGroups(){
 const s=S(),orders=s?.orders||[],groups=new Map();
 for(const o of orders){
  for(const r of o.weekCapacityReservations||[]){
   const remaining=Math.max(0,(Number(r.minutes)||0)-exactMinutesForWeek(o.id,r.week));if(!remaining)continue;
   if(!groups.has(r.week))groups.set(r.week,[]);
   groups.get(r.week).push({order:o,minutes:remaining});
  }
 }
 return groups;
}
function renderWeekCapacitySummaries(root){
 root.querySelectorAll('.week-capacity-summary').forEach(x=>x.remove());
 const s=S(),hourText=n=>(Math.round((Math.max(0,n)/60)*10)/10).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1});
 for(const block of root.querySelectorAll('.week-block')){
   const title=block.querySelector(':scope > h3');if(!title)continue;
   const dates=[...new Set([...block.querySelectorAll('[data-plan-date]')].map(x=>x.dataset.planDate).filter(Boolean))].sort();if(!dates.length)continue;
   const key=weekKey(dates[0]);let capacity=0,exact=0,reservedRemaining=0;
   const employees=['Ralph','Peter','Kaan','Lance','Shaffi'];
   for(const date of dates)for(const emp of employees){try{capacity+=Math.max(0,Number(employeeCapacity(date,emp,parse(date).getDay()===6))||0)}catch(_){}}
   for(const t of s?.tasks||[])for(const g of Array.isArray(t.planSegments)?t.planSegments:[])if(g?.date&&weekKey(g.date)===key)exact+=Number(g.minutes)||0;
   for(const o of s?.orders||[])for(const r of o.weekCapacityReservations||[])if(r.week===key)reservedRemaining+=Math.max(0,(Number(r.minutes)||0)-exactMinutesForWeek(o.id,key));
   const planned=exact+reservedRemaining,free=capacity-planned;
   title.insertAdjacentHTML('afterend',`<div class="week-capacity-summary" style="margin:5px 10px 8px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px"><b>${hourText(capacity)} uur beschikbaar</b><span>${hourText(planned)} uur in deze week</span><span style="font-weight:700">${free>=0?hourText(free)+' uur vrij':hourText(-free)+' uur overpland'}</span><span class="muted">${hourText(exact)} uur exact gepland · ${hourText(reservedRemaining)} uur nog te verdelen</span></div>`);
 }
}
function renderFutureWeekBuckets(root){
 root.querySelectorAll('.future-week-inline').forEach(x=>x.remove());
 const s=S(),groups=futureWeekGroups();if(!groups.size)return;
 for(const block of root.querySelectorAll('.week-block')){
   const h3=block.querySelector(':scope > h3');if(!h3)continue;
   const m=h3.textContent.match(/Week\s+(\d+)/i);if(!m)continue;
   const weekNo=String(Number(m[1])).padStart(2,'0');
   const match=[...groups.entries()].find(([key])=>key.endsWith('-W'+weekNo));if(!match)continue;
   const [week,rows]=match,total=rows.reduce((n,x)=>n+x.minutes,0);
   const prep=(s?.tasks||[]).filter(t=>t.planningWeek===week&&t.planningWeekEarly&&!t.deleted&&!['done','completed'].includes(String(t.status||'').toLowerCase())).map(t=>({t,o:(s.orders||[]).find(o=>o.id===t.orderId)}));
   const html=`<div class="future-week-inline" style="margin:8px 10px 10px;padding:10px 12px;border:1px solid rgba(0,0,0,.12);border-radius:9px;background:rgba(127,127,127,.05)">
     <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Werk voor week ${esc(weekNo)}</b><span class="muted">${(total/60).toLocaleString('nl-NL',{maximumFractionDigits:1})} uur gereserveerd · nog niet op dag/tijd</span></div>
     <div style="display:grid;gap:4px;margin-top:7px">${prep.map(x=>`<div style="display:flex;gap:10px;align-items:center"><span style="flex:1"><b>Voorbereiding</b> · ${esc(x.o?.orderNo||'')} · ${esc(x.t.name||'')}</span><span class="muted">deze week uitvoeren</span></div>`).join('')}${rows.sort((a,b)=>(Number(a.order.productionSequence)||9999)-(Number(b.order.productionSequence)||9999)).map(x=>`<div style="display:flex;gap:10px;align-items:center;min-width:0"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${esc(x.order.orderNo||'')}</b> · ${esc(x.order.product||'')}</span><span class="muted" style="white-space:nowrap">${(x.minutes/60).toLocaleString('nl-NL',{maximumFractionDigits:1})} uur</span></div>`).join('')}</div>
   </div>`;
   h3.insertAdjacentHTML('afterend',html);
 }
}
function decorate(){
  const root=document.getElementById('view-weeks');if(!root||root.classList.contains('hidden'))return;
  const panel=root.querySelector('.production-sequence-panel');if(!panel)return;
  if(!panel.querySelector('[data-hybrid-plan]')){
    const head=panel.querySelector('.prod-seq-head');if(head){const btn=document.createElement('button');btn.type='button';btn.className='btn primary small';btn.dataset.hybridPlan='';btn.textContent=ready()?'Herbereken weekplanning':'Planner laden…';btn.disabled=!ready();head.appendChild(btn);if(!ready())setTimeout(()=>{if(ready()&&btn.isConnected){btn.disabled=false;btn.textContent='Herbereken weekplanning'}},500)}
  }
  root.querySelector('.future-work-panel')?.remove();
  renderFutureWeekBuckets(root);
  renderWeekCapacitySummaries(root);
}
async function install(){
  try{await window.RALAB_CORE_READY}catch(_){}
  if(typeof window.renderWeeks!=='function'||!window.RALAB_ORDER_CONTROLS||!window.RALAB_DEADLINE_PLANNER)return setTimeout(install,100);
  const old=window.renderWeeks;window.renderWeeks=function(){const r=old.apply(this,arguments);setTimeout(()=>{decorate();if(needsWeekAssignment())ensureWeekAssignments().then(changed=>{if(changed)old.apply(window,arguments)})},0);return r};
  document.addEventListener('click',e=>{
    const saveBtn=e.target.closest?.('[data-missing-save]');if(saveBtn){e.preventDefault();return saveMissingData()}
    const cancel=e.target.closest?.('[data-missing-cancel]');if(cancel){e.preventDefault();document.getElementById('modalRoot').innerHTML='';return}
    const b=e.target.closest?.('[data-hybrid-plan]');if(!b)return;e.preventDefault();plan()
  },true);
  window.RALAB_HYBRID_PLANNER={version:VERSION,plan,buildWeekOnly,openMissingData,ensureWeekAssignments,needsWeekAssignment};
  setTimeout(()=>ensureWeekAssignments().then(changed=>{if(changed){try{window.RALAB_ERP?.renderOrderOverview?.()}catch(_){}try{window.renderWeeks?.()}catch(_){}}else decorate()}),250);
}
install();
})();