// Record semantic portal activity; never inspect password or free-text input values.
(()=>{
'use strict';
let db=null,active=false,lastPage='',lastClick='',lastClickAt=0,pending=new Set(),warned=false;
function record(kind,page,action,target=''){
 if(!active||window.RALAB_PORTAL_PREVIEW)return Promise.resolve();
 const request=Promise.resolve(db.rpc('portal_record_activity',{p_kind:kind,p_page:page,p_action:action,p_target:String(target).slice(0,100)})).then(r=>{if(r.error)throw r.error}).catch(()=>{if(!warned){console.warn('Portaalactiviteit kon niet worden geregistreerd.');warned=true}}).finally(()=>pending.delete(request));
 pending.add(request);return request;
}
const actions=[['[data-add-product]','add_product','addProduct'],['[data-open-cart]','open_cart'],['[data-close-cart]','close_cart'],['[data-request-order-change]','request_change','requestOrderChange'],['[data-inline-change]','submit_change','inlineChange'],['[data-place-order]','submit_order'],['[data-quote-decision]','quote_decision','quoteId'],['[data-new-custom-order]','custom_order'],['[data-portal-packing-slip]','download_packing','portalPackingSlip'],['#portalLogout','logout']];
document.addEventListener('click',e=>{
 if(!active||window.RALAB_PORTAL_PREVIEW)return;
 for(const [selector,name,key] of actions){const el=e.target.closest(selector);if(!el||el.disabled)continue;const action=name==='quote_decision'?(el.dataset.quoteDecision==='accepted'?'quote_accept':'quote_decline'):name,target=key?el.dataset[key]||'':'',signature=action+target,now=Date.now();if(signature===lastClick&&now-lastClickAt<300)return;lastClick=signature;lastClickAt=now;record('click',lastPage,action,target);break;}
},true);
window.RALAB_PORTAL_ACTIVITY={
 start(client){if(window.RALAB_PORTAL_PREVIEW)return;db=client;active=true;record('login','','login')},
 stop(){active=false;lastPage=''},
 page(page){if(!active||page===lastPage)return;lastPage=page;record('page',page,'view')},
 flush:()=>Promise.allSettled([...pending])
};
})();