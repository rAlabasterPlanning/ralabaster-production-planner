// rAlabaster - stabiele directe orderflow + orders verwijderen
(()=>{
let directBusy=false;
function S(){try{return state}catch(_){return null}}
function persist(){try{save()}catch(e){console.error(e)}}
function openOrders(){
  try{window.RALAB_ERP?.show?.('orders')}catch(e){console.error(e)}
  setTimeout(()=>{try{window.RALAB_ERP?.renderOrders?.()}catch(e){console.error(e)}injectDeleteButtons()},80);
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
    if(created.length){openOrders()}
    directBusy=false;
  },120);
}
function deleteOrder(id){
  const s=S();if(!s)return;
  const o=(s.orders||[]).find(x=>x.id===id);if(!o)return;
  if(!confirm(`Order “${o.orderNo||o.product||id}” verwijderen?\n\nDe bijbehorende planningstaken worden ook verwijderd.`))return;
  s.tasks=(s.tasks||[]).filter(t=>t.orderId!==id);
  s.orders=(s.orders||[]).filter(x=>x.id!==id);
  (s.quotes||[]).forEach(q=>{if(q.orderId===id){q.orderId='';if(q.status==='accepted')q.status='concept'}});
  persist();
  openOrders();
}
function injectDeleteButtons(){
  const root=document.getElementById('view-orders');if(!root)return;
  root.querySelectorAll('button[onclick*="RALAB_ERP.openOrder"]').forEach(openBtn=>{
    const m=(openBtn.getAttribute('onclick')||'').match(/openOrder\('([^']+)'\)/);if(!m)return;
    const id=m[1],wrap=openBtn.parentElement;if(!wrap||wrap.querySelector(`[data-delete-order="${id}"]`))return;
    const b=document.createElement('button');b.className='btn small';b.type='button';b.dataset.deleteOrder=id;b.textContent='Verwijderen';b.style.marginLeft='6px';wrap.appendChild(b);
  });
}
function install(){
  if(window.RALAB_ERP)window.RALAB_ERP.deleteOrder=deleteOrder;
  injectDeleteButtons();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('#calcFollowupActions button');
  if(b&&(b.textContent||'').includes('Direct order & plannen')){
    e.preventDefault();e.stopImmediatePropagation();directOrder();return;
  }
  const del=e.target.closest('[data-delete-order]');
  if(del){e.preventDefault();e.stopImmediatePropagation();deleteOrder(del.dataset.deleteOrder)}
},true);
document.addEventListener('click',e=>{if(e.target.closest('.navbtn[data-view="orders"]'))setTimeout(injectDeleteButtons,120)},true);
const orders=document.getElementById('view-orders');if(orders)new MutationObserver(()=>requestAnimationFrame(injectDeleteButtons)).observe(orders,{childList:true,subtree:true});
setTimeout(install,1300);
})();
