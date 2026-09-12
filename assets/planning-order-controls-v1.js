// Order-by-order planning controls: unplan safely, sort by deadline and check feasibility before saving.
(()=>{
const VERSION='20260912-1';
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
function planAndCheck(id){
 const o=findOrder(id);if(!o)return;const deadline=deadlineOf(o);if(!deadline){alert('Vul eerst een klantdeadline in. Zonder deadline kan de planner de haalbaarheid niet controleren.');return}
 try{closeModal()}catch(_){ }
 const normal=simulate(id,{allowPeter:false,allowSaturday:false});if(!normal){alert('De planningsmodule is nog niet gereed. Ververs de app en probeer opnieuw.');return}
 if(normal.health?.status!=='bad'){applyPlannedState(normal,id,'planned_deadline_order');return}
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
 if(kind==='peter')return applyPlannedState(p.withPeter,p.id,'planned_with_peter');
 if(kind==='overtime')return applyPlannedState(p.withOvertime,p.id,'planned_with_peter_overtime');
 if(kind==='shift'){
   setState(p.normal.state);const o=findOrder(p.id),d=p.normal.health?.finish;if(!o||!d)return;o.communicatedDeadline=d;o.deadline=d;o.maximumReadyDate=d;o.internalTargetDate=d;o.planningCheckedAt=new Date().toISOString();o.planningDecision='planned_deadline_shift';o.planningDecisionAt=new Date().toISOString();persistAndRender();alert(`Order ingepland. De deadline is verschoven naar ${fmtDate(d)}.`)
 }
}
document.addEventListener('click',e=>{
 const plan=e.target.closest('[data-plan-order]');if(plan){e.preventDefault();e.stopImmediatePropagation();planAndCheck(plan.dataset.planOrder);return}
 const one=e.target.closest('[data-unplan-order]');if(one){e.preventDefault();e.stopImmediatePropagation();confirmUnplanOrder(one.dataset.unplanOrder);return}
 if(e.target.closest('[data-unplan-all]')){e.preventDefault();e.stopImmediatePropagation();confirmUnplanAll();return}
 const confirmOne=e.target.closest('[data-confirm-unplan-order]');if(confirmOne){e.preventDefault();e.stopImmediatePropagation();executeUnplanOrder(confirmOne.dataset.confirmUnplanOrder);return}
 if(e.target.closest('[data-confirm-unplan-all]')){e.preventDefault();e.stopImmediatePropagation();executeUnplanAll();return}
 const apply=e.target.closest('[data-apply-order-plan]');if(apply){e.preventDefault();e.stopImmediatePropagation();applyPending(apply.dataset.applyOrderPlan);return}
 if(e.target.closest('[data-plan-control-cancel]')){e.preventDefault();e.stopImmediatePropagation();window.__ralabPendingOrderPlan=null;try{closeModal()}catch(_){document.getElementById('modalRoot').innerHTML=''} }
},true);
window.RALAB_ORDER_CONTROLS={version:VERSION,planAndCheck,confirmUnplanOrder,confirmUnplanAll,executeUnplanOrder,executeUnplanAll};
})();
