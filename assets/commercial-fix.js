// Compatibiliteitsfix: voorkom dat masterdata.js de commerciele klantenweergave overschrijft
(()=>{
  function install(){
    if(!window.RALAB_COMMERCIAL) return setTimeout(install,100);
    if(window.RALAB_COMMERCIAL.renderCustomers.__commercialGuard) return;
    const original=window.RALAB_COMMERCIAL.renderCustomers;
    const wrapped=function(){
      const result=original.apply(this,arguments);
      const root=document.getElementById('view-customers');
      if(root && !root.querySelector('[data-commercial-master-guard]')){
        const guard=document.createElement('span');
        guard.hidden=true;
        guard.setAttribute('data-commercial-master-guard','1');
        // masterdata.js controleert specifiek op deze onclick-string.
        guard.setAttribute('onclick','RALAB_MASTER.customerForm()');
        root.prepend(guard);
      }
      return result;
    };
    wrapped.__commercialGuard=true;
    window.RALAB_COMMERCIAL.renderCustomers=wrapped;

    // Als Klanten al zichtbaar is bij laden, meteen de juiste versie tekenen.
    const root=document.getElementById('view-customers');
    if(root && !root.classList.contains('hidden')) wrapped();
  }
  install();
})();
