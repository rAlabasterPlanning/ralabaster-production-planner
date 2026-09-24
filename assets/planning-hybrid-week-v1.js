// Hybrid planner: exact next 5 workdays, weekly capacity reservations after that.
(()=>{
const VERSION='20260924-3';
const clone=x=>JSON.parse(JSON.stringify(x));
const S=()=>{try{return state}catch(_){return null}};
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
async function plan(){
  const btn=document.querySelector('[data-hybrid-plan]');
  if(!ready()){if(btn){btn.disabled=true;btn.textContent='Planner starten…'};await ensureReady();if(btn){btn.disabled=false;btn.textContent='Plan komende week'}}
  const controls=window.RALAB_ORDER_CONTROLS;
  if(!ready())return alert('De planningsengine kon niet starten. Gebruik Ververs app; als dit terugkomt is er een laadfout die we moeten oplossen.');
  const preview=controls.simulateRemaining();
  if(!preview)return alert('De planner kon geen planningvoorstel berekenen. Controleer of de open orders een deadline en taakduur hebben.');
  if(!preview.orders?.length)return alert(preview.missingDeadline?.length?'De open orders hebben nog geen bruikbare deadline.':'Er is geen ongepland werk meer.');
  const hybrid=buildHybrid(preview),count=hybrid.weekly.length;
  const msg=`Komende 5 werkdagen exact plannen tot en met ${hybrid.horizon}. Daarna worden ${count} order(s) alleen op weekcapaciteit gereserveerd voor levertijdinschatting. Bestaande gestarte en vastgezette planning blijft staan. Doorgaan?`;
  if(!confirm(msg))return;
  state=hybrid.state;
  const now=new Date().toISOString();
  for(const o of state.orders||[])if(o.weekCapacityReservations){o.planningDecision='hybrid_week_capacity';o.planningDecisionAt=now}
  if(typeof save==='function')save();
  if(typeof renderWeeks==='function')renderWeeks();
  alert(`Planning bijgewerkt. ${hybrid.exactTasks} taak/taken staan exact in de komende 5 werkdagen. Later werk is alleen per week gereserveerd.${hybrid.late.length?' '+hybrid.late.length+' order(s) blijven aandacht vragen voor hun deadline.':''}`);
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
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-hybrid-plan]');if(!b)return;e.preventDefault();plan()},true);
  window.RALAB_HYBRID_PLANNER={version:VERSION,plan,buildHybrid};
  setTimeout(decorate,0);
}
install();
})();