// Reliable completed-order documents and follow-up actions for mouse and touch.
(()=>{
const VERSION='20260930-1';
if(window.__ralabCompletedOrderActionsV1Installed)return;
window.__ralabCompletedOrderActionsV1Installed=true;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const minutes=v=>{const n=Math.round(num(v)),sign=n<0?'-':'',a=Math.abs(n),h=Math.floor(a/60),m=a%60;return sign+(h?(h+'u '+String(m).padStart(2,'0')+'m'):(m+' min'))};
const money=v=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
const date=v=>{const s=String(v||'').slice(0,10);if(!s)return'—';const [y,m,d]=s.split('-');return d&&m&&y?`${d}-${m}-${y}`:s};
const dateTime=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'}):'—'};
function S(){try{return state}catch(_){return null}}
function performanceApi(){return window.RALAB_PERFORMANCE||null}
const bundleCache=new Map();let noteTimer=0;
function localBundle(id){const s=S(),o=(s?.orders||[]).find(x=>x.id===id);return o?{order:o,tasks:(s.tasks||[]).filter(t=>t.orderId===id).sort((a,b)=>num(a.seq)-num(b.seq))}:null}
async function bundle(id){const local=localBundle(id);if(local){bundleCache.set(id,local);return local}if(bundleCache.has(id))return bundleCache.get(id);const loaded=await performanceApi()?.loadOrderBundle?.(id);if(!loaded?.order)throw new Error('Afgeronde order niet gevonden.');bundleCache.set(id,loaded);return loaded}
function customerEmail(o){const s=S(),c=(s?.customers||[]).find(x=>x.id===o.customerId);return c?.email||o.customerSnapshot?.email||''}
function stats(tasks){const estimate=tasks.reduce((n,t)=>n+num(t.estimate),0),actual=tasks.reduce((n,t)=>n+num(t.actual),0);return{estimate,actual,difference:actual-estimate}}
function financials(o,tasks){
 const qty=num(o.completedQty||o.qty),costing=o.costing||{},ops=costing.ops||[],key=x=>String(x||'').trim().toLowerCase(),matched=new Set();
 const detail=(tasks||[]).map((t,i)=>{const op=ops.find((x,j)=>!matched.has(j)&&key(x.name)===key(t.name))||ops[i]||{},opIndex=ops.indexOf(op);if(opIndex>=0)matched.add(opIndex);const excluded=['wait','external'].includes(op.mode)||['wait','external'].includes(t.type),rate=excluded?0:num(t.importedRate||op.rate),minutesDifference=num(t.actual)-num(t.estimate),costDifference=minutesDifference/60*rate;return{task:t,rate,minutesDifference,costDifference,priced:excluded||rate>0}});
 const expectedMaterial=num(o.materialCostUnit)*qty||num(costing.materialCost)*(costing.materialMode==='batch'?1:qty),expectedExternal=ops.reduce((n,x)=>n+num(x.externalBatch)+num(x.externalUnit)*qty,0),estimatedLabor=detail.reduce((n,x)=>n+num(x.task.estimate)/60*x.rate,0);
 const budgetCost=num(o.totalCost)||num(o.costUnit)*qty||estimatedLabor+expectedMaterial+expectedExternal,actualMaterial=o.actualMaterialCostTotal==null?expectedMaterial:num(o.actualMaterialCostTotal),actualExternal=o.actualExternalCostTotal==null?expectedExternal:num(o.actualExternalCostTotal),laborDifference=detail.reduce((n,x)=>n+x.costDifference,0),materialDifference=actualMaterial-expectedMaterial,externalDifference=actualExternal-expectedExternal,totalDifference=laborDifference+materialDifference+externalDifference;
 const revenue=num(o.completedRevenue)||num(o.saleUnit)*qty||(num(o.qty)?num(o.totalSale)*qty/num(o.qty):num(o.totalSale)),actualCost=Math.max(0,budgetCost+totalDifference),expectedProfit=revenue-budgetCost,actualProfit=revenue-actualCost,marginPct=revenue?actualProfit/revenue*100:0;
 const causes=detail.filter(x=>Math.abs(x.costDifference)>.004).map(x=>({label:x.task.name||'Processtap',detail:`${minutes(x.minutesDifference)} × ${money(x.rate)}/uur`,effect:x.costDifference,priced:x.priced}));
 if(Math.abs(materialDifference)>.004)causes.push({label:'Materiaal',detail:`werkelijk ${money(actualMaterial)} · begroot ${money(expectedMaterial)}`,effect:materialDifference,priced:true});
 if(Math.abs(externalDifference)>.004)causes.push({label:'Extern / overig',detail:`werkelijk ${money(actualExternal)} · begroot ${money(expectedExternal)}`,effect:externalDifference,priced:true});
 return{qty,revenue,budgetCost,actualCost,expectedProfit,actualProfit,marginPct,totalDifference,expectedMaterial,actualMaterial,expectedExternal,actualExternal,causes:causes.sort((a,b)=>Math.abs(b.effect)-Math.abs(a.effect)),unpriced:detail.filter(x=>!x.priced&&x.minutesDifference).map(x=>x.task.name||'Processtap')};
}
function deliveryStatusHtml(o){
 if(o.packingSlipSentAt)return `<span class="badge ok">Verzonden</span> <b>${esc(dateTime(o.packingSlipSentAt))}</b>${o.packingSlipRecipient?' · '+esc(o.packingSlipRecipient):''}`;
 if(o.packingSlipFailureAt)return `<span class="badge bad">Verzending mislukt</span> ${esc(dateTime(o.packingSlipFailureAt))}${o.packingSlipRecipient?' · '+esc(o.packingSlipRecipient):''}`;
 if(o.packingSlipDraftAt)return `<span class="badge" style="background:#fff2cf;color:#795500">Concept gemaakt</span> ${esc(dateTime(o.packingSlipDraftAt))}${o.packingSlipRecipient?' · '+esc(o.packingSlipRecipient):''}`;
 return '<span class="badge bad">Nog niet verzonden</span>';
}
function actionModal(o,tasks){const s=stats(tasks),yieldText=o.yieldPct!=null?num(o.yieldPct).toLocaleString('nl-NL',{maximumFractionDigits:1})+'%':'—';return `<div data-customer-safe-modal hidden></div><div class="modalhead"><h3>Order afgerond – ${esc(o.orderNo)} – ${esc(o.product)}</h3></div><div class="modalbody"><div class="grid3"><div class="pill"><strong>Aantal</strong><br>${num(o.completedQty||o.qty)}</div><div class="pill" data-internal-finance><strong>Rendement</strong><br>${yieldText}</div><div class="pill" data-internal-finance><strong>Tijd</strong><br>${minutes(s.actual)} werkelijk / ${minutes(s.estimate)} begroot</div></div><div class="notice" style="margin-top:16px"><b>Pakbonstatus</b><div data-packing-status style="margin-top:6px">${deliveryStatusHtml(o)}</div></div><div class="field" style="margin-top:16px"><label for="completedDeliveryNote"><b>Opmerking op pakbon</b></label><textarea id="completedDeliveryNote" class="input" rows="3" data-completed-note="${esc(o.id)}" placeholder="Bijv. deellevering, verpakking of aandachtspunt">${esc(o.deliveryNote||'')}</textarea><div class="muted" data-completed-note-status>Wordt automatisch opgeslagen en op de pakbon gezet.</div></div><div class="field" style="margin-top:16px"><label for="completedCustomerEmail">E-mailadres klant</label><input id="completedCustomerEmail" class="input" type="email" value="${esc(o.packingSlipRecipient||customerEmail(o))}" placeholder="klant@bedrijf.nl"><div class="muted">Na het maken van het Outlook-concept wordt dat geregistreerd. Verstuur het concept in Outlook en bevestig daarna hieronder dat de pakbon is verzonden.</div><div class="muted" data-packing-draft-status role="status"></div></div><div style="margin-top:18px"><b>Wat wil je doen?</b></div><div style="display:grid;gap:10px;margin-top:10px"><button class="btn primary" type="button" data-completed-document="report" data-order-id="${esc(o.id)}">Productierapport / nacalculatie maken</button><button class="btn" type="button" data-completed-document="packing" data-order-id="${esc(o.id)}">Pakbon maken</button><button class="btn primary" type="button" data-packing-outlook="${esc(o.id)}">Outlook-concept met PDF</button><button class="btn" type="button" data-packing-share-pdf="${esc(o.id)}">PDF delen via mailapp</button><button class="btn" type="button" data-packing-mail-pdf="${esc(o.id)}">E-mail openen + PDF downloaden</button><button class="btn" type="button" data-packing-sent="${esc(o.id)}">✓ Markeer pakbon als verzonden</button><button class="btn" type="button" data-packing-failed="${esc(o.id)}">Verzending mislukt / opnieuw proberen</button></div></div><div class="modalfoot"><button class="btn" type="button" data-completed-overview>Terug naar afgeronde orders</button><div class="spacer"></div><button class="btn" type="button" data-completed-close>Sluiten</button></div>`}
async function open(id){
 if(typeof showModal==='function')showModal('<div class="modalhead"><h3>Afgeronde order laden…</h3></div><div class="modalbody"><div class="notice">Gegevens worden opgehaald.</div></div>');
 try{const b=await bundle(id);if(typeof showModal==='function')showModal(actionModal(b.order,b.tasks||[]));return b}catch(err){console.error(err);if(typeof closeModal==='function')closeModal();alert('De afgeronde order kon niet worden geopend.');return null}
}
function documentShell(title,body){return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#202423;margin:0}.actions{margin-bottom:18px}.brand{font-size:25px;font-weight:700;margin-bottom:16px}h1{font-size:23px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px}.muted{color:#68706d}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:20px 0}.meta>div{border-bottom:1px solid #ddd;padding:7px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ccc;padding:8px;text-align:left;vertical-align:top}th{background:#eee}.summary{margin-top:20px;border:1px solid #aaa;padding:12px;line-height:1.6}.finance{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.finance>div{border:1px solid #d8dddb;border-radius:7px;padding:11px}.finance .value{font-size:18px;font-weight:700;margin-top:4px}.good{color:#176b55}.bad{color:#b42318}.cause-table td:last-child,.cause-table th:last-child{text-align:right}.footnote{font-size:10px;color:#68706d;margin-top:8px}@media print{.actions{display:none}.finance>div,.summary,tr{break-inside:avoid}}</style></head><body><div class="actions"><button onclick="print()">Print / opslaan als PDF</button></div><div class="brand">rAlabaster</div>${body}</body></html>`}
function reportHtml(o,tasks){
 const s=stats(tasks),f=financials(o,tasks),rows=tasks.map(t=>`<tr><td>${num(t.seq)||''}</td><td><b>${esc(t.name||'')}</b><br><span class="muted">${esc(t.machine||'')}</span></td><td>${esc(t.employee||'—')}</td><td>${minutes(t.estimate)}</td><td>${minutes(t.actual)}</td><td>${minutes(num(t.actual)-num(t.estimate))}</td><td>${esc(t.consumption||'—')}</td><td>${esc(t.note||'—')}</td></tr>`).join(''),causes=f.causes.map(x=>`<tr><td><b>${esc(x.label)}</b></td><td>${esc(x.detail)}</td><td class="${x.effect>0?'bad':'good'}"><b>${x.effect>0?'-':'+'}${money(Math.abs(x.effect))}</b></td></tr>`).join('');
 return documentShell(`Nacalculatie ${o.orderNo}`,`<h1>Productierapport / nacalculatie</h1><div class="muted">Afgerond ${esc(date(o.completedAt))}</div><div class="meta"><div><b>Order</b><br>${esc(o.orderNo)}</div><div><b>Product</b><br>${esc(o.product)}</div><div><b>Aantal</b><br>${f.qty}</div><div><b>Klant</b><br>${esc(o.customerName||o.customerSnapshot?.company||'—')}</div></div><table><thead><tr><th>#</th><th>Fase / machine</th><th>Wie</th><th>Begroot</th><th>Werkelijk</th><th>Verschil</th><th>Verbruik</th><th>Opmerking</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><b>Tijd:</b> begroot ${minutes(s.estimate)} · werkelijk ${minutes(s.actual)} · verschil ${s.difference>0?'+':''}${minutes(s.difference)}<br><b>Materiaalrendement:</b> ${o.yieldPct!=null?num(o.yieldPct).toLocaleString('nl-NL',{maximumFractionDigits:1})+'%':'—'}${o.materialPricePerKg?` · ${money(o.materialPricePerKg)} per kg · ${money(f.actualMaterial)} werkelijk materiaal`:''}</div><h2>Financiële nacalculatie</h2><div class="finance"><div><span class="muted">Omzet</span><div class="value">${money(f.revenue)}</div></div><div><span class="muted">Begrote kosten</span><div class="value">${money(f.budgetCost)}</div></div><div><span class="muted">Werkelijke kosten</span><div class="value">${money(f.actualCost)}</div></div><div><span class="muted">Begrote brutomarge</span><div class="value">${money(f.expectedProfit)}</div></div><div><span class="muted">Werkelijke brutomarge</span><div class="value ${f.actualProfit>=0?'good':'bad'}">${money(f.actualProfit)}</div></div><div><span class="muted">Werkelijke marge</span><div class="value ${f.marginPct>=0?'good':'bad'}">${f.marginPct.toLocaleString('nl-NL',{maximumFractionDigits:1})}%</div></div></div><h2>Waardoor meer of minder verdiend</h2>${causes?`<table class="cause-table"><thead><tr><th>Oorzaak</th><th>Berekening</th><th>Effect op marge</th></tr></thead><tbody>${causes}</tbody></table>`:'<div class="summary good"><b>Geen financieel verschil ten opzichte van de voorcalculatie.</b></div>'}${f.unpriced.length?`<div class="summary bad"><b>Nog niet volledig geprijsd:</b> voor ${esc(f.unpriced.join(', '))} ontbreekt een uurtarief. Het tijdsverschil daarvan is nog niet in de marge verwerkt.</div>`:''}<div class="footnote">Brutomarge vóór algemene bedrijfskosten, rente en belasting. Tijdsverschillen zijn gewaardeerd met de uurtarieven uit de oorspronkelijke calculatie.</div>`)
}
function packingHtml(o){const customer=o.customerName||o.customerSnapshot?.company||'—',quantity=num(o.completedQty||o.qty),note=esc(o.deliveryNote||'—').replace(/\n/g,'<br>');return documentShell(`Pakbon ${o.orderNo}`,`<h1>Pakbon</h1><div class="meta"><div><b>Ordernummer</b><br>${esc(o.orderNo)}</div><div><b>Datum</b><br>${date(new Date().toISOString())}</div><div><b>Klant</b><br>${esc(customer)}</div><div><b>Project</b><br>${esc(o.project||'—')}</div></div><table><thead><tr><th>Omschrijving</th><th>Aantal</th></tr></thead><tbody><tr><td>${esc(o.product)}</td><td>${quantity}</td></tr></tbody></table><div class="summary"><b>Opmerking:</b><br>${note}</div>`)}
function writeWindow(w,title,html){w.document.open();w.document.write(html);w.document.close();try{w.document.title=title}catch(_){}}
function createDocument(id,type){
 if(type==='report'&&window.RALAB_CUSTOMER_MODE?.active()){alert('Zet klantmodus uit om interne nacalculatie te openen.');return Promise.resolve(false)}
 const w=window.open('','_blank');if(!w){alert('Sta pop-ups toe om het document te openen.');return Promise.resolve(false)}
 writeWindow(w,'Document laden…','<p style="font-family:Arial;padding:24px">Document wordt opgebouwd…</p>');
 return bundle(id).then(b=>{const title=(type==='packing'?'Pakbon ':'Nacalculatie ')+(b.order.orderNo||'');writeWindow(w,title,type==='packing'?packingHtml(b.order):reportHtml(b.order,b.tasks||[]));return true}).catch(err=>{console.error(err);try{w.close()}catch(_){}alert('Het document kon niet worden gemaakt.');return false})
}
async function prepareEmail(id){
 const field=document.getElementById('completedCustomerEmail'),local=localBundle(id)||bundleCache.get(id),to=(field?field.value:customerEmail(local?.order||{})).trim();
 if(!to||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||field&&!field.checkValidity()){alert('Vul eerst een geldig e-mailadres van de klant in.');field?.focus();return ''}
 const documentReady=createDocument(id,'packing');
 try{if(!await documentReady)return '';const b=await bundle(id),o=b.order,subject=`Pakbon ${o.orderNo} – ${o.product}`,body=`Beste,\n\nHierbij de pakbon voor order ${o.orderNo}.\nProduct: ${o.product}\nAantal: ${num(o.completedQty||o.qty)}\n\nMet vriendelijke groet,\nrAlabaster`,href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,a=document.createElement('a');a.href=href;a.style.display='none';document.body.appendChild(a);a.click();a.remove();return href}catch(err){console.error(err);alert('De e-mail kon niet worden voorbereid.');return ''}
}

function noteStatus(text,error=false){const el=document.querySelector('[data-completed-note-status]');if(el){el.textContent=text;el.style.color=error?'#b42318':''}}
function updateNoteDraft(id,value){const local=localBundle(id),cached=bundleCache.get(id),o=local?.order||cached?.order;if(o)o.deliveryNote=value;if(local)bundleCache.set(id,local)}
async function persistNote(id,value){
 updateNoteDraft(id,value);noteStatus('Opslaan…');
 try{
  const local=localBundle(id);
  if(local){if(typeof save==='function')save();performanceApi()?.invalidate?.();noteStatus('Opmerking opgeslagen.');return true}
  const b=await bundle(id);b.order.deliveryNote=value;
  if(typeof supabaseClient==='undefined'||!supabaseClient||typeof cloudUser==='undefined'||!cloudUser)throw new Error('Geen online verbinding');
  const workspace=typeof WORKSPACE_ID==='undefined'?'ralabaster-main':WORKSPACE_ID,now=new Date().toISOString();
  const {error}=await supabaseClient.from('planner_orders_v2').update({data:b.order,updated_at:now}).eq('workspace_id',workspace).eq('order_id',id);if(error)throw error;
  noteStatus('Opmerking opgeslagen.');return true
 }catch(err){console.error('Pakbonopmerking opslaan mislukt',err);noteStatus('Opslaan mislukt. Probeer opnieuw.',true);return false}
}
async function persistDeliveryState(id,change){
 try{
  const b=await bundle(id),o=b.order,now=new Date().toISOString(),data={...change},eventType=data.packingSlipEventType||(data.packingSlipSentAt?'sent':'draft');
  delete data.packingSlipEventType;Object.assign(o,data);
  o.packingSlipEvents=Array.isArray(o.packingSlipEvents)?o.packingSlipEvents:[];
  o.packingSlipEvents.push({type:eventType,at:now,to:o.packingSlipRecipient||''});
  const local=localBundle(id);
  if(local){if(typeof save==='function')save();performanceApi()?.invalidate?.()}
  else{
   if(typeof supabaseClient==='undefined'||!supabaseClient||typeof cloudUser==='undefined'||!cloudUser)throw new Error('Geen online verbinding');
   const workspace=typeof WORKSPACE_ID==='undefined'?'ralabaster-main':WORKSPACE_ID;
   const {error}=await supabaseClient.from('planner_orders_v2').update({data:o,updated_at:now}).eq('workspace_id',workspace).eq('order_id',id);if(error)throw error;
  }
  const status=document.querySelector('[data-packing-status]');if(status)status.innerHTML=deliveryStatusHtml(o);
  return true
 }catch(err){console.error('Pakbonstatus opslaan mislukt',err);alert('De pakbonstatus kon niet worden opgeslagen. Probeer het opnieuw.');return false}
}
function markDeliveryDraft(id,to){return persistDeliveryState(id,{packingSlipDraftAt:new Date().toISOString(),packingSlipFailureAt:null,packingSlipRecipient:String(to||'').trim()})}
async function markDeliverySent(id){
 const field=document.getElementById('completedCustomerEmail'),to=String(field?.value||'').trim();
 if(!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||field&&!field.checkValidity()){alert('Vul eerst een geldig e-mailadres van de klant in.');field?.focus();return false}
 const ok=await persistDeliveryState(id,{packingSlipSentAt:new Date().toISOString(),packingSlipRecipient:to});
 if(ok){const status=document.querySelector('[data-packing-draft-status]');if(status)status.textContent='Verzending geregistreerd.'}
 return ok
}
async function markDeliveryFailed(id){
 const ok=await persistDeliveryState(id,{packingSlipSentAt:null,packingSlipFailureAt:new Date().toISOString(),packingSlipEventType:'failed'});
 if(ok){const status=document.querySelector('[data-packing-draft-status]');if(status)status.textContent='Mislukte verzending geregistreerd. Maak een nieuw Outlook-concept en probeer opnieuw.'}
 return ok
}
function completedOverview(){if(typeof closeModal==='function')closeModal();window.RALAB_ERP?.show?.('completed')}
document.addEventListener('input',e=>{const field=e.target.closest?.('[data-completed-note]');if(!field)return;const id=field.dataset.completedNote;updateNoteDraft(id,field.value);noteStatus('Opslaan…');clearTimeout(noteTimer);noteTimer=setTimeout(()=>persistNote(id,field.value),450)},true);
document.addEventListener('click',e=>{
 const actions=e.target.closest?.('[data-completed-actions]');if(actions){e.preventDefault();e.stopImmediatePropagation();open(actions.dataset.completedActions);return}
 const sent=e.target.closest?.('[data-packing-sent]');if(sent){e.preventDefault();e.stopImmediatePropagation();markDeliverySent(sent.dataset.packingSent);return}
 const failed=e.target.closest?.('[data-packing-failed]');if(failed){e.preventDefault();e.stopImmediatePropagation();markDeliveryFailed(failed.dataset.packingFailed);return}
 const doc=e.target.closest?.('[data-completed-document]');if(doc){e.preventDefault();e.stopImmediatePropagation();createDocument(doc.dataset.orderId,doc.dataset.completedDocument);return}
 const email=e.target.closest?.('[data-completed-email]');if(email){e.preventDefault();e.stopImmediatePropagation();prepareEmail(email.dataset.completedEmail);return}
 if(e.target.closest?.('[data-completed-overview]')){e.preventDefault();e.stopImmediatePropagation();completedOverview();return}
 if(e.target.closest?.('[data-completed-close]')){e.preventDefault();e.stopImmediatePropagation();if(typeof closeModal==='function')closeModal();return}
 const legacy=e.target.closest?.('#modalRoot button[onclick]'),raw=legacy?.getAttribute('onclick')||'';let m=raw.match(/printProductionReport\(['"]([^'"]+)['"]\)/);if(m){e.preventDefault();e.stopImmediatePropagation();createDocument(m[1],'report');return}m=raw.match(/printPackingSlip\(['"]([^'"]+)['"]\)/);if(m){e.preventDefault();e.stopImmediatePropagation();createDocument(m[1],'packing');return}m=raw.match(/emailPackingSlip\(['"]([^'"]+)['"]\)/);if(m){e.preventDefault();e.stopImmediatePropagation();prepareEmail(m[1])}
},true);
window.RALAB_COMPLETED_ORDER_ACTIONS={version:VERSION,open,createDocument,prepareEmail,persistNote,bundle,financials,markDeliveryDraft,markDeliverySent,markDeliveryFailed,deliveryStatusHtml};
})();
