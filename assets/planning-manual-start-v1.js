// Strict manual planning: drag chooses employee/day, task modal chooses exact start/machine.
// Nothing else is moved automatically; employee/machine/dependency conflicts are rejected.
(()=>{
const VERSION='20260925-6';
const S=()=>{try{return state}catch(_){return null}};
const min=t=>{const[a,b]=String(t||'00:00').split(':').map(Number);return(a||0)*60+(b||0)};
const tm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const at=(d,t)=>d+'T'+t;
const addDay=d=>{try{return addDays(d,1)}catch(_){const x=new Date(d+'T12:00');x.setDate(x.getDate()+1);return x.toISOString().slice(0,10)}};
const segments=t=>Array.isArray(t?.planSegments)&&t.planSegments.length?t.planSegments:(t?.date&&t?.employee?[{date:t.date,employee:t.employee,start:t.start||'',minutes:Number(t.estimate)||0}]:[]);
const done=t=>['done','completed'].includes(String(t?.status||'').toLowerCase());
const machineKey=t=>String(t?.assignedMachine||t?.machinePreference||t?.machine||t?.name||'').replace(/\s*[-–]?\s*instellen\b/ig,'').replace(/\s+/g,' ').trim().toLowerCase();
const ralphOnly=t=>{const label=((t?.name||'')+' '+(t?.machine||'')).toLowerCase();return t?.ralphOnly===true||t?.onlyRalph===true||String(t?.requiredEmployee||t?.onlyEmployee||t?.fixedEmployee||t?.employeeRequired||'')==='Ralph'||/\binstellen\b|technisch\s+uitwerken|verpakking\s+bestellen|materiaal\s+bestellen/.test(label)};
function startMin(date,emp){try{return min(dayStartTime(date,emp))}catch(_){return 8*60+15}}
function endMin(date,emp){try{return workdayEndMinutes(date,emp)}catch(_){return 16*60+30}}
function capacity(date,emp){try{return employeeCapacity(date,emp,new Date(date+'T12:00').getDay()===6)}catch(_){return Math.max(0,endMin(date,emp)-startMin(date,emp))}}
function breaks(date,emp){try{return (planningBreaks(date,emp)||[]).map(x=>[x[0],x[1]])}catch(_){return[]}}
function previous(t){return(S()?.tasks||[]).filter(x=>x.orderId===t.orderId&&!x.deleted&&Number(x.seq)<Number(t.seq)).sort((a,b)=>Number(b.seq)-Number(a.seq))[0]||null}
function overlaps(a,z,b,y){return a<y&&z>b}
function busyEmployee(date,emp,current){
 const out=[];
 for(const t of S()?.tasks||[]){
  if(t.id===current.id||t.deleted||done(t))continue;
  if(current.parallelGroupId&&t.parallelGroupId===current.parallelGroupId)continue;
  for(const g of segments(t)){if(g.date!==date||g.employee!==emp||!g.start)continue;const a=min(g.start),z=a+(Number(g.elapsedMinutes)||Number(g.minutes)||0);if(z>a)out.push([a,z,t])}
 }
 return out;
}
function busyMachine(date,key,current){
 if(!key)return[];const out=[];
 for(const t of S()?.tasks||[]){
  if(t.id===current.id||t.deleted||done(t)||machineKey(t)!==key)continue;
  for(const g of segments(t)){if(g.date!==date||!g.start)continue;const a=min(g.start),z=a+(Number(g.elapsedMinutes)||Number(g.minutes)||0);if(z>a)out.push([a,z,t])}
 }
 return out;
}
function workIntervals(date,emp,from){
 const a=Math.max(startMin(date,emp),from),z=endMin(date,emp);if(z<=a)return[];
 let p=a,out=[];for(const [ba,bz] of breaks(date,emp)){if(bz<=p||ba>=z)continue;if(ba>p)out.push([p,Math.min(ba,z)]);p=Math.max(p,bz);if(p>=z)break}if(p<z)out.push([p,z]);return out.filter(x=>x[1]>x[0]);
}
function nextWorking(date,emp){
 let d=addDay(date),guard=0;while(guard++<14){if(capacity(d,emp)>0)return d;d=addDay(d)}return'';
}
function strictProposal(t,emp,date,start,estimate){
 if(!t||!emp||!date||!start)return{error:'Kies medewerker, datum en starttijd.'};
 if(ralphOnly(t)&&emp!=='Ralph')return{error:'Deze taak is Ralph-only en kan alleen bij Ralph worden gepland.'};
 const requested=at(date,start),p=previous(t);
 if(t.dependsPrev&&p){let finish='';try{finish=taskFinishAt(p)||''}catch(_){}if(finish&&requested<finish)return{error:'Deze taak kan niet vóór de vorige processtap starten ('+finish.slice(0,10)+' '+finish.slice(11,16)+').'};}
 let need=Math.max(0,Number(estimate)||0);if(!need)return{error:'Begrote tijd moet groter zijn dan 0 minuten.'};
 let d=date,first=true,out=[],guard=0;
 while(need>0&&guard++<60){
  if(capacity(d,emp)<=0)return{error:emp+' heeft op '+d+' geen beschikbare werktijd.'};
  const from=first?min(start):startMin(d,emp),windows=workIntervals(d,emp,from);
  if(!windows.length)return{error:'Starttijd valt buiten de werktijd van '+emp+'.'};
  const eb=busyEmployee(d,emp,t),mb=busyMachine(d,machineKey(t),t);
  for(const [a,z] of windows){
   if(need<=0)break;const take=Math.min(need,z-a),end=a+take;if(take<=0)continue;
   const eHit=eb.find(x=>overlaps(a,end,x[0],x[1]));if(eHit){const o=typeof order==='function'?order(eHit[2].orderId):null;return{error:emp+' is dan al bezet'+(o?' met '+(o.orderNo||o.product||'ander werk'):'')+'.'};}
   const mHit=mb.find(x=>overlaps(a,end,x[0],x[1]));if(mHit){return{error:'Machine/werkplek '+(t.assignedMachine||t.machine||t.name||'')+' is dan al bezet.'};}
   out.push({date:d,employee:emp,start:tm(a),minutes:take});need-=take;
  }
  if(need>0){const n=nextWorking(d,emp);if(!n)return{error:'Geen volgende werkdag gevonden.'};d=n;first=false}
 }
 if(need>0)return{error:'Taak past niet binnen de beschikbare werkdagen.'};
 out=typeof mergePauseSegments==='function'?mergePauseSegments(out):out;
 return{segments:out};
}
function applyStrict(t,proposal,emp){
 try{clearTaskPlanning(t)}catch(_){t.planSegments=[];t.date=null;t.start=''}
 t.planSegments=proposal.segments;t.employee=emp;t.date=proposal.segments[0]?.date||null;t.start=proposal.segments[0]?.start||'';t.planningOrigin='manual';t.lockedPlanning=true;t.manualPlanning=true;
}
function prefillDrop(id,emp,date){
 const t=S()?.tasks?.find(x=>x.id===id);if(!t)return;
 openTask(id);
 const e=document.getElementById('mEmp'),d=document.getElementById('mDate'),s=document.getElementById('mStart');
 if(e)e.value=emp;if(d)d.value=date;if(s&&!s.value){try{s.value=dayStartTime(date,emp)||'08:15'}catch(_){s.value='08:15'}}
}
function install(){
 if(typeof window.saveTask!=='function'||typeof window.openTask!=='function'||typeof window.render!=='function')return setTimeout(install,150);
 const originalSave=window.saveTask;
 window.saveTask=function(id){
  const t=S()?.tasks?.find(x=>x.id===id),emp=document.getElementById('mEmp')?.value||'',date=document.getElementById('mDate')?.value||'',start=document.getElementById('mStart')?.value||'',status=document.getElementById('mStatus')?.value||'',estimate=Number(document.getElementById('mEst')?.value)||0,machineValue=document.getElementById('mMachine')?.value||'';
  if(t&&status==='open'&&emp&&date){
   if(!start)return alert('Kies ook een starttijd.');
   const oldMachine=t.machine,oldAssigned=t.assignedMachine;if(machineValue){t.machine=machineValue;if(/mori|zl\s*[-–]?\s*15|sl\s*[-–]?\s*25/i.test(machineValue))t.assignedMachine=machineValue}
   const proposal=strictProposal(t,emp,date,start,estimate);if(proposal.error){t.machine=oldMachine;if(oldAssigned)t.assignedMachine=oldAssigned;else delete t.assignedMachine;return alert(proposal.error);}
   const old=window.scheduleTaskAcrossCapacity;
   window.scheduleTaskAcrossCapacity=function(task){applyStrict(task,proposal,emp);return taskFinishAt(task)};
   try{originalSave.apply(this,arguments)}finally{window.scheduleTaskAcrossCapacity=old}
   const fresh=S()?.tasks?.find(x=>x.id===id);if(fresh){fresh.planningOrigin='manual';fresh.lockedPlanning=true;fresh.manualPlanning=true;try{save()}catch(_){}}
   return;
  }
  return originalSave.apply(this,arguments);
 };
 const oldDropWeek=window.dropWeek;
 window.dropWeek=function(e,emp,date){e.preventDefault();e.currentTarget?.classList?.remove('dropover');const id=e.dataTransfer?.getData('text/plain');if(!id)return;prefillDrop(id,emp,date)};
 const oldDropToday=window.dropToday;
 window.dropToday=function(e,emp){e.preventDefault();const id=e.dataTransfer?.getData('text/plain');if(!id)return;if(!emp)return oldDropToday?.apply(this,arguments);prefillDrop(id,emp,typeof selectedDate!=='undefined'?selectedDate:new Date().toISOString().slice(0,10))};
 window.RALAB_MANUAL_START={version:VERSION,strictProposal,prefillDrop,manualOnly:true};
}
install();
})();