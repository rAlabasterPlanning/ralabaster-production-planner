// rAlabaster: ensure "Naar calculatie" is added after the async ERP order modal has finished opening.
(()=>{
  const VERSION='20260911-1';
  function inject(id){
    const root=document.getElementById('modalRoot');
    const foot=root?.querySelector('.modalfoot');
    const head=root?.querySelector('.modalhead');
    if(!foot||!head)return false;
    let b=foot.querySelector('[data-order-to-calc]');
    if(!b){
      b=document.createElement('button');
      b.className='btn primary';
      b.type='button';
      b.dataset.orderToCalc=id;
      b.textContent='Naar calculatie';
      foot.prepend(b);
    }else b.dataset.orderToCalc=id;
    return true;
  }
  function install(){
    if(!window.RALAB_ERP?.openOrder||!window.RALAB_ORDER_CALC?.open)return setTimeout(install,150);
    if(window.__ralabOrderCalcOpenFixInstalled)return;
    window.__ralabOrderCalcOpenFixInstalled=true;
    const old=window.RALAB_ERP.openOrder.bind(window.RALAB_ERP);
    window.RALAB_ERP.openOrder=async function(id){
      const result=await old(id);
      // showModal is synchronous once the data load is complete, but yield one frame so the modal DOM is guaranteed to exist.
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(!inject(id))setTimeout(()=>inject(id),40);
      return result;
    };
    // Also expose a direct, stable entry point for future order UIs.
    window.RALAB_ERP.openOrderCalculation=id=>window.RALAB_ORDER_CALC.open(id);
    window.RALAB_ORDER_CALC_OPEN_FIX={version:VERSION,inject};
  }
  install();
})();
