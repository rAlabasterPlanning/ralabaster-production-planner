// rAlabaster - stabiele directe orderflow + verwijderen vanuit echte planner Order openen
(()=>{
let directBusy=false;
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(e){console.error(e)}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openOrders(){
  try{
    if(typeof window.switchView==='function')window.switchView('orders');
    else if(typeof window.renderOrders==='function'){try{currentView='orders'}catch(_){};window.renderOrders()}
    else window.RALAB_ERP?.show?.('orders');
  }catch(e){console.error(e)}
  setTimeout(()=>{try{if(typeof window.renderOrders==='function')window.renderOrders()}catch(e){console.error(e)}},80);
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
function deleteOrderNow(id){
  const s=S();if(!s)return;
  const o=(s.orders||[]).find(x=>x.id===id);if(!o)return;
  s.tasks=(s.tasks||[]).filter(t=>t.orderId!==id);
  s.orders=(s.orders||[]).filter(x=>x.id!==id);
  (s.quotes||[]).forEach(q=>{if(q.orderId===id){q.orderId='';if(q.status==='accepted')q.status='concept'}});
  persist();
  try{closeModal()}catch(_){const m=document.getElementById('modalRoot');if(m)m.innerHTML=''}
  openOrders();
}
function askDelete(id){
  const s=S(),o=(s?.orders||[]).find(x=>x.id===id);if(!o)return;
  const label=o.orderNo||o.product||id;
  const html=`<div class="modalhead"><h3>Order verwijderen</h3></div><div class="modalbody"><p>Weet je zeker dat je order <b>${esc(label)}</b> wilt verwijderen?</p><p class="muted">De bijbehorende planningstaken worden ook verwijderd.</p></div><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn" type="button" data-confirm-delete-order="${esc(id)}" style="font-weight:800">Ja, verwijderen</button></div>`;
  if(typeof showModal==='function')showModal(html);else if(confirm(`Weet je zeker dat je order “${label}” wilt verwijderen?`))deleteOrderNow(id);
}
function addDeleteToOpenOrder(id){
  const foot=document.querySelector('#modalRoot .modalfoot');if(!foot||foot.querySelector('[data-open-order-delete]'))return;
  const b=document.createElement('button');b.className='btn';b.type='button';b.dataset.openOrderDelete=id;b.textContent='Verwijderen';b.style.marginRight='auto';b.style.fontWeight='800';foot.prepend(b);
}
function installPlannerOpen(){
  const fn=window.openOrder;
  if(typeof fn!=='function')return false;
  if(fn.__ralabDeleteWrapped)return true;
  const wrapped=function(id){const r=fn.apply(this,arguments);setTimeout(()=>addDeleteToOpenOrder(id),0);return r};
  wrapped.__ralabDeleteWrapped=true;
  window.openOrder=wrapped;
  return true;
}
function install(){
  installPlannerOpen();
  if(window.RALAB_ERP)window.RALAB_ERP.deleteOrder=askDelete;
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
install();setTimeout(install,400);setTimeout(install,1200);setTimeout(install,2500);
})();
