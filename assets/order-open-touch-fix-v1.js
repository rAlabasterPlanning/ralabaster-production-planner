// rAlabaster: stable Orders -> Order openen handling, especially for touch/iPad.
(()=>{
  const VERSION='20260912-1';
  if(window.__ralabOrderOpenTouchFixInstalled)return;
  window.__ralabOrderOpenTouchFixInstalled=true;

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#view-orders button');
    if(!btn)return;
    const raw=btn.getAttribute('onclick')||'';
    const m=raw.match(/RALAB_ERP\.openOrder\(['"]([^'"]+)['"]\)/);
    if(!m)return;
    e.preventDefault();
    e.stopPropagation();
    const id=m[1];
    if(window.RALAB_ERP?.openOrder){
      Promise.resolve(window.RALAB_ERP.openOrder(id)).catch(err=>{
        console.error('Order openen mislukt',err);
        alert('Order openen mislukt. Probeer het nogmaals.');
      });
    }
  },true);

  window.RALAB_ORDER_OPEN_TOUCH_FIX={version:VERSION};
})();
