// Order-by-order planning controls: unplan safely, sort by deadline and check feasibility before saving.
(()=>{
const VERSION='20260913-2';
const S=()=>{try{return state}catch(_){return null}};
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const planner=()=>window.RALAB_DEADLINE_PLANNER;
const findOrder=id=>(S()?.orders||[]).find(o=>o.id===id&&!o.deleted);
const tasksFor=id=>(S()?.tasks||[]).filter(t=>t.orderId===id&&!t.deleted);
const deadlineOf=o=>o?.communicatedDeadline||o?.maximumReadyDate||o?.deadline||'';
const done=t=>['done','completed'].includes(String(t?.status||'').toLowerCase());
const started=t=>['in_progress','partial','partly','external'].includes(String(t?.status||'').toLowerCase())||Number(t?.actual)>0||Number(t?.doneQty)>0;
const general=t=>!!t&&(t.isGeneralWork||t.orderId==='__workshop_general__'||t.orderId==='__staff_absence__');
const movable=t=>!general(t)&&!done(t)&&!started(t);
const segments=t=>Array.isArray(t?.planSegments)?t.planSegments:[];
const fmtDate=d=>{try{return typeof fmtShort==='function'?fmtShort(d):d}catch(_){return d||'—'}};
const fmtMinutes=m=>{const n=Math.max(0,Math.round(Number(m)||0));if(n<60)return n===1?'1 minuut':`${n} minuten`;const h=Math.round(n/6)/10;return`${String(h).replace('.',',')} uur`};
function invalidate(){try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}}
function setState(next){state=clone(next);invalidate()}
function clearOneTask(t){
 if(!movable(t))return false;
 if(typeof clearTaskPlanning==='function')clearTaskPlanning(t);else{t.planSegments=[];t.date=null;t.start='';t.waitStartAt='';t.waitEndAt=''}
 t.employee=null;t.preferredEmployee=null;t.lockedPlanning=false;delete t.assignedMachine;
 if(t.type==='external'||/extern/i.test((t.name||'')+' '+(t.machine||''))){t.externalSentDate='';t.expectedReturnDate=''}
 return true;
}
function unplanOrderInternal(id){
 const o=findOrder(id);if(!o)return{cleared:0,protected:0};let cleared=0,protectedCount=0;
 for(const t of tasksFor(id)){if(clearOneTask(t))cleared++;else if(!general(t)&&(done(t)||started(t)))protectedCount++}
 o.planningCheckedAt='';o.planningDecision='';o.planningDecisionAt='';o.planningRiskAcceptedAt='';o.planningRiskAcceptedFinish='';
 return{cleared,protected:protectedCount};
}
function activeOrders(){return(S()?.orders||[]).filter(o=>!o.deleted&&o.active!==false&&o.status!=='completed'&&!o.isGeneralWork)}
function persistAndRender(){invalidate();try{save()}catch(e){console.error(e)}try{closeModal()}catch(_){ }setTimeout(()=>window.RALAB_ERP?.renderOrders?.(0),0)}
function showConfirm(title,body,confirmText,action,value=''){
 const root=document.getElementById('modalRoot');if(!root)return;
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(620px,94vw)"><div class="modalhead"><h3>${esc(title)}</h3></div><div class="modalbody">${body}</div><div class="modalfoot"><button class="btn" type="button" data-plan-control-cancel>Annuleren</button><div class="spacer"></div><button class="btn" type="button" data-${action}="${esc(value)}" style="border-color:#b42318;color:#b42318;font-weight:800">${esc(confirmText)}</button></div></div></div>`;
}
function confirmUnplanOrder(id){
 const o=findOrder(id);if(!o)return;const movableCount=tasksFor(id).filter(movable).length,protectedCount=tasksFor(id).filter(t=>!general(t)&&(done(t)||started(t))).length;
 showConfirm('Order ontplannen',`<p>Alle planning van de <b>${movableCount} nog niet gestarte stap(pen)</b> van order <b>${esc(o.orderNo||'')}</b> wordt verwijderd.</p>${protectedCount?`<p class="muted">${protectedCount} afgeronde, gestarte of extern lopende stap(pen) blijven behouden.</p>`:''}`,'Order ontplannen','confirm-unplan-order',id);
}
function confirmUnplanAll(){
 const orders=activeOrders(),movableCount=orders.reduce((n,o)=>n+tasksFor(o.id).filter(movable).length,0),protectedCount=orders.reduce((n,o)=>n+tasksFor(o.id).filter(t=>!general(t)&&(done(t)||started(t))).length,0);
 showConfirm('Alle orders ontplannen',`<p>Je verwijdert de planning van <b>${movableCount} nog niet gestarte stappen</b> verdeeld over <b>${orders.length} actieve orders</b>.</p><p>Daarna kun je bij de eerste deadline beginnen en de orders één voor één opnieuw inplannen.</p>${protectedCount?`<p class="muted">${protectedCount} afgeronde, gestarte of extern lopende stap(pen) blijven behouden.</p>`:''}`,'Alles ontplannen','confirm-unplan-all');
}
function executeUnplanOrder(id){const r=unplanOrderInternal(id);persistAndRender();alert(`${r.cleared} stap(pen) van deze order zijn ontpland.${r.protected?` ${r.protected} gestarte/afgeronde stappen zijn behouden.`:''}`)}
function executeUnplanAll(){let cleared=0,protectedCount=0;for(const o of activeOrders()){const r=unplanOrderInternal(o.id);cleared+=r.cleared;protectedCount+=r.protected}persistAndRender();alert(`${cleared} nog niet gestarte stappen zijn ontpland.${protectedCount?` ${protectedCount} gestarte/afgeronde stappen zijn behouden.`:''}`)}
function countMinutes(orderId,pred){let n=0;for(const t of tasksFor(orderId))for(const g of segments(t))if(pred(g,t))n+=Number(g.minutes)||0;return n}
function simulate(id,opts){
 const backup=clone(S());setState(backup);unplanOrderInternal(id);const o=findOrder(id),p=planner();
 if(!o||!p?.planOrderStrict){setState(backup);return null}
 p.normalizeSequences?.();p.planOrderStrict(o,opts);invalidate();let h=p.health(o);
 if(h?.finish){o.internalExpectedDate=h.finish;h=p.health(o)}
 const result={state:clone(S()),health:h,peterMinutes:countMinutes(id,g=>g.employee==='Peter'),saturdayMinutes:countMinutes(id,g=>g.date&&typeof parseDate==='function'&&parseDate(g.date).getDay()===6)};
 setState(backup);return result;
}
function daysLate(deadline,finish){if(!deadline||!finish)return 0;const a=new Date(deadline+'T12:00:00'),b=new Date(finish+'T12:00:00');return Math.max(0,Math.ceil((b-a)/86400000))}
function applyPlannedState(result,id,decision){
 if(!result?.state)return;setState(result.state);const o=findOrder(id);if(o){o.planningCheckedAt=new Date().toISOString();o.planningDecision=decision;o.planningDecisionAt=new Date().toISOString()}
 persistAndRender();const h=result.health||{};alert(`Order ingepland. Verwacht gereed: ${fmtDate(h.finish)}. Deadline: ${fmtDate(deadlineOf(o))}.`)
}
function reviewSegments(t){return Array.isArray(t?.planSegments)&&t.planSegments.length?t.planSegments:(t?.date&&t?.employee?[{date:t.date,employee:t.employee,start:t.start||'',minutes:Number(t.estimate)||0}]:[])}
function reviewTaskStart(t){const a=reviewSegments(t).slice().sort((x,y)=>(x.date||'').localeCompare(y.date||'')||(x.start||'').localeCompare(y.start||''))[0];return a?(a.date+'T'+(a.start||'00:00')):''}
function reviewTaskFinish(t){const a=reviewSegments(t).slice().sort((x,y)=>(x.date||'').localeCompare(y.date||'')||(x.start||'').localeCompare(y.start||''));if(!a.length)return'';const x=a.at(-1),m=(x.start||'00:00').split(':').map(Number),end=(m[0]||0)*60+(m[1]||0)+(Number(x.minutes)||0);return x.date+'T'+String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0')}
function reviewWarnings(source,id){
 const warnings=[],tasks=(source.tasks||[]).filter(t=>!t.deleted&&t.status!=='done'),own=tasks.filter(t=>t.orderId===id).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)),groups=new Map();
 for(let i=0;i<own.length;i++){const t=own[i];if(!isExternalTask(t)&&!isDryTask(t)&&!reviewSegments(t).length)warnings.push(`${t.name}: nog niet ingepland.`);const p=own[i-1];if(t.dependsPrev&&p){const pf=isDryTask(p)?p.waitEndAt:isExternalTask(p)?((p.expectedReturnDate||p.date||'')+'T00:00'):reviewTaskFinish(p),ts=isDryTask(t)?t.waitStartAt:isExternalTask(t)?((t.date||'')+'T00:00'):reviewTaskStart(t);if(pf&&ts&&ts<pf)warnings.push(`${t.name}: begint voordat ${p.name} gereed is.`)}}
 const add=(key,x)=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)};
 for(const t of tasks)for(const g of reviewSegments(t)){if(!g.date||!g.start)continue;const a=g.start.split(':').map(Number),from=(a[0]||0)*60+(a[1]||0),to=from+(Number(g.minutes)||0);if(g.employee)add(`P|${g.date}|${g.employee}`,{t,g,from,to,label:g.employee,type:'Medewerker'});const m=String(t.assignedMachine||t.machinePreference||t.machine||'').replace(/\s*[-–]?\s*instellen\b/ig,'').trim().toLowerCase();if(m)add(`M|${g.date}|${m}`,{t,g,from,to,label:t.assignedMachine||t.machinePreference||t.machine,type:'Machine'})}
 const seen=new Set();for(const arr of groups.values()){arr.sort((a,b)=>a.from-b.from||a.to-b.to);for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length&&arr[j].from<arr[i].to;j++){const a=arr[i],b=arr[j];if(a.t.id===b.t.id||!(a.t.orderId===id||b.t.orderId===id)||a.to<=b.from)continue;const key=[a.type,a.t.id,b.t.id,a.g.date].sort().join('|');if(seen.has(key))continue;seen.add(key);warnings.push(`${a.type} ${a.label} heeft overlap op ${a.g.date}: ${a.t.name} en ${b.t.name}.`)}}
 return warnings
}
function reviewRows(result,id){const tasks=(result.state.tasks||[]).filter(t=>t.orderId===id&&!t.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));return tasks.map(t=>{const seg=reviewSegments(t).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||'')),f=seg[0],last=seg.at(-1),special=isDryTask(t)||isExternalTask(t),finish=isDryTask(t)?t.waitEndAt:isExternalTask(t)?((t.expectedReturnDate||'')+'T00:00'):reviewTaskFinish(t),blockEnd=f?.start?(()=>{const a=f.start.split(':').map(Number),z=(a[0]||0)*60+(a[1]||0)+(Number(f.minutes)||0);return String(Math.floor(z/60)).padStart(2,'0')+':'+String(z%60).padStart(2,'0')})():'',multiDay=seg.length>1,continuation=multiDay?`<div class="muted">Loopt door in ${seg.length} blokken t/m ${esc(last.date)} ${esc(last.start||'')}</div>`:'';return`<tr data-review-task="${esc(t.id)}" data-original-start="${esc(reviewTaskStart(t))}" data-original-end="${esc(blockEnd)}" data-original-employee="${esc(f?.employee||t.employee||'')}" data-original-date="${esc(f?.date||t.date||'')}"><td><b>${Number(t.seq)||''}. ${esc(t.name||'')}</b><div class="muted">${esc(t.machine||'—')}</div></td><td>${special?`<span class="muted">${isDryTask(t)?'Geen medewerker':'Externe partij'}</span>`:`<select class="input" data-review-employee>${EMPLOYEES.map(e=>`<option value="${esc(e)}" ${e===(f?.employee||t.employee)?'selected':''}>${esc(e)}</option>`).join('')}</select>`}</td><td>${special?esc(t.date||'—'):`<input class="input" type="date" data-review-date value="${esc(f?.date||t.date||'')}">`}</td><td>${special?'—':`<input class="input" type="time" data-review-start value="${esc(f?.start||t.start||'')}">`}</td><td>${special||multiDay?(finish?`${esc(finish.slice(11,16)||'—')}<div class="muted">${esc(finish.slice(0,10))}</div>`:'—'):`<input class="input" type="time" data-review-end value="${esc(blockEnd)}">`}${continuation}</td><td>${fmtMinutes(Number(t.estimate)||0)}</td></tr>`}).join('')}
function openPlanReview(result,id,decision,deadlineShift=''){const o=(result.state.orders||[]).find(x=>x.id===id);if(!o)return;const warnings=reviewWarnings(result.state,id),h=result.health||{},deadline=deadlineShift||deadlineOf(o),bad=h.status==='bad'&&!deadlineShift,status=bad?'Niet haalbaar':warnings.length?'Controle nodig':'Haalbaar';window.__ralabOrderPlanReview={result,id,decision,deadlineShift};const root=document.getElementById('modalRoot');if(!root)return;root.innerHTML=`<div class="modalback"><div class="modal plan-review-modal"><div class="modalhead"><h3>Orderplanning controleren · ${esc(o.orderNo||'')}</h3></div><div class="modalbody"><div class="plan-review-summary ${bad?'bad':warnings.length?'risk':'ok'}"><b>${esc(status)}</b> · verwacht gereed <b>${esc(fmtDate(h.finish))}</b> · deadline <b>${esc(fmtDate(deadline))}</b>${deadlineShift?`<br>Bij accepteren wordt de klantdeadline aangepast naar <b>${esc(fmtDate(deadlineShift))}</b>.`:''}</div>${warnings.length?`<div class="notice"><b>Let op:</b><ul>${warnings.slice(0,8).map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}<p>Controleer iedere stap. Pas medewerker, datum of starttijd aan en klik daarna op <b>Wijzigingen doorrekenen</b>.</p><div class="plan-review-table"><table><thead><tr><th>Processtap / machine</th><th>Medewerker</th><th>Datum</th><th>Start</th><th>Einde</th><th>Duur</th></tr></thead><tbody>${reviewRows(result,id)}</tbody></table></div></div><div class="modalfoot"><button class="btn" type="button" data-plan-review-cancel>Annuleren</button><div class="spacer"></div><button class="btn" type="button" data-plan-review-recalc>Wijzigingen doorrekenen</button><button class="btn primary" type="button" data-plan-review-accept ${warnings.length||bad?'disabled':''}>Planning accepteren</button></div></div></div>`}
function recalculateReview(){const review=window.__ralabOrderPlanReview;if(!review)return;const live=clone(S());setState(review.result.state);const changed=[];for(const row of document.querySelectorAll('[data-review-task]')){const t=(S().tasks||[]).find(x=>x.id===row.dataset.reviewTask);if(!t||isExternalTask(t)||isDryTask(t))continue;const emp=row.querySelector('[data-review-employee]')?.value||t.employee,date=row.querySelector('[data-review-date]')?.value||t.date,start=row.querySelector('[data-review-start]')?.value||'08:15',end=row.querySelector('[data-review-end]')?.value||'',old=row.dataset.originalStart||reviewTaskStart(t),endChanged=!!end&&end!==row.dataset.originalEnd;if(endChanged){const a=start.split(':').map(Number),b=end.split(':').map(Number),duration=(b[0]*60+b[1])-(a[0]*60+a[1]);if(duration<=0){setState(live);return alert(`${t.name}: de eindtijd moet later zijn dan de starttijd op dezelfde werkdag.`)}t.estimate=duration}if(emp!==t.employee||(date+'T'+start)!==old||endChanged)changed.push({t,emp,date,start,old,oldEmp:row.dataset.originalEmployee,oldDate:row.dataset.originalDate})}for(const x of changed){x.t.employee=x.emp;const engine=window.RALAB_MANUAL_START;if(engine?.reflow)engine.reflow(x.t.id,x.emp,x.date,x.start,x.old);else if(typeof scheduleTaskFromDateTime==='function')scheduleTaskFromDateTime(x.t,x.emp,x.date+'T'+x.start,false);window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(x.t);if(x.oldEmp&&x.oldDate&&(x.oldEmp!==x.emp||x.oldDate!==x.date))window.RALAB_GAP_COMPACTION?.compactEmployeeDay?.(x.oldDate,x.oldEmp)}const o=(S().orders||[]).find(x=>x.id===review.id),p=planner(),next={state:clone(S()),health:p?.health?.(o)||review.result.health};setState(live);review.result=next;openPlanReview(next,review.id,review.decision,review.deadlineShift)}
function acceptReview(){const review=window.__ralabOrderPlanReview;if(!review)return;if(review.deadlineShift){const o=(review.result.state.orders||[]).find(x=>x.id===review.id);if(o){o.communicatedDeadline=review.deadlineShift;o.deadline=review.deadlineShift;o.maximumReadyDate=review.deadlineShift;o.internalTargetDate=review.deadlineShift}}window.__ralabOrderPlanReview=null;applyPlannedState(review.result,review.id,review.decision)}
function planAndCheck(id){
 const o=findOrder(id);if(!o)return;const deadline=deadlineOf(o);if(!deadline){alert('Vul eerst een klantdeadline in. Zonder deadline kan de planner de haalbaarheid niet controleren.');return}
 try{closeModal()}catch(_){ }
 const normal=simulate(id,{allowPeter:false,allowSaturday:false});if(!normal){alert('De planningsmodule is nog niet gereed. Ververs de app en probeer opnieuw.');return}
 if(normal.health?.status!=='bad'){openPlanReview(normal,id,'planned_deadline_order');return}
 const withPeter=simulate(id,{allowPeter:true,allowSaturday:false}),withOvertime=simulate(id,{allowPeter:true,allowSaturday:true});
 const peterWorks=withPeter?.health?.status!=='bad'&&withPeter.peterMinutes>0;
 const overtimeWorks=withOvertime?.health?.status!=='bad'&&(withOvertime.saturdayMinutes>0||withOvertime.peterMinutes>0);
 const finish=normal.health?.finish||'',late=daysLate(deadline,finish);window.__ralabPendingOrderPlan={id,normal,withPeter,withOvertime};
 const options=[];
 if(peterWorks)options.push(`<button class="btn primary" type="button" data-apply-order-plan="peter">Plan met Peter · ${esc(fmtMinutes(withPeter.peterMinutes))}</button>`);
 if(overtimeWorks)options.push(`<button class="btn primary" type="button" data-apply-order-plan="overtime">Plan met Peter/overwerk · ${esc(fmtMinutes(withOvertime.peterMinutes))} Peter${withOvertime.saturdayMinutes?` + ${esc(fmtMinutes(withOvertime.saturdayMinutes))} zaterdag`:''}</button>`);
 if(finish)options.push(`<button class="btn" type="button" data-apply-order-plan="shift">Plan en verschuif deadline naar ${esc(fmtDate(finish))}</button>`);
 const root=document.getElementById('modalRoot');if(!root)return;
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(720px,94vw)"><div class="modalhead"><h3>Deadline niet haalbaar</h3></div><div class="modalbody"><div class="notice"><b>${esc(o.orderNo||'')} kan met de normale capaciteit niet op tijd worden afgerond.</b><br>Verwacht gereed: <b>${esc(fmtDate(finish))}</b> · klantdeadline: <b>${esc(fmtDate(deadline))}</b>${late?` · ongeveer <b>${late} dag(en) te laat</b>`:''}.</div><h3>Voorstel</h3>${options.length?`<p>Kies een uitvoerbare oplossing. Pas na jouw keuze wordt de planning opgeslagen.</p><div style="display:flex;gap:8px;flex-wrap:wrap">${options.join('')}</div>`:'<p>Met de huidige bezetting, Peter en zaterdagcapaciteit is geen haalbare oplossing gevonden. Pas capaciteit, bewerkingstijden of de klantdeadline aan.</p>'}</div><div class="modalfoot"><button class="btn" type="button" data-plan-control-cancel>Annuleren · niet opslaan</button></div></div></div>`;
}
function applyPending(kind){
 const p=window.__ralabPendingOrderPlan;if(!p)return alert('Het voorstel is verlopen. Plan de order opnieuw.');
 if(kind==='peter')return openPlanReview(p.withPeter,p.id,'planned_with_peter');
 if(kind==='overtime')return openPlanReview(p.withOvertime,p.id,'planned_with_peter_overtime');
 if(kind==='shift'){
   const d=p.normal.health?.finish;if(!d)return;return openPlanReview(p.normal,p.id,'planned_deadline_shift',d)
 }
}
document.addEventListener('click',e=>{
 const plan=e.target.closest('[data-plan-order]');if(plan){e.preventDefault();e.stopImmediatePropagation();planAndCheck(plan.dataset.planOrder);return}
 const one=e.target.closest('[data-unplan-order]');if(one){e.preventDefault();e.stopImmediatePropagation();confirmUnplanOrder(one.dataset.unplanOrder);return}
 if(e.target.closest('[data-unplan-all]')){e.preventDefault();e.stopImmediatePropagation();confirmUnplanAll();return}
 const confirmOne=e.target.closest('[data-confirm-unplan-order]');if(confirmOne){e.preventDefault();e.stopImmediatePropagation();executeUnplanOrder(confirmOne.dataset.confirmUnplanOrder);return}
 if(e.target.closest('[data-confirm-unplan-all]')){e.preventDefault();e.stopImmediatePropagation();executeUnplanAll();return}
 const apply=e.target.closest('[data-apply-order-plan]');if(apply){e.preventDefault();e.stopImmediatePropagation();applyPending(apply.dataset.applyOrderPlan);return}
 if(e.target.closest('[data-plan-review-recalc]')){e.preventDefault();e.stopImmediatePropagation();recalculateReview();return}
 if(e.target.closest('[data-plan-review-accept]')){e.preventDefault();e.stopImmediatePropagation();acceptReview();return}
 if(e.target.closest('[data-plan-review-cancel]')){e.preventDefault();e.stopImmediatePropagation();window.__ralabOrderPlanReview=null;try{closeModal()}catch(_){document.getElementById('modalRoot').innerHTML=''}return}
 if(e.target.closest('[data-plan-control-cancel]')){e.preventDefault();e.stopImmediatePropagation();window.__ralabPendingOrderPlan=null;try{closeModal()}catch(_){document.getElementById('modalRoot').innerHTML=''} }
},true);
window.RALAB_ORDER_CONTROLS={version:VERSION,planAndCheck,confirmUnplanOrder,confirmUnplanAll,executeUnplanOrder,executeUnplanAll,openPlanReview,recalculateReview,reviewWarnings};
const style=document.createElement('style');style.textContent=`.plan-review-modal{width:min(1180px,96vw)!important}.plan-review-table{overflow:auto;max-height:55vh;border:1px solid #d9dfdc;border-radius:8px}.plan-review-table table{min-width:920px}.plan-review-table th{position:sticky;top:0;background:#f5f7f6;z-index:1}.plan-review-table td{vertical-align:top}.plan-review-table .input{min-width:125px}.plan-review-summary{padding:11px 13px;border-radius:8px;margin-bottom:12px}.plan-review-summary.ok{background:#e8f6ec}.plan-review-summary.risk{background:#fff4d8}.plan-review-summary.bad{background:#ffe5e2}@media(max-width:800px){.plan-review-modal{width:98vw!important}.plan-review-table{max-height:58vh}}`;document.head.appendChild(style);
})();
