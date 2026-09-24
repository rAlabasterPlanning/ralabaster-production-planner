// Hybrid planner: exact next 5 workdays, weekly capacity reservations after that.
(()=>{
const VERSION='20260924-5';
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
      if(keep.length){t.date=keep[0].date;t.start=keep[0].start||'';t.employee=keep[0].employee||t.employee}
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
 const invalid=preview.invalid||[],auto=preview.autoDeadlines||[];
 const invalidHtml=invalid.map(x=>{
   const fields=(x.details||[]).map(d=>{
     if(d.type==='no_duration')return `<label style="display:grid;grid-template-columns:minmax(180px,1fr) 130px;gap:10px;align-items:center;margin:8px 0"><span>${esc(d.taskName||'Taak')} · duur</span><span style="display:flex;align-items:center;gap:6px"><input class="input" type="number" min="0.01" step="0.05" inputmode="decimal" data-missing-duration="${esc(d.taskId)}" placeholder="uren"> uur</span></label>`;
     if(d.type==='no_process')return `<div class="notice" style="margin:8px 0">Deze order heeft nog geen processtappen. <button class="btn small" type="button" data-open-missing-order="${esc(x.id)}">Order openen</button></div>`;
     return `<div>${esc(d.label||'Ontbrekende gegevens')}</div>`;
   }).join('');
   return `<div class="panel" style="padding:12px;margin:10px 0"><b>${esc(x.orderNo)} · ${esc(x.product||'')}</b>${fields}</div>`;
 }).join('');
 const autoHtml=auto.length?`<h3 style="margin-top:18px">Automatische planningsdeadlines</h3><p class="muted">Geen klantdeadline ingevuld. Dit is alleen een interne planningsdatum en mag je hier aanpassen.</p>${auto.map(x=>`<label style="display:grid;grid-template-columns:minmax(180px,1fr) 170px;gap:10px;align-items:center;margin:8px 0"><span><b>${esc(x.orderNo)}</b> · min. doorlooptijd ${x.leadDays} dag(en) + 4 weken</span><input class="input" type="date" data-fallback-deadline="${esc(x.id)}" value="${esc(x.date)}"></label>`).join('')}`:'';
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(760px,94vw)"><div class="modalhead"><h3>Ordergegevens aanvullen</h3></div><div class="modalbody"><p>Vul de ontbrekende gegevens in. Daarna rekent de planner direct opnieuw en gaat verder.</p>${invalidHtml||'<div class="muted">Geen ontbrekende taakgegevens.</div>'}${autoHtml}<div id="missingPlanningError" style="color:#b42318;margin-top:10px"></div></div><div class="modalfoot"><button class="btn" type="button" data-missing-cancel>Annuleren</button><div class="spacer"></div><button class="btn primary" type="button" data-missing-save>Opslaan en doorgaan</button></div></div></div>`;
 return true;
}
function saveMissingData(){
 const error=document.getElementById('missingPlanningError');if(error)error.textContent='';
 const s=S();if(!s)return false;
 let bad='';
 for(const input of document.querySelectorAll('[data-missing-duration]')){
   const hours=Number(String(input.value||'').replace(',','.'));
   if(!(hours>0)){bad='Vul bij alle ontbrekende taken een duur groter dan 0 uur in.';break}
   const t=(s.tasks||[]).find(x=>x.id===input.dataset.missingDuration);
   if(t)t.estimate=Math.max(1,Math.round(hours*60));
 }
 if(bad){if(error)error.textContent=bad;return false}
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
async function plan(){
  const btn=document.querySelector('[data-hybrid-plan]');
  if(!ready()){if(btn){btn.disabled=true;btn.textContent='Planner starten…'};await ensureReady();if(btn){btn.disabled=false;btn.textContent='Plan komende week'}}
  const controls=window.RALAB_ORDER_CONTROLS;
  if(!ready())return alert('De planningsengine kon niet starten. Gebruik Ververs app; als dit terugkomt is er een laadfout die we moeten oplossen.');
  const preview=controls.simulateRemaining();
  if(!preview)return alert('De planner kon geen planningvoorstel berekenen. Controleer of de open orders een deadline en taakduur hebben.');
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
    const open=e.target.closest?.('[data-open-missing-order]');if(open){e.preventDefault();document.getElementById('modalRoot').innerHTML='';window.RALAB_ERP?.openOrder?.(open.dataset.openMissingOrder);return}
    const b=e.target.closest?.('[data-hybrid-plan]');if(!b)return;e.preventDefault();plan()
  },true);
  window.RALAB_HYBRID_PLANNER={version:VERSION,plan,buildHybrid,openMissingData};
  setTimeout(decorate,0);
}
install();
})();