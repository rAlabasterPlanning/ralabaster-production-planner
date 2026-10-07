// rAlabaster: change an accepted order to another quoted quantity tier.
(()=>{
const VERSION='20261007-1';
const S=()=>{try{return state}catch(_){return null}};
const num=v=>Number(String(v??0).replace(',','.'))||0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(num(v));
const norm=v=>String(v||'').trim().toLowerCase();
const order=id=>(S()?.orders||[]).find(o=>o.id===id&&!o.deleted);
const orderTasks=id=>(S()?.tasks||[]).filter(t=>t.orderId===id&&!t.deleted);

function quoteFor(o){
 const quotes=S()?.quotes||[];
 return quotes.find(q=>q.orderId===o.id)
   ||quotes.find(q=>(q.quoteNo||q.orderNo)===o.sourceQuoteNo&&norm(q.name)===norm(o.product))
   ||quotes.find(q=>(q.quoteNo||q.orderNo)===o.sourceQuoteNo)
   ||o.costing||null;
}
function tiersFor(o){
 const q=quoteFor(o),raw=Array.isArray(q?.priceTiers)?q.priceTiers:[];
 const rows=raw.filter(t=>q?.tierVisibility?.[String(Math.round(num(t.qty)))]!==false).map(t=>({qty:Math.max(1,Math.round(num(t.qty))),saleUnit:Math.max(0,num(t.saleUnit))})).filter(t=>t.qty&&Number.isFinite(t.saleUnit));
 if(!rows.some(t=>t.qty===Math.round(num(o.qty))))rows.push({qty:Math.max(1,Math.round(num(o.qty))),saleUnit:Math.max(0,num(o.saleUnit))});
 return [...new Map(rows.map(t=>[t.qty,t])).values()].sort((a,b)=>a.qty-b.qty);
}
function sourceOp(o,t){
 const ops=quoteFor(o)?.ops||o.costing?.ops||[];
 return ops.find(x=>norm(x.name||x.workplace)===norm(t.name||t.machine))||null;
}
function modeFor(o,t){const op=sourceOp(o,t);return t.calcMode||op?.mode||(t.type==='external'?'external':t.type==='wait'?'wait':'batch')}
function minutesFor(o,t,oldQty){
 const op=sourceOp(o,t),mode=modeFor(o,t);
 if(Number.isFinite(Number(t.orderCalcMinutes)))return num(t.orderCalcMinutes);
 if(Number.isFinite(Number(op?.minutes)))return num(op.minutes);
 return mode==='unit'?num(t.estimate)/Math.max(1,oldQty):num(t.estimate);
}
function hasStarted(id){return orderTasks(id).some(t=>['done','completed','in_progress','partial','partly'].includes(String(t.status||'').toLowerCase())||num(t.actual)>0||num(t.doneQty)>0)}
function plannedCount(id){return orderTasks(id).filter(t=>t.date||(t.planSegments||[]).length).length}

function injectButton(){
 const foot=document.querySelector('#modalRoot .modalfoot'),anchor=foot?.querySelector('[data-order-to-calc]');
 if(!foot||!anchor||foot.querySelector('[data-order-tier-adjust]'))return;
 const o=order(anchor.dataset.orderToCalc);if(!o||tiersFor(o).length<2)return;
 const b=document.createElement('button');b.className='btn';b.type='button';b.dataset.orderTierAdjust=o.id;b.textContent='Aantal / staffel wijzigen';
 anchor.before(b);
}
function open(id){
 const o=order(id);if(!o)return alert('Order niet gevonden.');
 const tiers=tiersFor(o),root=document.getElementById('modalRoot');
 if(!tiers.length)return alert('Bij deze order is geen staffel uit de offerte gevonden.');
 const current=Math.round(num(o.qty)),started=hasStarted(id),planned=plannedCount(id);
 root.innerHTML=`<div class="modalback"><div class="modal" style="width:min(680px,94vw)"><div class="modalhead"><div><h3 style="margin:0">Aantal / staffel wijzigen</h3><div class="muted">${esc(o.orderNo||'')} · ${esc(o.product||'')}</div></div></div><div class="modalbody">
 <div class="notice"><b>Huidige order:</b> ${current} stuks à ${money(o.saleUnit)} = ${money(num(o.saleUnit)*current)}</div>
 ${started?'<div class="notice" style="border-color:#b42318;background:#fff4f2;color:#8f1d14"><b>Productie is al gestart.</b> Pas het aantal via de calculatie aan, zodat gereed werk behouden blijft.</div>':''}
 <div class="field" style="margin-top:14px"><label>Kies het nieuwe totale aantal volgens de offerte</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:7px">${tiers.map(t=>`<label class="panel" style="padding:12px;cursor:${started?'not-allowed':'pointer'};border:${t.qty===current?'2px solid #247a5a':'1px solid #d4d8d6'}"><input type="radio" name="orderTierQty" value="${t.qty}" data-sale="${t.saleUnit}" ${t.qty===current?'checked':''} ${started?'disabled':''}> <b>${t.qty} stuks</b><br><span>${money(t.saleUnit)} / stuk</span><br><span class="muted">Totaal ${money(t.qty*t.saleUnit)}</span></label>`).join('')}</div></div>
 <div data-tier-preview class="notice" style="margin-top:14px"></div>
 ${planned&&!started?`<div class="muted" style="margin-top:10px">Deze order heeft ${planned} ingeplande stap(pen). Die planning wordt leeggemaakt, omdat de benodigde productietijd verandert. Daarna kun je de order opnieuw inplannen.</div>`:''}
 </div><div class="modalfoot"><button class="btn" type="button" data-tier-cancel="${esc(id)}">Annuleren</button><div class="spacer"></div>${started?`<button class="btn primary" type="button" data-tier-to-calc="${esc(id)}">Open calculatie</button>`:`<button class="btn primary" type="button" data-tier-apply="${esc(id)}">Aantal wijzigen</button>`}</div></div></div>`;
 preview(id);
}
function selected(){const x=document.querySelector('input[name="orderTierQty"]:checked');return x?{qty:Math.round(num(x.value)),saleUnit:num(x.dataset.sale)}:null}
function preview(id){
 const o=order(id),x=selected(),el=document.querySelector('[data-tier-preview]');if(!o||!x||!el)return;
 const diff=x.qty-Math.round(num(o.qty));
 el.innerHTML=`<b>Nieuwe order:</b> ${x.qty} stuks à ${money(x.saleUnit)} = <b>${money(x.qty*x.saleUnit)}</b><br><span class="muted">Dit vervangt het huidige aantal ${Math.round(num(o.qty))}; verschil ${diff>=0?'+':''}${diff} stuks.</span>`;
}
function recalc(o,tasks){
 const q=o.costing||quoteFor(o)||{},qty=Math.max(1,num(o.qty)),material=num(o.materialCostUnit??q.materialCost),materialMode=q.materialMode||'unit';
 let total=material*(materialMode==='batch'?1:qty);
 for(const t of tasks){const mode=modeFor(o,t),mins=num(t.orderCalcMinutes),op=sourceOp(o,t);if(mode==='wait')continue;if(mode==='external'){total+=num(t.expectedExternalCostBatch??op?.externalBatch)+num(t.expectedExternalCostUnit??op?.externalUnit)*qty;continue}total+=(mode==='unit'?mins*qty:mins)/60*num(t.rate??op?.rate)}
 o.costUnit=total/qty;o.totalCost=total;o.totalSale=num(o.saleUnit)*qty;o.marginUnit=num(o.saleUnit)-o.costUnit;o.marginTotal=o.totalSale-total;
}
function apply(id){
 const s=S(),o=order(id),choice=selected();if(!s||!o||!choice)return;
 if(hasStarted(id))return alert('Productie is al gestart. Open de calculatie om het aantal gecontroleerd aan te passen.');
 const oldQty=Math.max(1,Math.round(num(o.qty))),oldSale=num(o.saleUnit),tasks=orderTasks(id);
 if(choice.qty===oldQty&&choice.saleUnit===oldSale)return alert('Dit is al het huidige aantal en de huidige staffelprijs.');
 for(const t of tasks){const mode=modeFor(o,t),mins=minutesFor(o,t,oldQty);t.calcMode=mode;t.orderCalcMinutes=mins;if(mode==='unit')t.estimate=mins*choice.qty;else if(mode==='external')t.estimate=0;else t.estimate=mins;t.employee=null;t.date=null;t.start='';t.planSegments=[];delete t.planningWeek;delete t.planningOrigin}
 Object.assign(o,{qty:choice.qty,saleUnit:choice.saleUnit,planningCheckedAt:'',weekPlanningUpdatedAt:'',internalExpectedDate:'',quantityChangedAt:new Date().toISOString(),quantityChangeSource:'quoted_tier'});
 o.quantityHistory=Array.isArray(o.quantityHistory)?o.quantityHistory:[];o.quantityHistory.push({fromQty:oldQty,toQty:choice.qty,fromSaleUnit:oldSale,toSaleUnit:choice.saleUnit,at:o.quantityChangedAt,source:'quoted_tier'});
 if(o.costing){o.costing.qty=choice.qty;o.costing.saleUnit=choice.saleUnit;o.costing.total=choice.qty*choice.saleUnit}
 recalc(o,tasks);
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{save()}catch(e){console.error(e);return alert('De wijziging kon niet worden opgeslagen: '+(e?.message||e))}
 try{window.RALAB_ERP?.renderOrderOverview?.()}catch(_){}
 window.RALAB_ERP?.openOrder?.(id);
 alert(`Order aangepast naar ${choice.qty} stuks à ${money(choice.saleUnit)}. De productieaantallen zijn opnieuw berekend${tasks.some(t=>!t.date)?' en de order kan opnieuw worden ingepland':''}.`);
}
function toCalc(id){document.getElementById('modalRoot').innerHTML='';window.RALAB_ORDER_CALC?.open?.(id)}
document.addEventListener('click',e=>{const a=e.target.closest?.('[data-order-tier-adjust]');if(a){e.preventDefault();open(a.dataset.orderTierAdjust);return}const c=e.target.closest?.('[data-tier-cancel]');if(c){e.preventDefault();window.RALAB_ERP?.openOrder?.(c.dataset.tierCancel);return}const p=e.target.closest?.('[data-tier-apply]');if(p){e.preventDefault();apply(p.dataset.tierApply);return}const x=e.target.closest?.('[data-tier-to-calc]');if(x){e.preventDefault();toCalc(x.dataset.tierToCalc)}},true);
document.addEventListener('change',e=>{if(e.target.matches?.('input[name="orderTierQty"]')){const id=document.querySelector('[data-tier-apply],[data-tier-to-calc]')?.dataset.tierApply||document.querySelector('[data-tier-to-calc]')?.dataset.tierToCalc;preview(id)}},true);
function install(){
 if(!window.RALAB_ERP?.openOrder)return setTimeout(install,200);
 if(window.__ralabOrderTierInstalled)return;
 window.__ralabOrderTierInstalled=true;
 const base=window.RALAB_ERP.openOrder;
 window.RALAB_ERP.openOrder=function(id){const result=base.apply(this,arguments);setTimeout(injectButton,0);return result};
}
install();
window.RALAB_ORDER_TIER={version:VERSION,open,apply,tiersFor,injectButton};
})();
