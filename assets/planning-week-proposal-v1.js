// Conceptplanning directly in the three-week board. Nothing is persisted until accepted.
(()=>{
const VERSION='20260925-7',clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S=()=>{try{return state}catch(_){return null}};
const employees=()=>typeof EMPLOYEES!=='undefined'?EMPLOYEES:['Ralph','Peter','Kaan','Lance','Shaffi'];
let proposal=null;
const taskSegmentsOf=t=>Array.isArray(t?.planSegments)?t.planSegments:[];
const taskById=id=>proposal?.draft?.tasks?.find(t=>t.id===id);
const orderById=id=>proposal?.draft?.orders?.find(o=>o.id===id);
const confirmedTask=id=>!!proposal?.confirmed?.[id];
const isDry=t=>typeof isDryTask==='function'&&isDryTask(t);
const isExternal=t=>typeof isExternalTask==='function'&&isExternalTask(t);
const minutes=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?Math.max(1,Math.round(n*60)):0};
const hours=m=>String(Math.round((Number(m)||0)/60*100)/100).replace('.',',');
function withDraft(fn){if(!proposal)return;const live=state;state=proposal.draft;try{return fn()}finally{proposal.draft=state;state=live}}
function cell(date,employee){return[...document.querySelectorAll('#view-weeks .daycell')].find(x=>x.dataset.planDate===date&&x.dataset.planEmployee===employee)}
function finishOf(t){try{return taskFinishAt(t)}catch(_){return''}}
function proposalCard(t,g,index){
 const o=orderById(t.orderId),elapsed=Number(g.elapsedMinutes)||Number(g.minutes)||0,end=typeof endTime==='function'?endTime(g.start||'08:15',elapsed):'',continuation=index?` · dag ${index+1}`:'',machine=typeof planningWorkplace==='function'?planningWorkplace(t):(t.assignedMachine||t.machinePreference||t.machine||'-'),kind=typeof workplaceKind==='function'?workplaceKind(machine):'other',qty=Number(o?.qty)||0;
 const ok=index===0?`<button class="btn small primary proposal-ok" type="button" data-proposal-task-ok="${esc(t.id)}">OK</button>`:'';
 if(typeof weekCompactView!=='undefined'&&weekCompactView)return `<div class="task proposal-task week-task-compact" draggable="true" data-proposal-task="${esc(t.id)}" data-proposal-segment="${index}" data-machine="${esc(machine)}"><div class="week-task-icon icon-${kind}" title="${esc(machine)}" aria-label="Werkplek: ${esc(machine)}">${typeof planningMachineIcon==='function'?planningMachineIcon(machine):''}</div><div class="week-task-main"><div class="proposal-label">VOORSTEL${continuation}</div><div class="week-task-time">${esc(g.start||'')}–${esc(end)}</div><div class="week-task-order">${qty?qty+'x ':''}${esc(o?.product||'Order')}</div><div class="proposal-actions">${ok}<button class="btn small" type="button" data-proposal-edit="${esc(t.id)}" data-proposal-edit-segment="${index}">Aanpassen</button></div></div></div>`;
 return `<div class="task proposal-task" draggable="true" data-proposal-task="${esc(t.id)}" data-proposal-segment="${index}"><div class="proposal-label">VOORSTEL${continuation}</div><div class="top">${esc(o?.orderNo||'')} – ${esc(o?.product||'')}</div><div class="op">${esc(t.name||'Taak')}</div><div class="machine"><b>Werkplek:</b> ${esc(machine)}</div><div class="meta">${esc(g.start||'')}–${esc(end)} · ${esc(g.employee||t.employee||'')} · ${typeof fmtMin==='function'?fmtMin(Number(g.minutes)||0):(Number(g.minutes)||0)+' min'}</div><div class="proposal-actions">${ok}<button class="btn small" type="button" data-proposal-edit="${esc(t.id)}" data-proposal-edit-segment="${index}">Aanpassen</button></div></div>`;
}
function specialCard(t){const o=orderById(t.orderId),date=t.date||String(t.waitStartAt||'').slice(0,10)||'—',kind=isDry(t)?'Droog-/wachttijd':'Externe bewerking';return `<div class="proposal-special" data-proposal-task="${esc(t.id)}"><b>CONCEPT · ${esc(kind)}</b> · ${esc(o?.orderNo||'')} · ${esc(t.name||'Taak')} · ${esc(date)} <button class="btn small" type="button" data-proposal-edit="${esc(t.id)}">Aanpassen</button></div>`}
function decorate(){
 const root=document.getElementById('view-weeks');if(!root||root.classList.contains('hidden'))return;
 root.querySelectorAll('.proposal-toolbar,.proposal-task,.proposal-specials').forEach(x=>x.remove());
 if(!proposal)return;
 const toolbar=root.querySelector('.toolbar'),bulk=!!proposal.bulk,o=bulk?null:orderById(proposal.orderId);
 const title=bulk?'Automatisch planningsvoorstel':`Planning voorstel · ${esc(o?.orderNo||'')} – ${esc(o?.product||'')}`;
 const text=bulk?'De grijze blokken zijn voorstellen. Klik per taak op <b>OK</b> om hem vast te zetten, of versleep hem eerst naar een andere dag/medewerker.':'De grijze blokken zijn nog niet definitief. Versleep ze of open <b>Aanpassen</b>; klik daarna op OK.';
 toolbar?.insertAdjacentHTML('afterend',`<div class="proposal-toolbar"><div><b>${title}</b><div>${text}</div></div><div class="spacer"></div><button class="btn" type="button" data-proposal-cancel>Voorstellen sluiten</button><button class="btn primary" type="button" data-proposal-accept>Alles akkoord</button></div>`);
 let outside=0;const special=[],ids=new Set(proposal.orderIds||[proposal.orderId]);
 const tasks=proposal.draft.tasks.filter(x=>ids.has(x.orderId)&&!x.deleted&&!confirmedTask(x.id)).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 for(const t of tasks){
   if(isDry(t)||isExternal(t)){special.push(specialCard(t));continue}
   const segs=taskSegmentsOf(t);
   for(const [i,g] of segs.entries()){
     const target=cell(g.date,g.employee||t.employee);
     if(target)target.insertAdjacentHTML('beforeend',proposalCard(t,g,i));else outside++;
   }
 }
 if(special.length||outside){const first=root.querySelector('.week-block');first?.insertAdjacentHTML('afterbegin',`<div class="proposal-specials">${special.join('')}${outside?`<div class="proposal-special"><b>${outside} voorstelblok(ken)</b> vallen buiten de getoonde weken.</div>`:''}</div>`)}
 root.querySelector('.weeks-backlog')?.removeAttribute('open');
}
function reflowAfter(t){withDraft(()=>{window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(t)})}
function moveTask(id,date,employee,start='08:15'){const t=taskById(id);if(!t)return;withDraft(()=>{t.lockedPlanning=false;t.employee=employee||t.employee;if(typeof clearTaskPlanning==='function')clearTaskPlanning(t);window.RALAB_DEADLINE_PLANNER?.allocateInternal?.(t,`${date}T${start}`,{allowPeter:t.employee==='Peter'});window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(t)});renderWeeks()}
function startProposal(id){const controls=window.RALAB_ORDER_CONTROLS,result=controls?.simulate?.(id,{allowPeter:false,allowSaturday:false});if(!result?.state)return alert('Voor deze order kon geen planning voorstel worden gemaakt. Controleer eerst de deadline en taakduren.');proposal={orderId:id,draft:clone(result.state),created:new Date().toISOString()};try{closeModal()}catch(_){}if(typeof switchView==='function')switchView('weeks');else{currentView='weeks';renderWeeks()}setTimeout(decorate,0)}
function startAllProposals(){
 const controls=window.RALAB_ORDER_CONTROLS,today=typeof isoDate==='function'?isoDate(new Date()):new Date().toISOString().slice(0,10);
 const result=controls?.simulateSequentialRemaining?.({planningStart:today});
 if(!result?.state||!result?.orders?.length)return alert('Er kon geen automatisch planningsvoorstel worden gemaakt.');
 const orderIds=result.orders.map(x=>x.id);
 proposal={orderId:null,orderIds,draft:clone(result.state),bulk:true,confirmed:{},created:new Date().toISOString()};
 try{closeModal()}catch(_){}
 if(typeof switchView==='function')switchView('weeks');else{currentView='weeks';renderWeeks()}
 setTimeout(decorate,0);
 return proposal;
}
function editTask(id,index=0){const t=taskById(id);if(!t)return;const g=taskSegmentsOf(t)[Number(index)]||taskSegmentsOf(t)[0],date=g?.date||t.date||String(t.waitStartAt||'').slice(0,10)||isoDate(new Date()),start=g?.start||t.start||String(t.waitStartAt||'').slice(11,16)||'08:15',employee=g?.employee||t.employee||employees()[0];showModal(`<div class="modalhead"><h3>Concepttaak aanpassen</h3></div><div class="modalbody"><div class="field"><label>Taak</label><input id="proposalName" class="input" value="${esc(t.name||'')}"></div><div class="grid2" style="margin-top:10px"><div class="field"><label>Medewerker</label><select id="proposalEmployee" class="input" ${isDry(t)||isExternal(t)?'disabled':''}>${employees().map(x=>`<option ${x===employee?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Datum</label><input id="proposalDate" class="input" type="date" value="${esc(date)}"></div><div class="field"><label>Starttijd</label><input id="proposalStart" class="input" type="time" value="${esc(start)}"></div><div class="field"><label>Beoogde duur</label><div style="display:flex;align-items:center;gap:6px"><input id="proposalHours" class="input" inputmode="decimal" value="${esc(hours(t.estimate))}"> uur</div></div></div><div class="notice">Bij opslaan worden alle volgende stappen van deze order automatisch naar de eerstvolgende ideale mogelijkheid doorgeschoven.</div></div><div class="modalfoot"><button class="btn danger" type="button" data-proposal-delete="${esc(id)}">Taak verwijderen</button><div class="spacer"></div><button class="btn" type="button" data-proposal-edit-cancel>Annuleren</button><button class="btn primary" type="button" data-proposal-save="${esc(id)}">Wijziging toepassen</button></div>`)}
function saveEdit(id){const t=taskById(id),duration=minutes(document.getElementById('proposalHours')?.value),date=document.getElementById('proposalDate')?.value,start=document.getElementById('proposalStart')?.value||'08:15',employee=document.getElementById('proposalEmployee')?.value;if(!t||!duration||!date)return alert('Vul een geldige datum en duur in.');withDraft(()=>{t.name=document.getElementById('proposalName')?.value.trim()||t.name;t.estimate=duration;t.lockedPlanning=false;if(isDry(t)){window.RALAB_DEADLINE_PLANNER?.scheduleWaitStrict?.(t,`${date}T${start}`);window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(t)}else if(isExternal(t)){t.date=date;t.start=start;t.expectedReturnDate=addDays(date,Number(t.externalLeadDays)||14);window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(t)}else{t.employee=employee;if(typeof clearTaskPlanning==='function')clearTaskPlanning(t);window.RALAB_DEADLINE_PLANNER?.allocateInternal?.(t,`${date}T${start}`,{allowPeter:employee==='Peter'});window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(t)}});closeModal();renderWeeks()}
function deleteTask(id){if(!confirm('Deze taak uit het planning voorstel verwijderen?'))return;withDraft(()=>{const tasks=state.tasks.filter(x=>x.orderId===proposal.orderId&&!x.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)),idx=tasks.findIndex(x=>x.id===id),previous=idx>0?tasks[idx-1]:null;state.tasks=state.tasks.filter(x=>x.id!==id);window.RALAB_DEADLINE_PLANNER?.normalizeSequences?.();if(previous)window.RALAB_DEADLINE_PLANNER?.enforceManualMove?.(previous);else{const o=state.orders.find(x=>x.id===proposal.orderId);for(const t of state.tasks.filter(x=>x.orderId===proposal.orderId))if(typeof clearTaskPlanning==='function')clearTaskPlanning(t);window.RALAB_DEADLINE_PLANNER?.planOrderStrict?.(o,{allowPeter:false,allowSaturday:false})}});closeModal();renderWeeks()}
function shiftTask(id,days){const t=taskById(id),g=taskSegmentsOf(t)[0];if(!t||!g)return;moveTask(id,addDays(g.date,Number(days)||0),g.employee||t.employee,g.start||'08:15')}
function acceptTask(id){
 if(!proposal||confirmedTask(id))return false;
 const draftTask=taskById(id);if(!draftTask)return false;
 const live=S(),idx=(live.tasks||[]).findIndex(x=>x.id===id);if(idx<0)return false;
 const accepted=clone(draftTask);accepted.lockedPlanning=true;accepted.manualPlanning=true;accepted.planningOrigin='proposal-confirmed';accepted.planningConfirmedAt=new Date().toISOString();
 live.tasks[idx]=accepted;
 const draftCopy=proposal.draft.tasks.find(x=>x.id===id);if(draftCopy){draftCopy.lockedPlanning=true;draftCopy.manualPlanning=true;draftCopy.planningOrigin='proposal-confirmed'}
 proposal.confirmed=proposal.confirmed||{};proposal.confirmed[id]=true;
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{save()}catch(e){console.error(e)}
 renderWeeks();
 return true;
}
function accept(){
 if(!proposal)return;
 const ids=new Set(proposal.orderIds||[proposal.orderId]);
 const remaining=proposal.draft.tasks.filter(t=>ids.has(t.orderId)&&!t.deleted&&!confirmedTask(t.id)&&(taskSegmentsOf(t).length||t.date||t.waitStartAt));
 for(const t of remaining)acceptTask(t.id);
 proposal=null;renderWeeks();alert('Alle resterende voorstellen zijn vastgezet.');
}
function cancel(){if(!proposal||confirm('Voorstellen sluiten? Taken waarop je al OK hebt geklikt blijven definitief staan.')){proposal=null;renderWeeks()}}
function install(){if(typeof window.renderWeeks!=='function'||!window.RALAB_ORDER_CONTROLS)return setTimeout(install,200);const old=window.renderWeeks;window.renderWeeks=function(){const r=old.apply(this,arguments);setTimeout(decorate,0);return r};document.addEventListener('dragstart',e=>{const card=e.target.closest?.('[data-proposal-task]');if(!card||!proposal)return;e.stopImmediatePropagation();e.dataTransfer?.setData('text/plain','proposal:'+card.dataset.proposalTask)},true);document.addEventListener('dragover',e=>{if(proposal&&e.target.closest?.('.daycell'))e.preventDefault()},true);document.addEventListener('drop',e=>{if(!proposal)return;const raw=e.dataTransfer?.getData('text/plain')||'';if(!raw.startsWith('proposal:'))return;const target=e.target.closest?.('.daycell');if(!target)return;e.preventDefault();e.stopImmediatePropagation();moveTask(raw.slice(9),target.dataset.planDate,target.dataset.planEmployee)},true);document.addEventListener('click',e=>{const ok=e.target.closest('[data-proposal-task-ok]');if(ok){e.preventDefault();e.stopImmediatePropagation();return acceptTask(ok.dataset.proposalTaskOk)}const start=e.target.closest('[data-week-proposal]');if(start){e.preventDefault();e.stopImmediatePropagation();return startProposal(start.dataset.weekProposal)}const backlogEdit=e.target.closest('[data-backlog-edit]');if(backlogEdit){e.preventDefault();e.stopImmediatePropagation();const t=taskById(backlogEdit.dataset.backlogEdit);return t?editTask(t.id):openTask(backlogEdit.dataset.backlogEdit)}const backlogDelete=e.target.closest('[data-backlog-delete]');if(backlogDelete){e.preventDefault();e.stopImmediatePropagation();const t=taskById(backlogDelete.dataset.backlogDelete);return t?deleteTask(t.id):window.deleteTask(backlogDelete.dataset.backlogDelete)}const edit=e.target.closest('[data-proposal-edit]');if(edit){e.preventDefault();e.stopImmediatePropagation();return editTask(edit.dataset.proposalEdit,edit.dataset.proposalEditSegment)}const shift=e.target.closest('[data-proposal-shift]');if(shift){e.preventDefault();e.stopImmediatePropagation();return shiftTask(shift.dataset.proposalShift,shift.dataset.proposalShiftDays)}const saveBtn=e.target.closest('[data-proposal-save]');if(saveBtn){e.preventDefault();e.stopImmediatePropagation();return saveEdit(saveBtn.dataset.proposalSave)}const del=e.target.closest('[data-proposal-delete]');if(del){e.preventDefault();e.stopImmediatePropagation();return deleteTask(del.dataset.proposalDelete)}if(e.target.closest('[data-proposal-edit-cancel]')){e.preventDefault();return closeModal()}if(e.target.closest('[data-proposal-accept]')){e.preventDefault();e.stopImmediatePropagation();return accept()}if(e.target.closest('[data-proposal-cancel]')){e.preventDefault();e.stopImmediatePropagation();return cancel()}},true);window.RALAB_WEEK_PROPOSAL={version:VERSION,start:startProposal,startAll:startAllProposals,decorate,active:()=>proposal,moveTask,editTask,acceptTask,accept,cancel}}
install();
})();
