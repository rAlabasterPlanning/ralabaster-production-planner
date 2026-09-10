// rAlabaster - stabiele directe orderflow + verwijderen vanuit Order openen
(()=>{
let directBusy=false;
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(e){console.error(e)}}
function openOrders(){
  try{window.RALAB_ERP?.show?.('orders')}catch(e){console.error(e)}
  setTimeout(()=>{try{window.RALAB_ERP?.renderOrders?.()}catch(e){console.error(e)}stripOverviewDeleteButtons()},80);
}
function directOrder(){
  if(directBusy)return;
  directBusy=true;
  const s=S(),before=new Set((s?.orders||[]).map(o=>o.id));
  try{
    const calc=window.RALAB_CALC;
    if(!calc?.confirmPlan)throw new Error('Orderfunctie is niet geladen.');
    calc.confirmPlan();
  }catch(e){
    console.error(e);
    alert('Order aanmaken mislukt: '+(e?.message||e));
    directBusy=false;
    return;
  }
  setTimeout(()=>{
    const created=(S()?.orders||[]).filter(o=>!before.has(o.id));
    if(created.length)openOrders();
    directBusy=false;
  },120);
}
function stripOverviewDeleteButtons(){
  document.querySelectorAll('#view-orders [data-delete-order]').forEach(b=>b.remove());
}
function deleteOrderNow(id){
  const s=S();if(!s)return;
  const o=(s.orders||[]).find(x=>x.id===id);if(!o)return;
  s.tasks=(s.tasks||[]).filter(t=>t.orderId!==id);
  s.orders=(s.orders||[]).filter(x=>x.id!==id);
  (s.quotes||[]).forEach(q=>{if(q.orderId===id){q.orderId='';if(q.status==='accepted')q.status='concept'}});
  persist();
  try{closeModal()}catch(_){document.getElementById('modalRoot').innerHTML=''}
  openOrders();
}
function askDelete(id){
  const s=S(),o=(s?.orders||[]).find(x=>x.id===id);if(!o)return;
  const label=o.orderNo||o.product||id;
  const html=`<div class="modalhead"><h3>Order verwijderen</h3></div><div class="modalbody"><p>Weet je zeker dat je order <b>${String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</b> wilt verwijderen?</p><p class="muted">De bijbehorende planningstaken worden ook verwijderd.</p></div><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn" type="button" data-confirm-delete-order="${id}" style="font-weight:800">Ja, verwijderen</button></div>`;
  if(typeof showModal==='function')showModal(html);else if(confirm(`Weet je zeker dat je order “${label}” wilt verwijderen?`))deleteOrderNow(id);
}
function addDeleteToOpenOrder(id){
  const foot=document.querySelector('#modalRoot .modalfoot');if(!foot||foot.querySelector('[data-open-order-delete]'))return;
  const b=document.createElement('button');b.className='btn';b.type='button';b.dataset.openOrderDelete=id;b.textContent='Verwijderen';b.style.marginRight='auto';b.style.fontWeight='800';foot.prepend(b);
}
function install(){
  const erp=window.RALAB_ERP;if(!erp)return false;
  erp.deleteOrder=askDelete;
  if(!erp.__deleteInsideOpenWrapped){
    const oldOpen=erp.openOrder;
    erp.openOrder=function(id){const r=oldOpen.apply(this,arguments);setTimeout(()=>addDeleteToOpenOrder(id),0);return r};
    erp.__deleteInsideOpenWrapped=true;
  }
  stripOverviewDeleteButtons();
  return true;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('#calcFollowupActions button');
  if(b&&(b.textContent||'').includes('Direct order & plannen')){
    e.preventDefault();e.stopImmediatePropagation();directOrder();return;
  }
  const del=e.target.closest('[data-open-order-delete]');
  if(del){e.preventDefault();e.stopImmediatePropagation();askDelete(del.dataset.openOrderDelete);return}
  const yes=e.target.closest('[data-confirm-delete-order]');
  if(yes){e.preventDefault();e.stopImmediatePropagation();deleteOrderNow(yes.dataset.confirmDeleteOrder)}
},true);
document.addEventListener('click',e=>{if(e.target.closest('.navbtn[data-view="orders"]'))setTimeout(stripOverviewDeleteButtons,120)},true);
const orders=document.getElementById('view-orders');if(orders)new MutationObserver(()=>requestAnimationFrame(stripOverviewDeleteButtons)).observe(orders,{childList:true,subtree:true});
if(!install())setTimeout(install,500);setTimeout(install,1400);
})();
