// rAlabaster: snelle orders uitwerken in de normale calculatie en zonder duplicaat omzetten naar productieorder(s).
(()=>{
const VERSION='20261007-1';
let activeQuickOrderId='',opening=false;
let restoring=false;
let selectedOpIds=new Set();
const S=()=>{try{return state}catch(_){return null}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setVal=(id,value)=>{const e=document.getElementById(id);if(e)e.value=value??''};
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
function quickOrder(id=activeQuickOrderId){return S()?.orders?.find(o=>o.id===id&&!o.deleted)||null}
function resetPricing(){const p=window.RALAB_CALC_PRICE;if(!p)return;p.manualByIndex=[];p.tiersByIndex=[];p.includeTiersByIndex=[]}
function contextNotice(o){
 const general=document.getElementById('calcGeneralBlock');if(!general)return;
 document.getElementById('quickCalcContext')?.remove();
 const linked=!!o.customerId,notice=document.createElement('div');notice.id='quickCalcContext';notice.className='notice';notice.style.marginBottom='12px';
 notice.innerHTML=`<b>Snelle order uitwerken in de normale calculatie</b><br>Alleen de eerder ingevoerde gegevens zijn overgenomen. Vul product, processtappen en prijs volledig aan; met <b>Direct order & plannen</b> wordt deze snelle invoer omgezet en ontstaat geen dubbele order.${o.note?`<div style="margin-top:7px"><b>Omschrijving / notitie:</b> ${esc(o.note)}</div>`:''}${linked?'':`<div style="margin-top:7px;color:#9a5a00"><b>Klant nog koppelen:</b> ${esc(o.customerName||'Onbekende klant')}. Kies hierboven een bestaand klantdossier of maak de klant aan.</div>`}${o.quantityPending?'<div style="margin-top:7px;color:#9a5a00"><b>Aantal was nog niet ingevuld.</b> Controleer het standaard aantal 1.</div>':''}`;
 general.insertAdjacentElement('beforebegin',notice);
}
function applyPrefill(o){
 const ui=window.RALAB_CALC_UI;if(!ui)return false;
 const ready=o.customerReadyDate||o.communicatedDeadline||o.deadline||'';
 const product={name:o.product||'',qty:o.quantityPending?1:Math.max(1,Number(o.qty)||1),templateId:'',customerReadyDate:ready,materialCost:0,materialMode:'unit',marginMode:'factor',marginValue:3,ops:[]};
 ui.products=[product];ui.active=0;ui.selectionMode=true;ui.rendered=false;resetPricing();
 window.RALAB_CALC?.render?.();
 setTimeout(()=>{
  setVal('cCustomer',o.customerId||'');setVal('cProject',o.project||'');setVal('cOrder',o.orderNo||'');setVal('cDeadline',ready);
  setVal('cName',product.name);setVal('cQty',product.qty);setVal('cTemplate','');setVal('cProductCustomerDate',ready);setVal('cMaterial',0);setVal('cMaterialMode','unit');setVal('cMarginMode','factor');setVal('cMargin',3);
  document.querySelectorAll('#view-calculation [data-opcheck]').forEach(x=>x.checked=false);
  for(const id of ['cCustomer','cProject','cOrder','cDeadline','cName','cQty','cProductCustomerDate'])document.getElementById(id)?.dispatchEvent(new Event('change',{bubbles:true}));
  contextNotice(o);window.RALAB_CALC_PRICE?.render?.();document.getElementById('calcGeneralBlock')?.scrollIntoView?.({block:'start'});document.getElementById(o.customerId?'cName':'cCustomer')?.focus?.();
 },80);
 return true;
}
function restorePrefillIfRebuilt(o){
 if(restoring||!o?.needsCalculation)return;const name=document.getElementById('cName');if(!name||name.value)return;restoring=true;
 const ui=window.RALAB_CALC_UI,p=ui?.products?.[0]||{},ready=p.customerReadyDate||o.customerReadyDate||o.communicatedDeadline||o.deadline||'';
 setVal('cCustomer',o.customerId||'');setVal('cProject',o.project||'');setVal('cOrder',o.orderNo||'');setVal('cDeadline',ready);setVal('cName',p.name||o.product||'');setVal('cQty',p.qty||1);setVal('cTemplate','');setVal('cProductCustomerDate',ready);
 for(const id of ['cCustomer','cProject','cOrder','cDeadline','cName','cQty','cProductCustomerDate'])document.getElementById(id)?.dispatchEvent(new Event('change',{bubbles:true}));
 restoring=false;
}
function open(id){
 const o=quickOrder(id);if(!o)return alert('Snelle order niet gevonden.');if(!o.needsCalculation)return window.RALAB_ORDER_CALC?.open?.(id);
 activeQuickOrderId=id;selectedOpIds=new Set();opening=true;try{closeModal()}catch(_){}
 try{if(typeof switchView==='function')switchView('calculation');else window.RALAB_ERP?.show?.('calculation')}catch(_){window.RALAB_ERP?.show?.('calculation')}
 try{window.RALAB_CALC?.newCalc?.()}finally{opening=false}
 setTimeout(()=>applyPrefill(o),30);return true;
}
function convertCreated(created){
 const s=S(),quick=quickOrder();if(!s||!quick||!quick.needsCalculation||!created.length)return false;
 const first=created[0],createdId=first.id,quickId=quick.id,product=window.RALAB_CALC_UI?.products?.[0]||{},ready=product.customerReadyDate||document.getElementById('cProductCustomerDate')?.value||document.getElementById('cDeadline')?.value||first.customerReadyDate||first.communicatedDeadline||first.deadline||'',original={id:quick.id,orderNo:quick.orderNo,note:quick.note,created:quick.created,createdAt:quick.createdAt,customerName:quick.customerName};
 Object.assign(quick,structuredClone(first),{id:quickId,note:original.note||first.note||'',created:original.created||first.created,createdAt:original.createdAt||first.createdAt,needsCalculation:false,quantityPending:false,status:'confirmed',calculationCompletedAt:new Date().toISOString(),quickOrderSource:true});
 if(ready){quick.customerReadyDate=ready;quick.communicatedDeadline=ready;quick.deadline=ready}
 if(created.length===1)quick.orderNo=first.orderNo||original.orderNo;else quick.orderNo=first.orderNo||`${original.orderNo}-01`;
 s.orders=s.orders.filter(o=>o.id!==createdId);
 for(const t of s.tasks||[])if(t.orderId===createdId)t.orderId=quickId;
 try{window.RALAB_PERFORMANCE?.invalidate?.()}catch(_){}
 try{save()}catch(e){console.error('Snelle order omzetten mislukt',e);alert('De calculatie is gemaakt, maar het samenvoegen met de snelle order kon niet worden opgeslagen.');return false}
 activeQuickOrderId='';document.getElementById('quickCalcContext')?.remove();setTimeout(()=>window.RALAB_ERP?.show?.('orderoverview'),20);return true;
}
function install(){
 const calc=window.RALAB_CALC;if(!calc)return false;
 if(!calc.__quickOrderCalculationWrapped){
  const oldConfirm=calc.confirmPlan;calc.confirmPlan=function(){const q=quickOrder();if(!q||!q.needsCalculation||!document.getElementById('quickCalcContext'))return oldConfirm.apply(this,arguments);const before=new Set((S()?.orders||[]).map(o=>o.id)),result=oldConfirm.apply(this,arguments),created=(S()?.orders||[]).filter(o=>!before.has(o.id));if(created.length)convertCreated(created);return result};
  const oldNew=calc.newCalc;calc.newCalc=function(){if(!opening){activeQuickOrderId='';document.getElementById('quickCalcContext')?.remove()}return oldNew.apply(this,arguments)};
  calc.__quickOrderCalculationWrapped=true;
 }
 window.RALAB_QUICK_CALC={version:VERSION,open,get activeOrderId(){return activeQuickOrderId}};return true;
}
document.addEventListener('change',e=>{if(e.target.id!=='cCustomer'||!activeQuickOrderId)return;const o=quickOrder(),id=e.target.value,c=S()?.customers?.find(x=>x.id===id);if(o&&id){o.customerId=id;o.customerName=c?.name||o.customerName;o.updatedAt=new Date().toISOString()}},true);
function syncSelectedOps(){const ui=window.RALAB_CALC_UI,p=ui?.products?.[ui.active],root=document.getElementById('view-calculation');if(!p||!root)return;const ops=[];root.querySelectorAll('[data-opcheck]').forEach(cb=>{const id=cb.dataset.opcheck;if(!selectedOpIds.has(id))return;cb.checked=true;const row=cb.closest('tr');ops.push({id,name:row?.querySelector('td:nth-child(2) b')?.textContent?.trim()||id,rate:num(root.querySelector(`[data-rate="${id}"]`)?.value),mode:root.querySelector(`[data-mode="${id}"]`)?.value||'unit',minutes:num(root.querySelector(`[data-minutes="${id}"]`)?.value),externalBatch:num(root.querySelector(`[data-eb="${id}"]`)?.value),externalUnit:num(root.querySelector(`[data-eu="${id}"]`)?.value)})});p.ops=ops}
document.addEventListener('change',e=>{if(!activeQuickOrderId||!e.target.matches?.('[data-opcheck]'))return;const id=e.target.dataset.opcheck;if(e.target.checked)selectedOpIds.add(id);else selectedOpIds.delete(id);syncSelectedOps()},true);
document.addEventListener('click',e=>{if(activeQuickOrderId&&e.target.closest?.('#cuiLoadSteps'))syncSelectedOps()},true);
if(!install())setTimeout(install,500);setTimeout(install,1800);
new MutationObserver(()=>{const o=quickOrder();if(o?.needsCalculation&&!document.getElementById('view-calculation')?.classList.contains('hidden'))requestAnimationFrame(()=>{restorePrefillIfRebuilt(o);syncSelectedOps();if(!document.getElementById('quickCalcContext'))contextNotice(o)})}).observe(document.querySelector('main')||document.body,{subtree:true,childList:true});
})();
