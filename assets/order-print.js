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
function model(order,tasks,snapshot={},customers=[]){
 const route=tasks.filter(t=>t.orderId===order.id&&!t.deleted&&!t.isStaffAbsence).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 const production=route.filter(t=>t.type!=='wait'&&!/instellen/i.test(t.name||t.machine||''));
 const F=window.RALAB_PRODUCTION_FORECAST,P=window.RALAB_PRODUCTION_PACE;
 const rows=P?P.rows(snapshot,Date.now()).filter(r=>r.order_id===order.id):[];
 const stages=route.map(t=>{
  const measured=rows.filter(r=>F?.taskFor(r,production)?.id===t.id),progress=(snapshot.taskProgress||[]).filter(p=>p.task_id===t.id);
  const explicit=count(t.doneQty),real=explicit!==null&&(explicit>0||t.productionLogged)&&!t.stageCorrection&&!['production-order-start','production-order-finish'].includes(t.completionSource);
  const seeded=(snapshot.openingBalances||[]).some(b=>b.task_id===t.id);
  const reported=measured.some(r=>Number(r.good)>0)||seeded||t.productionLogged||(snapshot.checkpointContext||[]).some(c=>(snapshot.sessions||[]).some(s=>s.id===c.session_id&&s.task_id===t.id&&c.last_report_at&&c.last_report_at>s.started_at));
  const counts=measured.length&&reported?Math.max(0,measured.reduce((n,r)=>n+(Number(r.good)||0),0)):null;
  const percentOnly=progress.some(p=>p.mode==='percent')||measured.some(r=>r.progress_mode==='percent');
  const good=percentOnly?null:counts!==null?(seeded?counts:Math.max(counts,real?explicit:0)):real?explicit:null;
  const percent=percentOnly?Math.max(...progress.filter(p=>p.mode==='percent').map(p=>Number(p.percent)||0),...measured.filter(r=>r.progress_mode==='percent').map(r=>Number(r.progress_percent)||0)):null;
  const employees=[t.employee,t.completionEmployee,...(t.planSegments||[]).map(p=>p.employee),...(snapshot.sessions||[]).filter(s=>s.order_id===order.id&&F?.taskFor(s,production)?.id===t.id).map(s=>s.employee)].filter(Boolean);
  return {name:t.name,workplace:[...new Set([t.assignedMachine||t.machine,...measured.map(r=>r.workplace_name)].filter(Boolean))].join(', '),employee:[...new Set(employees)].join(', '),good,percent,status:done(t)?'Gereed':t.status==='in_progress'?'In productie':t.type==='external'?'Extern':t.type==='wait'?'Wachten':'Open',note:text(t.note),final:production.at(-1)?.id===t.id};
 });
 const qty=order.quantityPending?null:count(order.qty),last=stages.find(s=>s.final),completed=count(order.completedQty)??last?.good??null;
 const customer=customers.find(c=>c.id===order.customerId);
 return {orderNo:order.orderNo,customerReference:order.customerReference,requestedDeliveryDate:order.requestedDeliveryDate||order.customerReadyDate,customer:order.customerName||customer?.name||order.customerSnapshot?.name,product:order.product,deadline:order.communicatedDeadline||order.maximumReadyDate||order.deadline,qty,completed,remaining:qty!==null&&completed!==null?Math.max(0,qty-completed):null,unitPercent:qty>0&&completed!==null?Math.min(100,Math.round(completed/qty*100)):null,finished:route.filter(done).length,stages,note:text(order.note),deliveryNote:text(order.deliveryNote)};
}
function sheet(m,index,total,stamp){const field=(k,v)=>`<div><dt>${k}</dt><dd>${v}</dd></div>`;return `<article class="page"><div class="content"><header><img src="${esc(new URL('assets/ralabaster-mail-logo.jpg',location.href).href)}" alt="rAlabaster"><div>PRODUCTIEORDER<br><strong>${label(m.orderNo)}</strong></div></header><h1>${label(m.product)}</h1><dl class="meta">${field('Klant',label(m.customer))}${field('Ordernummer',label(m.orderNo))}${field('PO-nummer klant',esc(m.customerReference||'—'))}${field('Gevraagd door klant',label(m.requestedDeliveryDate))}${field('Bevestigde leverdatum',label(m.deadline))}</dl><dl class="counts">${field('Besteld aantal',fmt(m.qty))}${field('Gereed aantal',fmt(m.completed))}${field('Nog te maken',fmt(m.remaining))}</dl><section class="progress"><b>Productievoortgang</b><p>${m.unitPercent===null?'Gereed product: Onbekend':m.unitPercent+'% gereed product'} · ${m.finished} van ${m.stages.length} productiestappen gereed</p>${m.unitPercent===null?'':`<div class="track"><div style="width:${m.unitPercent}%"></div></div>`}<small>Aantallen per stap zijn tussenstanden en worden niet bij elkaar opgeteld.</small></section><h2>Productiestappen</h2><table><thead><tr><th>Stap / werkplek</th><th>Medewerker</th><th>Stand</th><th>Opmerkingen</th></tr></thead><tbody>${m.stages.map((s,i)=>`<tr><td><b>${i+1}. ${label(s.name)}</b><br>${label(s.workplace)}</td><td>${label(s.employee)}</td><td>${s.status}<br>${s.percent!==null?fmt(s.percent)+'%':fmt(s.good)+(s.good===null?'':' st.')}</td><td>${esc(s.note)||'—'}</td></tr>`).join('')||'<tr><td colspan="4">Geen productiestappen beschikbaar.</td></tr>'}</tbody></table>${m.note||m.deliveryNote?`<section class="notes"><h2>Opmerkingen</h2><p>${esc([m.note,m.deliveryNote].filter(Boolean).join('\n'))}</p></section>`:''}<footer>rAlabaster · Productiestand opgehaald ${esc(stamp)}<span>Order ${index+1} / ${total}</span></footer></div></article>`}
function html(models,stamp=new Date().toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam'})){return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>rAlabaster productieorders</title><style>
@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#e8e9e7;color:#20312d;font:10pt Arial,sans-serif}.tools{padding:16px;text-align:center}.tools button{font:inherit;padding:12px 20px;cursor:pointer}.page{width:186mm;height:272mm;margin:12px auto;background:white;break-after:page;page-break-after:always;position:relative;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}.content{font-size:calc(10pt * var(--print-scale,1));position:absolute;top:0;left:0;width:100%;padding:calc(5mm * var(--print-scale,1));transform-origin:top left}header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #234b40;padding-bottom:calc(5mm * var(--print-scale,1));font-size:calc(11pt * var(--print-scale,1))}header img{width:calc(52mm * var(--print-scale,1));height:auto}header div{text-align:right}h1{font-size:calc(20pt * var(--print-scale,1));margin:calc(7mm * var(--print-scale,1)) 0;overflow-wrap:anywhere}h2{font-size:calc(11pt * var(--print-scale,1));margin:calc(6mm * var(--print-scale,1)) 0 calc(3mm * var(--print-scale,1))}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(4mm * var(--print-scale,1))}dt{font-size:calc(8pt * var(--print-scale,1));color:#51645d;text-transform:uppercase}dd{margin:calc(2mm * var(--print-scale,1)) 0 0;font-weight:bold;overflow-wrap:anywhere}.counts{background:#eef3ef;padding:calc(5mm * var(--print-scale,1));border:1px solid #ccdad2}.counts dd{font-size:calc(19pt * var(--print-scale,1))}.progress{margin:calc(6mm * var(--print-scale,1)) 0}.progress p{margin:calc(2mm * var(--print-scale,1)) 0}.track{background:#eee;height:calc(2mm * var(--print-scale,1));margin:calc(3mm * var(--print-scale,1)) 0}.track div{height:100%;background:#234b40}small{font-size:calc(8pt * var(--print-scale,1));color:#53635d}table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;background:#eef3ef;font-size:calc(8pt * var(--print-scale,1))}td,th{padding:calc(3mm * var(--print-scale,1)) calc(2mm * var(--print-scale,1));border-bottom:1px solid #d8dfda;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:31%}th:nth-child(2){width:19%}th:nth-child(3){width:19%}td:last-child,.notes p{white-space:pre-wrap}.notes p{overflow-wrap:anywhere}footer{border-top:1px solid #ccd6d0;margin-top:calc(7mm * var(--print-scale,1));padding-top:calc(3mm * var(--print-scale,1));font-size:calc(8pt * var(--print-scale,1));color:#53635d}footer span{float:right}@media print{body{background:white}.tools{display:none}.page{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="tools"><button type="button" data-print-now>Afdrukken / opslaan als PDF</button><p>Eén A4 per order · Schakel browserkop- en voetteksten uit bij het afdrukken.</p></div>${models.map((m,i)=>sheet(m,i,models.length,stamp)).join('')}</body></html>`}
async function paged(make){let rows=[];for(let offset=0;;offset+=500){const r=await make().range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows}}
async function load(db,id){
 const base=table=>db.from(table).select('*').eq('workspace_id','ralabaster').eq('deleted',false);
 const [orders,tasks,meta,floor]=await Promise.all([
 paged(()=>{let q=base('planner_orders_v2').order('order_id');return id?q.eq('order_id',id):q.eq('active',true)}),
 paged(()=>{let q=base('planner_tasks_v2').order('task_id');return id?q.eq('order_id',id):q.eq('order_active',true)}),
 db.from('planner_shared_state').select('data').eq('workspace_id','ralabaster').maybeSingle(),db.rpc('production_monitor_snapshot')]);
 if(meta.error)throw meta.error;if(floor.error)throw floor.error;
 const selected=orders.map(r=>({...r.data,id:r.order_id,active:r.active,deleted:r.deleted,status:r.status??r.data?.status})).filter(o=>id||active(o));
 if(!selected.length)throw Error(id?'Deze order bestaat niet meer.':'Geen lopende orders om af te drukken.');
 const ts=tasks.map(r=>({...r.data,id:r.task_id,orderId:r.order_id,status:r.status??r.data?.status}));
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
window.RALAB_ORDER_PRINT={model,html,load,fit,active,print};
document.addEventListener('click',e=>{const b=e.target.closest('[data-print-order],[data-print-active-orders]');if(!b)return;e.preventDefault();e.stopPropagation();print(b.dataset.printOrder||undefined).catch(e=>alert(e.message||'Afdrukken mislukt.'))});
})();
