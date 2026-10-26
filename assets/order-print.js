// Read-only, fresh Supabase production sheets; never clone the financial planner DOM.
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const fmt=v=>v==null?'Onbekend':v.toLocaleString('nl-NL');
const done=t=>['done','completed'].includes(String(t.status||'').toLowerCase());
const active=o=>!o.deleted&&!o.closed&&!o.completedAt&&o.active!==false&&!o.isGeneralWork&&!o.isManualTasks&&!['completed','closed','done','cancelled','canceled','deleted','archived'].includes(String(o.status||'').toLowerCase());
// Notes may also contain financial information. Omit the entire financial sentence.
function text(v){return String(v??'').split(/\n|(?<=[.!?;])\s+/).filter(s=>!/(?:[€$£¥]|\b(?:eur|usd|gbp|cad|aud|euro|btw|uurtarie\w*|verkoop\w*|inkoop\w*|prijs\w*|kost\w*|marge\w*|tarie\w*|omzet|factuur\w*|betaling\w*|bedrag\w*|korting\w*|price\w*|cost\w*|margin\w*|revenue|invoice\w*|payment\w*|discount\w*|profit\w*|budget\w*|sale\w*)\b)/i.test(s)).join('\n').trim()}
const label=v=>esc(text(v)||'Onbekend');
const duration=v=>v==null?'Niet te bepalen':(v/60).toLocaleString('nl-NL',{maximumFractionDigits:1})+' uur';
// Calendar completion is not the sum of operation minutes (parallel work, waits, shifts).
function timing(order,route,snapshot,at){
 const F=window.RALAB_PRODUCTION_FORECAST,C=window.RALAB_PRODUCTION_CORE;
 const snap={...snapshot,costOrders:[order],costTasks:route};
 const details=F?.forecast(order.id,null,snap,at)?.details||[];
 const stages=route.map(t=>{
  const waiting=['wait','external'].includes(t.type),d=details.find(d=>d.taskId===t.id);
  const base=F?.plan(t,order,snap),op=(order.costing?.ops||order.templateOps||[]).find(o=>o.id===t.sourceOpId);
  const unit=(t.calcMode||op?.mode)==='unit';
  const remaining=done(t)?0:waiting?null:d&&base>0&&!(unit&&(order.quantityPending||!(count(order.qty)>0)))?d.remaining:null;
  const until=t.type==='external'?(t.expectedReturnDate||t.externalExpectedDate):t.waitEndAt;
  const end=until&&/^\d{4}-\d{2}-\d{2}T/.test(until)?Date.parse(until):NaN;
  const waitRemaining=done(t)?0:Number.isFinite(end)&&end>=at?(end-at)/60000:count(t.estimate)>0?Number(t.estimate):count(t.externalLeadDays)>0?Number(t.externalLeadDays)*1440:null;
  return {remaining,waiting,waitRemaining,waitEndKnown:Number.isFinite(end)&&end>=at,basis:done(t)?'Gereed':waiting?'Doorlooptijd':d?.measuredPace?'Gemeten tempo':'Begroot tempo'};
 });
 const work=stages.filter(s=>!s.waiting),complete=!!work.length&&work.every(s=>s.remaining!==null)&&!snapshot.costUnavailable;
 let ends=[],scheduled=!!route.length&&!snapshot.costUnavailable,previousEnd=null;
 for(let i=0;i<route.length;i++){
  const t=route[i],s=stages[i];if(done(t))continue;
  let first=Infinity,last=null;
  if(s.waiting){const value=t.type==='external'?(t.expectedReturnDate||t.externalExpectedDate):t.waitEndAt;
   const end=/T\d{2}:\d{2}/.test(value||'')?Date.parse(value):NaN;
   // Waiting/external starts and resource dependencies are not fully represented here.
   scheduled=false;if(Number.isFinite(end)&&end>=at)ends.push(end);continue;
  }
  const segments=t.planSegments||[];let minutes=0;
  if(s.remaining===null||!segments.length)scheduled=false;
  for(const g of segments){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(g.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(g.start||'')||!(count(g.minutes)>0)||!(count(g.elapsedMinutes)>0)||!C){scheduled=false;continue}
   const [h,m]=g.start.split(':').map(Number),start=C.wall(g.date,h*60+m),end=start+Number(g.elapsedMinutes)*60000;
   if(start<at||Number(g.elapsedMinutes)<Number(g.minutes)){scheduled=false;continue}minutes+=Number(g.minutes);ends.push(end);first=Math.min(first,start);last=Math.max(last||0,end);
  }
  if(minutes<(s.remaining??Infinity))scheduled=false;
  const previous=route[i-1],parallel=t.parallelGroupId&&t.parallelGroupId===previous?.parallelGroupId;
  if(t.dependsPrev&&!parallel&&previousEnd!==null&&first<previousEnd)scheduled=false;
  previousEnd=last;
 }
 return {stages,remaining:complete?work.reduce((n,s)=>n+s.remaining,0):null,known:work.reduce((n,s)=>n+(s.remaining||0),0),readyAt:scheduled&&ends.length?Math.max(...ends):null};
}
function model(order,tasks,snapshot={},customers=[]){
 const route=tasks.filter(t=>t.orderId===order.id&&!t.deleted&&!t.isStaffAbsence).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 const production=route.filter(t=>t.type!=='wait'&&!/instellen/i.test(t.name||t.machine||''));
 const F=window.RALAB_PRODUCTION_FORECAST,P=window.RALAB_PRODUCTION_PACE;
 const at=Date.now(),times=timing(order,route,snapshot,at);
 const rows=P?P.rows({...snapshot,costOrders:[order],costTasks:route},at).filter(r=>r.order_id===order.id):[];
 const stages=route.map((t,index)=>{
  const measured=rows.filter(r=>F?.taskFor(r,production)?.id===t.id),progress=(snapshot.taskProgress||[]).filter(p=>p.task_id===t.id);
  const explicit=count(t.doneQty),real=explicit!==null&&(explicit>0||t.productionLogged)&&!t.stageCorrection&&!['production-order-start','production-order-finish'].includes(t.completionSource);
  const seeded=(snapshot.openingBalances||[]).some(b=>b.task_id===t.id);
  const reported=measured.some(r=>Number(r.good)>0)||seeded||t.productionLogged||(snapshot.checkpointContext||[]).some(c=>(snapshot.sessions||[]).some(s=>s.id===c.session_id&&s.task_id===t.id&&c.last_report_at&&c.last_report_at>s.started_at));
  const counts=measured.length&&reported?Math.max(0,measured.reduce((n,r)=>n+(Number(r.good)||0),0)):null;
  const percentOnly=progress.some(p=>p.mode==='percent')||measured.some(r=>r.progress_mode==='percent');
  const good=percentOnly?null:counts!==null?(seeded?counts:Math.max(counts,real?explicit:0)):real?explicit:null;
  const percent=percentOnly?Math.max(...progress.filter(p=>p.mode==='percent').map(p=>Number(p.percent)||0),...measured.filter(r=>r.progress_mode==='percent').map(r=>Number(r.progress_percent)||0)):null;
  const employees=[t.employee,t.completionEmployee,...(t.planSegments||[]).map(p=>p.employee),...(snapshot.sessions||[]).filter(s=>s.order_id===order.id&&F?.taskFor(s,production)?.id===t.id).map(s=>s.employee)].filter(Boolean);
  const op=(order.costing?.ops||order.templateOps||[]).find(o=>o.id===t.sourceOpId);
  return {...times.stages[index],name:t.name||op?.name||t.machine,workplace:[...new Set([t.assignedMachine||t.machine,...measured.map(r=>r.workplace_name)].filter(Boolean))].join(', '),employee:[...new Set(employees)].join(', '),good,percent,status:done(t)?'Gereed':t.status==='in_progress'?'In productie':t.type==='external'?'Extern':t.type==='wait'?'Wachten':'Open',note:text(t.note),final:production.at(-1)?.id===t.id};
 });
 const qty=order.quantityPending?null:count(order.qty),last=stages.find(s=>s.final),completed=count(order.completedQty)??last?.good??null;
 const customer=customers.find(c=>c.id===order.customerId);
 return {times,quantityPending:!!order.quantityPending,orderNo:order.orderNo,customerReference:order.customerReference,requestedDeliveryDate:order.requestedDeliveryDate||order.customerReadyDate,customer:order.customerName||customer?.name||order.customerSnapshot?.name,product:order.product,deadline:order.communicatedDeadline||order.maximumReadyDate||order.deadline,qty,completed,remaining:qty!==null&&completed!==null?Math.max(0,qty-completed):null,unitPercent:qty>0&&completed!==null?Math.min(100,Math.round(completed/qty*100)):null,finished:route.filter(done).length,stages,note:text(order.note),deliveryNote:text(order.deliveryNote)};
}
function sheet(m,index,total,stamp){const field=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;return `<article class="page"><div class="content"><header><img src="${esc(new URL('assets/ralabaster-mail-logo.jpg',location.href).href)}" alt="rAlabaster"><div>PRODUCTIEORDER<br><strong>${label(m.orderNo)}</strong></div></header><h1>${label(m.product)}</h1><dl class="meta">${field('Klant',label(m.customer))}${field('Ordernummer',label(m.orderNo))}${field('PO-nummer klant',esc(m.customerReference||'—'))}${field('Gevraagd door klant',label(m.requestedDeliveryDate))}${field('Bevestigde leverdatum',label(m.deadline))}</dl><dl class="counts">${field('Besteld aantal',m.qty===null?(m.quantityPending?"Aantal nog niet ingevuld":"Aantal ontbreekt"):fmt(m.qty))}${field('Gereed aantal',m.completed===null?"Geen bevestigde eindtelling":fmt(m.completed))}${field('Nog te maken',m.remaining===null?"Niet te bepalen":fmt(m.remaining))}</dl><section class="progress"><b>Productievoortgang</b><p>${m.unitPercent===null?'Gereed product: Onbekend':m.unitPercent+'% gereed product'} · ${m.finished} van ${m.stages.length} productiestappen gereed</p>${m.unitPercent===null?'':`<div class="track"><div style="width:${m.unitPercent}%"></div></div>`}<small>Aantallen per stap zijn tussenstanden en worden niet bij elkaar opgeteld.</small></section><section class="times"><b>Resterende werkuren (som van interne bewerkingen)</b><p>${duration(m.times.remaining)}${m.times.remaining===null?` � bekende deeltijd: ${duration(m.times.known)} (onvolledig)`:""}</p><b>Gepland verwacht gereed</b><p>${m.times.readyAt?esc(new Date(m.times.readyAt).toLocaleString("nl-NL",{timeZone:"Europe/Amsterdam"}))+" � Europe/Amsterdam":"Niet betrouwbaar te bepalen uit de huidige planning"}</p><small>Werkuren zijn geen doorlooptijd. Doorlooptijd omvat ook wachtrijen, pauzes, droogtijd en extern werk; bewerkingen kunnen parallel lopen.</small></section><h2>Productiestappen</h2><table><thead><tr><th>Stap / werkplek</th><th>Medewerker</th><th>Stand</th><th>Resterende tijd</th><th>Opmerkingen</th></tr></thead><tbody>${m.stages.map((s,i)=>`<tr><td><b>${i+1}. ${label(s.name)}</b><br>${esc(text(s.workplace))||"Werkplek niet toegewezen"}</td><td>${esc(text(s.employee))||"Niet toegewezen"}</td><td>${s.status}<br>${s.percent!==null?fmt(s.percent)+'%':s.good===null?'Geen telling':fmt(s.good)+' st.'}</td><td>${s.waiting?duration(s.waitRemaining):duration(s.remaining)}<br><small>${s.waiting?s.waitEndKnown?"Resterende doorlooptijd":"Begrote doorlooptijd":s.remaining===null?"Schatting ontbreekt":s.basis}</small></td><td>${esc(s.note)||'—'}</td></tr>`).join('')||'<tr><td colspan="5">Geen productiestappen beschikbaar.</td></tr>'}</tbody></table>${m.note||m.deliveryNote?`<section class="notes"><h2>Opmerkingen</h2><p>${esc([m.note,m.deliveryNote].filter(Boolean).join('\n'))}</p></section>`:''}<footer>rAlabaster · Productiestand opgehaald ${esc(stamp)}<span>Order ${index+1} / ${total}</span></footer></div></article>`}
function html(models,stamp=new Date().toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam'})){return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>rAlabaster productieorders</title><style>
@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#e8e9e7;color:#20312d;font:10pt Arial,sans-serif}.tools{padding:16px;text-align:center}.tools button{font:inherit;padding:12px 20px;cursor:pointer}.page{width:186mm;height:272mm;margin:12px auto;background:white;break-after:page;page-break-after:always;position:relative;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}.content{font-size:calc(10pt * var(--print-scale,1));position:absolute;top:0;left:0;width:100%;padding:calc(5mm * var(--print-scale,1));transform-origin:top left}header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #234b40;padding-bottom:calc(5mm * var(--print-scale,1));font-size:calc(11pt * var(--print-scale,1))}header img{width:calc(52mm * var(--print-scale,1));height:auto}header div{text-align:right}h1{font-size:calc(20pt * var(--print-scale,1));margin:calc(7mm * var(--print-scale,1)) 0;overflow-wrap:anywhere}h2{font-size:calc(11pt * var(--print-scale,1));margin:calc(6mm * var(--print-scale,1)) 0 calc(3mm * var(--print-scale,1))}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(4mm * var(--print-scale,1))}dt{font-size:calc(8pt * var(--print-scale,1));color:#51645d;text-transform:uppercase}dd{margin:calc(2mm * var(--print-scale,1)) 0 0;font-weight:bold;overflow-wrap:anywhere}.counts{background:#eef3ef;padding:calc(5mm * var(--print-scale,1));border:1px solid #ccdad2}.counts dd{font-size:calc(19pt * var(--print-scale,1))}.progress{margin:calc(6mm * var(--print-scale,1)) 0}.progress p{margin:calc(2mm * var(--print-scale,1)) 0}.track{background:#eee;height:calc(2mm * var(--print-scale,1));margin:calc(3mm * var(--print-scale,1)) 0}.track div{height:100%;background:#234b40}small{font-size:calc(8pt * var(--print-scale,1));color:#53635d}table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;background:#eef3ef;font-size:calc(8pt * var(--print-scale,1))}td,th{padding:calc(3mm * var(--print-scale,1)) calc(2mm * var(--print-scale,1));border-bottom:1px solid #d8dfda;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:26%}th:nth-child(2){width:15%}th:nth-child(3){width:18%}th:nth-child(4){width:18%}.times{margin:4mm 0}.times p{margin:2mm 0 3mm}td:last-child,.notes p{white-space:pre-wrap}.notes p{overflow-wrap:anywhere}footer{border-top:1px solid #ccd6d0;margin-top:calc(7mm * var(--print-scale,1));padding-top:calc(3mm * var(--print-scale,1));font-size:calc(8pt * var(--print-scale,1));color:#53635d}footer span{float:right}@media print{body{background:white}.tools{display:none}.page{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="tools"><button type="button" data-print-now>Afdrukken / opslaan als PDF</button><p>Eén A4 per order · Schakel browserkop- en voetteksten uit bij het afdrukken.</p></div>${models.map((m,i)=>sheet(m,i,models.length,stamp)).join('')}</body></html>`}
async function paged(make){let rows=[];for(let offset=0;;offset+=500){const r=await make().range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows}}
async function load(db,id){
 const base=table=>db.from(table).select('*').eq('workspace_id','ralabaster').eq('deleted',false);
 const [orders,tasks,meta,floor]=await Promise.all([
 paged(()=>{let q=base('planner_orders_v2').order('order_id');return id?q.eq('order_id',id):q.eq('active',true)}),
 paged(()=>{let q=base('planner_tasks_v2').order('task_id');return id?q.eq('order_id',id):q.eq('order_active',true)}),
 db.from('planner_shared_state').select('data').eq('workspace_id','ralabaster').maybeSingle(),db.rpc('production_monitor_snapshot')]);
 if(meta.error)throw meta.error;if(floor.error)throw floor.error;
 const selected=orders.map(r=>({...r.data,id:r.order_id,active:r.active,deleted:r.deleted,orderNo:r.order_no||r.data?.orderNo,status:r.status||r.data?.status})).filter(o=>id||active(o));
 if(!selected.length)throw Error(id?'Deze order bestaat niet meer.':'Geen lopende orders om af te drukken.');
 const ts=tasks.map(r=>({...r.data,id:r.task_id,orderId:r.order_id,status:r.status||r.data?.status,seq:r.seq??r.data?.seq,date:r.task_date||r.data?.date,employee:r.employee||r.data?.employee,machine:r.machine||r.data?.machine,type:r.task_type||r.data?.type}));
 return selected.sort((a,b)=>String(a.deadline||'9999').localeCompare(String(b.deadline||'9999'))||String(a.orderNo||'').localeCompare(String(b.orderNo||''))).map(o=>model(o,ts,floor.data||{},meta.data?.data?.customers||[]));
}
function fit(doc){for(const page of doc.querySelectorAll('.page')){const content=page.querySelector('.content'),limit=page.clientHeight-3;
 const size=scale=>{content.style.setProperty('--print-scale',String(scale));return content.getBoundingClientRect().height};
 if(size(1)<=limit)continue;let low=.01,high=1;for(let i=0;i<14;i++){const mid=(low+high)/2;if(size(mid)<=limit)low=mid;else high=mid}size(low);
}}
async function print(id){
 const db=window.RALAB_ADMIN_AUTH?.client;if(!db)throw Error('Log eerst in op de planner.');
 const preview=window.open('about:blank','_blank');if(!preview)throw Error('Sta pop-ups toe om de orderafdruk te openen.');
 preview.document.body.textContent='Actuele productiestand ophalen…';
 try{const models=await load(db,id);if(preview.closed)return;preview.document.open();preview.document.write(html(models));preview.document.close();
 await Promise.all([...preview.document.images].map(img=>img.decode().catch(()=>{throw Error('Het rAlabaster-logo kon niet worden geladen. Probeer opnieuw.')})));
 fit(preview.document);preview.addEventListener('beforeprint',()=>fit(preview.document));preview.document.querySelector('[data-print-now]').onclick=()=>{fit(preview.document);preview.focus();preview.print()};preview.focus();preview.print();return models;
 }catch(e){if(!preview.closed)preview.document.body.textContent='Afdrukken niet gelukt. '+(e.message||'Controleer de verbinding en probeer opnieuw.');throw e}
}
window.RALAB_ORDER_PRINT={model,html,load,fit,active,print,timing};
document.addEventListener('click',e=>{const b=e.target.closest('[data-print-order],[data-print-active-orders]');if(!b)return;e.preventDefault();e.stopPropagation();print(b.dataset.printOrder||undefined).catch(e=>alert(e.message||'Afdrukken mislukt.'))});
})();
