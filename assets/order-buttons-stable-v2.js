// rAlabaster Orders buttons v2 — convert inline actions to stable data-actions on each explicit Orders render.
(()=>{
  const VERSION='20260912-2';
  if(window.__ralabOrderButtonsStableV2Installed)return;
  window.__ralabOrderButtonsStableV2Installed=true;

  function decorate(){
    const root=document.getElementById('view-orders');
    if(!root)return;
    root.querySelectorAll('button').forEach(btn=>{
      const raw=btn.getAttribute('onclick')||'';
      let m=raw.match(/RALAB_ERP\.openOrder\(['"]([^'"]+)['"]\)/);
      if(m){btn.dataset.orderOpen=m[1];btn.removeAttribute('onclick');return}
      m=raw.match(/RALAB_ERP\.orderConfirmation\(['"]([^'"]+)['"]\)/);
      if(m){btn.dataset.orderConfirmation=m[1];btn.removeAttribute('onclick');}
    });
  }

  function install(){
    const erp=window.RALAB_ERP;
    if(!erp?.renderOrders||!erp?.openOrder||!erp?.orderConfirmation)return setTimeout(install,120);
    if(!erp.__orderButtonsRenderWrapped){
      erp.__orderButtonsRenderWrapped=true;
      const oldRender=erp.renderOrders.bind(erp);
      erp.renderOrders=function(){
        const r=oldRender(...arguments);
        decorate();
        return r;
      };
    }
    decorate();
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-order-open]');
    if(open){
      e.preventDefault();e.stopImmediatePropagation();
      const id=open.dataset.orderOpen;
      Promise.resolve(window.RALAB_ERP?.openOrder?.(id)).catch(err=>{
        console.error('Order openen mislukt',err);
        alert('Order openen mislukt. Probeer opnieuw.');
      });
      return;
    }
    const conf=e.target.closest('[data-order-confirmation]');
    if(conf){
      e.preventDefault();e.stopImmediatePropagation();
      try{window.RALAB_ERP?.orderConfirmation?.(conf.dataset.orderConfirmation)}catch(err){
        console.error('Order confirmation mislukt',err);
        alert('Order confirmation openen mislukt. Probeer opnieuw.');
      }
    }
  },true);

  install();
  window.RALAB_ORDER_BUTTONS_STABLE_V2={version:VERSION,decorate};
})();
