// rAlabaster deadline-driven planner v2
// Hard task sequence, Ralph setup pairing, deadline buffers, scenario planning and controlled re-optimization.
(()=>{
const VERSION='20260911-2';
const FREEZE_DAYS=1;
const MIN_USEFUL_BLOCK=60;
const MORI_FLEX=['Mori ZL15 #1','Mori ZL15 #2','Mori SL25'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const S=()=>{try{return state}catch(_){return null}};
const clone=x=>JSON.parse(JSON.stringify(x));
const today=()=>isoDate(new Date());
const addCal=(d,n)=>addDays(d,n);
const min=(t)=>{const [h,m]=(t||'00:00').split(':').map(Number);return h*60+m};
const tm=x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');
const taskDone=t=>t?.status==='done'||t?.status==='completed';
const taskStarted=t=>['in_progress','partly','partial','external'].includes(String(t?.status||'').toLowerCase())||Number(t?.actual)>0||Number(t?.doneQty)>0;
const isGeneral=t=>!!t&&(t.isGeneralWork||t.orderId==='__workshop_general__');
const isSetup=t=>/\binstellen\b/i.test((t?.name||'')+' '+(t?.machine||''));
const cleanMachine=s=>String(s||'').replace(/\s*[-–]?\s*instellen\b/ig,'').replace(/\s+/g,' ').trim();
const machineKey=t=>cleanMachine(t?.assignedMachine||t?.machine||t?.name||'').toLowerCase();
const machineBase=t=>cleanMachine(t?.machinePreference||t?.machine||t?.name||'');
const isZL15=s=>/^mori\s+zl15\s+#?[12]$/i.test(cleanMachine(s));
const isSL25=s=>/^mori\s+sl25$/i.test(cleanMachine(s));
function rememberMachinePreference(t){if(!t||t.machinePreference)return;if(isZL15(t.machine))t.machinePreference=cleanMachine(t.machine);else if(isSL25(t.machine))t.machinePreference='Mori SL25'}
function machineOptions(t){rememberMachinePreference(t);const b=machineBase(t);if(isZL15(b))return MORI_FLEX.slice();if(isSL25(b))return ['Mori SL25'];return [cleanMachine(t?.assignedMachine||t?.machine||t?.name||'')].filter(Boolean)}
function setAssignedMachine(t,machine){if(!t||!machine)return;rememberMachinePreference(t);t.assignedMachine=machine;if(t.machinePreference){t.machine=isSetup(t)?`${machine} - Instellen`:machine}}
function resetMachineAssignment(t){if(!t)return;rememberMachinePreference(t);if(t.machinePreference){t.machine=isSetup(t)?`${t.machinePreference} - Instellen`:t.machinePreference;delete t.assignedMachine}}
const hardDate=o=>o?.maximumReadyDate||o?.deadline||'';
const targetDate=o=>o?.internalTargetDate||(hardDate(o)?addCal(hardDate(o),-3):'');
const fmt=d=>d?fmtShort(d):'—';
function workdaySlack(a,b){if(!a||!b)return null;return workdaysBetween(a,b)}
function setDerivedDates(o){if(!o)return;o.maximumReadyDate=o.maximumReadyDate||o.deadline||'';if(o.maximumReadyDate&&!o.internalTargetDate)o.internalTargetDate=addCal(o.maximumReadyDate,-3)}
function migrateOrderBuffers(){const s=S();if(!s)return false;let changed=false;for(const o of s.orders||[]){if(o.isGeneralWork||o.bufferModelVersion)continue;if(o.sourceQuoteNo&&o.communicatedDeadline&&(!o.deadline||o.deadline===o.communicatedDeadline)){o.quotedEstimatedReadyDate=o.communicatedDeadline;o.maximumReadyDate=addCal(o.communicatedDeadline,14);o.internalTargetDate=addCal(o.maximumReadyDate,-3);o.deadline=o.maximumReadyDate;o.bufferModelVersion=2;changed=true}else if(o.deadline){setDerivedDates(o);o.bufferModelVersion=2;changed=true}}return changed}
function normalizeSequences(){const s=S();if(!s)return;for(const o of s.orders||[]){if(isGeneral({orderId:o.id,isGeneralWork:o.isGeneralWork}))continue;const ts=(s.tasks||[]).filter(t=>t.orderId===o.id&&!isGeneral(t)).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));ts.forEach((t,i)=>{t.seq=i+1;t.dependsPrev=i>0;t.sequenceLocked=true;rememberMachinePreference(t)})}}
function frozen(t){if(taskDone(t)||taskStarted(t)||t.lockedPlanning)return true;const f=addCal(today(),FREEZE_DAYS);return (taskSegments(t)||[]).some(g=>g.date&&g.date<=f)}
function intervalsForEmployee(date,emp,excludeIds=new Set()){
 const out=[];for(const t of S()?.tasks||[]){if(excludeIds.has(t.id)||taskDone(t))continue;for(const g of taskSegments(t)||[]){if(g.date!==date||g.employee!==emp||!g.start)continue;out.push([min(g.start),min(g.start)+Number(g.minutes||0),t.id])}}
 return out.sort((a,b)=>a[0]-b[0]);
}
function intervalsForMachine(date,key,excludeIds=new Set()){
 if(!key)return[];const out=[];for(const t of S()?.tasks||[]){if(excludeIds.has(t.id)||taskDone(t)||machineKey(t)!==key)continue;for(const g of taskSegments(t)||[]){if(g.date!==date||!g.start)continue;out.push([min(g.start),min(g.start)+Number(g.minutes||0),t.id])}}
 return out.sort((a,b)=>a[0]-b[0]);
}
function workBounds(date,emp,allowSaturday=false,allowPeter=false){
 const dow=parseDate(date).getDay();if(dow===0)return null;
 if(dow===6){if(!allowSaturday)return null;return [8*60,12*60]}
 if(emp==='Peter'&&!allowPeter)return null;
 if(dow===5){if(emp!=='Ralph')return null;return [8*60+15,15*60]}
 if(dow>=1&&dow<=4)return [8*60+15,16*60+30];return null;
}
function freeWindows(date,emp,key,excludeIds,allowSaturday,allowPeter){
 const b=workBounds(date,emp,allowSaturday,allowPeter);if(!b)return[];let busy=[...intervalsForEmployee(date,emp,excludeIds),...intervalsForMachine(date,key,excludeIds)].sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const x of busy){const a=Math.max(b[0],x[0]),z=Math.min(b[1],x[1]);if(z<=a)continue;const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],z);else merged.push([a,z])}
 const out=[];let p=b[0];for(const x of merged){if(x[0]>p)out.push([p,x[0]]);p=Math.max(p,x[1])}if(p<b[1])out.push([p,b[1]]);return out;
}
function allocateInternal(t,earliestAt,opts={}){
 const allowSaturday=!!opts.allowSaturday,allowPeter=!!opts.allowPeter,excludeIds=opts.excludeIds||new Set([t.id]);
 const preferred=t.employee&&!isSetup(t)?t.employee:null;let employees=preferred?[preferred]:['Kaan','Lance','Shaffi','Ralph'];if(allowPeter)employees.push('Peter');
 if(isSetup(t))employees=['Ralph'];
 let need=Math.max(0,Number(t.estimate)||0);if(need===0){t.planSegments=[];t.date=dtDate(earliestAt);return earliestAt}
 let d=dtDate(earliestAt),firstDay=true,segs=[],guard=0,selectedMachine=t.assignedMachine||null;
 while(need>0&&guard++<240){let best=null;const machines=selectedMachine?[selectedMachine]:machineOptions(t);for(const machine of machines){const key=cleanMachine(machine).toLowerCase();for(const emp of employees){for(const w of freeWindows(d,emp,key,excludeIds,allowSaturday,allowPeter)){let a=w[0],z=w[1];if(firstDay)a=Math.max(a,min(dtTime(earliestAt)));const free=z-a;if(free<=0)continue;if(!best||a<best.a||(a===best.a&&free>best.free))best={emp,a,z,free,machine}}}}
   if(best){if(!selectedMachine){selectedMachine=best.machine;setAssignedMachine(t,selectedMachine)}let take=Math.min(need,best.free);if(need>take&&take<MIN_USEFUL_BLOCK){d=addCal(d,1);firstDay=false;continue}segs.push({date:d,employee:best.emp,start:tm(best.a),minutes:take});need-=take;firstDay=false;if(need>0)d=addCal(d,1)}else{d=addCal(d,1);firstDay=false}
 }
 t.planSegments=segs;t.employee=segs[0]?.employee||preferred||null;t.date=segs[0]?.date||dtDate(earliestAt);t.start=segs[0]?.start||'';return taskFinishAt(t)||earliestAt;
}
function pairSetupWithExecution(setup,run,earliestAt,opts={}){
 const sd=Math.max(1,Number(setup.estimate)||30),exclude=new Set([setup.id,run.id]);let d=dtDate(earliestAt),guard=0;
 let employees=run.employee&&run.employee!=='Ralph'?[run.employee]:['Kaan','Lance','Shaffi'];if(opts.allowPeter)employees.push('Peter');
 const machines=run.assignedMachine?[run.assignedMachine]:machineOptions(run);
 while(guard++<180){for(const machine of machines){const key=cleanMachine(machine).toLowerCase(),rw=freeWindows(d,'Ralph',key,exclude,!!opts.allowSaturday,!!opts.allowPeter);for(const emp of employees){const ew=freeWindows(d,emp,key,exclude,!!opts.allowSaturday,!!opts.allowPeter);for(const e of ew){let runStart=Math.max(e[0],min(dtTime(earliestAt))*(d===dtDate(earliestAt)?1:0));if(d!==dtDate(earliestAt))runStart=e[0];for(const r of rw){const candidate=Math.max(runStart,r[0]+sd);if(candidate<e[1]&&candidate<=r[1]&&candidate-sd>=r[0]){
           setAssignedMachine(run,machine);setAssignedMachine(setup,machine);setup.planSegments=[{date:d,employee:'Ralph',start:tm(candidate-sd),minutes:sd}];setup.employee='Ralph';setup.date=d;setup.start=tm(candidate-sd);setup.preferredEmployee='Ralph';
           run.employee=emp;run.preferredEmployee=emp;const finish=allocateInternal(run,dtString(d,tm(candidate)),{...opts,excludeIds:exclude});return finish;
         }}}}
   }d=addCal(d,1)
 }
 return allocateInternal(setup,earliestAt,opts);
}
function clearMovablePlanning(orderIds=null){const ids=orderIds?new Set(orderIds):null;for(const t of S()?.tasks||[]){if(isGeneral(t)||taskDone(t)||frozen(t)||(ids&&!ids.has(t.orderId)))continue;clearTaskPlanning(t);resetMachineAssignment(t);if(isExternalTask(t)&&t.status!=='external'){t.externalSentDate='';t.expectedReturnDate=''}}}
function chainStartForOrder(o){const ts=orderTasks(o.id).sort((a,b)=>a.seq-b.seq),fixed=ts.filter(frozen);let cursor=dtString(today(),'08:15');for(const t of fixed){const f=taskFinishAt(t);if(f&&f>cursor)cursor=f}return cursor}
function scheduleWaitStrict(t,startAt){
 const start=(startAt&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startAt))?startAt.slice(0,16):dtString(today(),'00:00');
 const m=String(start).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
 const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),0,0);
 d.setMinutes(d.getMinutes()+Math.ceil(Math.max(0,Number(t.estimate)||540)));
 const finish=isoDate(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 t.employee=null;t.planSegments=[];t.waitStartAt=start;t.waitEndAt=finish;t.date=dtDate(start);t.start=dtTime(start);t.plannedReleaseAt=finish;
 return finish;
}
function planOrderStrict(o,opts={}){
 setDerivedDates(o);const ts=orderTasks(o.id).filter(t=>!taskDone(t)&&!isGeneral(t)).sort((a,b)=>a.seq-b.seq);let cursor=chainStartForOrder(o);
 for(let i=0;i<ts.length;i++){const t=ts[i];if(frozen(t)){const f=taskFinishAt(t);if(f&&f>cursor)cursor=f;continue}
   const next=ts[i+1];if(isDryTask(t)){cursor=scheduleWaitStrict(t,cursor);continue}
   if(isExternalTask(t)){const send=dtDate(cursor),lead=Number(t.externalLeadDays)||(CFG.rules?.externalLeadDays||14);t.employee=null;t.planSegments=[];t.date=send;t.start='';if(t.status==='external'&&t.externalSentDate)t.expectedReturnDate=addCal(t.externalSentDate,lead);else t.expectedReturnDate=addCal(send,lead);cursor=dtString(t.expectedReturnDate,'00:00');continue}
   if(isSetup(t)&&next&&!isExternalTask(next)&&!isDryTask(next)&&!frozen(next)){
     cursor=pairSetupWithExecution(t,next,cursor,opts);
     // Sla de uitvoerende stap alleen over als die door pairing ook echt is ingepland.
     // Zo kan een mislukte pairing nooit een taak stilletjes ongepland achterlaten.
     const nextPlanned=taskDone(next)||taskStarted(next)||(Array.isArray(next.planSegments)&&next.planSegments.length>0)||!!next.date;
     if(nextPlanned){i++;continue}
     // Fallback: plan setup en uitvoering los, maar nog steeds strikt achter elkaar.
     cursor=allocateInternal(t,cursor,opts);
     cursor=allocateInternal(next,cursor,opts);
     i++;continue
   }
   cursor=allocateInternal(t,cursor,opts);
 }
 return cursor;
}
function roughLeadMinutes(o){let internal=0,calendar=0,bottleneck=0;for(const t of orderTasks(o.id)){if(taskDone(t))continue;if(isExternalTask(t))calendar+=(Number(t.externalLeadDays)||14)*1440;else if(isDryTask(t))calendar+=Number(t.estimate)||540;else{internal+=Number(t.estimate)||0;if(/reichenbacher|kuka|mori|teach-in|gildemeister/i.test(machineKey(t)))bottleneck+=Number(t.estimate)||0}}return {internal,calendar,bottleneck}}
function priority(o){setDerivedDates(o);const h=hardDate(o)||'9999-12-31',t=targetDate(o)||h,r=roughLeadMinutes(o);const latestApprox=h==='9999-12-31'?'9999-12-31':addCal(h,-Math.ceil((r.internal+r.bottleneck*0.35)/495)-Math.ceil(r.calendar/1440));return [latestApprox,t,h,-r.bottleneck,String(o.orderNo||'')]} 
function cmpOrder(a,b){const A=priority(a),B=priority(b);for(let i=0;i<A.length;i++){if(A[i]<B[i])return-1;if(A[i]>B[i])return 1}return 0}
function optimizeAll(opts={}){normalizeSequences();const os=(S()?.orders||[]).filter(o=>o.active&&!o.isGeneralWork&&hardDate(o)).slice().sort(cmpOrder);clearMovablePlanning();for(const o of os)planOrderStrict(o,opts);return os}
function finishDate(o){const ts=orderTasks(o.id).filter(t=>!isGeneral(t));let f='';for(const t of ts){const x=taskFinishDate(t);if(x>f)f=x}return f||today()}
function health(o){setDerivedDates(o);const finish=finishDate(o),target=targetDate(o),hard=hardDate(o),promised=o?.communicatedDeadline||'',internal=o?.internalExpectedDate||'',customerSlack=promised?workdaySlack(finish,promised):null,slack=promised?customerSlack:(hard?workdaySlack(finish,hard):null);let status='ok',label='Ruim haalbaar';if(promised&&internal&&internal>promised){status='bad';label='Interne gereeddatum na klantdeadline'}else if(promised&&finish>promised){status='bad';label='Niet haalbaar voor klantdeadline'}else if(promised&&customerSlack!==null&&customerSlack<=2){status='risk';label='Weinig speling tot klantdeadline'}else if(!promised&&!hard){status='risk';label='Geen maximumdatum'}else if(!promised&&finish>hard){status='bad';label='Niet haalbaar'}else if(!promised&&target&&finish>target){status='risk';label='In bufferzone'}else if(!promised&&slack!==null&&slack<=2){status='risk';label='Weinig speling'}return {finish,target,hard,promised,internal,slack,status,label}}
function scenario(){const backup=clone(S()),result={};try{optimizeAll({allowPeter:false,allowSaturday:false});for(const o of S().orders||[])if(o.active&&!o.isGeneralWork)result[o.id]={normal:health(o)};state=clone(backup);optimizeAll({allowPeter:true,allowSaturday:false});for(const o of S().orders||[])if(result[o.id])result[o.id].peter=health(o);state=clone(backup);optimizeAll({allowPeter:true,allowSaturday:true});for(const o of S().orders||[])if(result[o.id])result[o.id].overtime=health(o)}finally{state=backup}return result}
function recommendation(o,sc){const x=sc?.[o.id];if(!x)return'';if(x.normal.status!=='bad')return x.normal.status==='ok'?'Normale capaciteit':'Buffer wordt gebruikt';if(x.peter?.status!=='bad')return'Peter nodig';if(x.overtime?.status!=='bad')return'Peter + zaterdagoverwerk nodig';return'Niet haalbaar met huidige capaciteit'}
function changedTasks(before,after){const map=new Map((before.tasks||[]).map(t=>[t.id,t]));const out=[];for(const t of after.tasks||[]){const b=map.get(t.id);if(!b||isGeneral(t)||taskDone(t))continue;const a1=JSON.stringify(b.planSegments||[]),a2=JSON.stringify(t.planSegments||[]);if(a1!==a2||String(b.machine||'')!==String(t.machine||'')){const o=(after.orders||[]).find(x=>x.id===t.orderId);out.push({orderNo:o?.orderNo||'',product:o?.product||'',task:t.name,from:(b.planSegments||[])[0]?.date||'',to:(t.planSegments||[])[0]?.date||'',machine:t.machine||''})}}return out}
function previewOptimize(id){const s=S(),before=clone(s),o=order(id);normalizeSequences();optimizeAll({allowPeter:false,allowSaturday:false});let scHealth=health(order(id)),mode='normal';if(scHealth.status==='bad'){state=clone(before);normalizeSequences();optimizeAll({allowPeter:true,allowSaturday:false});scHealth=health(order(id));mode='peter'}if(scHealth.status==='bad'){state=clone(before);normalizeSequences();optimizeAll({allowPeter:true,allowSaturday:true});scHealth=health(order(id));mode='overtime'}const after=clone(state),changes=changedTasks(before,after);state=before;return {mode,health:scHealth,after,changes}}
function applyState(next){state=next;normalizeSequences();save();render()}
function openOptimize(id){const o=order(id),p=previewOptimize(id),h=p.health;const moved=p.changes.slice(0,12).map(x=>`<tr><td>${esc(x.orderNo)} – ${esc(x.product)}</td><td>${esc(x.task)}${x.machine?`<div class="muted">${esc(x.machine)}</div>`:''}</td><td>${fmt(x.from)} → ${fmt(x.to)}</td></tr>`).join('');const extra=p.changes.length>12?`<div class="muted">+ ${p.changes.length-12} extra verschuivingen</div>`:'';const mode=p.mode==='normal'?'Geen extra capaciteit nodig':p.mode==='peter'?'Peter nodig om de planning veilig te halen':'Peter + zaterdagoverwerk nodig';window.__ralabOptimizedState=p.after;
 showModal(`<div class="modalhead"><h3>Planning optimaliseren – ${esc(o.orderNo)} – ${esc(o.product)}</h3></div><div class="modalbody"><div class="notice"><b>${esc(mode)}</b><br>Verwacht gereed <b>${fmt(h.finish)}</b> · intern doel <b>${fmt(h.target)}</b> · harde maximumdatum <b>${fmt(h.hard)}</b> · speling <b>${h.slack===null?'—':h.slack+' werkdagen'}</b>.</div><p>De planner bewaart vandaag + morgen, afgeronde/gestarte taken en vastgezette taken. ZL15 #1/#2 werk mag automatisch naar ZL15 #1, ZL15 #2 of SL25; werk dat expliciet op SL25 staat blijft op SL25.</p><div class="panel" style="max-height:280px;overflow:auto"><table><thead><tr><th>Order</th><th>Taak / machine</th><th>Verschuiving</th></tr></thead><tbody>${moved||'<tr><td colspan="3">Geen bestaande taken hoeven te verschuiven.</td></tr>'}</tbody></table>${extra}</div></div><div class="modalfoot"><button class="btn" onclick="window.__ralabOptimizedState=null;closeModal()">Annuleren</button><button class="btn primary" data-apply-deadline-opt>Optimalisatie toepassen</button></div>`)
}
function riskStrip(o){const h=health(o),rec=recommendation(o,window.__ralabScenarios||{});return `<div class="deadline-health ${h.status}"><b>${esc(h.label)}</b> · gereed ${fmt(h.finish)} · doel ${fmt(h.target)} · max ${fmt(h.hard)} · speling ${h.slack===null?'—':h.slack+' wd'}${rec?' · '+esc(rec):''}</div>`}
function decorateOrders(){const root=document.getElementById('view-orders');if(!root)return;for(const card of root.querySelectorAll('.ordercard')){if(card.querySelector('.deadline-health'))continue;const txt=card.textContent||'',o=(S()?.orders||[]).filter(x=>x.active&&!x.isGeneralWork).find(x=>txt.includes(String(x.orderNo||''))&&txt.includes(String(x.product||'')));if(o)card.insertAdjacentHTML('beforeend',riskStrip(o))}}
function decorateOrderModal(){const m=document.querySelector('#modalRoot .modalbody');if(!m||m.querySelector('.deadline-v2-box'))return;const title=document.querySelector('#modalRoot .modalhead h3')?.textContent||'';const o=(S()?.orders||[]).find(x=>title.includes(String(x.orderNo||''))&&title.includes(String(x.product||'')));if(!o)return;setDerivedDates(o);const h=health(o);m.insertAdjacentHTML('afterbegin',`<div class="deadline-v2-box panel" style="padding:12px;margin-bottom:12px"><div class="grid3"><div><b>Intern doel</b><br>${fmt(h.target)}</div><div><b>Harde maximumdatum</b><br>${fmt(h.hard)}</div><div><b>Actuele speling</b><br>${h.slack===null?'—':h.slack+' werkdagen'}</div></div><div style="margin-top:10px"><button class="btn primary" type="button" data-optimize-order="${esc(o.id)}">Optimaliseer op deadlines</button> <button class="btn" type="button" data-lock-order="${esc(o.id)}">Planning vastzetten</button></div></div>`)}
function lockOrder(id){for(const t of orderTasks(id))if(!taskDone(t))t.lockedPlanning=true;save();alert('Resterende planning van deze order is vastgezet en wordt niet automatisch verschoven.')}
function enforceManualMove(t){if(!t||isGeneral(t))return;normalizeSequences();const ts=orderTasks(t.orderId).sort((a,b)=>a.seq-b.seq),idx=ts.findIndex(x=>x.id===t.id);if(idx<0)return;let cursor=taskFinishAt(t);for(let i=idx+1;i<ts.length;i++){const x=ts[i];if(taskDone(x)||taskStarted(x)||x.lockedPlanning)break;if(!cursor)break;if(isDryTask(x)){cursor=scheduleWaitStrict(x,cursor)}else if(isExternalTask(x)){const d=dtDate(cursor),lead=Number(x.externalLeadDays)||14;x.employee=null;x.planSegments=[];x.date=d;x.expectedReturnDate=addCal(d,lead);cursor=dtString(x.expectedReturnDate,'00:00')}else{const emp=isSetup(x)?'Ralph':(x.employee||x.preferredEmployee||bestEmployeeForTask(x,cursor,false));cursor=allocateInternal(x,cursor,{allowPeter:emp==='Peter'})}}
}
function install(){if(typeof window.renderOrders!=='function'||typeof window.openOrder!=='function')return setTimeout(install,300);normalizeSequences();migrateOrderBuffers();for(const o of S()?.orders||[])setDerivedDates(o);save();
 const oldRenderOrders=window.renderOrders;window.renderOrders=function(){window.__ralabScenarios=scenario();const r=oldRenderOrders();setTimeout(decorateOrders,0);return r};
 const oldOpenOrder=window.openOrder;window.openOrder=function(id){const r=oldOpenOrder(id);setTimeout(decorateOrderModal,0);return r};
 const oldDeadline=window.updateOrderDeadline;window.updateOrderDeadline=function(id,v){const o=order(id);if(o){o.deadline=v||'';o.maximumReadyDate=v||'';o.internalTargetDate=v?addCal(v,-3):'';save();closeModal();renderOrders();openOrder(id);return}return oldDeadline?.(id,v)};
 const oldDropToday=window.dropToday;window.dropToday=function(e,emp){const id=e.dataTransfer?.getData('text/plain'),t0=S()?.tasks?.find(x=>x.id===id),before=JSON.stringify(t0?.planSegments||[]);oldDropToday(e,emp);const t=S()?.tasks?.find(x=>x.id===id);if(t&&!isGeneral(t)&&JSON.stringify(t.planSegments||[])!==before){enforceManualMove(t);save();renderToday()}};
 const oldDropWeek=window.dropWeek;window.dropWeek=function(e,emp,date){const id=e.dataTransfer?.getData('text/plain'),t0=S()?.tasks?.find(x=>x.id===id),before=JSON.stringify(t0?.planSegments||[]);oldDropWeek(e,emp,date);const t=S()?.tasks?.find(x=>x.id===id);if(t&&!isGeneral(t)&&JSON.stringify(t.planSegments||[])!==before){enforceManualMove(t);save();renderWeeks()}};
 window.openPlanEntireOrder=function(id){const o=order(id);showModal(`<div class="modalhead"><h3>Order inplannen – ${esc(o.orderNo)} – ${esc(o.product)}</h3></div><div class="modalbody"><div class="notice"><b>Vaste procesvolgorde actief.</b> Instellen door Ralph blijft direct gekoppeld aan de uitvoerende machinebewerking. ZL15-werk mag automatisch over ZL15 #1, ZL15 #2 en SL25 worden verdeeld.</div><div class="grid2"><div class="panel" style="padding:12px"><b>Zonder andere orders te wijzigen</b><p class="muted">Plant deze order in om de bestaande planning heen. De taakvolgorde blijft vast.</p><button class="btn" type="button" data-plan-current="${esc(id)}">Alleen deze order plannen</button></div><div class="panel" style="padding:12px"><b>Optimaliseer op deadlines</b><p class="muted">Herschikt nog niet gestarte planning na de freeze-horizon en controleert Peter/overwerk.</p><button class="btn primary" type="button" data-optimize-order="${esc(id)}">Deadline-optimalisatie</button></div></div></div><div class="modalfoot"><button class="btn" onclick="closeModal()">Sluiten</button></div>`)};
 const st=document.createElement('style');st.textContent=`.deadline-health{margin-top:8px;padding:7px 9px;border-radius:7px;background:#eef7ef;font-size:12px}.deadline-health.risk{background:#fff4d8}.deadline-health.bad{background:#ffe5e2}.deadline-v2-box{background:#fbfcfb}`;document.head.appendChild(st);
 document.addEventListener('click',e=>{const pc=e.target.closest('[data-plan-current]');if(pc){e.preventDefault();const id=pc.dataset.planCurrent,o=order(id);clearMovablePlanning([id]);planOrderStrict(o,{allowPeter:false,allowSaturday:false});save();closeModal();render();return}const b=e.target.closest('[data-optimize-order]');if(b){e.preventDefault();openOptimize(b.dataset.optimizeOrder);return}const a=e.target.closest('[data-apply-deadline-opt]');if(a){e.preventDefault();if(window.__ralabOptimizedState){const n=window.__ralabOptimizedState;window.__ralabOptimizedState=null;closeModal();applyState(n)}return}const l=e.target.closest('[data-lock-order]');if(l){e.preventDefault();lockOrder(l.dataset.lockOrder);return}},true);
 window.RALAB_DEADLINE_PLANNER={version:VERSION,optimizeAll,planOrderStrict,health,scenario,openOptimize,normalizeSequences,enforceManualMove,machineOptions,allocateInternal,scheduleWaitStrict};
 if(typeof currentView!=='undefined'&&currentView==='orders')renderOrders();
}
install();
})();