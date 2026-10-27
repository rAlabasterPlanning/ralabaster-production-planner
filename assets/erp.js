// rAlabaster ERP navigatie en orderdossiers — schaalbaar voor grote aantallen orders
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),euro=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(+n||0),iso=()=>{const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const PAGE=60;let orderPage=0,completedPage=0,quotePage=0,productPage=0,archiveCache=[],orderOverviewPinnedOrder=null;
function S(){try{return state}catch(_){return null}} function persist(){try{save()}catch(_){}}
function init(){const s=S();if(!s)return false;s.customers=s.customers||[];s.quotes=s.quotes||[];s.productTemplates=s.productTemplates||[];s.orderConfirmations=s.orderConfirmations||[];s.contractStockWork=s.contractStockWork||[];for(const cust of s.customers)cust.productContracts=cust.productContracts||[];return true}
function perf(){return window.RALAB_PERFORMANCE||null}
function taskList(id){const p=perf();return p?.getOrderTasks?p.getOrderTasks(id):((S().tasks||[]).filter(t=>t.orderId===id).sort((a,b)=>(+a.seq||0)-(+b.seq||0)))}
function findOrder(id){const p=perf();return p?.getOrder?p.getOrder(id):(S().orders||[]).find(x=>x.id===id)}
function status(o){if(o.alabasterWait?.active)return window.RALAB_ALABASTER_WAIT.label(o);if(o.needsCalculation)return 'Nog calculeren / aanvullen';const ts=taskList(o.id);if(o.deleted)return'Verwijderd';if(o.active===false||o.status==='completed')return'Afgerond';if(o.waitingMaterial||o.materialStatus==='waiting')return'Wacht op materiaal';if(!ts.length)return'Bevestigd';let done=0,ext=false,busy=false,planned=false;for(const t of ts){if(t.status==='done')done++;if(t.status==='external')ext=true;if(t.status==='in_progress')busy=true;if(t.date||(t.planSegments||[]).length)planned=true}if(done===ts.length)return'Gereed';if(ext)return'Extern';if(busy)return'In productie';if(planned)return'Gepland';return'Nog te plannen'}
function currentStep(o){const ts=taskList(o.id);return ts.find(t=>t.status!=='done')||ts.at(-1)}
function pageInfo(total,page){const pages=Math.max(1,Math.ceil(total/PAGE));page=Math.min(page,pages-1);return {pages,page,start:page*PAGE,end:Math.min(total,(page+1)*PAGE)}}
function pager(total,page,fn){const p=pageInfo(total,page);if(total<=PAGE)return'';return `<div class="toolbar" style="margin-top:12px"><span class="muted">${p.start+1}–${p.end} van ${total}</span><div class="spacer"></div><button class="btn small" ${p.page<=0?'disabled':''} onclick="${fn}(${p.page-1})">← Vorige</button><span class="pill">${p.page+1}/${p.pages}</span><button class="btn small" ${p.page>=p.pages-1?'disabled':''} onclick="${fn}(${p.page+1})">Volgende →</button></div>`}
function show(view){try{currentView=view}catch(_){}const overview=document.getElementById('view-orderoverview'),enteringOverview=view==='orderoverview'&&overview?.classList.contains('hidden');if(enteringOverview)orderOverviewPinnedOrder=null;document.querySelectorAll('main>section').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.navbtn').forEach(x=>x.classList.remove('active'));const sec=document.getElementById('view-'+view);if(sec)sec.classList.remove('hidden');document.querySelector(`.navbtn[data-view="${view}"]`)?.classList.add('active');requestAnimationFrame(()=>{if(view==='quotes'&&window.RALAB_QUOTE_INBOX?.render)return window.RALAB_QUOTE_INBOX.render();return({quotes:renderQuotes,orders:renderOrders,orderoverview:renderOrderOverview,completed:renderCompleted,products:renderProducts,customers:renderCustomers}[view]||(()=>{}))()})}
function renderCustomers(){if(!init())return;const root=document.getElementById('view-customers'),s=S(),counts=new Map();for(const o of s.orders||[]){if(o.deleted)continue;const k=o.customerId||'';if(!counts.has(k))counts.set(k,{open:0,done:0});const x=counts.get(k);if(o.active===false||o.status==='completed')x.done++;else x.open++}const q=(root?.dataset.q||'').toLowerCase();const arr=s.customers.filter(c=>!q||[c.name,c.contact,c.email].join(' ').toLowerCase().includes(q)).slice(0,500);root.innerHTML=`<div class="toolbar"><h2>Klanten</h2><div class="spacer"></div><button class="btn primary" onclick="RALAB_ERP.addCustomer()">+ Nieuwe klant</button></div><div class="panel" style="padding:16px"><input class="input" id="custSearch" placeholder="Zoek op klant, contactpersoon of e-mail" oninput="this.closest('section').dataset.q=this.value;RALAB_ERP.renderCustomers()" value="${esc(root.dataset.q||'')}"><table><thead><tr><th>Klant</th><th>Contact</th><th>E-mail</th><th>Lopende orders</th><th>Afgerond</th><th></th></tr></thead><tbody>${arr.map(c=>{const x=counts.get(c.id)||{open:0,done:0};return`<tr data-customer-id="${esc(c.id)}" style="cursor:pointer"><td><b>${esc(c.name)}</b></td><td>${esc(c.contact||'')}</td><td>${esc(c.email||'')}</td><td>${x.open}</td><td>${x.done}</td><td><button class="btn small" type="button" onclick="window.RALAB_COMMERCIAL?.customerForm?.('${c.id}')">Open klant</button> <button class="btn small" type="button" data-customer-portal-invite="${esc(c.id)}">Stuur uitnodigingsmail</button> <button class="btn small" type="button" data-customer-portal-activity="${esc(c.id)}">Portaalactiviteit</button></td></tr>`}).join('')||'<tr><td colspan=6>Nog geen klanten.</td></tr>'}</tbody></table></div>`}

function customerOrders(id){return (S()?.orders||[]).filter(o=>o.customerId===id&&!o.deleted).slice().sort((a,b)=>(a.active===false||a.status==='completed')-(b.active===false||b.status==='completed')||(a.deadline||a.communicatedDeadline||'9999-12-31').localeCompare(b.deadline||b.communicatedDeadline||'9999-12-31'))}
function plannedReadyDate(o){
 const direct=o?.expectedReadyDate||o?.internalExpectedDate||'';
 if(direct)return String(direct).slice(0,10);
 const ts=(S()?.tasks||[]).filter(t=>t.orderId===o?.id&&!t.deleted);
 let last='';
 for(const t of ts){
  for(const g of (Array.isArray(t.planSegments)?t.planSegments:[]))if(g?.date&&g.date>last)last=g.date;
  const special=t.expectedReturnDate||String(t.waitEndAt||'').slice(0,10)||t.date||'';
  if(special&&special>last)last=String(special).slice(0,10);
 }
 return last||'';
}
function productContractKey(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function contractStats(cust,contract){
 const s=S(),key=productContractKey(contract.product),orders=(s?.orders||[]).filter(o=>!o.deleted&&o.customerId===cust.id&&productContractKey(o.product)===key);
 const delivered=Math.max(0,Number(contract.deliveredBaseline)||0);
 const open=orders.filter(o=>o.active!==false&&o.status!=='completed').reduce((n,o)=>n+(Number(o.qty)||0),0);
 const stock=(s?.contractStockWork||[]).filter(x=>!x.deleted&&x.customerId===cust.id&&productContractKey(x.product)===key).reduce((n,x)=>n+(Number(x.qty)||0),0);
 const remaining=Math.max(0,(Number(contract.contractQty)||0)-delivered-open-stock);
 return {delivered,open,stock,remaining,orders};
}
function addCustomerProductContract(customerId){
 const s=S(),cust=s?.customers?.find(c=>c.id===customerId);if(!cust)return false;
 const root=document.getElementById('modalRoot'),product=String(root?.querySelector('[data-contract-product]')?.value||'').trim();
 const contractQty=Math.max(0,Math.round(Number(root?.querySelector('[data-contract-qty]')?.value)||0));
 const deliveredBaseline=Math.max(0,Math.round(Number(root?.querySelector('[data-contract-delivered]')?.value)||0));
 const batchSize=Math.max(0,Math.round(Number(root?.querySelector('[data-contract-batch]')?.value)||0));
 const minStock=Math.max(0,Math.round(Number(root?.querySelector('[data-contract-min-stock]')?.value)||0));
 if(!product||!contractQty)return alert('Vul product en contractaantal in.');
 cust.productContracts=cust.productContracts||[];
 const existing=cust.productContracts.find(x=>productContractKey(x.product)===productContractKey(product));
 if(existing)Object.assign(existing,{product,contractQty,deliveredBaseline,batchSize,minStock});else cust.productContracts.push({id:'pc_'+Date.now(),product,contractQty,deliveredBaseline,batchSize,minStock});
 persist();if(window.RALAB_COMMERCIAL?.customerForm)window.RALAB_COMMERCIAL.customerForm(customerId);else openCustomer(customerId);return true;
}
function removeCustomerProductContract(customerId,contractId){
 const cust=S()?.customers?.find(c=>c.id===customerId);if(!cust)return false;
 cust.productContracts=(cust.productContracts||[]).filter(x=>x.id!==contractId);persist();if(window.RALAB_COMMERCIAL?.customerForm)window.RALAB_COMMERCIAL.customerForm(customerId);else openCustomer(customerId);return true;
}
function createContractStockWork(customerId,product,qty){
 const s=S(),cust=s?.customers?.find(c=>c.id===customerId);if(!s||!cust)return false;
 qty=Math.max(1,Math.round(Number(qty)||0));if(!qty)return false;
 s.contractStockWork=s.contractStockWork||[];
 s.contractStockWork.push({id:'csw_'+Date.now(),customerId,customerName:cust.name||'',product,qty,status:'open',created:iso(),source:'contract'});
 persist();renderOrderOverview();return true;
}
function openContractProductionPrompt(customerId,product){
 const s=S(),cust=s?.customers?.find(c=>c.id===customerId);if(!cust)return false;
 const contract=(cust.productContracts||[]).find(x=>productContractKey(x.product)===productContractKey(product));if(!contract)return false;
 const st=contractStats(cust,contract),root=document.getElementById('modalRoot');if(!root)return false;
 const suggested=contract.batchSize>0?Math.min(st.remaining,Math.max(0,contract.batchSize-st.open)):st.remaining;
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(600px,94vw)"><div class="modalhead"><h3>Vooruit produceren · ${esc(product)}</h3></div><div class="modalbody">
 <div class="grid3"><div><b>Contract</b><br>${Number(contract.contractQty)||0} st.</div><div><b>Open orders</b><br>${st.open} st.</div><div><b>Nog verwacht</b><br>${st.remaining} st.</div></div>
 <div class="grid3" style="margin-top:10px"><div><b>Geleverd</b><br>${st.delivered} st.</div><div><b>Voorraadwerk</b><br>${st.stock} st.</div><div><b>Gewenste batch</b><br>${Number(contract.batchSize)||'—'} st.</div></div>
 <label style="display:block;margin-top:16px"><b>Extra vooruit produceren</b><input class="input" type="number" min="1" step="1" data-contract-stock-qty value="${suggested>0?suggested:''}" style="width:130px;margin-left:10px"> st.</label>
 </div><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">Annuleren</button><div class="spacer"></div><button class="btn primary" type="button" data-contract-stock-confirm data-customer-id="${esc(customerId)}" data-product="${esc(product)}">Voorraadwerk toevoegen</button></div></div></div>`;
 return true;
}
function openCustomer(id){
 const s=S(),cust=s?.customers?.find(c=>c.id===id);if(!cust)return false;
 const orders=customerOrders(id),open=orders.filter(o=>o.active!==false&&o.status!=='completed'),done=orders.filter(o=>o.active===false||o.status==='completed');
 const totalOpen=open.reduce((n,o)=>n+(Number(o.totalSale)||((Number(o.saleUnit)||0)*(Number(o.qty)||0))),0);
 const totalAll=orders.reduce((n,o)=>n+(Number(o.totalSale)||((Number(o.saleUnit)||0)*(Number(o.qty)||0))),0);
 const rows=orders.map(o=>`<tr><td><button class="btn small" type="button" onclick="RALAB_ERP.openOrder('${o.id}')">${esc(o.orderNo||'')}</button></td><td>${esc(o.product||'')}</td><td>${Number(o.qty)||0}</td><td>${esc(status(o))}</td><td>${esc(plannedReadyDate(o)||'—')}</td><td style="text-align:right">${euro(Number(o.totalSale)||((Number(o.saleUnit)||0)*(Number(o.qty)||0)))}</td></tr>`).join('');
 const root=document.getElementById('modalRoot');if(!root)return false;
 root.innerHTML=`<div class="modalback"><div class="modal"><div class="modalhead"><h3>${esc(cust.name)}</h3></div><div class="modalbody">
 <div class="grid3"><div><b>Contact</b><br>${esc(cust.contact||'—')}</div><div><b>E-mail</b><br>${esc(cust.email||'—')}</div><div><b>Orders</b><br>${orders.length} totaal · ${open.length} lopend · ${done.length} afgerond</div></div>
 <div class="grid3" style="margin-top:12px"><div><b>Lopende orderwaarde</b><br>${euro(totalOpen)}</div><div><b>Totale orderwaarde</b><br>${euro(totalAll)}</div><div><b>Adres</b><br>${esc([cust.address,cust.country].filter(Boolean).join(', ')||'—')}</div></div>
 <h3 style="margin-top:18px">Orders</h3><div style="overflow:auto"><table><thead><tr><th>Order</th><th>Product</th><th>Aantal</th><th>Status</th><th>Gepland gereed</th><th style="text-align:right">Waarde</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Geen orders voor deze klant.</td></tr>'}</tbody></table></div>
 </div><div class="modalfoot"><button class="btn primary" type="button" data-customer-portal-preview="${esc(id)}">Klantweergave</button><button class="btn" type="button" data-customer-portal-invite="${esc(id)}">Stuur uitnodigingsmail</button> <button class="btn small" type="button" data-customer-portal-activity="${esc(id)}">Portaalactiviteit</button><button class="btn" type="button" data-customer-print="${esc(id)}">Print orderlijst</button><div class="spacer"></div><button class="btn" type="button" onclick="closeModal()">Sluiten</button></div></div></div>`;
 return true;
}
function printCustomerOrders(id){
 const s=S(),cust=s?.customers?.find(c=>c.id===id);if(!cust)return false;
 const orders=customerOrders(id);
 const rows=orders.map(o=>`<tr><td>${esc(o.orderNo||'')}</td><td>${esc(o.product||'')}</td><td>${Number(o.qty)||0}</td><td>${esc(status(o))}</td><td>${esc(plannedReadyDate(o)||'—')}</td><td style="text-align:right">${euro(Number(o.totalSale)||((Number(o.saleUnit)||0)*(Number(o.qty)||0)))}</td></tr>`).join('');
 const w=window.open('','_blank');if(!w)return false;
 w.document.write(`<html><head><title>Orders - ${esc(cust.name)}</title><style>body{font-family:Arial;margin:28px}h1{font-size:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f4f4f4}</style></head><body><h1>${esc(cust.name)} - orders</h1><p>${esc(cust.contact||'')} ${cust.email?'· '+esc(cust.email):''}</p><table><thead><tr><th>Order</th><th>Product</th><th>Aantal</th><th>Status</th><th>Gepland gereed</th><th>Waarde</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Geen orders.</td></tr>'}</tbody></table><script>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();return true;
}
function addCustomer(){const name=prompt('Klantnaam');if(!name)return;const contact=prompt('Contactpersoon','')||'',email=prompt('E-mail klant','')||'',address=prompt('Adres','')||'',country=prompt('Land','')||'';S().customers.push({id:'cus_'+Date.now(),name,contact,email,address,country,created:iso()});persist();renderCustomers()}
function renderQuotes(page=quotePage){if(!init())return;quotePage=Math.max(0,+page||0);const root=document.getElementById('view-quotes'),s=S(),all=s.quotes||[],p=pageInfo(all.length,quotePage);quotePage=p.page;const arr=all.slice(p.start,p.end);root.innerHTML=`<div class="toolbar"><h2>2. Offertes</h2><div class="spacer"></div><button class="btn primary" onclick="RALAB_ERP.show('calculation')">+ Nieuwe calculatie</button></div><div class="panel"><table><thead><tr><th>Klant</th><th>Product / project</th><th>Aantal</th><th>Prijs/st</th><th>Totaal</th><th>Intern gereed</th><th>Voorstel klantdatum</th><th>Status</th><th></th></tr></thead><tbody>${arr.map(q=>{const c=s.customers.find(x=>x.id===q.customerId);return`<tr><td>${esc(c?.name||'—')}</td><td><b>${esc(q.name)}</b>${q.project?'<br>'+esc(q.project):''}</td><td>${q.qty}</td><td>${euro(q.saleUnit)}</td><td>${euro(q.total)}</td><td>${esc(q.internalReady||'')}</td><td>${esc(q.communicatedDate||'')}</td><td>${esc(q.status||'concept')}</td><td><button class="btn small" onclick="RALAB_ERP.quoteOrder('${q.id}')">Akkoord → order</button></td></tr>`}).join('')||'<tr><td colspan=9>Nog geen offertes.</td></tr>'}</tbody></table>${pager(all.length,quotePage,'RALAB_ERP.renderQuotes')}</div>`}
function quoteOrder(id){const s=S(),q=s.quotes.find(x=>x.id===id);if(!q)return;const cust=s.customers.find(c=>c.id===q.customerId);const oid='o_'+Date.now();s.orders.push({id:oid,orderNo:q.orderNo||('ORD-'+Date.now().toString().slice(-6)),customerId:q.customerId,customerName:cust?.name||'',project:q.project||'',product:q.name,qty:q.qty,deadline:q.communicatedDate,internalExpectedDate:q.internalReady,communicatedDeadline:'',deliveryBufferDays:14,costing:structuredClone(q),costUnit:q.costUnit,saleUnit:q.saleUnit,totalSale:q.total,created:iso(),active:true,status:'confirmed'});(q.ops||[]).forEach((o,i)=>s.tasks.push({id:'t_'+Date.now()+'_'+i,orderId:oid,seq:i+1,name:o.name,machine:o.machine||o.name,operationInstanceId:o.id||null,sourceOpId:o.sourceOpId||o.id||null,calcMode:o.mode,orderCalcMinutes:Number(o.minutes)||0,rate:Number(o.rate)||0,estimate:(+o.minutes||0)*(o.mode==='unit'?q.qty:1),dependsPrev:i>0,type:o.mode==='external'?'external':o.mode==='wait'?'wait':'internal',employee:null,date:null,start:'',planSegments:[],status:'open',actual:0,doneQty:0,note:'',externalLeadDays:o.mode==='external'?Math.max(1,Math.ceil((+o.minutes||20160)/1440)):null,expectedExternalCostBatch:o.externalBatch||0,expectedExternalCostUnit:o.externalUnit||0}));q.status='accepted';q.orderId=oid;persist();show('orderoverview')}
function orderFeasibility(o){
 if(o.waitingMaterial||o.materialStatus==='waiting')return {key:'waiting',label:'Wacht op materiaal',detail:'Niet beoordeeld'};
 const promised=o.communicatedDeadline||'';
 const internal=o.internalExpectedDate||'';
 if(promised&&internal&&internal>promised)return {key:'bad',label:'Niet haalbaar',detail:'Intern verwacht '+internal+' · klant beloofd '+promised};
 const h=window.RALAB_DEADLINE_PLANNER?.health?.(o);
 if(!h)return {key:'unknown',label:'Nog te beoordelen',detail:'Planning ontbreekt'};
 if(h.status==='bad')return {key:'bad',label:'Niet haalbaar',detail:h.finish?('Verwacht '+h.finish):'Planning niet haalbaar'};
 if(h.status==='risk')return {key:'risk',label:'Spannend',detail:h.slack!=null?(h.slack+' werkdagen speling'):(h.label||'Weinig speling')};
 return {key:'ok',label:'Makkelijk haalbaar',detail:h.slack!=null?(h.slack+' werkdagen speling'):(h.label||'Ruim haalbaar')};
}
function orderSequenceValue(o){const n=Number(o?.productionSequence);return Number.isFinite(n)&&n>0?n:0}
function orderSortForProduction(a,b){
 if(!!a.needsCalculation!==!!b.needsCalculation)return a.needsCalculation?-1:1;
 if(a.needsCalculation&&b.needsCalculation)return String(b.createdAt||b.created||'').localeCompare(String(a.createdAt||a.created||''));
 const sa=orderSequenceValue(a),sb=orderSequenceValue(b);
 if(sa&&sb&&sa!==sb)return sa-sb;if(sa&&!sb)return-1;if(!sa&&sb)return 1;
 const da=orderDeadlineValue(a),db=orderDeadlineValue(b);if(da!==db)return da.localeCompare(db);
 return String(a.orderNo||'').localeCompare(String(b.orderNo||''));
}
function taskDueDate(t){
 if(!t)return'';
 const segs=Array.isArray(t.planSegments)?t.planSegments.filter(g=>g?.date).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||'')):[];
 if(segs.length)return segs[0].date;
 if(t.planningWeek){const m=String(t.planningWeek).match(/^(\d{4})-W(\d{2})$/);if(m){const y=Number(m[1]),w=Number(m[2]),jan4=new Date(y,0,4,12),dow=(jan4.getDay()+6)%7;jan4.setDate(jan4.getDate()-dow+(w-1)*7);const z=new Date(jan4.getTime()-jan4.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}}
 return t.date||'';
}
function daysFromToday(date){if(!date)return null;const a=new Date(iso()+'T12:00:00'),b=new Date(date+'T12:00:00');return Math.ceil((b-a)/86400000)}
const stageDone=t=>['done','completed'].includes(String(t.status||'').toLowerCase());
function overviewCurrent(o,ts,snapshot=overviewFloor){const manual=ts.filter(t=>t.stageCorrection?.source==='order-overview').sort((a,b)=>String(b.stageCorrection.at).localeCompare(String(a.stageCorrection.at)))[0];if(manual){const target=ts.find(t=>t.id===manual.stageCorrection.selectedTaskId);return{task:target&&!stageDone(target)?target:ts.find(t=>!stageDone(t)),source:'manual'}}const F=window.RALAB_PRODUCTION_FORECAST,route=ts.filter(t=>!['wait','external'].includes(t.type)),rows=[...(snapshot?.sessions||[]),...(snapshot?.costHistory||[])].filter(r=>r.order_id===o.id).sort((a,b)=>Date.parse(b.started_at||b.last_at||0)-Date.parse(a.started_at||a.last_at||0));for(const r of rows){const task=F?.taskFor(r,route);if(task&&!stageDone(task))return{task,source:'floor',workplace:r.workplace_name}}return{task:ts.find(t=>!stageDone(t)),source:'route'}}
function overviewProgress(o){const ts=taskList(o.id).filter(t=>!t.deleted),selection=overviewCurrent(o,ts),current=selection.task,done=ts.filter(stageDone).length,total=Number(o.qty)||0,good=Math.max(0,Number(current?.doneQty)||0);return{tasks:ts,current,source:selection.source,workplace:selection.workplace,done,steps:ts.length,percent:ts.length?Math.round(done/ts.length*100):null,good,total,unitPercent:total>0?Math.min(100,Math.round(good/total*100)):null}}
function overviewFloorCounts(o,snapshot=overviewFloor){if(!snapshot)return[];const C=window.RALAB_PRODUCTION_CORE,P=window.RALAB_PRODUCTION_PACE;if(!C||!P)return[];const snap={...snapshot,costOrders:S().orders,costTasks:S().tasks.filter(t=>!t.deleted)},places=new Map();for(const r of P.rows(snap,Date.now()).filter(r=>r.order_id===o.id))places.set(C.canonical(r.workplace_name),r.workplace_name);return [...places.values()].map(name=>{const w=(snapshot.workplaces||[]).find(w=>C.canonical(w.name)===C.canonical(name))||{name,type:'machine'},m=P.monitor(o.id,w,snap,Date.now()),progress=(snapshot.taskProgress||[]).find(p=>p.order_id===o.id&&C.canonical(p.workplace_name)===C.canonical(name));return{name,good:m.good,percent:progress?.mode==='percent'?progress.percent:null}}).filter(m=>m.good>0||m.percent!=null)}
let overviewFloor=null,overviewFloorAt=0,overviewFloorLoading=false,overviewFloorError='';
async function refreshOverviewFloor(){if(overviewFloorLoading||Date.now()-overviewFloorAt<30000||typeof supabaseClient==='undefined'||!supabaseClient||typeof cloudUser==='undefined'||!cloudUser)return;overviewFloorLoading=true;overviewFloorAt=Date.now();try{const r=await supabaseClient.rpc('production_monitor_snapshot');if(r.error)throw r.error;overviewFloor=r.data;overviewFloorError=''}catch(e){overviewFloorError='Werkvloerregistraties niet geladen'}finally{overviewFloorLoading=false;document.querySelectorAll('[data-overview-progress]').forEach(el=>{const o=findOrder(el.dataset.overviewProgress);if(o)el.innerHTML=overviewProgressHtml(o)});document.querySelectorAll('[data-overview-current]').forEach(el=>{const o=findOrder(el.dataset.overviewCurrent);if(o&&!el.querySelector('select:disabled'))el.innerHTML=overviewCurrentHtml(o)})}}
function overviewForecast(o){const ts=taskList(o.id).filter(t=>!t.deleted),selection=overviewCurrent(o,ts),snap={...(overviewFloor||{}),costOrders:S().orders,costTasks:S().tasks.filter(t=>!t.deleted).map(t=>selection.source==='floor'&&t.orderId===o.id&&Number(t.seq)<Number(selection.task.seq)?{...t,status:'done'}:t)},F=window.RALAB_PRODUCTION_FORECAST,f=F?.forecast(o.id,null,snap,Date.now());let work=f?.remaining??ts.filter(t=>!stageDone(t)&&!['external','wait'].includes(t.type)).reduce((a,t)=>a+Math.max(0,Number(t.estimate)||0),0),wait=0;for(const t of ts){if(stageDone(t)||(selection.source==='floor'&&Number(t.seq)<Number(selection.task.seq)))continue;if(t.type==='external'){const end=Date.parse(t.expectedReturnDate||t.externalExpectedDate||'');wait+=Number.isFinite(end)?Math.max(0,(end-Date.now())/86400000):Math.max(0,Number(t.externalLeadDays)||Number(t.estimate)/1440||0)}else if(t.type==='wait'||/droog/i.test(t.name||t.machine||'')){const end=Date.parse(t.waitEndAt||'');wait+=Number.isFinite(end)?Math.max(0,(end-Date.now())/86400000):Math.max(0,Number(t.estimate)||0)/1440}}
return{days:work/480+wait,details:f?.details||[],partial:ts.some(t=>!stageDone(t)&&!(Number(t.estimate)>0)&&!(Number(t.orderCalcMinutes)>0)&&!(Number(t.externalLeadDays)>0))}}
function overviewProgressHtml(o){if(o.alabasterWait?.active)return '<b>'+esc(window.RALAB_ALABASTER_WAIT.label(o))+'</b><div class="muted">Gereeddatum afhankelijk van binnenkomst; de bestaande productieroute blijft behouden.</div>';const p=overviewProgress(o);if(o.needsCalculation||!p.steps)return '<span class="muted">Nog geen orderroute</span>';const f=overviewForecastCache.get(o.id)||{details:[],partial:false},floorCounts=overviewFloorCounts(o),counts=floorCounts.length?floorCounts.map(d=>'<div>'+esc(d.name)+': '+(d.percent!=null?d.percent+'%':d.good+' / '+p.total+' st. · '+Math.min(100,Math.round(d.good/Math.max(1,p.total)*100))+'%')+'</div>').join(''):f.details.filter(t=>t.good>0||t.progress>0).map(d=>{const t=p.tasks.find(t=>t.id===d.taskId);return '<div>'+esc(t?.name||'Bewerking')+': '+(d.progress!=null?d.progress+'%':d.good+' / '+p.total+' st. · '+Math.min(100,Math.round(d.good/Math.max(1,p.total)*100))+'%')+'</div>'}).join('');return (f.days!=null?'<b title="Schatting: 8 werkuren per werkdag, plus resterende droog- en wachttijd. Exclusief wachtrij voor machines.">Nog circa '+f.days.toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})+' dagen tot afronden</b>':'<span class="muted">Nog niet doorgerekend</span>')+'<div class="muted">'+(counts|| (p.current?p.good+' / '+p.total+' st. op huidige stap · '+(p.unitPercent||0)+'%':'Gereed'))+'</div>'+((overviewFloorError||f.partial)?'<div class="muted">'+esc(overviewFloorError||'Calculatie nog onvolledig')+'</div>':'')}
function overviewCurrentHtml(o){const p=overviewProgress(o);if(o.alabasterWait?.active)return '<b>'+esc(window.RALAB_ALABASTER_WAIT.label(o))+'</b><div class="muted">'+esc(window.RALAB_ALABASTER_WAIT.detail(o))+'</div>'+overviewStepSelect(o);return '<b>'+esc(o.needsCalculation?'Nog calculeren / aanvullen':window.RALAB_ALABASTER_WAIT.displayName(p.current?.name||'Gereed'))+'</b><div class="muted">'+esc(p.source==='manual'?'Handmatig ingesteld':p.source==='floor'?'Werkvloer · '+p.workplace:p.current?.machine||'')+'</div>'+overviewStepSelect(o)}
function overviewStepSelect(o){const p=overviewProgress(o);return '<select class="input" style="max-width:220px" aria-label="Huidige stap voor '+esc(o.orderNo)+'" data-overview-step-select="'+esc(o.id)+'">'+p.tasks.map(t=>'<option value="'+esc(t.id)+'" '+(!o.alabasterWait?.active&&t.id===p.current?.id?'selected':'')+'>'+esc(window.RALAB_ALABASTER_WAIT.displayName(t.name||t.machine))+(stageDone(t)?' (gereed)':'')+'</option>').join('')+(!p.current&&!o.alabasterWait?.active?'<option value="" selected>'+(!p.steps?'Kies een fase':'Alle stappen gereed')+'</option>':'')+alabasterWaitOptions(o)+'</select><div role="status" data-overview-step-status="'+esc(o.id)+'"></div>'}
document.addEventListener('change',async e=>{const el=e.target.closest?.('[data-overview-step-select]');if(!el||!el.value)return;el.disabled=true;const out=el.parentElement.querySelector('[data-overview-step-status]');if(out)out.textContent='Opslaan…';try{await setOverviewCurrentStep(el.dataset.overviewStepSelect,el.value);const saved=Array.from(document.querySelectorAll('[data-overview-step-status]')).find(x=>x.dataset.overviewStepStatus===el.dataset.overviewStepSelect);if(saved)saved.textContent='Opgeslagen'}catch(error){if(out)out.textContent=error.message;const o=findOrder(el.dataset.overviewStepSelect);el.value=overviewProgress(o).current?.id||''}finally{el.disabled=false}});
function alabasterWaitOptions(o){return '<option value="__wait_alabaster__" '+(o.alabasterWait?.active&&o.alabasterWait.kind!=='external'?'selected':'')+'>Wacht op binnenkomst Alabaster</option><option value="__wait_external__" '+(o.alabasterWait?.active&&o.alabasterWait.kind==='external'?'selected':'')+'>Extern</option>'+(o.alabasterWait?.active?'<option value="__resume_route__">Wachtstatus opheffen / bestaande route hervatten</option>':'')}
function overviewReadyOperation(o){const route=(S()?.tasks||[]).filter(t=>t.orderId===o.id&&!t.deleted);if(route.some(t=>/(alabast(er)?|steen|stenen).*klaar[\s-]*(zetten|leggen)/i.test((t.name||'')+' '+(t.machine||''))))return null;return orderTaskSteps(o).find(op=>op.name==='Alabaster klaarzetten'&&op.mode==='batch'&&Number(op.minutes)>0)||null}
function openOverviewStep(id){const o=S()?.orders?.find(x=>x.id===id&&!x.deleted),p=o&&overviewProgress(o);if(!o||o.active===false||o.closed||o.status==='completed')return;showModal('<div class="modalhead"><h3>Huidige productiestap instellen</h3></div><div class="modalbody"><div class="notice"><b>'+esc(o.orderNo)+' · '+esc(o.product)+'</b></div><div class="field"><label for="overviewCurrentStep">Order staat nu bij</label><select id="overviewCurrentStep" class="input">'+p.tasks.map((t,i)=>'<option value="'+esc(t.id)+'" '+(!o.alabasterWait?.active&&t.id===p.current?.id?'selected':'')+'>'+ (i+1)+'. '+esc(window.RALAB_ALABASTER_WAIT.displayName(t.name||t.machine))+(stageDone(t)?' (gereed)':'')+'</option>').join('')+(!p.steps&&!o.alabasterWait?.active?'<option value="" selected>Kies een fase</option>':'')+alabasterWaitOptions(o)+(overviewReadyOperation(o)&&!o.needsCalculation?'<option value="__add_ready__">Alabaster klaarzetten — toevoegen aan deze order</option>':'')+'</select></div><div id="overviewStepEffect" class="notice"></div><div class="field" id="overviewPurchaseStatusField" hidden><label for="overviewPurchaseStatus">Bestelstatus Alabaster</label><select id="overviewPurchaseStatus" class="input"><option value="">Kies bestelstatus</option><option value="pending" '+(o.alabasterWait?.active&&o.alabasterWait.kind!=='external'&&o.alabasterWait.purchaseStatus==='pending'?'selected':'')+'>Nog bestellen</option><option value="ordered" '+(o.alabasterWait?.active&&o.alabasterWait.kind!=='external'&&o.alabasterWait.purchaseStatus==='ordered'?'selected':'')+'>Besteld</option></select></div><div class="field" id="overviewExternalStatusField" hidden><label for="overviewExternalStatus">Externe status</label><select id="overviewExternalStatus" class="input"><option value="">Kies externe status</option><option value="ready" '+(o.alabasterWait?.active&&o.alabasterWait.kind==='external'&&o.alabasterWait.externalStatus==='ready'?'selected':'')+'>Ligt klaar voor extern</option><option value="return" '+(o.alabasterWait?.active&&o.alabasterWait.kind==='external'&&o.alabasterWait.externalStatus==='return'?'selected':'')+'>Wacht op retour</option></select></div><div class="field"><label for="overviewStageReason">Toelichting *</label><input id="overviewStageReason" class="input" placeholder="Bijv. steen staat klaar, order is al bij schuren"></div><p class="muted">Dit corrigeert de routevoortgang. Geregistreerde stuks, uren en verbruik blijven behouden. Een gereedstaande gekozen stap wordt heropend.</p><div id="overviewStageError" role="alert"></div></div><div class="modalfoot"><button class="btn" onclick="closeModal()">Annuleren</button><button class="btn primary" data-overview-stage-save="'+esc(id)+'">Huidige stap opslaan</button></div>');const update=()=>{const chosen=document.getElementById('overviewCurrentStep').value,index=p.tasks.findIndex(t=>t.id===chosen),prior=p.tasks.slice(0,index).filter(t=>!stageDone(t));document.getElementById('overviewExternalStatusField').hidden=chosen!=='__wait_external__';document.getElementById('overviewPurchaseStatusField').hidden=chosen!=='__wait_alabaster__';document.getElementById('overviewStepEffect').textContent=chosen==='__wait_external__'?'De order verhuist naar Extern. De productieroute blijft behouden; er wordt geen wachttijd toegevoegd.':chosen==='__wait_alabaster__'?'De order verhuist naar Wacht op binnenkomst Alabaster. Productiestappen, aantallen, uren en planning blijven behouden; er wordt geen wachttijd verzonnen.':chosen==='__resume_route__'?'Heft de wachtstatus op en hervat de bestaande route, zonder taken gereed te melden.':chosen==='__add_ready__'?'Voegt Alabaster klaarzetten toe vóór het productiewerk en kiest deze als huidige fase. Standaardduur: '+overviewReadyOperation(o).minutes+' minuten per batch. Eerdere inkoop- en voorbereidingsstappen worden gereed gezet.':prior.length?'Deze eerdere stappen worden gereed gezet: '+prior.map(t=>t.name||t.machine).join(', '):'Er hoeven geen eerdere stappen gereed gezet te worden.'};document.getElementById('overviewCurrentStep').addEventListener('change',update);update()}
async function setOverviewCurrentStep(orderId,taskId,reason,externalStatus,purchaseStatus){const s=S(),o=s?.orders?.find(x=>x.id===orderId&&!x.deleted&&x.active!==false);if(!o||o.closed||o.status==='completed')throw Error('Deze order is niet beschikbaar voor een voortgangscorrectie.');if(taskId==='__wait_external__')return window.RALAB_ALABASTER_WAIT.set(orderId,true,reason,'external',externalStatus);if(taskId==='__wait_alabaster__')return window.RALAB_ALABASTER_WAIT.set(orderId,true,reason,'alabaster',undefined,purchaseStatus);if(taskId==='__resume_route__')return window.RALAB_ALABASTER_WAIT.set(orderId,false,reason);if(o.needsCalculation)throw Error('Werk eerst de orderroute uit of kies de wachtstatus.');reason=String(reason||'').trim()||'Stap gekozen in orderoverzicht';const route=(s.tasks||[]).filter(t=>t.orderId===orderId&&!t.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)),sequenceChanges=[];let created=null;
 if(taskId==='__add_ready__'){const op=overviewReadyOperation(o);if(!op)throw Error('Klaarzetten staat al in de route of heeft geen bruikbare standaardduur. Open de correctie opnieuw.');let at=0;while(at<route.length&&/^(technisch uitwerken|verpakking bestellen|materiaal bestellen|materialen bestellen|steen inkopen spanje|wacht op binnenkomst alabaster)/i.test(route[at].name||''))at++;created={id:'t_ready_'+o.id,orderId,seq:at+1,name:op.name,machine:op.machine||op.name,estimate:Number(op.minutes),orderCalcMinutes:Number(op.minutes),calcMode:'batch',sourceOpId:op.id||null,dependsPrev:at>0,type:'internal',status:'open',actual:0,doneQty:0,employee:null,date:null,start:'',planSegments:[],note:''};if(s.tasks.some(t=>t.id===created.id))created.id+='_'+Date.now();route.splice(at,0,created);for(let n=0;n<route.length;n++){const t=route[n];if(t!==created&&t.seq!==n+1){sequenceChanges.push([t,structuredClone(t)]);t.seq=n+1}}s.tasks.push(created);taskId=created.id;}
 const i=route.findIndex(t=>t.id===taskId);if(i<0)throw Error('De gekozen stap bestaat niet meer in deze order.');const signature=JSON.stringify(route.map(t=>[t.id,t.status,t.doneQty,t.seq]));
 const live=(S().tasks||[]).filter(t=>t.orderId===orderId&&!t.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));if(JSON.stringify(live.map(t=>[t.id,t.status,t.doneQty,t.seq]))!==signature)throw Error('De orderroute is intussen gewijzigd. Open de correctie opnieuw.');const stamp=new Date().toISOString(),changed=sequenceChanges,oldWait=o.alabasterWait;if(oldWait?.active)o.alabasterWait=window.RALAB_ALABASTER_WAIT.next(o,false,reason);for(let n=0;n<=i;n++){const t=live[n],target=n<i?'done':stageDone(t)?'open':t.status;if(target===t.status&&n!==i)continue;if(!changed.some(([x])=>x===t))changed.push([t,structuredClone(t)]);const before=changed.find(([x])=>x===t)[1];t.status=target;t.stageCorrection={at:stamp,reason:String(reason).trim(),previousStatus:before.status,source:'order-overview',selectedTaskId:taskId};if(n<i){t.completedAt=stamp.slice(0,10);t.completedAtDT=stamp;t.planSegments=[];t.date=null;t.start='';t.employee=null}else{delete t.completedAt;delete t.completedAtDT}t.taskProgressUpdatedAt=stamp;}
 try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){for(const [t,old] of changed){for(const key of Object.keys(t))delete t[key];Object.assign(t,old)}if(created)s.tasks.splice(s.tasks.indexOf(created),1);if(oldWait?.active)o.alabasterWait=oldWait;window.RALAB_PERFORMANCE?.invalidate?.();throw e}if(typeof cloudUser!=='undefined'&&cloudUser&&typeof supabaseClient!=='undefined'&&supabaseClient){window.RALAB_PERFORMANCE?.flushCloudSave?.(30000).catch(()=>{});const expected=changed.map(([t])=>({id:t.id,status:t.status,seq:t.seq,correction:t.stageCorrection?.at})),until=Date.now()+30000;let confirmed=false;while(Date.now()<until){const r=await supabaseClient.from('planner_tasks_v2').select('task_id,data').eq('workspace_id','ralabaster').in('task_id',expected.map(t=>t.id));if(r.error)throw Error('Opslaan kon niet worden gecontroleerd: '+r.error.message);confirmed=expected.every(t=>r.data?.some(row=>row.task_id===t.id&&row.data?.status===t.status&&row.data?.seq===t.seq&&row.data?.stageCorrection?.at===t.correction));if(confirmed)break;await new Promise(resolve=>setTimeout(resolve,750))}if(!confirmed)throw Error('Deze stap is nog niet bevestigd. Je keuze blijft bewaard; vernieuw om de opgeslagen stand te controleren.')}if(oldWait?.active)await window.RALAB_ALABASTER_WAIT.verify(o);renderOrderOverview();window.RALAB_WORKPLACE_QUEUE?.render?.();return true;
}
function nextStepInfo(o){
 const t=taskList(o.id).find(x=>!x.deleted&&!['done','completed'].includes(String(x.status||'').toLowerCase()));
 if(!t)return{task:null,label:'Gereed',days:null,date:''};
 const today=iso(),deadline=o.communicatedDeadline||o.maximumReadyDate||o.deadline||'',lastWork=o.productionLatestWorkDate||(deadline?(()=>{const x=new Date(deadline+'T12:00:00');x.setDate(x.getDate()-7);return x.toISOString().slice(0,10)})():'');
 if(lastWork&&lastWork<today)return{task:t,date:lastWork,days:0,label:'TE LAAT · DIRECT UITVOEREN'};
 const d=t.planningLatestStartDate||o.productionLatestStartDate||taskDueDate(t),days=daysFromToday(d);
 return{task:t,date:d,days,label:days===null?'Week nog niet toegewezen':days<=0?'DIRECT UITVOEREN':days===1?'Uiterlijk over 1 dag':'Uiterlijk over '+days+' dagen'};
}
let earliestDeliveryRun=0,manualDeliveryBusy=false,manualDeliveryStatus='Levertijden worden alleen berekend met de knop hierboven.';
let earliestDeliveryCache=new Map(),overviewForecastCache=new Map();
async function refreshEarliestDeliveryDates(){
 if(manualDeliveryBusy)return false;manualDeliveryBusy=true;const run=++earliestDeliveryRun;manualDeliveryStatus='Levertijden en resterende tijden worden berekend…';renderOrderOverview();
 try{await new Promise(resolve=>setTimeout(resolve,30));const controls=window.RALAB_ORDER_CONTROLS;if(!controls?.simulateSequentialRemaining)throw Error('De planner is nog niet geladen. Probeer opnieuw.');
  const preview=await controls.simulateSequentialRemaining({planningStart:iso()}),finish=new Map((preview?.orders||[]).map(x=>[x.id,String(x.health?.finish||'').slice(0,10)])),forecasts=new Map();
  const orders=(S()?.orders||[]).filter(o=>!o.deleted&&o.active!==false&&!o.closed&&!['completed','closed','done','cancelled','deleted'].includes(String(o.status||'').toLowerCase())&&!o.isGeneralWork&&!o.isManualTasks&&!o.needsCalculation&&!o.alabasterWait?.active);
  for(let i=0;i<orders.length;i++){forecasts.set(orders[i].id,overviewForecast(orders[i]));if(i%5===4)await new Promise(resolve=>setTimeout(resolve,0))}
  if(run!==earliestDeliveryRun)return false;earliestDeliveryCache=finish;overviewForecastCache=forecasts;
  manualDeliveryStatus='Laatst berekend: '+new Date().toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'short',timeStyle:'short'})+' · '+orders.length+' orders. Bereken opnieuw na wijzigingen.';return true;
 }catch(error){console.error('Levertijden berekenen mislukt',error);manualDeliveryStatus='Berekenen niet gelukt: '+(error.message||String(error));return false}
 finally{manualDeliveryBusy=false;renderOrderOverview()}
}
let planCurrentSequenceBusy=false;
async function planCurrentSequence(button){
 if(planCurrentSequenceBusy)return false;
 const planner=window.RALAB_HYBRID_PLANNER;
 if(!planner?.ensureWeekAssignments)return alert('Weekplanner is nog niet geladen.');
 planCurrentSequenceBusy=true;
 const old=button?.textContent||'Plan volgens huidige volgorde';
 if(button){button.disabled=true;button.textContent='Weekplanning berekenen…'}
 try{
   try{window.RALAB_PRODUCTION_SEQUENCE?.normalize?.()}catch(_){}
   const changed=await planner.ensureWeekAssignments(true);
   try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
   try{save()}catch(_){}
   renderOrderOverview();
   const proposals=window.RALAB_WEEK_PROPOSAL;
   if(proposals?.startAll)proposals.startAll();
   else{show('weeks');try{window.renderWeeks?.()}catch(_){}}
   return changed;
 }catch(e){
   console.error('Plannen volgens huidige volgorde mislukt',e);
   alert('Weekplanning kon niet worden berekend.');
   return false;
 }finally{
   planCurrentSequenceBusy=false;
   if(button?.isConnected){button.disabled=false;button.textContent=old}
 }
}
function quickProductTemplate(product,id){const all=S()?.productTemplates||[];return id?all.find(t=>t.id===id&&!t.deleted):all.filter(t=>!t.deleted&&productContractKey(t.name)===productContractKey(product)).sort((a,b)=>(Number(b.version)||0)-(Number(a.version)||0)||String(b.updated||b.created||'').localeCompare(String(a.updated||a.created||'')))[0]}
function quickRouteInfo(){const form=document.getElementById('quickOrderForm'),out=form?.querySelector('[data-quick-route-info]');if(!out)return;const mode=form.querySelector('input[name="quickProductMode"]:checked')?.value,template=mode==='existing'?quickProductTemplate(document.getElementById('quickExistingProduct').value):null;out.textContent=template?.ops?.length?template.ops.length+' opgeslagen productiestappen worden automatisch geladen zodra een geldig aantal is ingevuld. Stuktijden worden berekend voor het orderaantal; de order wordt nog niet ingepland.':'Zonder opgeslagen productroute blijft deze order op Nog calculeren / aanvullen staan.'}
function attachQuickProductRoute(o,template){const s=S();s.tasks=s.tasks||[];if((s.tasks||[]).some(t=>t.orderId===o.id&&!t.deleted))throw Error('Deze order heeft al taken. De bestaande route wordt behouden.');const route=window.RALAB_TEMPLATE_ROUTE.build(o,template);if(route.tasks.some(t=>s.tasks.some(old=>old.id===t.id)))throw Error('Er bestaat al een routehistorie voor deze order. Controleer deze eerst.');Object.assign(o,route.fields);s.tasks.push(...route.tasks);return route}
function loadQuickProductRoute(id){const s=S(),o=s?.orders?.find(o=>o.id===id&&!o.deleted&&o.active!==false);if(!o||!o.needsCalculation)return false;const before=structuredClone(o),oldTasks=[...(s.tasks||[])];try{attachQuickProductRoute(o,quickProductTemplate(o.product,o.productTemplateId));save()}catch(error){Object.keys(o).forEach(k=>delete o[k]);Object.assign(o,before);s.tasks=oldTasks;window.RALAB_PERFORMANCE?.invalidate?.();alert(error.message);return false}window.RALAB_PERFORMANCE?.invalidate?.();renderOrderOverview();openOrder(id);return true}
function quickOrderForm(){
 if(!init())return;
 const s=S(),customers=(s.customers||[]).filter(c=>!c.deleted),products=[...new Set([...(s.productTemplates||[]).map(p=>p.name),...(s.orders||[]).filter(o=>!o.deleted).map(o=>o.product)].filter(Boolean))].sort();
 const startMode=products.length?'existing':'new';
 const html=`<div class="modalhead"><h3>Snelle order toevoegen</h3></div><form data-customer-safe-modal id="quickOrderForm"><div class="modalbody"><div class="grid2"><div class="field"><label for="quickCustomer">Klant *</label><input id="quickCustomer" class="input" list="quickCustomers" required autocomplete="off" placeholder="Kies of typ een klantnaam"><datalist id="quickCustomers">${customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}</datalist><div class="muted">Een nieuwe naam kun je later aan een klantdossier koppelen.</div></div><div class="field"><label>Product *</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin:5px 0 9px"><label class="btn small"><input type="radio" name="quickProductMode" value="existing" ${startMode==='existing'?'checked':''}> Bestaand product</label><label class="btn small"><input type="radio" name="quickProductMode" value="new" ${startMode==='new'?'checked':''}> Nieuw product</label></div><div data-quick-existing-product><select id="quickExistingProduct" class="input"><option value="">Kies een bestaand product</option>${products.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></div><div data-quick-new-product><input id="quickProduct" class="input" type="text" autocomplete="off" placeholder="Typ de nieuwe productomschrijving"><div class="muted">Je kunt hier volledig vrij typen.</div></div></div><div class="field"><label for="quickQty">Aantal (optioneel)</label><input id="quickQty" class="input" type="number" min="1" step="1" placeholder="Later invullen"></div><div class="field"><label for="quickDeadline">Gewenste datum (optioneel)</label><input id="quickDeadline" class="input" type="date"></div></div><div class="field" style="margin-top:12px"><label for="quickNote">Omschrijving / notitie (optioneel)</label><textarea id="quickNote" placeholder="Bijv. uitvoering, maat, kleur of wat nog uitgewerkt moet worden"></textarea><div class="muted">Deze tekst wordt direct in het Orderoverzicht getoond.</div></div><div class="notice" data-quick-route-info></div></div><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" type="submit">Snelle order opslaan</button></div></form>`;
 showModal(html);setQuickProductMode(startMode);setTimeout(()=>document.getElementById('quickCustomer')?.focus(),0);
}
function setQuickProductMode(mode){
 const form=document.getElementById('quickOrderForm');if(!form)return false;
 mode=mode==='new'?'new':'existing';
 const existing=form.querySelector('[data-quick-existing-product]'),fresh=form.querySelector('[data-quick-new-product]'),existingInput=document.getElementById('quickExistingProduct'),newInput=document.getElementById('quickProduct');
 if(existing)existing.hidden=mode!=='existing';if(fresh)fresh.hidden=mode!=='new';
 if(existingInput){existingInput.disabled=mode!=='existing';existingInput.required=mode==='existing'}
 if(newInput){newInput.disabled=mode!=='new';newInput.required=mode==='new'}
 quickRouteInfo();return true;
}
function saveQuickOrder(){
 const form=document.getElementById('quickOrderForm');if(!form||!form.reportValidity())return false;
 const mode=form.querySelector('input[name="quickProductMode"]:checked')?.value||'existing',customerName=document.getElementById('quickCustomer').value.trim(),product=(mode==='new'?document.getElementById('quickProduct'):document.getElementById('quickExistingProduct')).value.trim();
 if(!customerName||!product)return false;
 const s=S(),customer=(s.customers||[]).find(c=>!c.deleted&&productContractKey(c.name)===productContractKey(customerName)),template=mode==='existing'?quickProductTemplate(product):null;
 const rawQty=document.getElementById('quickQty').value,qty=rawQty?Number(rawQty):0;if(rawQty&&(!Number.isSafeInteger(qty)||qty<1))return false;
 const id='o_quick_'+(globalThis.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2)),stamp=new Date().toISOString();
 const order={id,orderNo:'SNEL-'+Date.now().toString().slice(-8),customerId:customer?.id||'',customerName:customer?.name||customerName,product,productTemplateId:template?.id||'',qty,quantityPending:!rawQty,deadline:document.getElementById('quickDeadline').value||'',note:document.getElementById('quickNote').value.trim(),active:true,status:'needs_calculation',needsCalculation:true,created:iso(),createdAt:stamp};
 if(template?.ops?.length&&rawQty){try{attachQuickProductRoute(order,template)}catch(error){alert(error.message);return false}}s.orders.push(order);
 try{save()}catch(e){s.orders=s.orders.filter(o=>o.id!==id);s.tasks=s.tasks.filter(t=>t.orderId!==id);console.error(e);alert('Order kon niet worden opgeslagen.');return false}
 closeModal();show('orderoverview');return true;
}
document.addEventListener('submit',e=>{if(e.target.id==='quickOrderForm'){e.preventDefault();saveQuickOrder()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-quick-order]')){e.preventDefault();quickOrderForm()}});
document.addEventListener('change',e=>{if(e.target.matches?.('#quickOrderForm input[name="quickProductMode"]'))setQuickProductMode(e.target.value);if(e.target.matches?.('#quickExistingProduct,#quickQty'))quickRouteInfo()});
function renderOrderOverview(){
 if(!init())return;refreshOverviewFloor();
 const root=document.getElementById('view-orderoverview'),s=S();if(!root)return;
 const q=String(root.dataset.q||'').trim().toLowerCase(),byWeek=(root.dataset.overviewSort||'week')==='week';
 const isFinished=o=>o.active===false||['completed','closed','done','cancelled','deleted'].includes(String(o.status||'').toLowerCase())||!!o.deleted;
 const all=(perf()?.getActiveOrders?perf().getActiveOrders():s.orders)
   .filter(o=>!isFinished(o)&&!o.isGeneralWork&&!o.isManualTasks)
   .filter(o=>!q||[o.orderNo,o.customerName,o.product,o.project].join(' ').toLowerCase().includes(q))
   .slice().sort(byWeek?deadlineWeekSort:orderSortForProduction);
 const weekHeader=weekHeaders(all,true);
 if(!byWeek&&orderOverviewPinnedOrder){const positions=new Map(orderOverviewPinnedOrder.map((id,index)=>[id,index]));all.sort((a,b)=>{const ai=positions.has(a.id)?positions.get(a.id):Number.MAX_SAFE_INTEGER,bi=positions.has(b.id)?positions.get(b.id):Number.MAX_SAFE_INTEGER;return ai-bi||(ai===Number.MAX_SAFE_INTEGER?orderSortForProduction(a,b):0)})}
 const groups=new Map();for(const o of all){const k=(o.customerId||o.customerName||'')+'|'+productContractKey(o.product);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o)}
 const batchHints=[];for(const rows of groups.values()){const first=rows[0],cust=(s.customers||[]).find(x=>x.id===first.customerId),contract=(cust?.productContracts||[]).find(x=>productContractKey(x.product)===productContractKey(first.product));if(rows.length>1||contract){const st=contract?contractStats(cust,contract):null;batchHints.push({rows,first,cust,contract,st})}}
 const stockRows=(s.contractStockWork||[]).filter(x=>!x.deleted&&x.status!=='done').filter(x=>!q||[x.customerName,x.product].join(' ').toLowerCase().includes(q));
 const hintsHtml=batchHints.map(h=>`<div class="notice" style="margin-bottom:8px"><b>🔗 ${esc(h.first.product)}</b> · ${h.rows.length} open order(s) · ${h.rows.reduce((n,o)=>n+(Number(o.qty)||0),0)} st.${h.contract?' · contract '+Number(h.contract.contractQty||0)+' st. · nog verwacht '+h.st.remaining+' st.':''}<span style="float:right">${h.contract?'<button class="btn small" type="button" data-contract-produce="'+esc(h.cust.id)+'" data-product="'+esc(h.first.product)+'">Vooruit produceren?</button>':''}</span></div>`).join('');
 const stockHtml=stockRows.length?`<div class="panel" style="padding:10px;margin-bottom:10px"><b>Contractvoorraad / vooruitwerk</b>${stockRows.map(x=>`<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #eee"><span style="flex:1"><b>${esc(x.product)}</b><span class="muted"> · ${esc(x.customerName)} · geen harde deadline</span></span><b>${Number(x.qty)||0} st.</b><span class="pill">mag vooruit</span></div>`).join('')}</div>`:'';
 root.innerHTML=`<div class="toolbar"><h2>Orderoverzicht</h2><span class="pill">${all.length} actief</span><div class="spacer"></div><button class="btn" type="button" data-print-active-orders>Print alle lopende orders</button><button class="btn" type="button" data-backup-download title="Sla eerst alles op, maak een herstelpunt en download een volledige back-up">🛡 Volledige back-up</button><button class="btn primary" type="button" data-quick-order>+ Snelle order</button><button class="btn" type="button" data-calculate-delivery ${manualDeliveryBusy?'disabled':''}>${manualDeliveryBusy?'Berekenen…':'Levertijden berekenen'}</button><button class="btn primary" type="button" data-plan-current-sequence>Plan volgens huidige volgorde</button><button class="btn" onclick="RALAB_ERP.show('calculation')">+ Nieuwe calculatie</button></div>
 <div class="muted" role="status" data-delivery-calculation-status style="margin:8px 0">${esc(manualDeliveryStatus)}</div>${hintsHtml}${stockHtml}<div class="panel" style="padding:10px;margin-bottom:10px"><label style="display:inline-block;margin:0 12px 8px 0"><b>Indeling:</b> <select class="input" data-overview-sort><option value="week" ${byWeek?'selected':''}>Deadline per week</option><option value="production" ${!byWeek?'selected':''}>Productievolgorde</option></select></label><input class="input" type="search" data-orderoverview-search placeholder="Zoek ordernummer, klant, product of project" value="${esc(root.dataset.q||'')}" style="width:min(560px,100%)"></div>
 <div class="notice">${byWeek?'Orders staan per deadlineweek, van vroeg naar laat. Zonder deadline staat onderaan. Kies Productievolgorde om de handmatige volgorde te bekijken.':'<b>Productievolgorde:</b> standaard op deadline. Vul alleen een volgordenummer in als je handmatig wilt overrulen. Gewijzigde deadlines worden direct opgeslagen; de nieuwe sortering verschijnt zodra je dit tabblad opnieuw opent.'}</div>
 <div class="panel order-overview-panel" style="overflow:auto">
 <table class="order-overview-list" style="min-width:1000px"><thead><tr><th style="width:78px">Volgorde</th><th>Order</th><th>Klant / product</th><th style="width:155px">Deadline</th><th style="width:155px">Vroegst uitleveren</th><th style="width:160px">Uiterlijk starten</th><th>Huidige / volgende stap</th><th>Voortgang</th><th style="width:80px"></th></tr></thead><tbody>
 ${all.map(o=>{const n=nextStepInfo(o),seq=orderSequenceValue(o)||'',deadline=(o.communicatedDeadline||o.maximumReadyDate||o.deadline||'');return `${byWeek?weekHeader(o):''}<tr data-overview-order="${esc(o.id)}">
   <td data-label="Volgorde"><input class="input" style="width:68px;text-align:center" type="number" min="1" placeholder="auto" data-overview-sequence="${esc(o.id)}" value="${esc(seq)}"></td>
   <td data-label="Order"><input class="input" type="text" data-overview-order-no="${esc(o.id)}" value="${esc(o.orderNo||'')}" aria-label="Ordernummer aanpassen" style="width:140px;font-weight:800"></td>
   <td data-label="Klant / product"><b>${esc(o.product||'')}</b><div class="muted">${esc(o.customerName||'')} · ${o.quantityPending?'Aantal nog invullen':(Number(o.qty)||0)+' st.'}</div>${o.note?`<div style="margin-top:4px;white-space:pre-wrap"><span class="muted"><b>Omschrijving:</b></span> ${esc(o.note)}</div>`:''}${o.needsCalculation?'<span class="pill" style="background:#fff2cf;color:#795500;margin-top:5px">Nog calculeren / aanvullen</span>':''}</td>
   <td data-label="Deadline"><input class="input" type="date" data-overview-deadline="${esc(o.id)}" value="${esc(deadline)}"></td>
   <td data-label="Vroegst uitleveren" ${o.needsCalculation||o.alabasterWait?.active?'':'data-earliest-delivery="'+esc(o.id)+'"'}><span class="muted">${o.needsCalculation?'Na uitwerken':o.alabasterWait?.active?esc(window.RALAB_ALABASTER_WAIT.label(o)):esc(earliestDeliveryCache.get(o.id)||'Nog niet berekend')}</span></td>
   <td data-label="Uiterlijk starten">${(()=>{if(o.needsCalculation)return '<span class="muted">Na uitwerken</span>';const today=iso(),late=o.productionLatestWorkDate&&o.productionLatestWorkDate<today,due=o.productionLatestStartDate&&o.productionLatestStartDate<=today;if(late)return '<b>TE LAAT</b>';if(due)return '<b>DIRECT STARTEN</b>';if(o.productionLatestStartWeek&&o.productionLatestStartDate)return '<b>Week '+esc(String(o.productionLatestStartWeek).slice(-2))+'</b><div class="muted">'+esc(o.productionLatestStartDate)+'</div>';return '<b>Nog berekenen</b>'})()}</td>
   <td data-label="Huidige stap" data-overview-current="${esc(o.id)}">${overviewCurrentHtml(o)}</td><td data-label="Voortgang" data-overview-progress="${esc(o.id)}">${overviewProgressHtml(o)}</td>
   <td class="order-overview-actions">${window.RALAB_DELIVERIES?.controls?.(o)||''}<button class="btn small" type="button" data-print-order="${esc(o.id)}">Print deze order</button><button class="btn small" type="button" onclick="RALAB_ERP.openOrder('${o.id}')">Open</button> <button class="btn small primary" type="button" data-closeout-order-button="${esc(o.id)}" onclick="RALAB_ORDER_CLOSEOUT?.open('${esc(o.id)}')">Order afgerond</button>${o.needsCalculation?` <button class="btn small danger" type="button" data-delete-quick-order="${esc(o.id)}">Verwijderen</button>`:''}</td>
 </tr>`}).join('')||'<tr><td colspan="9">Geen actieve orders.</td></tr>'}
 </tbody></table></div>`;

}
function deleteQuickOrder(id){
 const s=S(),o=s?.orders?.find(x=>x.id===id&&!x.deleted);if(!o||!o.needsCalculation)return false;
 if(!confirm(`Snelle order ${o.orderNo||''} verwijderen?`))return false;
 const stamp=new Date().toISOString();o.deleted=true;o.active=false;o.status='deleted';o.deletedAt=stamp;o.updatedAt=stamp;
 for(const t of s.tasks||[])if(t.orderId===id&&!t.deleted){t.deleted=true;t.status='deleted';t.planSegments=[];t.updatedAt=stamp}
 try{window.RALAB_PERFORMANCE?.markDeleted?.('orders',id);window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){console.error(e);alert('De snelle order kon niet worden verwijderd.');return false}
 renderOrderOverview();return true;
}
function orderDeadlineValue(o){return o?.communicatedDeadline||o?.maximumReadyDate||o?.deadline||'9999-12-31'}
function deadlineWeek(o){
 const value=orderDeadlineValue(o),d=new Date(value+'T12:00:00Z');
 if(value==='9999-12-31'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)return {key:'9999',label:'Zonder deadline',range:''};
 d.setUTCHours(0,0,0,0);const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);
 const thursday=new Date(monday);thursday.setUTCDate(monday.getUTCDate()+3);const year=thursday.getUTCFullYear();
 const week=Math.ceil((((thursday-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);
 const fmt=x=>x.toLocaleDateString('nl-NL',{day:'numeric',month:'short',timeZone:'UTC'});
 return {key:year+'-W'+String(week).padStart(2,'0'),label:'Week '+week+' · '+year,range:fmt(monday)+' – '+fmt(sunday)};
}
function deadlineWeekSort(a,b){return deadlineWeek(a).key.localeCompare(deadlineWeek(b).key)||orderDeadlineValue(a).localeCompare(orderDeadlineValue(b))||String(a.orderNo||'').localeCompare(String(b.orderNo||''))}
function weekHeaders(orders,table=false){
 const counts=new Map();for(const o of orders){const k=deadlineWeek(o).key;counts.set(k,(counts.get(k)||0)+1)}let previous='';
 return o=>{const w=deadlineWeek(o);if(w.key===previous)return '';previous=w.key;const count=counts.get(w.key),text=`<b>${esc(w.label)}</b> <span class="muted">${esc(w.range)}</span> <span class="pill">${count} order${count===1?'':'s'}</span>`;
 return table?`<tr class="order-deadline-week" data-deadline-week="${w.key}"><td colspan="9">${text}</td></tr>`:`<div class="order-deadline-week" data-deadline-week="${w.key}">${text}</div>`};
}

function orderPriority(o){const n=Number(o?.planningPriority);return n>=1&&n<=3?n:3}
function priorityStars(o){const value=orderPriority(o);return `<span class="order-priority" role="group" aria-label="Prioriteit deadline">${[1,2,3].map(n=>`<button class="priority-star ${n<=value?'active':''}" type="button" data-priority-order="${esc(o.id)}" data-priority-value="${n}" title="${n} ster${n===1?'':'ren'}: ${n===1?'laagste':n===3?'hoogste':'normale'} prioriteit" aria-label="Prioriteit ${n} van 3" aria-pressed="${n===value?'true':'false'}">★</button>`).join('')}</span>`}
function setOrderPriority(id,value){
 // Simulations replace state objects. Never write into the performance read cache.
 const o=S()?.orders?.find(x=>x.id===id&&!x.deleted);if(!o)return false;
 const previous=o.planningPriority;o.planningPriority=Math.max(1,Math.min(3,Number(value)||3));
 try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(err){if(previous===undefined)delete o.planningPriority;else o.planningPriority=previous;console.error('Prioriteit opslaan mislukt',err);alert('Prioriteit kon niet worden opgeslagen. Probeer opnieuw.');return false}
 if(!document.getElementById('view-orderoverview')?.classList.contains('hidden'))renderOrderOverview();else renderOrders(orderPage);return true
}
function setOverviewDeadline(id,value){
 const o=S()?.orders?.find(x=>x.id===id&&!x.deleted);if(!o)return false;
 if(!document.getElementById('view-orderoverview')?.classList.contains('hidden')&&!orderOverviewPinnedOrder){orderOverviewPinnedOrder=(perf()?.getActiveOrders?perf().getActiveOrders():(S()?.orders||[]).filter(x=>x.active!==false&&x.status!=='completed'&&!x.deleted)).filter(x=>!x.isGeneralWork&&!x.isManualTasks&&!x.deleted).slice().sort(orderSortForProduction).map(x=>x.id)}
 o.communicatedDeadline=value||'';o.deadline=value||'';o.maximumReadyDate=value||'';o.internalTargetDate=value?(()=>{const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-7);return d.toISOString().slice(0,10)})():'';
 o.planningCheckedAt='';o.weekPlanningUpdatedAt='';try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){console.error(e);return false}renderOrderOverview();return true;
}
function setOverviewOrderNo(id,value){
 const s=S(),o=s?.orders?.find(x=>x.id===id&&!x.deleted);if(!o)return false;const next=String(value??'').trim(),previous=String(o.orderNo||'');
 if(!next){alert('Ordernummer mag niet leeg zijn.');renderOrderOverview();return false}
 const duplicate=(s.orders||[]).find(x=>x.id!==id&&!x.deleted&&String(x.orderNo||'').trim().toLowerCase()===next.toLowerCase());
 if(duplicate){alert(`Ordernummer ${next} bestaat al. Kies een uniek ordernummer.`);renderOrderOverview();return false}
 if(next===previous)return true;o.orderNo=next;o.updatedAt=new Date().toISOString();
 try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){o.orderNo=previous;console.error('Ordernummer opslaan mislukt',e);alert('Ordernummer kon niet worden opgeslagen. Probeer opnieuw.');renderOrderOverview();return false}
 renderOrderOverview();return true;
}
function closeDeadlineQuickPick(){document.querySelector('.deadline-quick-pick')?.remove()}
function deadlineFromWeeks(weeks){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+Math.round(Number(weeks)||0)*7);const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
function openDeadlineQuickPick(input){
 if(!input)return;closeDeadlineQuickPick();
 const box=document.createElement('div'),r=input.getBoundingClientRect(),id=input.dataset.overviewDeadline;
 box.className='deadline-quick-pick';box.dataset.orderId=id||'';
 box.style.cssText='position:fixed;z-index:7000;width:290px;padding:10px;background:var(--card,#fff);border:1px solid var(--line,#d9dfdc);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.2)';
 box.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><b style="flex:1">Deadline kiezen</b><button class="btn small" type="button" data-deadline-calendar>Kalender</button></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" type="button" data-deadline-quick="0">Vandaag</button><button class="btn small" type="button" data-deadline-quick="1">+1 week</button><button class="btn small" type="button" data-deadline-quick="2">+2 weken</button><button class="btn small" type="button" data-deadline-quick="4">+4 weken</button><button class="btn small" type="button" data-deadline-quick="6">+6 weken</button><button class="btn small" type="button" data-deadline-quick="8">+8 weken</button></div><div style="display:flex;align-items:center;gap:7px;margin-top:9px"><span>Over</span><input class="input" type="number" min="0" step="1" placeholder="x" data-deadline-custom-weeks style="width:70px;text-align:center"><span>weken</span><button class="btn small primary" type="button" data-deadline-custom-apply>Instellen</button></div>';
 document.body.appendChild(box);
 const left=Math.min(window.innerWidth-box.offsetWidth-8,Math.max(8,r.left)),top=Math.min(window.innerHeight-box.offsetHeight-8,r.bottom+6);
 box.style.left=left+'px';box.style.top=top+'px';
}
function setOverviewDeadlineWeeks(id,weeks){
 const n=Number(weeks);if(!Number.isFinite(n)||n<0)return false;
 const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+Math.round(n)*7);const z=new Date(d.getTime()-d.getTimezoneOffset()*60000),value=z.toISOString().slice(0,10);
 return setOverviewDeadline(id,value);
}
function setOverviewSequence(id,value){
 const o=S()?.orders?.find(x=>x.id===id&&!x.deleted);if(!o)return false;const raw=String(value??'').trim();
 if(!raw)delete o.productionSequence;else o.productionSequence=Math.max(1,Number(raw)||1);
 try{window.RALAB_PRODUCTION_SEQUENCE?.normalize?.();window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){console.error(e)}
 orderOverviewPinnedOrder=null;
 renderOrderOverview();return true;
}
function orderHasUnplannedWork(o){return taskList(o.id).some(t=>{if(['done','completed','external','in_progress','partial','partly'].includes(String(t.status||'').toLowerCase()))return false;if(t.type==='wait')return!(t.waitStartAt&&t.waitEndAt);if(t.type==='external')return!(t.date&&t.expectedReturnDate);return!((t.planSegments||[]).length||t.date)})}
function renderOrders(page=orderPage){
 if(!init())return;orderPage=Math.max(0,+page||0);
 const root=document.getElementById('view-orders'),s=S(),q=(root?.dataset.q||'').trim().toLowerCase(),sort=root?.dataset.orderSort||'week',onlyUnplanned=root?.dataset.onlyUnplanned==='1';
 let arr=(perf()?.getActiveOrders?perf().getActiveOrders():s.orders.filter(o=>o.active!==false&&o.status!=='completed')).filter(o=>!o.isGeneralWork&&!o.isManualTasks)
   .filter(o=>!q||[o.orderNo,o.customerName,o.product,o.project].join(' ').toLowerCase().includes(q))
   .filter(o=>!onlyUnplanned||orderHasUnplannedWork(o));
 arr.sort(sort==='week'?deadlineWeekSort:(a,b)=>{const d=orderDeadlineValue(a).localeCompare(orderDeadlineValue(b));return(sort==='deadline-desc'?-d:d)||(a.orderNo||'').localeCompare(b.orderNo||'')});
 const p=pageInfo(arr.length,orderPage);orderPage=p.page;const rows=arr.slice(p.start,p.end);const weekHeader=weekHeaders(arr);
 const html=`<div class="toolbar"><h2>3. Orders</h2><span class="pill" data-orders-count>${arr.length} actief</span><div class="spacer"></div><button class="btn" type="button" data-print-active-orders>Print alle lopende orders</button><button class="btn" type="button" data-backup-download title="Sla eerst alles op, maak een herstelpunt en download een volledige back-up">🛡 Volledige back-up</button><button class="btn" type="button" data-unplan-all>Alle orders ontplannen</button><button class="btn primary" type="button" data-plan-remaining>Resterende taken plannen</button><button class="btn" type="button" data-start-review onclick="RALAB_ORDER_CALC_WORKFLOW?.startReview?.()">Nog te controleren / plannen${window.RALAB_ORDER_CALC_WORKFLOW?.reviewCount?(' ('+window.RALAB_ORDER_CALC_WORKFLOW.reviewCount()+')'):''}</button><button class="btn" onclick="RALAB_ERP.show('calculation')">+ Nieuwe order/calculatie</button></div>
 <div class="panel" style="padding:12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input class="input" type="search" data-order-search aria-label="Zoek orders" style="min-width:280px;flex:1" placeholder="Zoek klant, ordernummer, product of project" value="${esc(root.dataset.q||'')}"><label><b>Sorteren:</b> <select class="input" data-order-sort><option value="week" ${sort==='week'?'selected':''}>Deadline per week</option><option value="deadline-asc" ${sort==='deadline-asc'?'selected':''}>Eerste deadline bovenaan</option><option value="deadline-desc" ${sort==='deadline-desc'?'selected':''}>Laatste deadline bovenaan</option></select></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-only-unplanned ${onlyUnplanned?'checked':''}> Alleen ongeplande orders</label></div></div>
 <div data-orders-results>${rows.map(o=>{const t=currentStep(o),st=status(o);return`${sort==='week'?weekHeader(o):''}<div class="panel" data-order-card="${esc(o.id)}" style="padding:16px;margin-top:10px"><div class="toolbar"><div><b style="font-size:18px">${esc(o.orderNo)} · ${esc(o.customerName||'')}</b><div>${esc(o.product)} · ${o.qty} st.${o.project?' · '+esc(o.project):''}</div></div><div class="spacer"></div><div><div class="muted" style="text-align:right">Deadlineprioriteit</div>${priorityStars(o)}</div><span class="badge">${esc(st)}</span></div><div class="grid3"><div><b>Nu</b><br>${esc(t?.name||'—')}<br><span class="muted">${esc(t?.machine||'')}</span></div><div><b>Intern verwacht gereed</b><br>${esc(o.internalExpectedDate||'Nog niet berekend')}</div><div><b>Gecommuniceerde deadline</b><br>${esc(o.communicatedDeadline||o.deadline||'Nog niet bevestigd')}</div></div><div style="margin-top:10px">${window.RALAB_DELIVERIES?.controls?.(o)||''}<button class="btn small" type="button" data-print-order="${esc(o.id)}">Print deze order</button> <button class="btn small" onclick="RALAB_ERP.openOrder('${o.id}')">Order openen</button> <button class="btn small primary" type="button" data-plan-order="${esc(o.id)}">Inplannen</button> <button class="btn small" type="button" data-unplan-order="${esc(o.id)}">Ontplannen</button> <button class="btn small" onclick="RALAB_ERP.orderConfirmation('${o.id}')">Order confirmation</button> <button class="btn small" onclick="RALAB_ERP.deleteOrder('${o.id}')" style="margin-left:6px">Verwijder order</button></div></div>`}).join('')||'<div class="panel" style="padding:16px">Geen lopende orders binnen dit filter.</div>'}${pager(arr.length,orderPage,'RALAB_ERP.renderOrders')}</div>`
 const results=root.querySelector('[data-orders-results]');
 if(!results){root.innerHTML=html;return}
 const template=document.createElement('div');template.innerHTML=html;
 results.replaceWith(template.querySelector('[data-orders-results]'));
 root.querySelector('[data-orders-count]').textContent=arr.length+' actief';
 root.querySelector('[data-order-sort]').value=sort;
 root.querySelector('[data-only-unplanned]').checked=onlyUnplanned;
 const review=root.querySelector('[data-start-review]'),nextReview=template.querySelector('[data-start-review]');if(review&&nextReview)review.textContent=nextReview.textContent;
}
function orderTaskSteps(o){
 const byName=new Map(),k=n=>String(n||'').trim().toLowerCase();
 for(const op of window.RALAB_CALC?.getOperations?.()||[])byName.set(k(op.name),{...op,machine:op.machine||op.name});
 const template=S()?.productTemplates?.find(t=>t.id===o.productTemplateId);
 for(const op of o.costing?.ops||o.templateOps||template?.ops||[])if(op.name)byName.set(k(op.name),{...byName.get(k(op.name)),...op,machine:op.machine||op.name});
 for(const w of S()?.workplaces||[]){if(w.active===false)continue;if(w.name&&!byName.has(k(w.name)))byName.set(k(w.name),{name:w.name,machine:w.name,mode:['external','wait'].includes(w.type)?w.type:'batch',minutes:null,rate:w.hourlyCost});}
 return [...byName.values()].filter(op=>op.name);
}
function updateNewOrderTask(select){
 const root=select.closest('.modalbody'),id=root?.querySelector('[data-add-order-task]')?.dataset.addOrderTask,o=S()?.orders?.find(o=>o.id===id),step=o&&orderTaskSteps(o).find(op=>op.name===select.value);if(!root||!o)return;
 const machine=root.querySelector('[data-new-order-task-machine]'),duration=root.querySelector('[data-new-order-task-duration]'),button=root.querySelector('[data-add-order-task]');
 machine.value=step?.machine||'';const qty=!o.quantityPending?Number(o.qty):0,total=step?.mode==='unit'?(qty>0?Number(step.minutes)*qty:0):Number(step?.minutes);
 duration.value=total>0?Math.max(1,Math.round(total)):'';button.disabled=!step;
 root.querySelector('[data-new-order-task-preferred]').value=step?.preferredEmployee||'';root.querySelector('[data-new-order-task-parallel]').value=step?.parallelGroupId||'';
 const hint=root.querySelector('[data-new-order-task-help]');if(hint)hint.textContent=step?total>0?(step.mode==='unit'?`Totale duur voor ${qty} stuks, op basis van de bestaande stap.`:'Duur overgenomen uit de bestaande stap; controleer voor deze order.'):'Vul de totale duur voor deze order in; er is geen bruikbare standaardtijd.':'Kies een bestaande processtap.';
}
async function openOrder(id){
 let o=findOrder(id),ts=o?taskList(id):[];if(!o&&perf()?.loadOrderBundle){try{const b=await perf().loadOrderBundle(id);o=b?.order;ts=b?.tasks||[]}catch(e){console.error(e)}}if(!o)return;
 ts=ts.filter(t=>!t.deleted).slice().sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 const steps=orderTaskSteps(o),stepLabel=n=>/^steen\s+inkopen\s+spanje(?:\s*\(extern\))?$/i.test(n)?'Wacht op binnenkomst Alabaster':n;
 const rows=ts.map((t,i)=>{const done=['done','completed'].includes(String(t.status||'').toLowerCase());return `<div data-order-task-row="${esc(t.id)}" style="display:grid;grid-template-columns:82px minmax(190px,1fr) 105px 140px 120px 110px 92px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
   <div style="display:flex;align-items:center;gap:4px"><b style="min-width:22px">${i+1}.</b><button class="btn small" type="button" data-order-task-move="${esc(t.id)}" data-move-dir="-1" ${i===0?'disabled':''} title="Omhoog">↑</button><button class="btn small" type="button" data-order-task-move="${esc(t.id)}" data-move-dir="1" ${i===ts.length-1?'disabled':''} title="Omlaag">↓</button></div>
   <div><b>${esc(window.RALAB_ALABASTER_WAIT.displayName(t.name||'Taak'))}</b><div class="muted">${esc(window.RALAB_ALABASTER_WAIT.displayName(t.machine||''))}${t.employee?' · '+esc(t.employee):''}${t.date?' · '+esc(t.date):''}</div></div>
   <label style="display:flex;align-items:center;gap:5px"><input class="input" style="width:72px" type="number" min="1" step="1" data-order-task-duration="${esc(t.id)}" value="${Math.max(1,Math.round(Number(t.estimate)||1))}"><span class="muted">min</span></label>
   <select class="input" data-order-task-preferred="${esc(t.id)}" title="Voorkeursmedewerker"><option value="">Geen voorkeur</option>${['Ralph','Peter','Kaan','Lance','Shaffi','Youri'].map(x=>`<option value="${x}" ${x===(t.preferredEmployee||'')?'selected':''}>${x}</option>`).join('')}</select>
   <select class="input" data-order-task-parallel="${esc(t.id)}" title="Parallelgroep"><option value="">Niet parallel</option>${['A','B','C','D'].map(x=>`<option value="${x}" ${x===(t.parallelGroupId||'')?'selected':''}>Parallel ${x}</option>`).join('')}</select>
   <button class="btn small ${done?'':'primary'}" type="button" data-order-task-toggle="${esc(t.id)}">${done?'Heropenen':'Klaar'}</button>
   <button class="btn small" type="button" data-order-task-delete="${esc(t.id)}">Verwijderen</button>
 </div>`}).join('');
 const html=`<div data-customer-safe-modal hidden></div><div class="modalhead"><h3>${esc(o.orderNo)} · ${esc(o.customerName||'')} · ${esc(o.product)}</h3></div><div class="modalbody"><div class="grid3"><div><b>Status</b><br>${status({...o,id:o.id})}</div><div><b>Intern gereed</b><br>${esc(o.internalExpectedDate||'—')}</div><div><b>Klantdeadline</b><br>${esc(o.communicatedDeadline||o.deadline||'—')}</div></div>
 ${o.needsCalculation?'<div class="notice"><b>Nog calculeren / aanvullen</b> · '+esc(o.note||'')+'<label style="display:block;margin-top:10px"><b>Productomschrijving</b><input class="input" type="text" data-needs-calculation-product="'+esc(o.id)+'" value="'+esc(o.product||'')+'" style="width:100%;margin-top:5px"></label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px"><button class="btn" type="button" data-save-needs-product="'+esc(o.id)+'">Omschrijving opslaan</button><button class="btn primary" type="button" data-order-to-calc="'+esc(o.id)+'">Order uitwerken</button>'+(o.productTemplateId&&!ts.length?'<button class="btn" type="button" data-load-product-route="'+esc(o.id)+'">Opgeslagen productiestappen laden</button>':'')+'</div></div>':''}
 <div style="display:flex;align-items:center;gap:10px;margin-top:18px">${window.RALAB_DELIVERIES?.controls?.(o)||''}<button class="btn" type="button" data-print-order="${esc(o.id)}">Print deze order</button><button class="btn" type="button" data-planner-drawings="${esc(o.id)}">Ordertekeningen & historie</button><h3 style="margin:0">Proces</h3><span class="pill">${ts.length} taken</span></div>
 <div style="display:grid;grid-template-columns:82px minmax(190px,1fr) 105px 140px 120px 110px 92px;gap:8px;margin-top:8px;padding:0 0 5px;font-size:12px;font-weight:700;color:var(--muted,#667)"><span></span><span>Taak / werkplek</span><span>Duur</span><span>Voorkeursmedewerker</span><span>Parallel</span><span></span><span></span></div><div>${rows||'<div class="muted">Nog geen taken.</div>'}</div>
 <div class="panel" style="padding:10px;margin-top:10px"><b>Taak toevoegen</b><div class="order-task-add-fields">
   <select class="input" data-new-order-task-name aria-label="Bestaande processtap" required><option value="">Kies een bestaande stap…</option>${steps.map(step=>`<option value="${esc(step.name)}">${esc(stepLabel(step.name))}</option>`).join('')}</select>
   <input class="input" data-new-order-task-machine placeholder="Bijbehorende werkplek" aria-label="Bijbehorende werkplek" readonly>
   <label style="display:flex;align-items:center;gap:5px"><input class="input" type="number" min="1" step="1" value="" required aria-label="Totale duur in minuten" data-new-order-task-duration style="width:76px"><span class="muted">min</span></label>
   <select class="input" data-new-order-task-preferred><option value="">Geen voorkeur</option>${['Ralph','Peter','Kaan','Lance','Shaffi','Youri'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select>
   <select class="input" data-new-order-task-parallel><option value="">Niet parallel</option>${['A','B','C','D'].map(x=>`<option value="${x}">Parallel ${x}</option>`).join('')}</select>
   <button class="btn primary" type="button" data-add-order-task="${esc(o.id)}" disabled>+ Toevoegen</button>
 </div><div class="muted" style="margin-top:7px" data-new-order-task-help>Kies een bestaande processtap.</div></div>
 <h3>Commercieel</h3><div><span data-internal-finance>Kostprijs/st: ${euro(o.costUnit)} · </span>Verkoop/st: ${euro(o.saleUnit)} · Totaal: ${euro(o.totalSale)}</div></div><div class="modalfoot" style="flex-wrap:wrap"><button class="btn" onclick="RALAB_ERP.deleteOrder('${o.id}')">Verwijder order</button><button class="btn" type="button" data-copy-order="${esc(o.id)}">Order kopiëren</button><button class="btn" type="button" data-unplan-order="${esc(o.id)}">Ontplannen</button><button class="btn" type="button" data-order-to-calc="${esc(o.id)}">Terug naar calculatie</button><div class="spacer"></div><button class="btn primary" type="button" data-closeout-order-button="${esc(o.id)}" onclick="RALAB_ORDER_CLOSEOUT?.open('${esc(o.id)}')">Order afgerond</button><button class="btn" type="button" data-order-save-close="${esc(o.id)}">Opslaan en sluiten</button><button class="btn" onclick="RALAB_ERP.orderConfirmation('${o.id}')">Order confirmation</button></div>`;
 if(typeof showModal==='function')showModal(html);else alert(o.orderNo)
}
function saveAndCloseOrder(id){
 const o=S()?.orders?.find(x=>x.id===id&&!x.deleted);if(!o)return false;
 try{save()}catch(e){console.error(e);alert('Opslaan mislukt.');return false}
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{renderOrderOverview()}catch(_){}
 const root=document.getElementById('modalRoot');if(root)root.innerHTML='';
 return true;
}
function saveNeedsCalculationProduct(id){
 const s=S(),o=s?.orders?.find(x=>x.id===id&&!x.deleted);if(!s||!o||!o.needsCalculation)return false;
 const input=document.querySelector('[data-needs-calculation-product="'+CSS.escape(id)+'"]'),product=String(input?.value||'').trim();
 if(!product){alert('Vul een productomschrijving in.');input?.focus();return false}
 const template=(s.productTemplates||[]).filter(t=>productContractKey(t.name)===productContractKey(product)).sort((a,b)=>(Number(b.version)||0)-(Number(a.version)||0))[0];
 o.product=product;o.productTemplateId=template?.id||'';o.updatedAt=new Date().toISOString();
 try{save()}catch(e){console.error(e);alert('Productomschrijving kon niet worden opgeslagen.');return false}
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 renderOrderOverview();openOrder(id);return true;
}
function mutableTask(id){return S()?.tasks?.find(t=>t.id===id&&!t.deleted)||null}
function renumberOrderTasks(orderId){(S()?.tasks||[]).filter(t=>t.orderId===orderId&&!t.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)).forEach((t,i)=>t.seq=i+1)}
async function refreshOrderAfterTaskChange(orderId){
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{save()}catch(e){console.error(e)}

 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 renderOrderOverview();openOrder(orderId);
}
function moveOrderTask(id,dir){
 const t=mutableTask(id);if(!t)return false;
 const list=(S()?.tasks||[]).filter(x=>x.orderId===t.orderId&&!x.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 const i=list.findIndex(x=>x.id===id),j=i+(Number(dir)||0);if(i<0||j<0||j>=list.length)return false;
 const a=list[i],b=list[j],tmp=Number(a.seq)||i+1;a.seq=Number(b.seq)||j+1;b.seq=tmp;
 renumberOrderTasks(t.orderId);
 const o=S()?.orders?.find(x=>x.id===t.orderId);if(o){o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek=''}
 refreshOrderAfterTaskChange(t.orderId);return true;
}
function setOrderTaskPreferred(id,value){
 const t=mutableTask(id);if(!t)return false;t.preferredEmployee=String(value||'').trim()||null;
 const o=S()?.orders?.find(x=>x.id===t.orderId);if(o){o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek=''}
 refreshOrderAfterTaskChange(t.orderId);return true;
}
function setOrderTaskParallel(id,value){
 const t=mutableTask(id);if(!t)return false;t.parallelGroupId=String(value||'').trim();
 const o=S()?.orders?.find(x=>x.id===t.orderId);if(o){o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek=''}
 refreshOrderAfterTaskChange(t.orderId);return true;
}
function setOrderTaskDuration(id,value){
 const t=mutableTask(id);if(!t)return false;const minutes=Math.max(1,Math.round(Number(value)||0));if(!minutes)return false;t.estimate=minutes;
 const o=S()?.orders?.find(x=>x.id===t.orderId);if(o){o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek=''}
 refreshOrderAfterTaskChange(t.orderId);return true;
}
function toggleOrderTaskDone(id){
 const t=mutableTask(id);if(!t)return false;const done=['done','completed'].includes(String(t.status||'').toLowerCase());
 if(done){t.status='open';delete t.completedAt;delete t.completedAtDT}
 else{t.status='done';t.completedAt=iso();t.completedAtDT=new Date().toISOString();t.planSegments=[];t.date=null;t.start='';t.employee=null;t.doneQty=t.doneQty||Number(S()?.orders?.find(o=>o.id===t.orderId)?.qty)||0}
 const o=S()?.orders?.find(x=>x.id===t.orderId);if(o){o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek=''}
 refreshOrderAfterTaskChange(t.orderId);return true;
}
function removeOrderTask(id){
 const t=mutableTask(id);if(!t)return false;if(!confirm('Taak "'+(t.name||'')+'" verwijderen?'))return false;
 t.deleted=true;t.deletedAt=new Date().toISOString();t.planSegments=[];t.date=null;t.start='';t.employee=null;
 renumberOrderTasks(t.orderId);
 const o=S()?.orders?.find(x=>x.id===t.orderId);if(o){o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek=''}
 refreshOrderAfterTaskChange(t.orderId);return true;
}
function addOrderTask(orderId,name,machine,minutes,preferredEmployee,parallelGroupId){
 const s=S(),o=s?.orders?.find(x=>x.id===orderId&&!x.deleted);if(!s||!o)return false;
 name=String(name||'').trim();machine=String(machine||'').trim();
 const step=orderTaskSteps(o).find(op=>op.name===name);if(!step)return alert('Kies een bestaande processtap.');machine=step.machine;
 if(!Number.isFinite(Number(minutes))||Number(minutes)<1)return alert('Vul de totale duur voor deze order in.');
 const list=(s.tasks||[]).filter(t=>t.orderId===orderId&&!t.deleted),seq=list.reduce((m,t)=>Math.max(m,Number(t.seq)||0),0)+1;
 const id='t_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
 const estimate=Math.round(Number(minutes)),unit=step.mode==='unit'&&!o.quantityPending&&Number(o.qty)>0;
 s.tasks.push({id,orderId,seq,name,machine,estimate,sourceOpId:step.id||null,calcMode:unit?'unit':step.mode==='unit'?'batch':step.mode||'batch',orderCalcMinutes:unit?estimate/Number(o.qty):estimate,dependsPrev:seq>1,type:['external','wait'].includes(step.mode)?step.mode:'internal',externalLeadDays:step.mode==='external'?Math.max(1,Math.ceil(estimate/1440)):null,employee:null,preferredEmployee:String(preferredEmployee||'').trim()||null,parallelGroupId:String(parallelGroupId||'').trim(),date:null,start:'',planSegments:[],status:'open',actual:0,doneQty:0,note:''});
 o.weekPlanningUpdatedAt='';o.productionLatestStartDate='';o.productionLatestStartWeek='';
 refreshOrderAfterTaskChange(orderId);return true;
}
function nextStandardOrderNo(){
 const s=S(),d=new Date(),prefix=String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'-';
 let max=0;
 for(const o of s?.orders||[]){const m=String(o.orderNo||'').match(new RegExp('^'+prefix+'(\\d+)$'));if(m)max=Math.max(max,Number(m[1])||0)}
 return prefix+String(max+1).padStart(2,'0');
}
function copyOrder(id){
 const s=S(),src=s?.orders?.find(o=>o.id===id&&!o.deleted);if(!s||!src)return false;
 const root=document.getElementById('modalRoot');if(!root)return false;
 const existingRef=src.customerReference||src.customerRef||src.reference||src.project||'';
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(560px,92vw)"><div class="modalhead"><h3>Order kopiëren</h3></div><div class="modalbody">
   <p><b>${esc(src.orderNo||'')}</b> · ${esc(src.product||'')}</p>
   <label style="display:block;margin-top:10px"><b>Klantreferentie</b><input class="input" type="text" data-copy-customer-reference value="${esc(existingRef)}" placeholder="Klantreferentie" style="width:100%;margin-top:5px"></label>
   <label style="display:block;margin-top:12px"><b>Deadline</b><input class="input" type="date" data-copy-deadline style="width:100%;margin-top:5px"></label>
   <div class="muted" style="margin-top:10px">De nieuwe order krijgt automatisch het volgende standaard ordernummer. Taken, volgorde, werkplekken en duren worden gekopieerd; planning en status niet.</div>
 </div><div class="modalfoot"><button class="btn" type="button" data-copy-cancel>Annuleren</button><div class="spacer"></div><button class="btn primary" type="button" data-copy-confirm="${esc(id)}">Kopiëren</button></div></div></div>`;
 return true;
}
function confirmCopyOrder(id){
 const s=S(),src=s?.orders?.find(o=>o.id===id&&!o.deleted);if(!s||!src)return false;
 const root=document.getElementById('modalRoot'),ref=String(root?.querySelector('[data-copy-customer-reference]')?.value||'').trim(),deadline=root?.querySelector('[data-copy-deadline]')?.value||'';
 if(!deadline)return alert('Kies een deadline.');
 const now=Date.now(),newId='o_'+now,newNo=nextStandardOrderNo(),cloned=structuredClone(src);
 Object.assign(cloned,{
   id:newId,orderNo:newNo,created:iso(),active:true,status:'confirmed',deleted:false,
   customerReference:ref,customerRef:ref,reference:ref,
   communicatedDeadline:deadline,deadline,maximumReadyDate:deadline,internalExpectedDate:'',
   expectedReadyDate:'',expectedReadyWeek:'',weekCapacityReservations:[],
   productionStartWeek:'',productionFinishWeek:'',productionLatestStartDate:'',
   productionLatestStartWeek:'',productionLatestWorkDate:'',weekPlanningUpdatedAt:'',
   planningDecision:'',planningDecisionAt:''
 });
 delete cloned.projectCartNumber;delete cloned.projectCartUpdatedAt;delete cloned.completedAt;delete cloned.deletedAt;delete cloned.productionSequence;delete cloned.packingSlipDraftAt;delete cloned.packingSlipSentAt;delete cloned.packingSlipFailureAt;delete cloned.packingSlipRecipient;delete cloned.packingSlipEvents;
 s.orders.push(cloned);
 const srcTasks=(s.tasks||[]).filter(t=>t.orderId===id&&!t.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 srcTasks.forEach((t,i)=>{
   const nt=structuredClone(t);
   Object.assign(nt,{
     id:'t_'+now+'_'+i,orderId:newId,seq:i+1,status:'open',
     employee:null,date:null,start:'',planSegments:[],actual:0,doneQty:0,note:t.note||''
   });
   delete nt.completedAt;delete nt.completedAtDT;delete nt.deleted;delete nt.deletedAt;
   delete nt.waitStartAt;delete nt.waitEndAt;delete nt.externalSentDate;delete nt.expectedReturnDate;
   delete nt.planningWeek;delete nt.planningSimulatedWeek;delete nt.planningWeekEarly;delete nt.planningLatestStartDate;
   delete nt.planningOrigin;delete nt.lockedPlanning;delete nt.manualPlanning;delete nt.assignedMachine;
   s.tasks.push(nt);
 });
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{save()}catch(e){console.error(e);alert('Kopiëren opslaan mislukt.');return false}
 root.innerHTML='';
 renderOrderOverview();

 openOrder(newId);return true;
}
function deleteOrder(id){
 const o=findOrder(id);if(!o)return false;
 const root=document.getElementById('modalRoot');if(!root)return false;
 const label=(o.orderNo||'deze order')+(o.product?' · '+o.product:'');
 root.innerHTML=`<div class="modalback" data-delete-modal><div class="modal" style="width:min(560px,92vw)"><div class="modalhead"><h3>Order verwijderen</h3></div><div class="modalbody"><p>Weet je zeker dat je order <b>${esc(label)}</b> wilt verwijderen?</p><p class="muted">De bijbehorende planningstaken worden ook verwijderd.</p></div><div class="modalfoot"><button class="btn" type="button" data-delete-cancel>Annuleren</button><button class="btn" type="button" data-delete-confirm="${esc(id)}" style="border-color:#b42318;color:#b42318;font-weight:800">Ja, verwijderen</button></div></div></div>`;
 return true;
}
function confirmDeleteOrder(id){
 const s=S(),o=(s?.orders||[]).find(x=>x.id===id);if(!s||!o){alert('Order kon niet worden gevonden.');return false;}
 o.deleted=true;o.deletedAt=new Date().toISOString();o.active=false;o.status='deleted';o.planningCheckedAt='';
 for(const t of (s.tasks||[]).filter(t=>t.orderId===id)){
   t.deleted=true;t.deletedAt=o.deletedAt;t.date=null;t.start='';t.planSegments=[];t.employee=null;
 }
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 const root=document.getElementById('modalRoot');if(root)root.innerHTML='';
 renderOrderOverview();
 persist();
 return true;
}
function orderConfirmation(id){const s=S(),o=findOrder(id),c=s.customers.find(x=>x.id===o?.customerId);if(!o)return;const proposed=o.communicatedDeadline||o.deadline||((o.internalExpectedDate)?(()=>{const d=new Date(o.internalExpectedDate+'T12:00');d.setDate(d.getDate()+14);return d.toISOString().slice(0,10)})():'');const date=prompt('Gecommuniceerde gereeddatum (harde deadline voor klant)',proposed);if(!date)return;o.communicatedDeadline=date;o.deadline=date;const body=`Dear ${c?.contact||'Customer'},\n\nThank you for your order. Please find our order confirmation below.\n\nOrder: ${o.orderNo}\nCustomer PO: ${o.customerReference||'—'}\nRequested delivery: ${o.requestedDeliveryDate||o.customerReadyDate||'—'}\nProduct: ${o.product}\nQuantity: ${o.qty}\nPrice per unit: ${euro(o.saleUnit)}\nTotal: ${euro(o.totalSale)}\nEstimated ready date: ${date}\n\nKind regards,\nrAlabaster`;s.orderConfirmations.push({id:'oc_'+Date.now(),orderId:o.id,created:iso(),to:'info@ralabaster.com',customerEmail:c?.email||'',communicatedDate:date,body});persist();const w=window.open('','_blank');w.document.write(`<html><head><title>Order Confirmation ${esc(o.orderNo)}</title><style>body{font-family:Arial;max-width:800px;margin:40px auto;line-height:1.5}h1{font-size:24px}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}.right{text-align:right}</style></head><body><h1>ORDER CONFIRMATION</h1><p><b>rAlabaster</b></p><p>Customer: ${esc(c?.name||'')}<br>Attn: ${esc(c?.contact||'')}<br>Order: ${esc(o.orderNo)}<br>Customer PO: ${esc(o.customerReference||'—')}<br>Requested delivery: ${esc(o.requestedDeliveryDate||o.customerReadyDate||'—')}</p><table><tr><td>${esc(o.product)}</td><td>${o.qty} pcs</td><td class="right">${euro(o.saleUnit)}</td><td class="right">${euro(o.totalSale)}</td></tr></table><p><b>Estimated ready date: ${esc(date)}</b></p><p>Thank you for your order.</p><p>Kind regards,<br>rAlabaster</p><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();setTimeout(()=>{location.href=`mailto:info@ralabaster.com?subject=${encodeURIComponent('Order Confirmation – rAlabaster – '+o.orderNo)}&body=${encodeURIComponent(body+'\n\nThe PDF can be attached after saving/printing the opened confirmation.')}`},500)}
function completedPackingStatus(o){
 const format=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):''};
 if(o.packingSlipSentAt)return `<span class="badge ok">Verzonden</span><br><small>${esc(format(o.packingSlipSentAt))}${o.packingSlipRecipient?' · '+esc(o.packingSlipRecipient):''}</small>`;
 if(o.packingSlipFailureAt)return `<span class="badge bad">Verzending mislukt</span><br><small>${esc(format(o.packingSlipFailureAt))}${o.packingSlipRecipient?' · '+esc(o.packingSlipRecipient):''}</small>`;
 if(o.packingSlipDraftAt)return `<span class="badge" style="background:#fff2cf;color:#795500">Concept gemaakt</span><br><small>Nog bevestigen${o.packingSlipRecipient?' · '+esc(o.packingSlipRecipient):''}</small>`;
 return '<span class="badge bad">Niet verzonden</span>';
}
async function renderCompleted(page=completedPage){if(!init())return;completedPage=Math.max(0,+page||0);const root=document.getElementById('view-completed');root.innerHTML='<div class="toolbar"><h2>6. Afgeronde orders</h2></div><div class="panel" style="padding:16px">Laden…</div>';let arr,total=0;if(perf()?.loadArchivedOrders&&perf().isNormalized?.()){try{arr=await perf().loadArchivedOrders(completedPage,PAGE,'');total=arr.total||arr.length;archiveCache=arr}catch(e){console.error(e);arr=[]}}else{const all=(S().orders||[]).filter(o=>!o.deleted&&(o.active===false||o.status==='completed'));total=all.length;const p=pageInfo(total,completedPage);completedPage=p.page;arr=all.slice(p.start,p.end)}root.innerHTML=`<div class="toolbar"><h2>6. Afgeronde orders</h2></div><div class="panel"><table><thead><tr><th>Order</th><th>Klant</th><th>Product</th><th>Aantal</th><th>Gereed</th><th>Rendement</th><th>Pakbonstatus</th><th></th></tr></thead><tbody>${(arr||[]).map(o=>`<tr><td>${esc(o.orderNo)}</td><td>${esc(o.customerName||'')}</td><td>${esc(o.product)}</td><td>${o.qty}</td><td>${esc(o.completedAt||'')}</td><td>${o.yieldPct!=null?Number(o.yieldPct).toFixed(1)+'%':'—'}</td><td>${completedPackingStatus(o)}</td><td>${window.RALAB_DELIVERIES?.controls?.(o)||''}<button class="btn small" type="button" data-print-order="${esc(o.id)}">Print deze order</button> <button class="btn small" onclick="RALAB_ERP.openOrder('${o.id}')">Order bekijken</button> <button class="btn small primary" type="button" data-completed-actions="${esc(o.id)}">Pakbon / nacalculatie</button></td></tr>`).join('')||'<tr><td colspan=8>Nog geen afgeronde orders.</td></tr>'}</tbody></table>${pager(total,completedPage,'RALAB_ERP.renderCompleted')}</div>`}
function renderProducts(page=productPage){if(!init())return;productPage=Math.max(0,+page||0);const root=document.getElementById('view-products'),s=S(),all=s.productTemplates.slice().sort((a,b)=>a.name.localeCompare(b.name)||(+b.version||1)-(+a.version||1)),p=pageInfo(all.length,productPage);productPage=p.page;const arr=all.slice(p.start,p.end);root.innerHTML=`<div class="toolbar"><h2>7. Producten / templates</h2></div><div class="panel"><table><thead><tr><th>Product</th><th>Versie</th><th>Processtappen</th><th>Materiaal</th><th>Marge</th><th>Aangemaakt</th></tr></thead><tbody>${arr.map(t=>`<tr><td><b>${esc(t.name)}</b></td><td>v${t.version||1}</td><td>${(t.ops||[]).length}</td><td>${euro(t.materialCost)} ${t.materialMode==='batch'?'per batch':'per stuk'}</td><td>${t.marginMode==='factor'?'×':t.marginMode==='percent'?'%':'€'} ${t.marginValue}</td><td>${esc(t.created||'')}</td></tr>`).join('')||'<tr><td colspan=6>Nog geen producttemplates.</td></tr>'}</tbody></table>${pager(all.length,productPage,'RALAB_ERP.renderProducts')}</div>`}
// Delegated listeners survive result replacement and handle touch, typing and the search clear button.
function searchOrderOverview(e){const el=e.target.closest?.('#view-orderoverview [data-orderoverview-search]');if(!el)return;const root=el.closest('section'),value=el.value,pos=el.selectionStart??value.length;root.dataset.q=value;renderOrderOverview();const next=root.querySelector('[data-orderoverview-search]');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch(_){}}}
function searchOrders(e){const el=e.target.closest?.('#view-orders [data-order-search]');if(!el)return;const root=el.closest('section');root.dataset.q=el.value;renderOrders(0)}
document.addEventListener('input',e=>{searchOrders(e);searchOrderOverview(e)});
document.addEventListener('search',e=>{searchOrders(e);searchOrderOverview(e)});
document.addEventListener('click',async e=>{if(e.target.closest?.('[data-calculate-delivery]')){e.preventDefault();await refreshEarliestDeliveryDates();return}const load=e.target.closest?.('[data-load-product-route]');if(load){e.preventDefault();loadQuickProductRoute(load.dataset.loadProductRoute);return}const open=e.target.closest?.('[data-overview-stage]');if(open){openOverviewStep(open.dataset.overviewStage);return}const button=e.target.closest?.('[data-overview-stage-save]');if(!button||button.disabled)return;button.disabled=true;button.textContent='Opslaan…';try{await setOverviewCurrentStep(button.dataset.overviewStageSave,document.getElementById('overviewCurrentStep').value,document.getElementById('overviewStageReason').value,document.getElementById('overviewExternalStatus')?.value,document.getElementById('overviewPurchaseStatus')?.value);closeModal();renderOrderOverview()}catch(error){const out=document.getElementById('overviewStageError');if(out)out.textContent='Opslaan niet bevestigd: '+error.message;}finally{button.disabled=false;button.textContent='Huidige stap opslaan'}});
document.addEventListener('change',e=>{if(e.target.matches?.('[data-overview-sort]')){document.getElementById('view-orderoverview').dataset.overviewSort=e.target.value;renderOrderOverview();return}const chosen=e.target.closest?.('[data-new-order-task-name]');if(chosen){updateNewOrderTask(chosen);return}const pref=e.target.closest?.('[data-order-task-preferred]');if(pref){setOrderTaskPreferred(pref.dataset.orderTaskPreferred,pref.value);return}const par=e.target.closest?.('[data-order-task-parallel]');if(par){setOrderTaskParallel(par.dataset.orderTaskParallel,par.value);return}const td=e.target.closest?.('[data-order-task-duration]');if(td){setOrderTaskDuration(td.dataset.orderTaskDuration,td.value);return}const no=e.target.closest?.('#view-orderoverview [data-overview-order-no]');if(no){setOverviewOrderNo(no.dataset.overviewOrderNo,no.value);return}const dl=e.target.closest?.('#view-orderoverview [data-overview-deadline]');if(dl){setOverviewDeadline(dl.dataset.overviewDeadline,dl.value);return}const sq=e.target.closest?.('#view-orderoverview [data-overview-sequence]');if(sq){setOverviewSequence(sq.dataset.overviewSequence,sq.value);return}if(e.target.matches?.('#view-orders [data-order-search]'))return searchOrders(e);const root=e.target.closest?.('#view-orders');if(!root)return;if(e.target.matches('[data-order-sort]'))root.dataset.orderSort=e.target.value;else if(e.target.matches('[data-only-unplanned]'))root.dataset.onlyUnplanned=e.target.checked?'1':'0';else return;renderOrders(0)});
document.addEventListener('keydown',e=>{const no=e.target.closest?.('#view-orderoverview [data-overview-order-no]');if(!no)return;if(e.key==='Enter'){e.preventDefault();no.blur()}else if(e.key==='Escape'){e.preventDefault();renderOrderOverview()}},true);
document.addEventListener('pointerdown',e=>{const dl=e.target.closest?.('#view-orderoverview [data-overview-deadline]');if(!dl)return;e.preventDefault();e.stopPropagation();openDeadlineQuickPick(dl)},true);
document.addEventListener('click',e=>{
 const deleteQuick=e.target.closest?.('[data-delete-quick-order]');if(deleteQuick){e.preventDefault();deleteQuickOrder(deleteQuick.dataset.deleteQuickOrder);return}
 const seqPlan=e.target.closest?.('[data-plan-current-sequence]');if(seqPlan){e.preventDefault();planCurrentSequence(seqPlan);return}
 const saveProduct=e.target.closest?.('[data-save-needs-product]');if(saveProduct){e.preventDefault();saveNeedsCalculationProduct(saveProduct.dataset.saveNeedsProduct);return}
 const saveClose=e.target.closest?.('[data-order-save-close]');if(saveClose){e.preventDefault();saveAndCloseOrder(saveClose.dataset.orderSaveClose);return}
 const contractAdd=e.target.closest?.('[data-contract-add]');if(contractAdd){e.preventDefault();addCustomerProductContract(contractAdd.dataset.contractAdd);return}
 const contractRemove=e.target.closest?.('[data-contract-remove]');if(contractRemove){e.preventDefault();removeCustomerProductContract(contractRemove.dataset.customerId,contractRemove.dataset.contractRemove);return}
 const produce=e.target.closest?.('[data-contract-produce]');if(produce){e.preventDefault();openContractProductionPrompt(produce.dataset.contractProduce,produce.dataset.product);return}
 const stockConfirm=e.target.closest?.('[data-contract-stock-confirm]');if(stockConfirm){e.preventDefault();const qty=document.querySelector('[data-contract-stock-qty]')?.value;if(createContractStockWork(stockConfirm.dataset.customerId,stockConfirm.dataset.product,qty))document.getElementById('modalRoot').innerHTML='';return}
 const cal=e.target.closest?.('[data-deadline-calendar]');if(cal){e.preventDefault();const box=cal.closest('.deadline-quick-pick'),id=box?.dataset.orderId||'',input=document.querySelector('#view-orderoverview [data-overview-deadline="'+CSS.escape(id)+'"]');closeDeadlineQuickPick();if(input){input.focus();try{input.showPicker?.()}catch(_){input.click()}}return}
 const quick=e.target.closest?.('[data-deadline-quick]');if(quick){e.preventDefault();const box=quick.closest('.deadline-quick-pick'),id=box?.dataset.orderId||'';if(id){setOverviewDeadline(id,deadlineFromWeeks(quick.dataset.deadlineQuick));closeDeadlineQuickPick()}return}
 const custom=e.target.closest?.('[data-deadline-custom-apply]');if(custom){e.preventDefault();const box=custom.closest('.deadline-quick-pick'),id=box?.dataset.orderId||'',weeks=box?.querySelector('[data-deadline-custom-weeks]')?.value;if(id&&weeks!==''){setOverviewDeadline(id,deadlineFromWeeks(weeks));closeDeadlineQuickPick()}return}
 if(!e.target.closest?.('.deadline-quick-pick')&&!e.target.closest?.('#view-orderoverview [data-overview-deadline]'))closeDeadlineQuickPick();

 const copyCancel=e.target.closest?.('[data-copy-cancel]');if(copyCancel){e.preventDefault();document.getElementById('modalRoot').innerHTML='';return}
 const copyConfirm=e.target.closest?.('[data-copy-confirm]');if(copyConfirm){e.preventDefault();confirmCopyOrder(copyConfirm.dataset.copyConfirm);return}
 const copy=e.target.closest?.('[data-copy-order]');if(copy){e.preventDefault();copyOrder(copy.dataset.copyOrder);return}
 const move=e.target.closest?.('[data-order-task-move]');if(move){e.preventDefault();moveOrderTask(move.dataset.orderTaskMove,move.dataset.moveDir);return}
 const add=e.target.closest?.('[data-add-order-task]');if(add){e.preventDefault();const root=add.closest('.modalbody')||document;const duration=root.querySelector('[data-new-order-task-duration]');if(duration&&!duration.reportValidity())return;const name=root.querySelector('[data-new-order-task-name]')?.value||'',machine=root.querySelector('[data-new-order-task-machine]')?.value||'',minutes=root.querySelector('[data-new-order-task-duration]')?.value||'',preferred=root.querySelector('[data-new-order-task-preferred]')?.value||'',parallel=root.querySelector('[data-new-order-task-parallel]')?.value||'';addOrderTask(add.dataset.addOrderTask,name,machine,minutes,preferred,parallel);return}
 const toggle=e.target.closest?.('[data-order-task-toggle]');if(toggle){e.preventDefault();toggleOrderTaskDone(toggle.dataset.orderTaskToggle);return}
 const del=e.target.closest?.('[data-order-task-delete]');if(del){e.preventDefault();removeOrderTask(del.dataset.orderTaskDelete);return}
 const star=e.target.closest?.('#view-orders [data-priority-order], #view-orderoverview [data-priority-order]');if(!star||star.disabled)return;e.preventDefault();e.stopPropagation();setOrderPriority(star.dataset.priorityOrder,star.dataset.priorityValue)},true);
window.RALAB_ERP={refreshEarliestDeliveryDates,loadQuickProductRoute,overviewCurrent,overviewFloorCounts,overviewForecast,overviewProgress,openOverviewStep,setOverviewCurrentStep,show,renderQuotes,renderOrders,renderOrderOverview,renderCompleted,renderProducts,renderCustomers,openCustomer,printCustomerOrders,addCustomer,quoteOrder,openOrder,orderConfirmation,deleteOrder,confirmDeleteOrder,deleteQuickOrder,setOrderPriority,setOverviewOrderNo,setOverviewDeadline,setOverviewDeadlineWeeks,setOverviewSequence,setOrderTaskDuration,setOrderTaskPreferred,setOrderTaskParallel,toggleOrderTaskDone,removeOrderTask,addOrderTask,moveOrderTask,copyOrder,confirmCopyOrder,nextStandardOrderNo,saveAndCloseOrder,saveNeedsCalculationProduct,addCustomerProductContract,removeCustomerProductContract,openContractProductionPrompt,createContractStockWork};
const weekStyle=document.createElement('style');weekStyle.textContent='.order-deadline-week{background:#eaf1ed;padding:14px 16px;margin-top:20px;border-radius:8px;color:#173f32}.order-deadline-week .pill{margin-left:8px}.order-deadline-week .muted{margin:0 8px}.order-overview-list .order-deadline-week td{background:#eaf1ed;padding:14px!important}@media(max-width:700px){.order-overview-list tr.order-deadline-week{display:block;background:#eaf1ed;box-shadow:none}.order-overview-list .order-deadline-week td:before{display:none}.order-deadline-week .muted{display:block;margin:4px 0}}';document.head.appendChild(weekStyle);
const priorityStyle=document.createElement('style');priorityStyle.textContent='.order-priority{display:inline-flex;gap:1px;white-space:nowrap}.priority-star{appearance:none;border:0;background:transparent;color:#b8bfbb;font-size:25px;line-height:1;padding:2px;cursor:pointer;touch-action:manipulation}.priority-star.active{color:#d99a00}.priority-star:focus-visible{outline:2px solid #176b55;border-radius:4px}@media(max-width:700px){.priority-star{font-size:29px;padding:4px}}';document.head.appendChild(priorityStyle);
const overviewMobileStyle=document.createElement('style');overviewMobileStyle.textContent='@media(max-width:700px){.order-overview-panel{overflow:visible!important;background:transparent!important;border:0!important;box-shadow:none!important}.order-overview-list{display:block;min-width:0!important}.order-overview-list thead{display:none}.order-overview-list tbody{display:grid;gap:12px}.order-overview-list tr{display:grid;grid-template-columns:1fr 1fr;background:#fff;border:1px solid #dfe4e2;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(20,35,30,.08)}.order-overview-list td{display:block;padding:10px 12px!important;border:0!important;min-width:0}.order-overview-list td:before{content:attr(data-label);display:block;margin-bottom:4px;color:#68716e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}.order-overview-list td:nth-child(3),.order-overview-list td:nth-child(7),.order-overview-list .order-overview-actions{grid-column:1/-1}.order-overview-list .order-overview-actions{display:flex;gap:8px;padding-top:12px!important;border-top:1px solid #e5e9e7!important;background:#f7f9f8}.order-overview-list .order-overview-actions:before{display:none}.order-overview-list .order-overview-actions .btn{min-height:42px;flex:1;white-space:normal}.order-overview-list input[type=date]{width:100%;min-width:0}.order-overview-list td:nth-child(5),.order-overview-list td:nth-child(6){font-size:13px}}';document.head.appendChild(overviewMobileStyle);
setTimeout(()=>{if(!init())return;document.querySelectorAll('.erp-nav').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();show(b.dataset.view)}));},1200);
})();
// Touch-safe modal actions.
document.addEventListener('click',e=>{
 const yes=e.target.closest('[data-delete-confirm]');if(yes){e.preventDefault();e.stopImmediatePropagation();window.RALAB_ERP?.confirmDeleteOrder?.(yes.dataset.deleteConfirm);return}
 const no=e.target.closest('[data-delete-cancel]');if(no){e.preventDefault();e.stopImmediatePropagation();const r=document.getElementById('modalRoot');if(r)r.innerHTML='';return}
 const pr=e.target.closest('[data-customer-print]');if(pr){e.preventDefault();e.stopImmediatePropagation();window.RALAB_ERP?.printCustomerOrders?.(pr.dataset.customerPrint);return}
 const row=e.target.closest('#view-customers tr[data-customer-id]');if(row&&!e.target.closest('button,input,a,select')){e.preventDefault();window.RALAB_ERP?.openCustomer?.(row.dataset.customerId)}
},true);

