// rAlabaster: reopen an existing quotation in the calculator and update it in place.
(()=>{
const VERSION='20260923-1';
let editingQuoteNo='';
if(!window.CSS)window.CSS={};if(typeof window.CSS.escape!=='function')window.CSS.escape=value=>String(value).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c);
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(e){console.error(e)}}
function quoteLines(no){return(S()?.quotes||[]).filter(q=>String(q.quoteNo||q.orderNo||q.id)===String(no)).sort((a,b)=>(a.lineNo||0)-(b.lineNo||0))}
function setVal(id,value){const el=document.getElementById(id);if(el)el.value=value??''}
function calcProduct(q){return{name:q.name||'',qty:Math.max(1,num(q.qty)||1),templateId:q.templateId||'',materialCost:num(q.materialCost),materialMode:q.materialMode||'unit',marginMode:q.marginMode||'factor',marginValue:q.marginValue??3,ops:structuredClone(q.ops||[])}}
function applyProduct(p){
 setVal('cName',p.name);setVal('cQty',p.qty);setVal('cTemplate',p.templateId||'');setVal('cMaterial',p.materialCost);setVal('cMaterialMode',p.materialMode);setVal('cMarginMode',p.marginMode);setVal('cMargin',p.marginValue);
 const root=document.getElementById('view-calculation'),rows=[...(root?.querySelectorAll('[data-opcheck]')||[])];
 for(const cb of rows){const id=cb.dataset.opcheck,name=cb.closest('tr')?.querySelector('td:nth-child(2) b')?.textContent?.trim(),op=(p.ops||[]).find(x=>x.id===id||x.name===name);cb.checked=!!op;if(op){for(const [key,value] of [['rate',op.rate],['mode',op.mode],['minutes',op.minutes],['eb',op.externalBatch||0],['eu',op.externalUnit||0]]){const el=root.querySelector(`[data-${key}="${id}"]`);if(el)el.value=value}}}
 const tbody=rows[0]?.closest('tbody');if(tbody){const rowList=rows.map(cb=>cb.closest('tr')),selected=[];for(const op of p.ops||[]){const row=rowList.find(r=>r.querySelector('[data-opcheck]')?.dataset.opcheck===op.id||r.querySelector('td:nth-child(2) b')?.textContent?.trim()===op.name);if(row&&!selected.includes(row))selected.push(row)}for(const row of [...selected,...rowList.filter(r=>!selected.includes(r))])tbody.appendChild(row)}
 for(const cb of rows){const row=cb.closest('tr');if(row)row.style.display=cb.checked?'':'none'}
}
function showCalc(no){
 const lines=quoteLines(no),ui=window.RALAB_CALC_UI;if(!lines.length||!ui)return alert('De calculatie van deze offerte is niet gevonden.');
 const products=lines.map(calcProduct);editingQuoteNo=String(no);ui.products=structuredClone(products);ui.active=0;ui.selectionMode=!(ui.products[0]?.ops||[]).length;
 if(window.RALAB_CALC_PRICE){window.RALAB_CALC_PRICE.manualByIndex=lines.map(q=>num(q.saleUnit));window.RALAB_CALC_PRICE.tiersByIndex=lines.map(q=>structuredClone(q.priceTiers||[]));window.RALAB_CALC_PRICE.includeTiersByIndex=lines.map(q=>!!q.includeTierPricing)}
 try{closeModal()}catch(_){}
 try{switchView('calculation')}catch(_){window.RALAB_ERP?.show?.('calculation')}
 try{window.RALAB_CALC?.render?.()}catch(e){console.error(e)}
 const hydrate=()=>{
  const q=lines[0],p=products[0];ui.products=structuredClone(products);ui.active=0;ui.selectionMode=!(p.ops||[]).length;setVal('cCustomer',q.customerId||'');setVal('cProject',q.project||'');setVal('cOrder',q.quoteNo||q.orderNo||no);setVal('cDeadline',q.estimatedReadyDate||q.deadline||'');setVal('cCustomerReference',q.customerReference||'');applyProduct(p);
  const action=[...document.querySelectorAll('#calcFollowupActions button')].find(b=>(b.textContent||'').includes('Naar offertes'));
  if(action){action.textContent='Offerte bijwerken';action.dataset.updateQuoteCalculation=String(no)}
  window.RALAB_CALC_PRICE?.render?.();document.getElementById('calcGeneralBlock')?.scrollIntoView?.({block:'start'});
 };
 setTimeout(hydrate,80);setTimeout(hydrate,170);
}
function collectCurrent(){
 const ui=window.RALAB_CALC_UI,p=ui?.products?.[ui.active]||{},root=document.getElementById('view-calculation'),ops=[];
 root?.querySelectorAll('[data-opcheck]').forEach(cb=>{if(!cb.checked)return;const id=cb.dataset.opcheck,row=cb.closest('tr');ops.push({id,name:row?.querySelector('td:nth-child(2) b')?.textContent?.trim()||id,rate:num(root.querySelector(`[data-rate="${id}"]`)?.value),mode:root.querySelector(`[data-mode="${id}"]`)?.value||'unit',minutes:num(root.querySelector(`[data-minutes="${id}"]`)?.value),externalBatch:num(root.querySelector(`[data-eb="${id}"]`)?.value),externalUnit:num(root.querySelector(`[data-eu="${id}"]`)?.value)})});
 return{...structuredClone(p),name:document.getElementById('cName')?.value.trim()||'',qty:Math.max(1,num(document.getElementById('cQty')?.value)||1),templateId:document.getElementById('cTemplate')?.value||'',materialCost:num(document.getElementById('cMaterial')?.value),materialMode:document.getElementById('cMaterialMode')?.value||'unit',marginMode:document.getElementById('cMarginMode')?.value||'factor',marginValue:num(document.getElementById('cMargin')?.value),ops};
}
function costFor(p){let labor=0,external=0;for(const op of p.ops||[]){if(op.mode==='wait')continue;if(op.mode==='external'){external+=num(op.externalBatch)+num(op.externalUnit)*p.qty;continue}labor+=num(op.minutes)/60*num(op.rate)*(op.mode==='unit'?p.qty:1)}const material=num(p.materialCost)*(p.materialMode==='unit'?p.qty:1),total=labor+external+material;return{total,unit:p.qty?total/p.qty:0}}
function autoSale(p,cost){const v=num(p.marginValue);return p.marginMode==='factor'?cost*v:p.marginMode==='percent'?cost*(1+v/100):cost+v}
function updateQuote(no){
 const s=S(),old=quoteLines(no),ui=window.RALAB_CALC_UI;if(!s||!old.length||!ui)return false;
 ui.products[ui.active]=collectCurrent();const products=structuredClone(ui.products),first=old[0],price=window.RALAB_CALC_PRICE?.manualByIndex||[],stamp=Date.now(),group=first.quoteGroupId||('qgrp_'+stamp),customerId=document.getElementById('cCustomer')?.value||first.customerId,project=document.getElementById('cProject')?.value.trim()||'',reference=document.getElementById('cCustomerReference')?.value.trim()||'',deadline=document.getElementById('cDeadline')?.value||'';
 const updated=products.map((p,i)=>{const prior=old[i],cost=costFor(p),manual=price[i],sale=manual===null||manual===undefined||manual===''?autoSale(p,cost.unit):num(manual),margin=sale-cost.unit,priceTiers=window.RALAB_CALC_PRICE?.quoteTiers?.(i,p)||[];return{...(prior||first),id:prior?.id||`q_${stamp}_${i}`,quoteNo:String(no),orderNo:String(no),quoteGroupId:group,lineNo:i+1,isMultiProductLine:products.length>1,customerId,customerReference:reference,project,name:p.name,qty:p.qty,templateId:p.templateId||'',ops:structuredClone(p.ops||[]),materialCost:num(p.materialCost),materialMode:p.materialMode||'unit',marginMode:p.marginMode||'factor',marginValue:num(p.marginValue),costUnit:cost.unit,calculatedSaleUnit:autoSale(p,cost.unit),manualSalePrice:sale,saleUnit:sale,total:sale*p.qty,includeTierPricing:priceTiers.length>0,priceTiers:structuredClone(priceTiers),estimatedReadyDate:prior?.estimatedReadyDate||deadline,deadline:prior?.deadline||deadline,grossMarginUnit:margin,grossMarginPct:sale?margin/sale*100:0,markupPct:cost.unit?margin/cost.unit*100:0,updatedAt:new Date().toISOString()}});
 const ids=new Set(old.map(q=>q.id));const at=Math.max(0,s.quotes.findIndex(q=>ids.has(q.id)));s.quotes=s.quotes.filter(q=>!ids.has(q.id));s.quotes.splice(at,0,...updated);persist();editingQuoteNo='';
 try{switchView('quotes')}catch(_){window.RALAB_ERP?.show?.('quotes')}setTimeout(()=>{window.RALAB_QUOTE_INBOX?.render?.();window.RALAB_DOCS?.openQuote?.(String(no))},80);return true;
}
function addModalButton(){const foot=document.querySelector('#modalRoot .modalfoot'),saveBtn=foot?.querySelector('[data-save-quote]');if(!foot||!saveBtn||foot.querySelector('[data-quote-to-calculation]'))return;const b=document.createElement('button');b.className='btn primary';b.type='button';b.dataset.quoteToCalculation=saveBtn.dataset.saveQuote;b.textContent='Terug naar calculatie';foot.insertBefore(b,foot.firstChild)}
const modal=document.getElementById('modalRoot');if(modal)new MutationObserver(addModalButton).observe(modal,{childList:true,subtree:true});
document.addEventListener('click',e=>{const back=e.target.closest('[data-quote-to-calculation]');if(back){e.preventDefault();e.stopImmediatePropagation();const no=back.dataset.quoteToCalculation,saveBtn=document.querySelector('#modalRoot [data-save-quote]');saveBtn?.click();setTimeout(()=>showCalc(no),50);return}const update=e.target.closest('[data-update-quote-calculation]');if(update){e.preventDefault();e.stopImmediatePropagation();updateQuote(update.dataset.updateQuoteCalculation)}},true);
window.RALAB_QUOTE_CALC={version:VERSION,open:showCalc,update:updateQuote,get editingQuoteNo(){return editingQuoteNo}};
})();
