// Close safe same-day planning gaps immediately after a task is deleted.
(()=>{
const VERSION='20260913-1';
const S=()=>{try{return state}catch(_){return null}};
const clone=x=>JSON.parse(JSON.stringify(x));
const done=t=>['done','completed'].includes(String(t?.status||'').toLowerCase());
const started=t=>['in_progress','partial','partly','external'].includes(String(t?.status||'').toLowerCase())||Number(t?.actual)>0||Number(t?.doneQty)>0;
const movable=t=>!!t&&!t.deleted&&!t.isGeneralWork&&!done(t)&&!started(t)&&!t.lockedPlanning;
const segs=t=>Array.isArray(t?.planSegments)&&t.planSegments.length?t.planSegments:(t?.date&&t?.employee?[{date:t.date,employee:t.employee,start:t.start||'',minutes:Number(t.estimate)||0,__fallback:true}]:[]);
const toMin=x=>{const [h,m]=String(x||'00:00').split(':').map(Number);return(h||0)*60+(m||0)};
const toTime=x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');
const cleanMachine=x=>String(x||'').replace(/\s*[-–]?\s*instellen\b/ig,'').replace(/\s+/g,' ').trim().toLowerCase();
const machineOf=t=>cleanMachine(t?.assignedMachine||t?.machinePreference||t?.machine||t?.name||'');
const taskEndAt=t=>{try{return typeof taskFinishAt==='function'?taskFinishAt(t):''}catch(_){return''}};
function dayStart(date,employee){try{return toMin(typeof dayStartTime==='function'?dayStartTime(date,employee):'08:15')}catch(_){return 8*60+15}}
function previousTask(t){
 const list=(S()?.tasks||[]).filter(x=>x.orderId===t.orderId&&!x.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 return list.find(x=>(Number(x.seq)||0)===(Number(t.seq)||0)-1)||null;
}
function machineBusy(date,employee,currentTask,currentSegment){
 const key=machineOf(currentTask);if(!key)return[];const out=[];
 for(const t of S()?.tasks||[]){if(t.deleted||done(t)||machineOf(t)!==key)continue;
   for(const g of segs(t)){
     if(g===currentSegment||(t===currentTask&&g.date===currentSegment.date&&g.start===currentSegment.start&&Number(g.minutes)===Number(currentSegment.minutes)))continue;
     if(g.date!==date||!g.start)continue;
     // Andere verplaatsbare taken van dezelfde medewerker worden in deze ronde zelf op volgorde aangesloten.
     if(g.employee===employee&&movable(t))continue;
     const a=toMin(g.start),z=a+Math.max(0,Number(g.minutes)||0);if(z>a)out.push([a,z]);
   }
 }
 return out.sort((a,b)=>a[0]-b[0]);
}
function firstMachineSlot(candidate,duration,busy){
 let start=candidate,changed=true,guard=0;
 while(changed&&guard++<200){changed=false;for(const [a,z] of busy){if(start<z&&start+duration>a){start=z;changed=true;break}}}
 return start;
}
function dependencyEarliest(t,date){
 const p=previousTask(t);if(!p)return 0;const end=taskEndAt(p);if(!end)return 0;
 const d=String(end).slice(0,10),time=String(end).slice(11,16);if(d>date)return Infinity;if(d===date)return toMin(time);return 0;
}
function compactEmployeeDay(date,employee){
 if(!date||!employee)return 0;const items=[];
 for(const t of S()?.tasks||[]){if(!movable(t))continue;for(const g of segs(t)){if(g.date===date&&g.employee===employee&&g.start&&Number(g.minutes)>0)items.push({t,g})}}
 items.sort((a,b)=>toMin(a.g.start)-toMin(b.g.start)||(Number(a.t.seq)||0)-(Number(b.t.seq)||0));
 let cursor=dayStart(date,employee),moved=0;
 for(const item of items){const {t,g}=item,old=toMin(g.start),duration=Math.max(1,Number(g.minutes)||0),dependency=dependencyEarliest(t,date);let earliest=Math.max(cursor,Number.isFinite(dependency)?dependency:old);
   const own=segs(t),idx=own.indexOf(g);if(idx>0&&own[idx-1].date===date)earliest=Math.max(earliest,toMin(own[idx-1].start)+Number(own[idx-1].minutes||0));
   const pauses=typeof planningBreaks==='function'?planningBreaks(date,employee).map(x=>[x[0],x[1]]):[],candidate=firstMachineSlot(earliest,duration,[...machineBusy(date,employee,t,g),...pauses].sort((a,b)=>a[0]-b[0]));
   if(candidate<old){g.start=toTime(candidate);if(g.__fallback)t.start=g.start;moved++}
   const actualStart=candidate<old?candidate:old;cursor=Math.max(cursor,actualStart+duration);
 }
 for(const t of new Set(items.map(x=>x.t))){const first=segs(t).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||''))[0];if(first){t.date=first.date;t.start=first.start;t.employee=first.employee||t.employee}}
 return moved;
}
function affectedSlots(t){const out=new Map();for(const g of segs(t)){if(g.date&&g.employee)out.set(g.date+'|'+g.employee,{date:g.date,employee:g.employee})}return[...out.values()]}
function deleteAndCompact(id){
 if(!confirm('Deze taak verwijderen? De vrijgekomen tijd wordt automatisch doorgeschoven. Je kunt dit daarna ongedaan maken.'))return;
 const s=S(),idx=(s?.tasks||[]).findIndex(t=>t.id===id);if(idx<0)return;const t=s.tasks[idx],slots=affectedSlots(t);
 s.deletedTasks=s.deletedTasks||[];s.deletedTasks.push({task:clone(t),deletedAt:Date.now()});s.tasks.splice(idx,1);
 try{renumberOrder(t.orderId)}catch(_){ }
 let moved=0;for(const slot of slots)moved+=compactEmployeeDay(slot.date,slot.employee);
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){ }
 try{save()}catch(e){console.error(e)}try{closeModal()}catch(_){ }try{render()}catch(_){ }
 alert(`Taak verwijderd.${moved?` ${moved} geplande taakblok(ken) zijn automatisch naar voren geschoven.`:' Er was geen veilig later taakblok om naar voren te schuiven.'} Via Orders → “Verwijderen ongedaan maken” kun je de taak herstellen.`);
}
function undoDeleteSafely(){
 const s=S(),x=s?.deletedTasks?.pop();if(!x)return alert('Niets om ongedaan te maken.');const restored=clone(x.task),seq=Number(restored.seq)||1;
 (s.tasks||[]).filter(t=>t.orderId===restored.orderId&&Number(t.seq)>=seq).forEach(t=>t.seq=(Number(t.seq)||0)+1);
 // De oude plaats in de kalender is inmiddels opgevuld; herstel daarom alleen de procespositie.
 restored.planSegments=[];restored.date=null;restored.start='';restored.employee=null;restored.preferredEmployee=null;restored.lockedPlanning=false;restored.waitStartAt='';restored.waitEndAt='';
 if(restored.type==='external'||/extern/i.test((restored.name||'')+' '+(restored.machine||''))){restored.externalSentDate='';restored.expectedReturnDate=''}
 s.tasks.push(restored);try{renumberOrder(restored.orderId)}catch(_){ }
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){ }try{save()}catch(e){console.error(e)}try{render()}catch(_){ }
 alert('De taak is hersteld op de oorspronkelijke plek in het proces. Het tijdslot blijft leeg zodat er geen dubbele planning ontstaat; plan de taak opnieuw in.');
}
function install(){if(typeof window.deleteTask!=='function'||typeof window.undoDeleteTask!=='function'||typeof window.render!=='function')return setTimeout(install,150);window.deleteTask=deleteAndCompact;window.undoDeleteTask=undoDeleteSafely;window.RALAB_GAP_COMPACTION={version:VERSION,compactEmployeeDay,deleteAndCompact,undoDeleteSafely}}
install();
})();
