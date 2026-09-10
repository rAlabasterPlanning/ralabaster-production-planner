// rAlabaster - directe en betrouwbare Calculatie -> Offertes overgang
(()=>{
const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(e){console.error(e)}}
function root(){return document.getElementById('view-calculation')}
function val(id){return document.getElementById(id)?.value||''}
function todayKey(){const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10).replaceAll('-','')}
function usedQuoteNos(){return new Set((S()?.quotes||[]).map(q=>String(q.quoteNo||q.orderNo||'')).filter(Boolean))}
function nextQuoteNo(){const day=todayKey(),used=usedQuoteNos();let i=1;while(used.has(`${day}-${i}`))i++;return `${day}-${i}`}
function validFreeQuoteNo(candidate){const day=todayKey(),v=String(candidate||'').trim();return new RegExp(`^${day}-\\d+$`).test(v)&&!usedQuoteNos().has(v)}
function reserveQuoteNo(){const shown=val('cOrder').trim();return validFreeQuoteNo(shown)?shown:nextQuoteNo()}
function prefillQuoteNo(force=false){const e=document.getElementById('cOrder');if(!e)return;const cur=String(e.value||'').trim();if(force||!cur)e.value=nextQuoteNo()}
function ensureCustomerReference(){
 const grid=document.getElementById('calcGeneralGrid');if(!grid)return;
 if(!document.getElementById('cCustomerReference')){const f=document.createElement('div');f.className='field';f.innerHTML='<label>Referentie klant</label><input id="cCustomerReference" class="input" placeholder="Bijv. PO-nummer / projectreferentie">';grid.appendChild(f)}
 prefillQuoteNo(false);
}
function collectCurrent(){
 const ui=window.RALAB_CALC_UI,p=ui?.products?.[ui.active]||{};
 const ops=[];
 root()?.querySelectorAll('[data-opcheck]').forEach(cb=>{if(!cb.checked)return;const id=cb.dataset.opcheck,row=cb.closest('tr');ops.push({id,name:row?.querySelector('td:nth-child(2) b')?.textContent?.trim()||id,rate:num(root()?.querySelector(`[data-rate="${id}"]`)?.value),mode:root()?.querySelector(`[data-mode="${id}"]`)?.value||'unit',minutes:num(root()?.querySelector(`[data-minutes="${id}"]`)?.value),externalBatch:num(root()?.querySelector(`[data-eb="${id}"]`)?.value),externalUnit:num(root()?.querySelector(`[data-eu="${id}"]`)?.value)});});
 return {...p,name:val('cName').trim(),qty:Math.max(1,num(val('cQty'))||1),templateId:val('cTemplate'),materialCost:num(val('cMaterial')),materialMode:val('cMaterialMode')||'unit',marginMode:val('cMarginMode')||'factor',marginValue:num(val('cMargin')),ops};
}
function costFor(p,q){let labor=0,external=0;for(const o of p.ops||[]){if(o.mode==='wait')continue;if(o.mode==='external'){external+=num(o.externalBatch)+num(o.externalUnit)*q;continue}labor+=num(o.minutes)/60*num(o.rate)*(o.mode==='unit'?q:1)}const material=num(p.materialCost)*(p.materialMode==='unit'?q:1),total=labor+external+material;return{total,unit:q?total/q:0}}
function autoSale(p,costUnit){const v=num(p.marginValue);return p.marginMode==='factor'?costUnit*v:p.marginMode==='percent'?costUnit*(1+v/100):costUnit+v}
function finalSale(p,i,costUnit){const mv=window.RALAB_CALC_PRICE?.manualByIndex?.[i];return mv===null||mv===undefined||mv===''?autoSale(p,costUnit):num(mv)}
function saveQuoteDirect(){
 const s=S(),ui=window.RALAB_CALC_UI;if(!s)return;
 const customerId=val('cCustomer');if(!customerId)return alert('Kies eerst een klant.');
 const current=collectCurrent();let products=(ui?.products?.length?ui.products.map((p,i)=>i===ui.active?current:structuredClone(p)):[current]);
 if(products.some(p=>!p.name))return alert('Vul bij ieder product een productnaam in.');
 if(products.some(p=>!(p.ops||[]).length))return alert('Selecteer bij ieder product minimaal één processtap.');
 s.quotes=s.quotes||[];
 const stamp=Date.now(),quoteNo=reserveQuoteNo(),groupId=products.length>1?'qgrp_'+stamp:null,test=!!document.getElementById('calcTestOrder')?.checked,customerReference=val('cCustomerReference').trim();
 const orderField=document.getElementById('cOrder');if(orderField)orderField.value=quoteNo;
 products.forEach((p,i)=>{const c=costFor(p,p.qty),guide=autoSale(p,c.unit),sale=finalSale(p,i,c.unit),margin=sale-c.unit;s.quotes.push({id:'q_'+stamp+'_'+i,quoteNo,quoteGroupId:groupId,isMultiProductLine:products.length>1,lineNo:i+1,customerId,customerReference,project:val('cProject'),orderNo:quoteNo,deadline:val('cDeadline'),name:p.name,qty:p.qty,ops:structuredClone(p.ops),materialCost:p.materialCost,materialMode:p.materialMode,marginMode:p.marginMode,marginValue:p.marginValue,costUnit:c.unit,calculatedSaleUnit:guide,manualSalePrice:sale===guide?null:sale,saleUnit:sale,total:sale*p.qty,grossMarginUnit:margin,grossMarginPct:sale?margin/sale*100:0,markupPct:c.unit?margin/c.unit*100:0,status:'concept',created:new Date().toISOString().slice(0,10),isTestOrder:test});});
 persist();
 if(window.RALAB_ERP?.show)window.RALAB_ERP.show('quotes');
 if(window.RALAB_ERP?.renderQuotes)setTimeout(()=>window.RALAB_ERP.renderQuotes(),0);
}
function install(){ensureCustomerReference();const calc=window.RALAB_CALC;if(!calc)return false;calc.saveQuote=saveQuoteDirect;if(!calc.__quoteNoNewWrapped){const oldNew=calc.newCalc;calc.newCalc=function(){const r=oldNew.apply(this,arguments);setTimeout(()=>{ensureCustomerReference();prefillQuoteNo(true)},30);return r};calc.__quoteNoNewWrapped=true}return true}
document.addEventListener('click',e=>{if(e.target.closest('.navbtn[data-view="calculation"]'))setTimeout(()=>{ensureCustomerReference();prefillQuoteNo(false)},120)},true);
if(!install())setTimeout(install,400);setTimeout(()=>{install();ensureCustomerReference();prefillQuoteNo(false)},1200);
})();