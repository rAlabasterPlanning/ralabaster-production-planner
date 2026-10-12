// Reuse the customer portal with a scoped, read-only administrator session.
(()=>{'use strict';
const customerId=new URL(location.href).searchParams.get('preview_customer');if(!customerId)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let verified=false,allOrders=[],ctx=null;
const blocked='[data-add-product],[data-place-order],[data-open-cart],[data-inline-change],[data-request-order-change],[data-quote-decision],#portalLogout';
document.addEventListener('click',e=>{if(e.target.closest(blocked)){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
async function load(client){
 const gate=await client.rpc('portal_is_admin');if(gate.error||gate.data!==true)throw new Error('Alleen beheerders mogen een klantweergave openen.');
 const results=await Promise.all([
  client.from('portal_customers').select('*').eq('customer_id',customerId).single(),
  client.from('portal_products').select('*').eq('customer_id',customerId).eq('active',true).order('name'),
  client.from('portal_orders').select('*,portal_order_lines(*)').eq('customer_id',customerId).order('created_at',{ascending:false}),
  client.from('portal_quotes').select('*,portal_quote_lines(*)').eq('customer_id',customerId).order('created_at',{ascending:false}),
  client.from('portal_product_requests').select('*').eq('customer_id',customerId).order('created_at',{ascending:false}),
  client.from('portal_order_change_requests').select('*').eq('customer_id',customerId).order('created_at',{ascending:false})
 ]);for(const r of results)if(r.error)throw r.error;
 verified=true;allOrders=results[2].data||[];
 return {customer:results[0].data,products:results[1].data||[],orders:allOrders.filter(o=>!o.hidden_from_customer),quotes:results[3].data||[],requests:results[4].data||[],changes:results[5].data||[]};
}
function renderHidden(){if(!verified||!ctx)return;const rows=allOrders.filter(o=>o.hidden_from_customer);ctx.main().innerHTML=ctx.head('Verborgen orders','Deze orders zijn alleen intern zichtbaar. U kunt ze hier weer tonen aan de klant.')+(rows.length?rows.map(o=>`<article class="panel" data-portal-order-id="${esc(o.id)}" style="margin-bottom:12px"><h3>${esc(o.order_no)}</h3>${ctx.orderProducts(o)}<p class="muted">Verborgen voor klant</p></article>`).join(''):ctx.empty('Geen verborgen orders','Alle orders zijn zichtbaar volgens hun status.'));}
function afterRender(next){if(!verified)return;ctx=next;document.getElementById('portalLogout').hidden=true;
 if(!document.getElementById('portalPreviewBanner')){const banner=document.createElement('div');banner.id='portalPreviewBanner';banner.className='portal-preview-banner';banner.innerHTML=`<b>Klantweergave: ${esc(ctx.customer.company_name)}</b><span>U bekijkt dezelfde pagina als de klant. Alleen orderzichtbaarheid kan hier worden aangepast.</span>`;document.querySelector('.portal-header').before(banner);const tab=document.createElement('button');tab.type='button';tab.dataset.view='hidden';tab.textContent='Verborgen orders';document.getElementById('portalNav').appendChild(tab);}
 for(const button of document.querySelectorAll(blocked+',#portalMain [type=submit]')){button.disabled=true;button.title='Alleen bekijken in klantweergave';}
 for(const row of document.querySelectorAll('[data-portal-order-id]')){const order=allOrders.find(o=>o.id===row.dataset.portalOrderId);if(!order||row.querySelector('[data-portal-visibility]'))continue;const button=document.createElement('button');button.type='button';button.className='btn portal-visibility-button';button.dataset.portalVisibility=order.id;button.dataset.hidden=String(!!order.hidden_from_customer);button.textContent=order.hidden_from_customer?'Weer tonen aan klant':'Order verbergen voor klant';row.appendChild(button);}
}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-portal-visibility]');if(!button||!verified||!ctx)return;e.preventDefault();e.stopImmediatePropagation();if(button.disabled)return;button.disabled=true;try{const {error}=await ctx.client.rpc('portal_set_order_visibility',{p_order_id:button.dataset.portalVisibility,p_customer_id:customerId,p_hidden:button.dataset.hidden!=='true'});if(error)throw error;await ctx.refresh();}catch(error){button.disabled=false;let msg=document.getElementById('portalPreviewStatus');if(!msg){msg=document.createElement('p');msg.id='portalPreviewStatus';msg.setAttribute('role','alert');document.getElementById('portalPreviewBanner').appendChild(msg);}msg.textContent=error.message||'Zichtbaarheid kon niet worden opgeslagen.';}},true);
window.RALAB_PORTAL_PREVIEW={customerId,load,afterRender,renderHidden};
})();
