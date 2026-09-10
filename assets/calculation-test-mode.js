// rAlabaster - testorder vanaf calculatie door de hele flow
(()=>{
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(_){}}
function calcRoot(){return document.getElementById('view-calculation')}
function checked(){return !!document.getElementById('calcTestOrder')?.checked}
function inject(){
 const root=calcRoot(); if(!root||root.classList.contains('hidden'))return;
 if(document.getElementById('calcTestOrder'))return;
 const toolbar=root.querySelector('.toolbar'); if(!toolbar)return;
 const wrap=document.createElement('label');
 wrap.id='calcTestOrderWrap'; wrap.className='btn';
 wrap.style.cssText='display:flex;align-items:center;gap:8px;font-weight:800;cursor:pointer';
 wrap.innerHTML='<input id="calcTestOrder" type="checkbox" style="width:18px;height:18px"> Testorder';
 const spacer=toolbar.querySelector('.spacer');
 if(spacer)spacer.insertAdjacentElement('afterend',wrap); else toolbar.appendChild(wrap);
}
function markNew(before,collection,flag){
 const s=S(); if(!s)return;
 const arr=s[collection]||[];
 let changed=false;
 for(const x of arr){if(!before.has(x.id)){x.isTestOrder=!!flag;changed=true}}
 if(changed)persist();
}
function snapshot(name){return new Set((S()?.[name]||[]).map(x=>x.id))}
// Leg de status vast bij acties vanuit Calculaties.
document.addEventListener('click',e=>{
 const root=calcRoot(); if(!root||!root.contains(e.target))return;
 const b=e.target.closest('button'); if(!b)return;
 const txt=(b.textContent||'').trim();
 if(!['Concept opslaan','Naar offertes','Direct order & plannen'].some(x=>txt.includes(x)))return;
 const flag=checked();
 const c0=snapshot('calculations'),q0=snapshot('quotes'),o0=snapshot('orders');
 setTimeout(()=>{
   if(txt.includes('Concept opslaan'))markNew(c0,'calculations',flag);
   if(txt.includes('Naar offertes'))markNew(q0,'quotes',flag);
   if(txt.includes('Direct order & plannen'))markNew(o0,'orders',flag);
 },0);
 setTimeout(()=>{
   if(txt.includes('Concept opslaan'))markNew(c0,'calculations',flag);
   if(txt.includes('Naar offertes'))markNew(q0,'quotes',flag);
   if(txt.includes('Direct order & plannen'))markNew(o0,'orders',flag);
 },150);
},true);
// Bij laden van een concept de testvlag terugzetten in de checkbox.
document.addEventListener('change',e=>{
 if(e.target?.id!=='cDraft')return;
 setTimeout(()=>{
   const d=(S()?.calculations||[]).find(x=>x.id===e.target.value);
   const cb=document.getElementById('calcTestOrder'); if(cb)cb.checked=!!d?.isTestOrder;
 },80);
},true);
function wrapQuoteOrder(){
 const erp=window.RALAB_ERP; if(!erp?.quoteOrder||erp.quoteOrder.__testCalcWrapped)return false;
 const old=erp.quoteOrder;
 function wrapped(id){
   const s=S(),q=(s?.quotes||[]).find(x=>x.id===id),before=new Set((s?.orders||[]).map(x=>x.id));
   const r=old.apply(this,arguments);
   setTimeout(()=>{const ss=S();let ch=false;for(const o of ss?.orders||[]){if(!before.has(o.id)&&q?.isTestOrder){o.isTestOrder=true;ch=true}}if(ch)persist()},0);
   return r;
 }
 wrapped.__testCalcWrapped=true; erp.quoteOrder=wrapped; return true;
}
function observe(){inject();wrapQuoteOrder()}
new MutationObserver(()=>setTimeout(observe,20)).observe(document.querySelector('main')||document.body,{subtree:true,childList:true});
document.addEventListener('click',e=>{if(e.target.closest('.navbtn[data-view="calculation"]'))setTimeout(observe,80)},true);
setInterval(wrapQuoteOrder,1000);
setTimeout(observe,400);
})();