// rAlabaster order modal buttons v1 — touch-safe actions only inside #modalRoot.
(()=>{
  const VERSION='20260912-2';
  if(window.__ralabOrderModalButtonsV1Installed)return;
  window.__ralabOrderModalButtonsV1Installed=true;

  const inRect=(r,x,y)=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
  const hitButton=(x,y)=>[...document.querySelectorAll('#modalRoot .modalfoot button')].find(btn=>{
    const r=btn.getBoundingClientRect();
    return r.width>0&&r.height>0&&inRect(r,x,y);
  })||null;

  function actionFor(btn){
    if(!btn)return null;
    if(btn.matches('[data-order-to-calc]'))return {type:'calc',id:btn.dataset.orderToCalc};
    if(btn.matches('[data-delete-confirm]'))return {type:'deleteConfirm',id:btn.dataset.deleteConfirm};
    if(btn.matches('[data-delete-cancel]'))return {type:'deleteCancel'};
    if(btn.matches('[data-customer-print]'))return {type:'customerPrint',id:btn.dataset.customerPrint};
    const raw=btn.getAttribute('onclick')||'';
    if(/closeModal\s*\(/.test(raw))return {type:'close'};
    let m=raw.match(/RALAB_ERP\.orderConfirmation\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'confirmation',id:m[1]};
    const txt=(btn.textContent||'').trim().toLowerCase();
    if(txt==='sluiten')return {type:'close'};
    return null;
  }

  function run(action){
    if(!action)return false;
    try{
      if(action.type==='close'){
        if(typeof window.closeModal==='function')window.closeModal();
        else document.getElementById('modalRoot').innerHTML='';
        return true;
      }
      if(action.type==='confirmation'){
        const fn=window.RALAB_ERP?.orderConfirmation;
        if(typeof fn!=='function')throw new Error('orderConfirmation unavailable');
        fn(action.id);return true;
      }
      if(action.type==='calc'){
        const fn=window.RALAB_ORDER_CALC?.open;
        if(typeof fn!=='function')throw new Error('order calculation unavailable');
        fn(action.id);return true;
      }
      if(action.type==='deleteConfirm'){window.RALAB_ERP?.confirmDeleteOrder?.(action.id);return true}
      if(action.type==='deleteCancel'){const r=document.getElementById('modalRoot');if(r)r.innerHTML='';return true}
      if(action.type==='customerPrint'){window.RALAB_ERP?.printCustomerOrders?.(action.id);return true}
    }catch(err){
      console.error('Order modal actie mislukt',err);
      alert('Deze actie kon niet worden geopend. Ververs de app en probeer opnieuw.');
    }
    return false;
  }

  function handle(e){
    const root=document.getElementById('modalRoot');
    if(!root||!root.querySelector('.modalback'))return;
    const x=e.clientX,y=e.clientY;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const btn=hitButton(x,y);
    const action=actionFor(btn);
    if(!action)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run(action);
  }

  // Touch is the problem case on iPad. Keep this scoped to the modal only.
  document.addEventListener('pointerup',handle,true);
  document.addEventListener('click',e=>{
    if(e.detail===0)return;
    handle(e);
  },true);

  window.RALAB_ORDER_MODAL_BUTTONS_V1={version:VERSION};
})();
