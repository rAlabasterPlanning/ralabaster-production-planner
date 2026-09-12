// rAlabaster: edit an existing production order inside Calculatie without creating a duplicate order.
(()=>{
const VERSION='20260912-7';
let editOrderId='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S=()=>{try{return state}catch(_){return null}};
const uid=()=>`t_edit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const rates={
 'Technisch uitwerken':0,'Verpakking bestellen':30,'Materiaal bestellen':11,'Alabaster klaarzetten':11,
 'Ruw materiaal boren':61,'Doppen lijmen':11,'Mori - Instellen':60,'Mori ZL15 #1':20.5,'Mori ZL15 #2':20.5,'Mori SL25':20.5,
 'Gildemeister':20.5,'Gildemeister - Instellen':60,'Teach-In draaibank - instellen':40,'Teach-In Draaibank (RALAB)':41,
 'Reichenbacher - Instellen':30,'Reichenbacher':26,'KUKA KR210 - Instellen':30,'KUKA KR210':41,'Kawasaki Boorrobot':11,
 'Kolomboormachine':11,'Schuren':26,'Polijsten':26,'Assemblage':11,'Inpakken':11,'Zagen (Wiseco)':16,'Zagen':16
};
function orderById(id){return S()?.orders?.find(o=>o.id===id)||null}
function tasksFor(id){return (S()?.tasks||[]).filter(t=>t.orderId===id).slice().sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0))}
function templateFor(o){const s=S();return s?.productTemplates?.find(t=>t.id===o?.productTemplateId)||s?.productTemplates?.find(t=>String(t.name||'').trim().toLowerCase()===String(o?.product||'').trim().toLowerCase())||null}
function templateOp(o,t){const tpl=templateFor(o);return (tpl?.ops||[]).find(x=>String(x.name||x.workplace||'').trim().toLowerCase()===String(t.name||t.machine||'').trim().toLowerCase())||null}
function taskMode(o,t){if(t.type==='external')return'external';if(t.type==='wait')return'wait';const op=templateOp(o,t);return t.calcMode||op?.mode||'batch'}
function taskMinutes(o,t){const mode=taskMode(o,t),op=templateOp(o,t);if(Number.isFinite(Number(t.orderCalcMinutes)))return Number(t.orderCalcMinutes);if(mode==='unit'&&Number.isFinite(Number(t.estimate)))return (Number(t.estimate)||0)/Math.max(1,Number(o.qty)||1);if(mode==='external'&&Number.isFinite(Number(t.externalLeadDays)))return (Number(t.externalLeadDays)||14)*1440;if(Number.isFinite(Number(t.estimate))&&Number(t.estimate)!==0)return Number(t.estimate);if(op&&Number.isFinite(Number(op.minutes)))return Number(op.minutes);return 0}
function taskRate(o,t){const op=templateOp(o,t);if(Number.isFinite(Number(t.rate)))return Number(t.rate);if(op&&Number.isFinite(Number(op.rate)))return Number(op.rate);return Number(rates[t.machine]??rates[t.name]??0)}
function extUnit(o,t){const op=templateOp(o,t);return Number(t.expectedExternalCostUnit??op?.externalUnit??0)||0}

function parseTimeInput(v,mode='batch'){
 const raw=String(v??'').trim().toLowerCase().replace(',','.');
 if(!raw)return 0;
 const m=raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-z]*)$/i);
 if(!m)return Math.max(0,Number(raw)||0);
 const n=Math.max(0,Number(m[1])||0),u=m[2];
 if(!u||u==='m'||u==='min'||u==='mins'||u==='minuut'||u==='minuten')return n;
 if(u==='u'||u==='h'||u==='uur'||u==='uren')return n*60;
 if(u==='d'||u==='dag'||u==='dagen')return n*((mode==='wait'||mode==='external')?1440:495);
 return n;
}
function fmtEuro(n){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(Number(n)||0)}
function liveSummary(){
 const o=orderById(editOrderId);if(!o)return null;
 const qty=Math.max(1,Number(document.getElementById('ocQty')?.value)||1);
 const sale=Math.max(0,Number(document.getElementById('ocSale')?.value)||0);
 const material=Math.max(0,Number(document.getElementById('ocMaterial')?.value)||0);
 let total=material*qty;
 for(const r of document.querySelectorAll('#ocRows [data-oc-row]')){
   const mode=r.querySelector('[data-oc-mode]')?.value||'batch';
   const mins=parseTimeInput(r.querySelector('[data-oc-min]')?.value,mode);
   const rate=Math.max(0,Number(r.querySelector('[data-oc-rate]')?.value)||0);
   const ext=Math.max(0,Number(r.querySelector('[data-oc-ext]')?.value)||0);
   if(mode==='wait')continue;
   if(mode==='external'){total+=ext*qty;continue}
   const totalMinutes=mode==='unit'?mins*qty:mins;
   total+=totalMinutes/60*rate;
 }
 const costUnit=qty?total/qty:0,totalSale=sale*qty,marginUnit=sale-costUnit,marginTotal=totalSale-total;
 const marginPct=sale>0?(marginUnit/sale*100):0;
 return {qty,costUnit,totalCost:total,saleUnit:sale,totalSale,marginUnit,marginTotal,marginPct};
}
function renderMarginSummary(){
 const x=liveSummary(),el=document.getElementById('ocMarginSummary');if(!x||!el)return;
 el.innerHTML=`<div class="grid3">
   <div><b>Kostprijs / product</b><div style="font-size:22px">${fmtEuro(x.costUnit)}</div></div>
   <div><b>Verkoop / product</b><div style="font-size:22px">${fmtEuro(x.saleUnit)}</div></div>
   <div><b>Marge / product</b><div style="font-size:22px">${fmtEuro(x.marginUnit)} <span class="muted">(${x.marginPct.toFixed(1).replace('.',',')}%)</span></div></div>
   <div><b>Totale kostprijs order</b><div style="font-size:20px">${fmtEuro(x.totalCost)}</div></div>
   <div><b>Totale verkoop order</b><div style="font-size:20px">${fmtEuro(x.totalSale)}</div></div>
   <div><b>Totale marge order</b><div style="font-size:20px">${fmtEuro(x.marginTotal)}</div></div>
 </div>`;
}
function row(t,o,i){const mode=taskMode(o,t),mins=taskMinutes(o,t),done=t.status==='done'||t.status==='completed';return `<tr data-oc-row data-task-id="${esc(t.id)}" data-status="${esc(t.status||'open')}"><td style="white-space:nowrap"><button class="btn small" type="button" data-oc-up title="Omhoog">↑</button> <button class="btn small" type="button" data-oc-down title="Omlaag">↓</button></td><td><input class="input" data-oc-name value="${esc(t.name||'')}"></td><td><input class="input" data-oc-machine value="${esc(t.machine||t.name||'')}"></td><td><select class="input" data-oc-mode><option value="batch" ${mode==='batch'?'selected':''}>1× batch</option><option value="unit" ${mode==='unit'?'selected':''}>per product</option><option value="external" ${mode==='external'?'selected':''}>extern</option><option value="wait" ${mode==='wait'?'selected':''}>wachten 24/7</option></select></td><td><input class="input" data-oc-min type="text" inputmode="text" value="${mins}" placeholder="min / 1,5u / 1d"></td><td><input class="input" data-oc-rate type="number" min="0" step="0.01" value="${taskRate(o,t)}"></td><td><input class="input" data-oc-ext type="number" min="0" step="0.01" value="${extUnit(o,t)}"></td><td>${done?'<span class="badge done">Gereed</span>':`<button class="btn small" type="button" data-oc-delete>Verwijder</button>`}</td></tr>`}
function renderEditor(){
 const o=orderById(editOrderId),root=document.getElementById('view-calculation');if(!o||!root)return;
 root.querySelector('#orderCalcEditor')?.remove();
 const customers=S()?.customers||[],tasks=tasksFor(o.id),ready=o.quotedEstimatedReadyDate||o.communicatedDeadline||o.deadline||'';
 const box=document.createElement('div');box.id='orderCalcEditor';box.className='panel';box.style.cssText='padding:16px;margin-bottom:14px;border:2px solid #6f7773';
 box.innerHTML=`<div class="toolbar"><div><h2 style="margin:0">Ordercalculatie · ${esc(o.orderNo||'')}</h2><div class="muted">Je bewerkt rechtstreeks de bestaande order <b>${esc(o.product||'')}</b>. Opslaan maakt géén nieuwe order.</div>${o.waitingMaterial?'<div style="margin-top:6px"><span class="badge" style="background:#fff1c7;color:#6b4d00">🟠 Wacht op materiaal</span></div>':''}</div><div class="spacer"></div><button class="btn" type="button" data-oc-back>Terug naar order</button><button class="btn" type="button" data-oc-save>Opslaan naar order</button><button class="btn" type="button" data-oc-material>${o.waitingMaterial?'Materiaal binnen':'Wacht op materiaal'}</button><button class="btn primary" type="button" data-oc-save-plan ${o.waitingMaterial?'disabled title="Eerst materiaal binnen melden"':''}>Opslaan en direct inplannen</button></div>
 <div class="grid3" style="margin-top:12px"><div class="field"><label>Klant</label><select class="input" id="ocCustomer"><option value="">— geen klant —</option>${customers.map(c=>`<option value="${esc(c.id)}" ${c.id===o.customerId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Project</label><input id="ocProject" class="input" value="${esc(o.project||'')}"></div><div class="field"><label>Product</label><input id="ocProduct" class="input" value="${esc(o.product||'')}"></div><div class="field"><label>Aantal</label><input id="ocQty" class="input" type="number" min="1" value="${Number(o.qty)||1}"></div><div class="field"><label>Gewenste productiegereed</label><input id="ocReady" class="input" type="date" value="${esc(ready)}"></div><div class="field"><label>Verkoopprijs / product €</label><input id="ocSale" class="input" type="number" min="0" step="0.01" value="${Number(o.saleUnit)||0}"></div><div class="field"><label>Materiaal / product €</label><input id="ocMaterial" class="input" type="number" min="0" step="0.01" value="${Number(o.materialCostUnit??o.costing?.materialCost??0)||0}"></div><div class="field" style="grid-column:span 2"><label><input id="ocUpdateTemplate" type="checkbox"> Ook producttemplate bijwerken voor toekomstige orders</label><div class="muted">Uit = alleen deze order aanpassen.</div></div></div>
 <div style="overflow:auto;margin-top:16px"><div class="toolbar"><h3 style="margin:0">Productiestappen</h3><div class="spacer"></div><button class="btn" type="button" data-oc-add>+ Stap toevoegen</button></div><table><thead><tr><th>Volgorde</th><th>Stap</th><th>Werkplek / machine</th><th>Berekening</th><th>Tijd</th><th>€/uur</th><th>Extern €/stuk</th><th></th></tr></thead><tbody id="ocRows">${tasks.map((t,i)=>row(t,o,i)).join('')}</tbody></table><div class="muted" style="margin-top:8px">Bij <b>per product</b> worden minuten × aantal gerekend. Batch wordt één keer gerekend. Extern gebruikt de minuten als doorlooptijd; 20.160 min = 14 dagen.</div></div>
 <div class="notice" style="margin-top:12px"><b>Na opslaan:</b> open/niet-gestarte stappen van deze order worden opnieuw op volgorde ingepland. Afgeronde en reeds gestarte stappen blijven behouden.</div>`;
 root.prepend(box);renderMarginSummary();box.scrollIntoView({block:'start'});
}
function addRow(){const o=orderById(editOrderId),tbody=document.getElementById('ocRows');if(!o||!tbody)return;const t={id:uid(),name:'Nieuwe stap',machine:'',estimate:0,type:'internal',status:'open'};tbody.insertAdjacentHTML('beforeend',row(t,o,tbody.children.length));}
function parseRows(o){const qty=Math.max(1,Number(document.getElementById('ocQty')?.value)||1);return [...document.querySelectorAll('#ocRows [data-oc-row]')].map((r,i)=>{const mode=r.querySelector('[data-oc-mode]')?.value||'batch',mins=parseTimeInput(r.querySelector('[data-oc-min]')?.value,mode),name=r.querySelector('[data-oc-name]')?.value.trim()||'Stap',machine=r.querySelector('[data-oc-machine]')?.value.trim()||name,old=(S()?.tasks||[]).find(t=>t.id===r.dataset.taskId);const t=old?{...old}:{id:r.dataset.taskId||uid(),orderId:o.id,status:'open',actual:0,doneQty:0,note:'',planSegments:[]};t.seq=i+1;t.dependsPrev=i>0;t.name=name;t.machine=machine;t.calcMode=mode;t.orderCalcMinutes=mins;t.rate=Math.max(0,Number(r.querySelector('[data-oc-rate]')?.value)||0);t.expectedExternalCostUnit=Math.max(0,Number(r.querySelector('[data-oc-ext]')?.value)||0);t.expectedExternalCostBatch=Number(t.expectedExternalCostBatch)||0;t.type=mode==='external'?'external':mode==='wait'?'wait':'internal';t.estimate=mode==='unit'?mins*qty:mode==='external'?0:mins;t.externalLeadDays=mode==='external'?Math.max(1,Math.ceil((mins||20160)/1440)):null;if(!old)t.orderId=o.id;return {...t,__minutes:mins,__mode:mode}})}
function recalcCost(o,rows){const qty=Math.max(1,Number(o.qty)||1),material=Number(o.materialCostUnit)||0;let total=material*qty;for(const t of rows){if(t.__mode==='wait')continue;if(t.__mode==='external'){total+=(Number(t.expectedExternalCostBatch)||0)+(Number(t.expectedExternalCostUnit)||0)*qty;continue}const mins=Number(t.__minutes)||0,totalMinutes=t.__mode==='unit'?mins*qty:mins;total+=totalMinutes/60*(Number(t.rate)||0)}o.costUnit=qty?total/qty:0;o.totalCost=total;o.totalSale=(Number(o.saleUnit)||0)*qty;o.marginUnit=(Number(o.saleUnit)||0)-o.costUnit;o.marginTotal=o.totalSale-total;}
function clearMovableForOrder(rows){for(const t of rows){if(['done','completed','in_progress','partial','partly','external'].includes(String(t.status||'').toLowerCase())||Number(t.actual)>0||Number(t.doneQty)>0||t.lockedPlanning)continue;t.employee=null;t.date=null;t.start='';t.planSegments=[];if(t.type==='external'){t.externalSentDate='';t.expectedReturnDate=''}}}
function updateTemplate(o,rows){if(!document.getElementById('ocUpdateTemplate')?.checked)return;const s=S(),tpl=templateFor(o);const ops=rows.map(t=>({name:t.name,workplace:t.machine,rate:Number(t.rate)||0,minutes:Number(t.__minutes)||0,mode:t.__mode,externalBatch:Number(t.expectedExternalCostBatch)||0,externalUnit:Number(t.expectedExternalCostUnit)||0}));if(tpl){tpl.name=o.product;tpl.ops=ops;tpl.materialMode='unit';tpl.materialCost=Number(o.materialCostUnit)||0;tpl.version=Number(tpl.version)||1;tpl.updated=new Date().toISOString()}else{s.productTemplates=s.productTemplates||[];const n={id:'pt_order_'+Date.now(),name:o.product,version:1,ops,materialMode:'unit',materialCost:Number(o.materialCostUnit)||0,created:new Date().toISOString()};s.productTemplates.push(n);o.productTemplateId=n.id}}
function nextUnplannedOrder(excludeId){const s=S();if(!s)return null;return (s.orders||[]).filter(o=>o.id!==excludeId&&o.active!==false&&o.status!=='completed').filter(o=>{const ts=(s.tasks||[]).filter(t=>t.orderId===o.id);const remaining=ts.filter(t=>!['done','completed'].includes(String(t.status||'').toLowerCase())&&t.type!=='external'&&t.type!=='wait');return remaining.some(t=>!t.date&&!(t.planSegments||[]).length)}).sort((a,b)=>(a.deadline||a.communicatedDeadline||'9999-12-31').localeCompare(b.deadline||b.communicatedDeadline||'9999-12-31')||(a.orderNo||'').localeCompare(b.orderNo||''))[0]||null}
function setWaitingMaterial(on){
 const o=orderById(editOrderId),s=S();if(!o||!s)return false;
 o.waitingMaterial=!!on;
 o.materialStatus=on?'waiting':'available';
 o.planningCheckedAt='';
 o.materialStatusChangedAt=new Date().toISOString();
 if(on){
   clearMovableForOrder((s.tasks||[]).filter(t=>t.orderId===o.id));
 }
 try{save()}catch(e){console.error(e)}
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){ }
 renderEditor();
 return true;
}
function saveOrderCalc(openNext=false){const s=S(),o=orderById(editOrderId);if(!s||!o)return false;o.planningCheckedAt='';const qty=Math.max(1,Number(document.getElementById('ocQty')?.value)||1),customerId=document.getElementById('ocCustomer')?.value||'',customer=s.customers?.find(c=>c.id===customerId),ready=document.getElementById('ocReady')?.value||'';o.customerId=customerId;o.customerName=customer?.name||o.customerName||'';o.project=document.getElementById('ocProject')?.value.trim()||'';o.product=document.getElementById('ocProduct')?.value.trim()||o.product;o.qty=qty;o.saleUnit=Math.max(0,Number(document.getElementById('ocSale')?.value)||0);o.materialCostUnit=Math.max(0,Number(document.getElementById('ocMaterial')?.value)||0);if(ready){o.quotedEstimatedReadyDate=ready;o.communicatedDeadline=ready;o.maximumReadyDate=addDays(ready,14);o.internalTargetDate=addDays(o.maximumReadyDate,-3);o.deadline=o.maximumReadyDate;o.bufferModelVersion=2}
 const rows=parseRows(o);const rowIds=new Set(rows.map(t=>t.id));const keep=(s.tasks||[]).filter(t=>t.orderId!==o.id||rowIds.has(t.id));const map=new Map(rows.map(t=>[t.id,t]));s.tasks=keep.map(t=>map.has(t.id)?map.get(t.id):t);for(const t of rows)if(!s.tasks.some(x=>x.id===t.id))s.tasks.push(t);for(const t of rows){delete t.__minutes;delete t.__mode}
 const rowsForCalc=parseRows(o);recalcCost(o,rowsForCalc);updateTemplate(o,rowsForCalc);for(const t of rowsForCalc){const real=s.tasks.find(x=>x.id===t.id);if(real){real.calcMode=t.__mode;real.rate=t.rate}}
 clearMovableForOrder(s.tasks.filter(t=>t.orderId===o.id));
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){ }
 if(!o.waitingMaterial){try{window.RALAB_DEADLINE_PLANNER?.normalizeSequences?.();window.RALAB_DEADLINE_PLANNER?.planOrderStrict?.(o,{allowPeter:false,allowSaturday:false})}catch(e){console.warn('Order opnieuw plannen is overgeslagen',e)}}
 try{save()}catch(e){console.error(e)}
 if(openNext){const next=nextUnplannedOrder(o.id);if(next){openInCalculation(next.id);return true}alert('Alle actieve orders zijn ingepland.');try{if(typeof window.switchView==='function')window.switchView('today');else window.RALAB_ERP?.show?.('today')}catch(_){ }return true}
 alert('Order en productiestappen zijn bijgewerkt. De resterende planning is opnieuw berekend.');renderEditor();return true;
}
function openInCalculation(id){const o=orderById(id);if(!o)return alert('Order niet gevonden.');editOrderId=id;try{closeModal()}catch(_){ }try{switchView('calculation')}catch(_){document.querySelectorAll('section[id^="view-"]').forEach(x=>x.classList.add('hidden'));document.getElementById('view-calculation')?.classList.remove('hidden')};try{window.RALAB_CALC?.render?.()}catch(_){ }setTimeout(renderEditor,0)}
function back(){const id=editOrderId;editOrderId='';try{switchView('orders')}catch(_){window.RALAB_ERP?.show?.('orders')}setTimeout(()=>{try{openOrder(id)}catch(_){ }},30)}
function injectOrderButton(id){const foot=document.querySelector('#modalRoot .modalfoot'),head=document.querySelector('#modalRoot .modalhead');if(!foot||!head||foot.querySelector('[data-order-to-calc]'))return;const b=document.createElement('button');b.className='btn primary';b.type='button';b.dataset.orderToCalc=id;b.textContent='Naar calculatie';foot.prepend(b)}
function install(){if(typeof window.openOrder!=='function'||!window.RALAB_CALC)return setTimeout(install,200);if(window.__ralabOrderCalcBridgeInstalled)return;window.__ralabOrderCalcBridgeInstalled=true;const old=window.openOrder;window.openOrder=function(id){const r=old.apply(this,arguments);setTimeout(()=>injectOrderButton(id),0);return r};document.addEventListener('input',e=>{if(e.target.closest('#orderCalcEditor'))renderMarginSummary()},true);document.addEventListener('change',e=>{if(e.target.closest('#orderCalcEditor'))renderMarginSummary()},true);document.addEventListener('click',e=>{const to=e.target.closest('[data-order-to-calc]');if(to){e.preventDefault();openInCalculation(to.dataset.orderToCalc);return}if(e.target.closest('[data-oc-back]')){e.preventDefault();back();return}if(e.target.closest('[data-oc-save-plan]')){e.preventDefault();saveOrderCalc(true);return}if(e.target.closest('[data-oc-save]')){e.preventDefault();saveOrderCalc(false);return}if(e.target.closest('[data-oc-material]')){e.preventDefault();const o=orderById(editOrderId);setWaitingMaterial(!o?.waitingMaterial);return}if(e.target.closest('[data-oc-add]')){e.preventDefault();addRow();return}const del=e.target.closest('[data-oc-delete]');if(del){e.preventDefault();del.closest('[data-oc-row]')?.remove();return}const up=e.target.closest('[data-oc-up]');if(up){e.preventDefault();const r=up.closest('[data-oc-row]');r?.previousElementSibling?.before(r);return}const down=e.target.closest('[data-oc-down]');if(down){e.preventDefault();const r=down.closest('[data-oc-row]'),n=r?.nextElementSibling;if(n)n.after(r);return}},true);window.RALAB_ORDER_CALC={version:VERSION,open:openInCalculation,save:saveOrderCalc}}
setTimeout(install,1400);
})();