// rAlabaster Orders buttons v3 — minimal stable click bridge. No render wrapping, no DOM mutation.
(()=>{
  const VERSION='20260912-3';
  if(window.__ralabOrderButtonsStableV3Installed)return;
  window.__ralabOrderButtonsStableV3Installed=true;

  function orderActionFromButton(btn){
    if(!btn||!btn.closest('#view-orders'))return null;
    const raw=btn.getAttribute('onclick')||'';
    let m=raw.match(/RALAB_ERP\.openOrder\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'open',id:m[1]};
    m=raw.match(/RALAB_ERP\.orderConfirmation\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'confirmation',id:m[1]};
    return null;
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#view-orders button');
    const action=orderActionFromButton(btn);
    if(!action)return;

    // Handle once, directly from the user's tap/click. Do not rewrite buttons or wrap renderOrders.
    e.preventDefault();
    e.stopPropagation();

    try{
      if(action.type==='open'){
        const fn=window.RALAB_ERP?.openOrder;
        if(typeof fn!=='function')throw new Error('openOrder unavailable');
        Promise.resolve(fn(action.id)).catch(err=>{
          console.error('Order openen mislukt',err);
          alert('Order openen mislukt. Probeer opnieuw.');
        });
      }else{
        const fn=window.RALAB_ERP?.orderConfirmation;
        if(typeof fn!=='function')throw new Error('orderConfirmation unavailable');
        fn(action.id);
      }
    }catch(err){
      console.error('Orderactie mislukt',err);
      alert('Deze orderactie kon niet worden geopend. Ververs de app en probeer opnieuw.');
    }
  },true);

  window.RALAB_ORDER_BUTTONS_STABLE_V3={version:VERSION};
})();
