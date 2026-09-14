// Loose workshop tasks plus editable task end times.
(()=>{
const VERSION='20260914-1',MANUAL_ORDER='__manual_tasks__';
const S=()=>{try{return state}catch(_){return null}};
const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toMin=t=>{const[a,b]=String(t||'00:00').split(':').map(Number);return(a||0)*60+(b||0)};
const toTime=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function workMinutesBetween(date,employee,start,end){const a=toMin(start),b=toMin(end);if(b<=a)return b-a;const pauses=typeof planningBreaks==='function'?planningBreaks(date,employee):[];return Math.max(0,b-a-pauses.reduce((n,x)=>n+Math.max(0,Math.min(b,x[1])-Math.max(a,x[0])),0))}
function elapsedForWorkLocal(date,employee,start,work){const a=toMin(start);let elapsed=Math.max(0,Number(work)||0),guard=0;while(guard++<10){const end=a+elapsed,breaks=(typeof planningBreaks==='function'?planningBreaks(date,employee):[]).reduce((n,x)=>n+Math.max(0,Math.min(end,x[1])-Math.max(a,x[0])),0),next=work+breaks;if(next===elapsed)break;elapsed=next}return elapsed}
function ensureOrder(){const s=S();if(!s)return null;s.orders=s.orders||[];let o=s.orders.find(x=>x.id===MANUAL_ORDER);if(!o){o={id:MANUAL_ORDER,orderNo:'LOS',product:'Losse taken',qty:1,deadline:'',created:new Date().toISOString().slice(0,10),active:true,status:'internal',isGeneralWork:true,isManualTasks:true};s.orders.push(o)}return o}
function addButtons(){for(const id of ['view-today','view-weeks']){const root=document.getElementById(id);if(!root||root.classList.contains('hidden')||root.querySelector('[data-add-loose-task]'))continue;const bar=root.querySelector('.toolbar');if(!bar)continue;const b=document.createElement('button');b.className='btn primary';b.type='button';b.dataset.addLooseTask='1';b.textContent='+ Losse taak';bar.appendChild(b)}}
function openLooseTask(){const date=typeof selectedDate!=='undefined'?selectedDate:new Date().toISOString().slice(0,10);showModal(`<div class="modalhead"><h3>Losse taak toevoegen</h3></div><div class="modalbody"><div class="notice">Voor onderhoud, opruimen, overleg, reparaties of ander werk dat niet bij een productieorder hoort.</div><div class="grid2"><div class="field"><label>Taak *</label><input id="ltName" class="input" placeholder="Bijv. machine schoonmaken"></div><div class="field"><label>Machine / werkplek *</label><input id="ltMachine" class="input" placeholder="Bijv. Mori ZL15 #1 of Werkplaats"></div><div class="field"><label>Medewerker *</label><select id="ltEmployee" class="input"><option value="">Kies medewerker</option>${EMPLOYEES.map(e=>`<option value="${esc2(e)}">${esc2(e)}</option>`).join('')}</select></div><div class="field"><label>Datum *</label><input id="ltDate" class="input" type="date" value="${esc2(date)}"></div><div class="field"><label>Starttijd *</label><input id="ltStart" class="input" type="time" value="08:15"></div><div class="field"><label>Eindtijd *</label><input id="ltEnd" class="input" type="time" value="09:15"></div></div><div class="field" style="margin-top:10px"><label>Opmerking</label><textarea id="ltNote" class="input"></textarea></div></div><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" type="button" data-save-loose-task>Taak inplannen</button></div>`)}
function saveLooseTask(){
 const s=S(),name=document.getElementById('ltName')?.value.trim(),machine=document.getElementById('ltMachine')?.value.trim(),employee=document.getElementById('ltEmployee')?.value,date=document.getElementById('ltDate')?.value,start=document.getElementById('ltStart')?.value,end=document.getElementById('ltEnd')?.value,note=document.getElementById('ltNote')?.value.trim()||'';
 if(!name||!machine||!employee||!date||!start||!end)return alert('Vul taak, machine/werkplek, medewerker, datum, starttijd en eindtijd in.');
 const n=Date.now(),t={id:'manual_'+n,orderId:MANUAL_ORDER,seq:n,name,machine,estimate:0,dependsPrev:false,type:'internal',employee,date,start,status:'open',actual:0,doneQty:0,note,isManualTask:true,createdAt:new Date().toISOString()};
 let result;try{result=buildManualPlan(t,[{date,start,endDate:date,end}],{employee})}catch(e){return alert(e.message)}
 const warnings=result.warnings.filter(x=>!x.startsWith('De begrote taakduur'));
 if(warnings.length&&!confirm(warnings.join('\n')+'\n\nAndere taken blijven staan. Toch handmatig opslaan?'))return;
 ensureOrder();Object.assign(t,{estimate:result.estimate,planSegments:result.blocks,lockedPlanning:true,planningOrigin:'manual',manualOverrideWarnings:warnings,manualOverrideAt:new Date().toISOString()});s.tasks.push(t);
 try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){s.tasks=s.tasks.filter(x=>x.id!==t.id);return alert('Opslaan is niet gelukt: '+e.message)}
 closeModal();render();
}
const copy=x=>JSON.parse(JSON.stringify(x));
const timeValue=x=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x||'');
function dateValue(x){return /^\d{4}-\d{2}-\d{2}$/.test(x||'')&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x}
function dayPlus(date,n){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function stamp(date,time){return Date.parse(date+'T00:00:00Z')/60000+toMin(time)}
function endpoint(date,start,elapsed){const n=toMin(start)+Math.ceil(elapsed);return{date:dayPlus(date,Math.floor(n/1440)),time:toTime(n)}}
const ordered=list=>(list||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||''));
const machineKey=t=>String(t.assignedMachine||t.machinePreference||t.machine||'').replace(/\s*[-–]?\s*instellen\b/ig,'').replace(/\s+/g,' ').trim().toLowerCase();
function taskBlocks(t){return ordered(t.planSegments?.length?t.planSegments:t.date&&t.employee?[{date:t.date,start:t.start||'08:15',employee:t.employee,minutes:Number(t.estimate)||0}]:[])}
function blockElapsed(g,employee){return Number(g.elapsedMinutes)||elapsedForWorkLocal(g.date,g.employee||employee,g.start,Number(g.minutes)||0)}
function rangeBlocks(row,employee,ignoreBreaks){
 if(!dateValue(row.date)||!dateValue(row.endDate)||!timeValue(row.start)||!timeValue(row.end))throw Error('Vul voor ieder blok een geldige begin- en einddatum en tijd in.');
 const from=stamp(row.date,row.start),to=stamp(row.endDate,row.end);
 if(to<=from)throw Error('Het eindmoment moet na het beginmoment liggen. Kies bij nachtwerk ook de juiste einddatum.');
 const out=[];let date=row.date;
 while(date<=row.endDate){const start=date===row.date?toMin(row.start):0,end=date===row.endDate?toMin(row.end):1440;
  if(end>start){const pauses=ignoreBreaks?[]:typeof planningBreaks==='function'?planningBreaks(date,employee):[];
   const minutes=end-start-pauses.reduce((n,p)=>n+Math.max(0,Math.min(end,p[1])-Math.max(start,p[0])),0);
   out.push({date,employee,start:toTime(start),minutes:Math.max(0,minutes),elapsedMinutes:end-start});
  }date=dayPlus(date,1);
 }return out;
}
function sumBlocks(list){return list.reduce((n,g)=>n+Number(g.minutes||0),0)}
function endOf(g,employee){return stamp(g.date,g.start)+blockElapsed(g,employee)}
function intervalOverlap(a,b){return a[0]<b[1]&&b[0]<a[1]}
function planWarnings(task,blocks,all,estimate,ignoreBreaks){
 const warnings=[],employee=blocks[0]?.employee||task.employee,key=machineKey(task);
 for(const g of blocks){
  const start=toMin(g.start),end=start+Number(g.elapsedMinutes||g.minutes),cap=typeof employeeCapacity==='function'?employeeCapacity(g.date,g.employee,false):450;
  const ws=typeof dayStartTime==='function'?toMin(dayStartTime(g.date,g.employee)):495,we=typeof workdayEndMinutes==='function'?workdayEndMinutes(g.date,g.employee):990;
  if(cap<=0||start<ws||end>we)warnings.push(g.date+': '+g.start+'–'+toTime(end)+' valt buiten de normale werktijd of beschikbaarheid van '+g.employee+'.');
 }
 for(const other of all){
  if(other.id===task.id||other.deleted||['done','completed'].includes(other.status))continue;
  let overlap=false;
  for(const g of blocks)for(const h of taskBlocks(other)){
   if((h.employee===g.employee||(key&&machineKey(other)===key))&&intervalOverlap([stamp(g.date,g.start),endOf(g,employee)],[stamp(h.date,h.start),endOf(h,other.employee)]))overlap=true;
  }
  if(overlap)warnings.push('Overlap met '+(other.name||'andere taak')+' ('+(other.employee||machineKey(other)||'werkplek')+').');
 }
 for(let i=0;i<blocks.length;i++)for(let j=0;j<i;j++)if(intervalOverlap([stamp(blocks[i].date,blocks[i].start),endOf(blocks[i],employee)],[stamp(blocks[j].date,blocks[j].start),endOf(blocks[j],employee)]))warnings.push('Twee blokken van deze taak overlappen.');
 const same=all.filter(t=>!t.deleted&&t.orderId===task.orderId),prev=same.filter(t=>Number(t.seq)<Number(task.seq)).sort((a,b)=>Number(b.seq)-Number(a.seq))[0];
 const finish=t=>Math.max(0,...taskBlocks(t).map(g=>endOf(g,t.employee)),Date.parse(t.waitEndAt||t.expectedReturnDate||'')/60000||0);
 const begin=Math.min(...blocks.map(g=>stamp(g.date,g.start))),end=Math.max(...blocks.map(g=>endOf(g,employee)));
 if(task.dependsPrev&&prev&&(!['done','completed'].includes(prev.status)&&(!taskBlocks(prev).length||finish(prev)>begin)))warnings.push('Vorige stap '+(prev.name||'')+' is op de gekozen begintijd nog niet klaar.');
 const next=same.filter(t=>t.dependsPrev&&Number(t.seq)>Number(task.seq)).sort((a,b)=>Number(a.seq)-Number(b.seq))[0];
 if(next&&taskBlocks(next).length&&stamp(taskBlocks(next)[0].date,taskBlocks(next)[0].start)<end)warnings.push('De volgende stap '+(next.name||'')+' staat eerder ingepland dan deze taak klaar is.');
 const o=S()?.orders?.find(o=>o.id===task.orderId),deadline=o?.communicatedDeadline||o?.maximumReadyDate||o?.deadline;
 if(deadline&&dateValue(deadline)&&end>stamp(dayPlus(deadline,1),'00:00'))warnings.push('De taak eindigt na de klantdeadline '+deadline+'. De klantdeadline blijft ongewijzigd.');
 if(estimate!==Number(task.estimate))warnings.push('De begrote taakduur verandert van '+Number(task.estimate||0)+' naar '+estimate+' werkminuten.');
 if(ignoreBreaks)warnings.push('Pauzes worden voor deze taak als werktijd meegerekend.');
 return [...new Set(warnings)];
}
// Only the edited task can be changed. Automatic remainder respects existing
// reservations; explicitly entered blocks can always be accepted despite them.
function appendRemainder(task,blocks,all,employee,date,amount,ignoreBreaks){
 let need=amount;
 for(let guard=0;need>0&&guard<370;guard++,date=dayPlus(date,1)){
  if(typeof employeeCapacity==='function'&&employeeCapacity(date,employee,false)<=0)continue;
  const ws=typeof dayStartTime==='function'?toMin(dayStartTime(date,employee)):495,we=typeof workdayEndMinutes==='function'?workdayEndMinutes(date,employee):990;
  const busy=(ignoreBreaks?[]:typeof planningBreaks==='function'?planningBreaks(date,employee):[]).map(x=>[x[0],x[1]]);
  const key=machineKey(task);
  for(const other of all){if(other.id===task.id||other.deleted||['done','completed'].includes(other.status))continue;
   for(const g of taskBlocks(other))if(g.date===date&&(g.employee===employee||(key&&machineKey(other)===key)))busy.push([toMin(g.start),toMin(g.start)+blockElapsed(g,other.employee)]);
  }
  for(const g of blocks)if(g.date===date)busy.push([toMin(g.start),toMin(g.start)+blockElapsed(g,employee)]);
  busy.sort((a,b)=>a[0]-b[0]);
  let cursor=ws;
  for(const b of [...busy,[we,we]]){const stop=Math.min(we,b[0]);if(stop>cursor&&need>0){const n=Math.min(need,stop-cursor);blocks.push({date,employee,start:toTime(cursor),minutes:n,elapsedMinutes:n});need-=n;cursor+=n}cursor=Math.max(cursor,b[1]);if(cursor>=we||need<=0)break}
 }
 return need;
}
function buildManualPlan(task,rows,options={},all=S()?.tasks||[]){
 const employee=options.employee||task.employee;
 if(!employee)throw Error('Kies een medewerker voor deze taak.');
 if(!rows.length)throw Error('Vul minstens één tijdblok in.');
 const parsed=rows.map(row=>rangeBlocks(row,employee,options.ignoreBreaks));
 let blocks=parsed.flat(),unplanned=0;
 if(options.keepTotal&&rows.length>1&&(rows.some(r=>r.changed)||Number(options.estimate)!==Number(task.estimate))){
  const changedIndex=rows.findIndex(r=>r.changed),firstChanged=Math.max(0,changedIndex);
  const fixed=parsed.flatMap((g,i)=>i<firstChanged||rows[i].changed||(changedIndex<0&&i===0)?g:[]);
  const target=Math.max(Number(options.estimate)||0,sumBlocks(fixed));
  blocks=fixed;
  const remaining=Math.max(0,target-sumBlocks(blocks));
  if(remaining){const next=dayPlus(rows[firstChanged].date,1);unplanned=appendRemainder(task,blocks,all,employee,next,remaining,options.ignoreBreaks)}
 }
 blocks=ordered(blocks);
 if(typeof mergePauseSegments==='function')blocks=mergePauseSegments(blocks);
 const estimate=sumBlocks(blocks)+unplanned;
 if(estimate<=0)throw Error('Dit tijdvak bevat alleen pauze. Vink Doorwerken tijdens pauzes aan als je hierin wilt werken.');
 const warnings=planWarnings({...task,employee},blocks,all,estimate,options.ignoreBreaks);
 if(unplanned)warnings.push(unplanned+' werkminuten hebben nog geen vrij vervolgblok. Je kunt de gekozen tijden toch opslaan; deze resterende minuten blijven geregistreerd.');
 return{blocks,estimate,unplanned,warnings};
}
let taskEditor=null;
function addEndTime(id){
 const t=S()?.tasks?.find(x=>x.id===id),start=document.getElementById('mStart'),estimate=document.getElementById('mEst'),root=document.getElementById('modalRoot');
 if(!t||!start||!estimate||!root||root.querySelector('[data-manual-task-editor]')||isExternalTask(t)||isDryTask(t))return;
 const saved=taskBlocks(t),list=saved.length?saved:[{date:t.date||new Date().toISOString().slice(0,10),start:t.start||'08:15',employee:t.employee,minutes:Number(t.estimate)||60}];
 const rows=list.map(g=>{const z=endpoint(g.date,g.start,blockElapsed(g,t.employee));return{date:g.date,start:g.start,endDate:z.date,end:z.time}});
 taskEditor={id,root,original:copy(t),rows:copy(rows)};
 const box=document.createElement('div');box.className='field';box.dataset.manualTaskEditor='1';box.style.gridColumn='1 / -1';
 box.innerHTML='<label>Handmatige tijden per taak / werkdag</label><div class="panel" style="padding:8px;overflow:auto"><table style="min-width:650px"><thead><tr><th>Begindatum</th><th>Begin</th><th>Einddatum</th><th>Einde</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr data-manual-row="'+i+'" data-work="'+Number(list[i].minutes||0)+'"><td><input class="input" type="date" aria-label="Begindatum blok '+(i+1)+'" data-day-date value="'+r.date+'"></td><td><input class="input" type="time" aria-label="Begintijd blok '+(i+1)+'" data-day-start value="'+r.start+'"></td><td><input class="input" type="date" aria-label="Einddatum blok '+(i+1)+'" data-day-end-date value="'+r.endDate+'"></td><td><input class="input" type="time" aria-label="Eindtijd blok '+(i+1)+'" data-task-day-end value="'+r.end+'"></td></tr>').join('')+'</tbody></table></div>'+
 '<label><input type="checkbox" data-manual-keep-total '+(rows.length>1?'checked':'')+'> Totale taakduur behouden bij verdelen over dagen</label>'+
 '<label><input type="checkbox" data-manual-ignore-breaks '+(t.manualIgnoreBreaks?'checked':'')+'> Doorwerken tijdens pauzes</label>'+
 '<div class="muted">Je mag meerdere blokken tegelijk aanpassen, ook buiten werktijd. Bij Totale taakduur behouden gaan resterende minuten naar een volgende vrije werkdag. Anders bepaalt jouw invoer de nieuwe taakduur. Andere taken blijven staan. Waarschuwingen kun je accepteren.</div>';
 estimate.closest('.field')?.after(box);
 const emp=document.getElementById('mEmp'),date=document.getElementById('mDate'),rowEls=[...box.querySelectorAll('[data-manual-row]')];
 const rowValues=el=>({date:el.querySelector('[data-day-date]').value,start:el.querySelector('[data-day-start]').value,endDate:el.querySelector('[data-day-end-date]').value,end:el.querySelector('[data-task-day-end]').value});
 function recalcEnd(el){const r=rowValues(el);if(!dateValue(r.date)||!timeValue(r.start))return;const work=Number(el.dataset.work)||0,ignore=box.querySelector('[data-manual-ignore-breaks]').checked,z=endpoint(r.date,r.start,ignore?work:elapsedForWorkLocal(r.date,emp.value,r.start,work));el.querySelector('[data-day-end-date]').value=z.date;el.querySelector('[data-task-day-end]').value=z.time}
 rowEls.forEach((el,i)=>{
  for(const key of ['[data-day-date]','[data-day-start]'])el.querySelector(key).addEventListener('change',()=>{recalcEnd(el);if(i===0){date.value=rowValues(el).date;start.value=rowValues(el).start}});
  for(const key of ['[data-day-end-date]','[data-task-day-end]'])el.querySelector(key).addEventListener('change',()=>{try{el.dataset.work=String(sumBlocks(rangeBlocks(rowValues(el),emp.value,box.querySelector('[data-manual-ignore-breaks]').checked)))}catch(_){}});
 });
 start.addEventListener('change',()=>{rowEls[0].querySelector('[data-day-start]').value=start.value;recalcEnd(rowEls[0])});
 date.addEventListener('change',()=>{if(!dateValue(date.value))return;const old=rowValues(rowEls[0]).date;if(!dateValue(old))return;const delta=(stamp(date.value,'00:00')-stamp(old,'00:00'))/1440;for(const el of rowEls){const r=rowValues(el);el.querySelector('[data-day-date]').value=dayPlus(r.date,delta);recalcEnd(el)}});
 emp.addEventListener('change',()=>rowEls.forEach(recalcEnd));
 box.querySelector('[data-manual-ignore-breaks]').addEventListener('change',()=>rowEls.forEach(recalcEnd));
 estimate.addEventListener('change',()=>{if(rowEls.length===1&&Number(estimate.value)>0){rowEls[0].dataset.work=estimate.value;recalcEnd(rowEls[0])}});
 const button=[...root.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'').includes('saveTask('));if(button)button.textContent='Handmatig opslaan';
}
function saveManualTask(id,base,args){
 const editor=taskEditor,root=document.getElementById('modalRoot'),box=root?.querySelector('[data-manual-task-editor]'),t=S()?.tasks?.find(x=>x.id===id);
 if(!editor||editor.id!==id||!box||!t)return base.apply(window,args);
 const get=id=>document.getElementById(id),newStatus=get('mStatus')?.value||t.status;
 // Completion still uses the established completion/history workflow.
 if(newStatus==='done')return base.apply(window,args);
 const machine=get('mMachine')?.value.trim(),employee=get('mEmp')?.value;
 if(!machine)return alert('Machine/werkplek is verplicht.');
 if(!employee)return alert('Kies een medewerker om handmatig in te plannen.');
 const rows=[...box.querySelectorAll('[data-manual-row]')].map((el,i)=>{
  const r={date:el.querySelector('[data-day-date]').value,start:el.querySelector('[data-day-start]').value,endDate:el.querySelector('[data-day-end-date]').value,end:el.querySelector('[data-task-day-end]').value};
  r.changed=['date','start','endDate','end'].some(k=>r[k]!==editor.rows[i]?.[k]);return r;
 });
 const draft={...copy(t),name:get('mName').value.trim(),machine,employee,preferredEmployee:employee,dependsPrev:get('mDep').checked,actual:Number(get('mActual').value)||0,doneQty:Number(get('mQty').value)||0,note:get('mNote').value,status:newStatus};
 if(machine!==t.machine){delete draft.assignedMachine;delete draft.machinePreference}
 const ignoreBreaks=box.querySelector('[data-manual-ignore-breaks]').checked,estimate=Number(get('mEst').value);
 if(!Number.isFinite(estimate)||estimate<0)return alert('Vul een geldige begrote tijd in.');
 const unchanged=!rows.some(r=>r.changed)&&estimate===Number(editor.original.estimate)&&employee===editor.original.employee&&ignoreBreaks===!!editor.original.manualIgnoreBreaks&&taskBlocks(t).length>0;
 let result;
 try{result=unchanged?{blocks:copy(taskBlocks(t)),estimate:Number(t.estimate),unplanned:Number(t.manualUnplannedMinutes)||0,warnings:planWarnings(draft,taskBlocks(t),S().tasks,Number(t.estimate),ignoreBreaks)}:buildManualPlan(draft,rows,{employee,estimate,ignoreBreaks,keepTotal:box.querySelector('[data-manual-keep-total]').checked})}catch(e){alert(e.message);return false}
 const planText=result.blocks.map(g=>{const z=endpoint(g.date,g.start,Number(g.elapsedMinutes)||Number(g.minutes));return g.date+' '+g.start+' – '+z.date+' '+z.time+' ('+g.minutes+' werkminuten)'}).join('\n');
 if((result.warnings.length||(!unchanged&&rows.length>1))&&!confirm('Controleer jouw handmatige planning:\n\n'+planText+'\n\n'+result.warnings.join('\n')+'\n\nAndere taken en de klantdeadline blijven staan. Toch handmatig opslaan?'))return false;
 Object.assign(draft,{planSegments:result.blocks,employee,preferredEmployee:employee,date:result.blocks[0]?.date,start:result.blocks[0]?.start,estimate:result.estimate,lockedPlanning:true,planningOrigin:'manual',manualIgnoreBreaks:ignoreBreaks,manualUnplannedMinutes:result.unplanned,manualOverrideAt:new Date().toISOString(),manualOverrideWarnings:result.warnings});
 if(newStatus==='partial')draft.completedAt=typeof isoDate==='function'?isoDate(new Date()):new Date().toISOString().slice(0,10);
 else delete draft.completedAt;
 // Do not call legacy saveTask wrappers: they allocate again and move other work.
 const previous=copy(t);Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,draft);
 try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,previous);window.RALAB_PERFORMANCE?.invalidate?.();alert('Opslaan is niet gelukt. Je invoer blijft open: '+e.message);return false}
 taskEditor=null;closeModal();render();return true;
}
function install(){
 if(typeof window.openTask!=='function'||typeof window.saveTask!=='function'||typeof window.renderToday!=='function'||typeof window.renderWeeks!=='function')return setTimeout(install,180);
 if(window.__ralabManualTasksInstalled)return;window.__ralabManualTasksInstalled=true;ensureOrder();
 const open=window.openTask;window.openTask=function(id){taskEditor=null;const r=open.apply(this,arguments);setTimeout(()=>addEndTime(id),0);return r};
 const saveBase=window.saveTask;window.saveTask=function(id){return saveManualTask(id,saveBase,arguments)};
 const rt=window.renderToday,rw=window.renderWeeks;
 window.renderToday=function(){const r=rt.apply(this,arguments);setTimeout(addButtons,0);return r};
 window.renderWeeks=function(){const r=rw.apply(this,arguments);setTimeout(addButtons,0);return r};
 document.addEventListener('click',e=>{if(e.target.closest('[data-add-loose-task]')){e.preventDefault();openLooseTask();return}if(e.target.closest('[data-save-loose-task]')){e.preventDefault();saveLooseTask()}},true);
 setTimeout(addButtons,0);window.RALAB_MANUAL_TASKS={version:VERSION,open:openLooseTask,save:saveLooseTask,buildManualPlan,addEndTime};
}
install();
})();
