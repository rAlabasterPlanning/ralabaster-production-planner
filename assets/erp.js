// rAlabaster ERP navigatie en orderdossiers — schaalbaar voor grote aantallen orders
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),euro=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(+n||0),iso=()=>{const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const PAGE=60;let orderPage=0,completedPage=0,quotePage=0,productPage=0,archiveCache=[];
function S(){try{return state}catch(_){return null}} function persist(){try{save()}catch(_){}}
function init(){const s=S();if(!s)return false;s.customers=s.customers||[];s.quotes=s.quotes||[];s.productTemplates=s.productTemplates||[];s.orderConfirmations=s.orderConfirmations||[];s.contractStockWork=s.contractStockWork||[];for(const cust of s.customers)cust.productContracts=cust.productContracts||[];return true}
function perf(){return window.RALAB_PERFORMANCE||null}
function taskList(id){const p=perf();return p?.getOrderTasks?p.getOrderTasks(id):((S().tasks||[]).filter(t=>t.orderId===id).sort((a,b)=>(+a.seq||0)-(+b.seq||0)))}
function findOrder(id){const p=perf();return p?.getOrder?p.getOrder(id):(S().orders||[]).find(x=>x.id===id)}
function status(o){const ts=taskList(o.id);if(o.deleted)return'Verwijderd';if(o.active===false||o.status==='completed')return'Afgerond';if(o.waitingMaterial||o.materialStatus==='waiting')return'Wacht op materiaal';if(!ts.length)return'Bevestigd';let done=0,ext=false,busy=false,planned=false;for(const t of ts){if(t.status==='done')done++;if(t.status==='external')ext=true;if(t.status==='in_progress')busy=true;if(t.date||(t.planSegments||[]).length)planned=true}if(done===ts.length)return'Gereed';if(ext)return'Extern';if(busy)return'In productie';if(planned)return'Gepland';return'Nog te plannen'}
function currentStep(o){const ts=taskList(o.id);return ts.find(t=>t.status!=='done')||ts.at(-1)}
function pageInfo(total,page){const pages=Math.max(1,Math.ceil(total/PAGE));page=Math.min(page,pages-1);return {pages,page,start:page*PAGE,end:Math.min(total,(page+1)*PAGE)}}
function pager(total,page,fn){const p=pageInfo(total,page);if(total<=PAGE)return'';return `<div class="toolbar" style="margin-top:12px"><span class="muted">${p.start+1}–${p.end} van ${total}</span><div class="spacer"></div><button class="btn small" ${p.page<=0?'disabled':''} onclick="${fn}(${p.page-1})">← Vorige</button><span class="pill">${p.page+1}/${p.pages}</span><button class="btn small" ${p.page>=p.pages-1?'disabled':''} onclick="${fn}(${p.page+1})">Volgende →</button></div>`}
function show(view){document.querySelectorAll('main>section').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.navbtn').forEach(x=>x.classList.remove('active'));const sec=document.getElementById('view-'+view);if(sec)sec.classList.remove('hidden');document.querySelector(`.navbtn[data-view="${view}"]`)?.classList.add('active');requestAnimationFrame(()=>{if(view==='quotes'&&window.RALAB_QUOTE_INBOX?.render)return window.RALAB_QUOTE_INBOX.render();return({quotes:renderQuotes,orders:renderOrders,orderoverview:renderOrderOverview,completed:renderCompleted,products:renderProducts,customers:renderCustomers}[view]||(()=>{}))()})}
function renderCustomers(){if(!init())return;const root=document.getElementById('view-customers'),s=S(),counts=new Map();for(const o of s.orders||[]){if(o.deleted)continue;const k=o.customerId||'';if(!counts.has(k))counts.set(k,{open:0,done:0});const x=counts.get(k);if(o.active===false||o.status==='completed')x.done++;else x.open++}const q=(root?.dataset.q||'').toLowerCase();const arr=s.customers.filter(c=>!q||[c.name,c.contact,c.email].join(' ').toLowerCase().includes(q)).slice(0,500);root.innerHTML=`<div class="toolbar"><h2>Klanten</h2><div class="spacer"></div><button class="btn primary" onclick="RALAB_ERP.addCustomer()">+ Nieuwe klant</button></div><div class="panel" style="padding:16px"><input class="input" id="custSearch" placeholder="Zoek op klant, contactpersoon of e-mail" oninput="this.closest('section').dataset.q=this.value;RALAB_ERP.renderCustomers()" value="${esc(root.dataset.q||'')}"><table><thead><tr><th>Klant</th><th>Contact</th><th>E-mail</th><th>Lopende orders</th><th>Afgerond</th><th></th></tr></thead><tbody>${arr.map(c=>{const x=counts.get(c.id)||{open:0,done:0};return`<tr data-customer-id="${esc(c.id)}" style="cursor:pointer"><td><b>${esc(c.name)}</b></td><td>${esc(c.contact||'')}</td><td>${esc(c.email||'')}</td><td>${x.open}</td><td>${x.done}</td><td><button class="btn small" type="button" onclick="window.RALAB_COMMERCIAL?.customerForm?.('${c.id}')">Open klant</button></td></tr>`}).join('')||'<tr><td colspan=6>Nog geen klanten.</td></tr>'}</tbody></table></div>`}

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
 </div><div class="modalfoot"><button class="btn" type="button" data-customer-print="${esc(id)}">Print orderlijst</button><div class="spacer"></div><button class="btn" type="button" onclick="closeModal()">Sluiten</button></div></div></div>`;
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
function quoteOrder(id){const s=S(),q=s.quotes.find(x=>x.id===id);if(!q)return;const cust=s.customers.find(c=>c.id===q.customerId);const oid='o_'+Date.now();s.orders.push({id:oid,orderNo:q.orderNo||('ORD-'+Date.now().toString().slice(-6)),customerId:q.customerId,customerName:cust?.name||'',project:q.project||'',product:q.name,qty:q.qty,deadline:q.communicatedDate,internalExpectedDate:q.internalReady,communicatedDeadline:'',deliveryBufferDays:14,costing:structuredClone(q),costUnit:q.costUnit,saleUnit:q.saleUnit,totalSale:q.total,created:iso(),active:true,status:'confirmed'});(q.ops||[]).forEach((o,i)=>s.tasks.push({id:'t_'+Date.now()+'_'+i,orderId:oid,seq:i+1,name:o.name,machine:o.name,estimate:(+o.minutes||0)*(o.mode==='unit'?q.qty:1),dependsPrev:i>0,type:o.mode==='external'?'external':o.mode==='wait'?'wait':'internal',employee:null,date:null,start:'',planSegments:[],status:'open',actual:0,doneQty:0,note:'',externalLeadDays:o.mode==='external'?Math.max(1,Math.ceil((+o.minutes||20160)/1440)):null,expectedExternalCostBatch:o.externalBatch||0,expectedExternalCostUnit:o.externalUnit||0}));q.status='accepted';q.orderId=oid;persist();show('orderoverview')}
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
function nextStepInfo(o){
 const t=taskList(o.id).find(x=>!x.deleted&&!['done','completed'].includes(String(x.status||'').toLowerCase()));
 if(!t)return{task:null,label:'Gereed',days:null,date:''};
 const today=iso(),deadline=o.communicatedDeadline||o.maximumReadyDate||o.deadline||'',lastWork=o.productionLatestWorkDate||(deadline?(()=>{const x=new Date(deadline+'T12:00:00');x.setDate(x.getDate()-7);return x.toISOString().slice(0,10)})():'');
 if(lastWork&&lastWork<today)return{task:t,date:lastWork,days:0,label:'TE LAAT · DIRECT UITVOEREN'};
 const d=t.planningLatestStartDate||o.productionLatestStartDate||taskDueDate(t),days=daysFromToday(d);
 return{task:t,date:d,days,label:days===null?'Week nog niet toegewezen':days<=0?'DIRECT UITVOEREN':days===1?'Uiterlijk over 1 dag':'Uiterlijk over '+days+' dagen'};
}
let earliestDeliveryRun=0;
async function refreshEarliestDeliveryDates(){
 const run=++earliestDeliveryRun,root=document.getElementById('view-orderoverview');if(!root||root.classList.contains('hidden'))return;
 const controls=window.RALAB_ORDER_CONTROLS,cells=[...root.querySelectorAll('[data-earliest-delivery]')];if(!cells.length)return;
 const fallback=new Map((S()?.orders||[]).map(o=>[o.id,plannedReadyDate(o)]));
 if(!controls?.simulateSequentialRemaining){
   for(const cell of cells){const d=fallback.get(cell.dataset.earliestDelivery)||'';cell.innerHTML=d?'<b>'+esc(d)+'</b>':'<span class="muted">Nog berekenen</span>'}
   return;
 }
 try{
   const preview=controls.simulateSequentialRemaining({planningStart:iso()});
   if(run!==earliestDeliveryRun)return;
   const finish=new Map((preview?.orders||[]).map(x=>[x.id,String(x.health?.finish||'').slice(0,10)]));
   for(const cell of cells){
     const id=cell.dataset.earliestDelivery,d=finish.get(id)||fallback.get(id)||'';
     cell.innerHTML=d?'<b>'+esc(d)+'</b>':'<span class="muted">Niet berekend</span>';
   }
 }catch(e){
   console.error('Vroegst uitleveren volgens productievolgorde berekenen mislukt',e);
   for(const cell of cells){const d=fallback.get(cell.dataset.earliestDelivery)||'';cell.innerHTML=d?'<b>'+esc(d)+'</b>':'<span class="muted">Niet berekend</span>'}
 }
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
   show('weeks');
   try{window.renderWeeks?.()}catch(_){}
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
function renderOrderOverview(){
 if(!init())return;
 const root=document.getElementById('view-orderoverview'),s=S();if(!root)return;
 const q=String(root.dataset.q||'').trim().toLowerCase();
 const all=(perf()?.getActiveOrders?perf().getActiveOrders():s.orders.filter(o=>o.active!==false&&o.status!=='completed'&&!o.deleted))
   .filter(o=>!o.isGeneralWork&&!o.isManualTasks&&!o.deleted)
   .filter(o=>!q||[o.orderNo,o.customerName,o.product,o.project].join(' ').toLowerCase().includes(q))
   .slice().sort(orderSortForProduction);
 const groups=new Map();for(const o of all){const k=(o.customerId||o.customerName||'')+'|'+productContractKey(o.product);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o)}
 const batchHints=[];for(const rows of groups.values()){const first=rows[0],cust=(s.customers||[]).find(x=>x.id===first.customerId),contract=(cust?.productContracts||[]).find(x=>productContractKey(x.product)===productContractKey(first.product));if(rows.length>1||contract){const st=contract?contractStats(cust,contract):null;batchHints.push({rows,first,cust,contract,st})}}
 const stockRows=(s.contractStockWork||[]).filter(x=>!x.deleted&&x.status!=='done').filter(x=>!q||[x.customerName,x.product].join(' ').toLowerCase().includes(q));
 const hintsHtml=batchHints.map(h=>`<div class="notice" style="margin-bottom:8px"><b>🔗 ${esc(h.first.product)}</b> · ${h.rows.length} open order(s) · ${h.rows.reduce((n,o)=>n+(Number(o.qty)||0),0)} st.${h.contract?' · contract '+Number(h.contract.contractQty||0)+' st. · nog verwacht '+h.st.remaining+' st.':''}<span style="float:right">${h.contract?'<button class="btn small" type="button" data-contract-produce="'+esc(h.cust.id)+'" data-product="'+esc(h.first.product)+'">Vooruit produceren?</button>':''}</span></div>`).join('');
 const stockHtml=stockRows.length?`<div class="panel" style="padding:10px;margin-bottom:10px"><b>Contractvoorraad / vooruitwerk</b>${stockRows.map(x=>`<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #eee"><span style="flex:1"><b>${esc(x.product)}</b><span class="muted"> · ${esc(x.customerName)} · geen harde deadline</span></span><b>${Number(x.qty)||0} st.</b><span class="pill">mag vooruit</span></div>`).join('')}</div>`:''; 
 root.innerHTML=`<div class="toolbar"><h2>Orderoverzicht</h2><span class="pill">${all.length} actief</span><div class="spacer"></div><button class="btn primary" type="button" data-plan-current-sequence>Plan volgens huidige volgorde</button><button class="btn" onclick="RALAB_ERP.show('calculation')">+ Nieuwe calculatie</button></div>
 ${hintsHtml}${stockHtml}<div class="panel" style="padding:10px;margin-bottom:10px"><input class="input" type="search" data-orderoverview-search placeholder="Zoek ordernummer, klant, product of project" value="${esc(root.dataset.q||'')}" style="width:min(560px,100%)"></div>
 <div class="notice"><b>Productievolgorde:</b> standaard op deadline. Vul alleen een volgordenummer in als je handmatig wilt overrulen. Deadline is direct in de lijst aanpasbaar.</div>
 <div class="panel" style="overflow:auto">
 <table class="order-overview-list" style="min-width:1000px"><thead><tr><th style="width:78px">Volgorde</th><th>Order</th><th>Klant / product</th><th style="width:155px">Deadline</th><th style="width:155px">Vroegst uitleveren</th><th style="width:160px">Uiterlijk starten</th><th>Volgende stap</th><th style="width:80px"></th></tr></thead><tbody>
 ${all.map(o=>{const n=nextStepInfo(o),seq=orderSequenceValue(o)||'',deadline=(o.communicatedDeadline||o.maximumReadyDate||o.deadline||'');return `<tr data-overview-order="${esc(o.id)}">
   <td><input class="input" style="width:68px;text-align:center" type="number" min="1" placeholder="auto" data-overview-sequence="${esc(o.id)}" value="${esc(seq)}"></td>
   <td><button class="btn small" type="button" onclick="RALAB_ERP.openOrder('${o.id}')"><b>${esc(o.orderNo||'')}</b></button></td>
   <td><b>${esc(o.product||'')}</b><div class="muted">${esc(o.customerName||'')} · ${Number(o.qty)||0} st.</div></td>
   <td><input class="input" type="date" data-overview-deadline="${esc(o.id)}" value="${esc(deadline)}"></td>
   <td data-earliest-delivery="${esc(o.id)}"><span class="muted">Berekenen…</span></td>
   <td>${(()=>{const today=iso(),late=o.productionLatestWorkDate&&o.productionLatestWorkDate<today,due=o.productionLatestStartDate&&o.productionLatestStartDate<=today;if(late)return '<b>TE LAAT</b>';if(due)return '<b>DIRECT STARTEN</b>';if(o.productionLatestStartWeek&&o.productionLatestStartDate)return '<b>Week '+esc(String(o.productionLatestStartWeek).slice(-2))+'</b><div class="muted">'+esc(o.productionLatestStartDate)+'</div>';return '<b>Nog berekenen</b>'})()}</td>
   <td><b>${esc(n.task?.name||'Gereed')}</b><div class="muted">${esc(n.task?.machine||'')}</div></td>
   <td><button class="btn small" type="button" onclick="RALAB_ERP.openOrder('${o.id}')">Open</button></td>
 </tr>`}).join('')||'<tr><td colspan="8">Geen actieve orders.</td></tr>'}
 </tbody></table></div>`;
 setTimeout(refreshEarliestDeliveryDates,0);
}
function orderDeadlineValue(o){return o?.communicatedDeadline||o?.maximumReadyDate||o?.deadline||'9999-12-31'}
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
 o.communicatedDeadline=value||'';o.deadline=value||'';o.maximumReadyDate=value||'';o.internalTargetDate=value?(()=>{const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-7);return d.toISOString().slice(0,10)})():'';
 o.planningCheckedAt='';o.weekPlanningUpdatedAt='';try{window.RALAB_PERFORMANCE?.invalidate?.();save()}catch(e){console.error(e);return false}const p=window.RALAB_HYBRID_PLANNER?.ensureWeekAssignments?.(true);if(p?.then)p.then(()=>renderOrderOverview());else renderOrderOverview();return true;
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
 renderOrderOverview();return true;
}
function orderHasUnplannedWork(o){return taskList(o.id).some(t=>{if(['done','completed','external','in_progress','partial','partly'].includes(String(t.status||'').toLowerCase()))return false;if(t.type==='wait')return!(t.waitStartAt&&t.waitEndAt);if(t.type==='external')return!(t.date&&t.expectedReturnDate);return!((t.planSegments||[]).length||t.date)})}
function renderOrders(page=orderPage){
 if(!init())return;orderPage=Math.max(0,+page||0);
 const root=document.getElementById('view-orders'),s=S(),q=(root?.dataset.q||'').trim().toLowerCase(),sort=root?.dataset.orderSort||'deadline-asc',onlyUnplanned=root?.dataset.onlyUnplanned==='1';
 let arr=(perf()?.getActiveOrders?perf().getActiveOrders():s.orders.filter(o=>o.active!==false&&o.status!=='completed')).filter(o=>!o.isGeneralWork&&!o.isManualTasks)
   .filter(o=>!q||[o.orderNo,o.customerName,o.product,o.project].join(' ').toLowerCase().includes(q))
   .filter(o=>!onlyUnplanned||orderHasUnplannedWork(o));
 arr.sort((a,b)=>{const d=orderDeadlineValue(a).localeCompare(orderDeadlineValue(b));return(sort==='deadline-desc'?-d:d)||(a.orderNo||'').localeCompare(b.orderNo||'')});
 const p=pageInfo(arr.length,orderPage);orderPage=p.page;const rows=arr.slice(p.start,p.end);
 const html=`<div class="toolbar"><h2>3. Orders</h2><span class="pill" data-orders-count>${arr.length} actief</span><div class="spacer"></div><button class="btn" type="button" data-unplan-all>Alle orders ontplannen</button><button class="btn primary" type="button" data-plan-remaining>Resterende taken plannen</button><button class="btn" type="button" data-start-review onclick="RALAB_ORDER_CALC_WORKFLOW?.startReview?.()">Nog te controleren / plannen${window.RALAB_ORDER_CALC_WORKFLOW?.reviewCount?(' ('+window.RALAB_ORDER_CALC_WORKFLOW.reviewCount()+')'):''}</button><button class="btn" onclick="RALAB_ERP.show('calculation')">+ Nieuwe order/calculatie</button></div>
 <div class="panel" style="padding:12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input class="input" type="search" data-order-search aria-label="Zoek orders" style="min-width:280px;flex:1" placeholder="Zoek klant, ordernummer, product of project" value="${esc(root.dataset.q||'')}"><label><b>Sorteren:</b> <select class="input" data-order-sort><option value="deadline-asc" ${sort==='deadline-asc'?'selected':''}>Eerste deadline bovenaan</option><option value="deadline-desc" ${sort==='deadline-desc'?'selected':''}>Laatste deadline bovenaan</option></select></label><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-only-unplanned ${onlyUnplanned?'checked':''}> Alleen ongeplande orders</label></div></div>
 <div data-orders-results>${rows.map(o=>{const t=currentStep(o),st=status(o);return`<div class="panel" data-order-card="${esc(o.id)}" style="padding:16px;margin-top:10px"><div class="toolbar"><div><b style="font-size:18px">${esc(o.orderNo)} · ${esc(o.customerName||'')}</b><div>${esc(o.product)} · ${o.qty} st.${o.project?' · '+esc(o.project):''}</div></div><div class="spacer"></div><div><div class="muted" style="text-align:right">Deadlineprioriteit</div>${priorityStars(o)}</div><span class="badge">${esc(st)}</span></div><div class="grid3"><div><b>Nu</b><br>${esc(t?.name||'—')}<br><span class="muted">${esc(t?.machine||'')}</span></div><div><b>Intern verwacht gereed</b><br>${esc(o.internalExpectedDate||'Nog niet berekend')}</div><div><b>Gecommuniceerde deadline</b><br>${esc(o.communicatedDeadline||o.deadline||'Nog niet bevestigd')}</div></div><div style="margin-top:10px"><button class="btn small" onclick="RALAB_ERP.openOrder('${o.id}')">Order openen</button> <button class="btn small primary" type="button" data-plan-order="${esc(o.id)}">Inplannen</button> <button class="btn small" type="button" data-unplan-order="${esc(o.id)}">Ontplannen</button> <button class="btn small" onclick="RALAB_ERP.orderConfirmation('${o.id}')">Order confirmation</button> <button class="btn small" onclick="RALAB_ERP.deleteOrder('${o.id}')" style="margin-left:6px">Verwijder order</button></div></div>`}).join('')||'<div class="panel" style="padding:16px">Geen lopende orders binnen dit filter.</div>'}${pager(arr.length,orderPage,'RALAB_ERP.renderOrders')}</div>`
 const results=root.querySelector('[data-orders-results]');
 if(!results){root.innerHTML=html;return}
 const template=document.createElement('div');template.innerHTML=html;
 results.replaceWith(template.querySelector('[data-orders-results]'));
 root.querySelector('[data-orders-count]').textContent=arr.length+' actief';
 root.querySelector('[data-order-sort]').value=sort;
 root.querySelector('[data-only-unplanned]').checked=onlyUnplanned;
 const review=root.querySelector('[data-start-review]'),nextReview=template.querySelector('[data-start-review]');if(review&&nextReview)review.textContent=nextReview.textContent;
}
async function openOrder(id){
 let o=findOrder(id),ts=o?taskList(id):[];if(!o&&perf()?.loadOrderBundle){try{const b=await perf().loadOrderBundle(id);o=b?.order;ts=b?.tasks||[]}catch(e){console.error(e)}}if(!o)return;
 ts=ts.filter(t=>!t.deleted).slice().sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
 const knownMachines=[...new Set((S()?.tasks||[]).map(t=>String(t.machine||'').trim()).filter(Boolean))].sort();
 const machineList=knownMachines.map(x=>`<option value="${esc(x)}"></option>`).join('');
 const rows=ts.map((t,i)=>{const done=['done','completed'].includes(String(t.status||'').toLowerCase());return `<div data-order-task-row="${esc(t.id)}" style="display:grid;grid-template-columns:82px minmax(190px,1fr) 105px 140px 120px 110px 92px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eee">
   <div style="display:flex;align-items:center;gap:4px"><b style="min-width:22px">${i+1}.</b><button class="btn small" type="button" data-order-task-move="${esc(t.id)}" data-move-dir="-1" ${i===0?'disabled':''} title="Omhoog">↑</button><button class="btn small" type="button" data-order-task-move="${esc(t.id)}" data-move-dir="1" ${i===ts.length-1?'disabled':''} title="Omlaag">↓</button></div>
   <div><b>${esc(t.name||'Taak')}</b><div class="muted">${esc(t.machine||'')}${t.employee?' · '+esc(t.employee):''}${t.date?' · '+esc(t.date):''}</div></div>
   <label style="display:flex;align-items:center;gap:5px"><input class="input" style="width:72px" type="number" min="1" step="1" data-order-task-duration="${esc(t.id)}" value="${Math.max(1,Math.round(Number(t.estimate)||1))}"><span class="muted">min</span></label>
   <select class="input" data-order-task-preferred="${esc(t.id)}" title="Voorkeursmedewerker"><option value="">Geen voorkeur</option>${['Ralph','Peter','Kaan','Lance','Shaffi'].map(x=>`<option value="${x}" ${x===(t.preferredEmployee||'')?'selected':''}>${x}</option>`).join('')}</select>
   <select class="input" data-order-task-parallel="${esc(t.id)}" title="Parallelgroep"><option value="">Niet parallel</option>${['A','B','C','D'].map(x=>`<option value="${x}" ${x===(t.parallelGroupId||'')?'selected':''}>Parallel ${x}</option>`).join('')}</select>
   <button class="btn small ${done?'':'primary'}" type="button" data-order-task-toggle="${esc(t.id)}">${done?'Heropenen':'Klaar'}</button>
   <button class="btn small" type="button" data-order-task-delete="${esc(t.id)}">Verwijderen</button>
 </div>`}).join('');
 const html=`<div class="modalhead"><h3>${esc(o.orderNo)} · ${esc(o.customerName||'')} · ${esc(o.product)}</h3></div><div class="modalbody"><div class="grid3"><div><b>Status</b><br>${status({...o,id:o.id})}</div><div><b>Intern gereed</b><br>${esc(o.internalExpectedDate||'—')}</div><div><b>Klantdeadline</b><br>${esc(o.communicatedDeadline||o.deadline||'—')}</div></div>
 <div style="display:flex;align-items:center;gap:10px;margin-top:18px"><h3 style="margin:0">Proces</h3><span class="pill">${ts.length} taken</span></div>
 <div style="display:grid;grid-template-columns:82px minmax(190px,1fr) 105px 140px 120px 110px 92px;gap:8px;margin-top:8px;padding:0 0 5px;font-size:12px;font-weight:700;color:var(--muted,#667)"><span></span><span>Taak / werkplek</span><span>Duur</span><span>Voorkeursmedewerker</span><span>Parallel</span><span></span><span></span></div><div>${rows||'<div class="muted">Nog geen taken.</div>'}</div>
 <div class="panel" style="padding:10px;margin-top:10px"><b>Taak toevoegen</b><div style="display:grid;grid-template-columns:minmax(170px,1fr) minmax(170px,1fr) 100px 135px 120px auto;gap:8px;margin-top:7px">
   <input class="input" data-new-order-task-name placeholder="Taaknaam">
   <input class="input" list="orderTaskMachineList" data-new-order-task-machine placeholder="Werkplek / machine">
   <label style="display:flex;align-items:center;gap:5px"><input class="input" type="number" min="1" step="1" value="30" data-new-order-task-duration style="width:76px"><span class="muted">min</span></label>
   <select class="input" data-new-order-task-preferred><option value="">Geen voorkeur</option>${['Ralph','Peter','Kaan','Lance','Shaffi'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select>
   <select class="input" data-new-order-task-parallel><option value="">Niet parallel</option>${['A','B','C','D'].map(x=>`<option value="${x}">Parallel ${x}</option>`).join('')}</select>
   <button class="btn primary" type="button" data-add-order-task="${esc(o.id)}">+ Toevoegen</button>
 </div><datalist id="orderTaskMachineList">${machineList}</datalist></div>
 <h3>Commercieel</h3><div>Kostprijs/st: ${euro(o.costUnit)} · Verkoop/st: ${euro(o.saleUnit)} · Totaal: ${euro(o.totalSale)}</div></div><div class="modalfoot" style="flex-wrap:wrap"><button class="btn" onclick="RALAB_ERP.deleteOrder('${o.id}')">Verwijder order</button><button class="btn" type="button" data-copy-order="${esc(o.id)}">Order kopiëren</button><button class="btn" type="button" data-unplan-order="${esc(o.id)}">Ontplannen</button><button class="btn" type="button" data-order-to-calc="${esc(o.id)}">Terug naar calculatie</button><div class="spacer"></div><button class="btn primary" type="button" data-order-save-close="${esc(o.id)}">Opslaan en sluiten</button><button class="btn" onclick="RALAB_ERP.orderConfirmation('${o.id}')">Order confirmation</button></div>`;
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
function mutableTask(id){return S()?.tasks?.find(t=>t.id===id&&!t.deleted)||null}
function renumberOrderTasks(orderId){(S()?.tasks||[]).filter(t=>t.orderId===orderId&&!t.deleted).sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0)).forEach((t,i)=>t.seq=i+1)}
async function refreshOrderAfterTaskChange(orderId){
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{save()}catch(e){console.error(e)}
 try{await window.RALAB_HYBRID_PLANNER?.ensureWeekAssignments?.(true)}catch(e){console.error(e)}
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
 if(!name)return alert('Vul een taaknaam in.');
 if(!machine)return alert('Kies of vul een werkplek / machine in.');
 const list=(s.tasks||[]).filter(t=>t.orderId===orderId&&!t.deleted),seq=list.reduce((m,t)=>Math.max(m,Number(t.seq)||0),0)+1;
 const id='t_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
 s.tasks.push({id,orderId,seq,name,machine,estimate:Math.max(1,Math.round(Number(minutes)||30)),dependsPrev:seq>1,type:'internal',employee:null,preferredEmployee:String(preferredEmployee||'').trim()||null,parallelGroupId:String(parallelGroupId||'').trim(),date:null,start:'',planSegments:[],status:'open',actual:0,doneQty:0,note:''});
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
 delete cloned.completedAt;delete cloned.deletedAt;delete cloned.productionSequence;
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
 try{window.RALAB_HYBRID_PLANNER?.ensureWeekAssignments?.(true)}catch(_){}
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
function orderConfirmation(id){const s=S(),o=findOrder(id),c=s.customers.find(x=>x.id===o?.customerId);if(!o)return;const proposed=o.communicatedDeadline||o.deadline||((o.internalExpectedDate)?(()=>{const d=new Date(o.internalExpectedDate+'T12:00');d.setDate(d.getDate()+14);return d.toISOString().slice(0,10)})():'');const date=prompt('Gecommuniceerde gereeddatum (harde deadline voor klant)',proposed);if(!date)return;o.communicatedDeadline=date;o.deadline=date;const body=`Dear ${c?.contact||'Customer'},\n\nThank you for your order. Please find our order confirmation below.\n\nOrder: ${o.orderNo}\nProduct: ${o.product}\nQuantity: ${o.qty}\nPrice per unit: ${euro(o.saleUnit)}\nTotal: ${euro(o.totalSale)}\nEstimated ready date: ${date}\n\nKind regards,\nrAlabaster`;s.orderConfirmations.push({id:'oc_'+Date.now(),orderId:o.id,created:iso(),to:'info@ralabaster.com',customerEmail:c?.email||'',communicatedDate:date,body});persist();const w=window.open('','_blank');w.document.write(`<html><head><title>Order Confirmation ${esc(o.orderNo)}</title><style>body{font-family:Arial;max-width:800px;margin:40px auto;line-height:1.5}h1{font-size:24px}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}.right{text-align:right}</style></head><body><h1>ORDER CONFIRMATION</h1><p><b>rAlabaster</b></p><p>Customer: ${esc(c?.name||'')}<br>Attn: ${esc(c?.contact||'')}<br>Order: ${esc(o.orderNo)}</p><table><tr><td>${esc(o.product)}</td><td>${o.qty} pcs</td><td class="right">${euro(o.saleUnit)}</td><td class="right">${euro(o.totalSale)}</td></tr></table><p><b>Estimated ready date: ${esc(date)}</b></p><p>Thank you for your order.</p><p>Kind regards,<br>rAlabaster</p><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();setTimeout(()=>{location.href=`mailto:info@ralabaster.com?subject=${encodeURIComponent('Order Confirmation – rAlabaster – '+o.orderNo)}&body=${encodeURIComponent(body+'\n\nThe PDF can be attached after saving/printing the opened confirmation.')}`},500)}
async function renderCompleted(page=completedPage){if(!init())return;completedPage=Math.max(0,+page||0);const root=document.getElementById('view-completed');root.innerHTML='<div class="toolbar"><h2>6. Afgeronde orders</h2></div><div class="panel" style="padding:16px">Laden…</div>';let arr,total=0;if(perf()?.loadArchivedOrders&&perf().isNormalized?.()){try{arr=await perf().loadArchivedOrders(completedPage,PAGE,'');total=arr.total||arr.length;archiveCache=arr}catch(e){console.error(e);arr=[]}}else{const all=(S().orders||[]).filter(o=>!o.deleted&&(o.active===false||o.status==='completed'));total=all.length;const p=pageInfo(total,completedPage);completedPage=p.page;arr=all.slice(p.start,p.end)}root.innerHTML=`<div class="toolbar"><h2>6. Afgeronde orders</h2></div><div class="panel"><table><thead><tr><th>Order</th><th>Klant</th><th>Product</th><th>Aantal</th><th>Gereed</th><th>Rendement</th><th></th></tr></thead><tbody>${(arr||[]).map(o=>`<tr><td>${esc(o.orderNo)}</td><td>${esc(o.customerName||'')}</td><td>${esc(o.product)}</td><td>${o.qty}</td><td>${esc(o.completedAt||'')}</td><td>${o.yieldPct!=null?Number(o.yieldPct).toFixed(1)+'%':'—'}</td><td><button class="btn small" onclick="RALAB_ERP.openOrder('${o.id}')">Order bekijken</button> <button class="btn small primary" type="button" data-completed-actions="${esc(o.id)}">Pakbon / nacalculatie</button></td></tr>`).join('')||'<tr><td colspan=7>Nog geen afgeronde orders.</td></tr>'}</tbody></table>${pager(total,completedPage,'RALAB_ERP.renderCompleted')}</div>`}
function renderProducts(page=productPage){if(!init())return;productPage=Math.max(0,+page||0);const root=document.getElementById('view-products'),s=S(),all=s.productTemplates.slice().sort((a,b)=>a.name.localeCompare(b.name)||(+b.version||1)-(+a.version||1)),p=pageInfo(all.length,productPage);productPage=p.page;const arr=all.slice(p.start,p.end);root.innerHTML=`<div class="toolbar"><h2>7. Producten / templates</h2></div><div class="panel"><table><thead><tr><th>Product</th><th>Versie</th><th>Processtappen</th><th>Materiaal</th><th>Marge</th><th>Aangemaakt</th></tr></thead><tbody>${arr.map(t=>`<tr><td><b>${esc(t.name)}</b></td><td>v${t.version||1}</td><td>${(t.ops||[]).length}</td><td>${euro(t.materialCost)} ${t.materialMode==='batch'?'per batch':'per stuk'}</td><td>${t.marginMode==='factor'?'×':t.marginMode==='percent'?'%':'€'} ${t.marginValue}</td><td>${esc(t.created||'')}</td></tr>`).join('')||'<tr><td colspan=6>Nog geen producttemplates.</td></tr>'}</tbody></table>${pager(all.length,productPage,'RALAB_ERP.renderProducts')}</div>`}
// Delegated listeners survive result replacement and handle touch, typing and the search clear button.
function searchOrderOverview(e){const el=e.target.closest?.('#view-orderoverview [data-orderoverview-search]');if(!el)return;const root=el.closest('section'),value=el.value,pos=el.selectionStart??value.length;root.dataset.q=value;renderOrderOverview();const next=root.querySelector('[data-orderoverview-search]');if(next){next.focus();try{next.setSelectionRange(pos,pos)}catch(_){}}}
function searchOrders(e){const el=e.target.closest?.('#view-orders [data-order-search]');if(!el)return;const root=el.closest('section');root.dataset.q=el.value;renderOrders(0)}
document.addEventListener('input',e=>{searchOrders(e);searchOrderOverview(e)});
document.addEventListener('search',e=>{searchOrders(e);searchOrderOverview(e)});
document.addEventListener('change',e=>{const pref=e.target.closest?.('[data-order-task-preferred]');if(pref){setOrderTaskPreferred(pref.dataset.orderTaskPreferred,pref.value);return}const par=e.target.closest?.('[data-order-task-parallel]');if(par){setOrderTaskParallel(par.dataset.orderTaskParallel,par.value);return}const td=e.target.closest?.('[data-order-task-duration]');if(td){setOrderTaskDuration(td.dataset.orderTaskDuration,td.value);return}const dl=e.target.closest?.('#view-orderoverview [data-overview-deadline]');if(dl){setOverviewDeadline(dl.dataset.overviewDeadline,dl.value);return}const sq=e.target.closest?.('#view-orderoverview [data-overview-sequence]');if(sq){setOverviewSequence(sq.dataset.overviewSequence,sq.value);return}if(e.target.matches?.('#view-orders [data-order-search]'))return searchOrders(e);const root=e.target.closest?.('#view-orders');if(!root)return;if(e.target.matches('[data-order-sort]'))root.dataset.orderSort=e.target.value;else if(e.target.matches('[data-only-unplanned]'))root.dataset.onlyUnplanned=e.target.checked?'1':'0';else return;renderOrders(0)});
document.addEventListener('pointerdown',e=>{const dl=e.target.closest?.('#view-orderoverview [data-overview-deadline]');if(!dl)return;e.preventDefault();e.stopPropagation();openDeadlineQuickPick(dl)},true);
document.addEventListener('click',e=>{
 const seqPlan=e.target.closest?.('[data-plan-current-sequence]');if(seqPlan){e.preventDefault();planCurrentSequence(seqPlan);return}
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
 const add=e.target.closest?.('[data-add-order-task]');if(add){e.preventDefault();const root=add.closest('.modalbody')||document;const name=root.querySelector('[data-new-order-task-name]')?.value||'',machine=root.querySelector('[data-new-order-task-machine]')?.value||'',minutes=root.querySelector('[data-new-order-task-duration]')?.value||30,preferred=root.querySelector('[data-new-order-task-preferred]')?.value||'',parallel=root.querySelector('[data-new-order-task-parallel]')?.value||'';addOrderTask(add.dataset.addOrderTask,name,machine,minutes,preferred,parallel);return}
 const toggle=e.target.closest?.('[data-order-task-toggle]');if(toggle){e.preventDefault();toggleOrderTaskDone(toggle.dataset.orderTaskToggle);return}
 const del=e.target.closest?.('[data-order-task-delete]');if(del){e.preventDefault();removeOrderTask(del.dataset.orderTaskDelete);return}
 const star=e.target.closest?.('#view-orders [data-priority-order], #view-orderoverview [data-priority-order]');if(!star||star.disabled)return;e.preventDefault();e.stopPropagation();setOrderPriority(star.dataset.priorityOrder,star.dataset.priorityValue)},true);
window.RALAB_ERP={show,renderQuotes,renderOrders,renderOrderOverview,renderCompleted,renderProducts,renderCustomers,openCustomer,printCustomerOrders,addCustomer,quoteOrder,openOrder,orderConfirmation,deleteOrder,confirmDeleteOrder,setOrderPriority,setOverviewDeadline,setOverviewDeadlineWeeks,setOverviewSequence,setOrderTaskDuration,setOrderTaskPreferred,setOrderTaskParallel,toggleOrderTaskDone,removeOrderTask,addOrderTask,moveOrderTask,copyOrder,confirmCopyOrder,nextStandardOrderNo,saveAndCloseOrder,addCustomerProductContract,removeCustomerProductContract,openContractProductionPrompt,createContractStockWork};
const priorityStyle=document.createElement('style');priorityStyle.textContent='.order-priority{display:inline-flex;gap:1px;white-space:nowrap}.priority-star{appearance:none;border:0;background:transparent;color:#b8bfbb;font-size:25px;line-height:1;padding:2px;cursor:pointer;touch-action:manipulation}.priority-star.active{color:#d99a00}.priority-star:focus-visible{outline:2px solid #176b55;border-radius:4px}@media(max-width:700px){.priority-star{font-size:29px;padding:4px}}';document.head.appendChild(priorityStyle);
setTimeout(()=>{if(!init())return;document.querySelectorAll('.erp-nav').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();show(b.dataset.view)}));},1200);
})();
// Touch-safe modal actions.
document.addEventListener('click',e=>{
 const yes=e.target.closest('[data-delete-confirm]');if(yes){e.preventDefault();e.stopImmediatePropagation();window.RALAB_ERP?.confirmDeleteOrder?.(yes.dataset.deleteConfirm);return}
 const no=e.target.closest('[data-delete-cancel]');if(no){e.preventDefault();e.stopImmediatePropagation();const r=document.getElementById('modalRoot');if(r)r.innerHTML='';return}
 const pr=e.target.closest('[data-customer-print]');if(pr){e.preventDefault();e.stopImmediatePropagation();window.RALAB_ERP?.printCustomerOrders?.(pr.dataset.customerPrint);return}
 const row=e.target.closest('#view-customers tr[data-customer-id]');if(row&&!e.target.closest('button,input,a,select')){e.preventDefault();window.RALAB_ERP?.openCustomer?.(row.dataset.customerId)}
},true);
