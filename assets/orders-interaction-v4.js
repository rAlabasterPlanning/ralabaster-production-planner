// Orders actions use the actual clicked element, never coordinate hits below it.
(()=>{
  const VERSION='20260914-2';
  if(window.__ralabOrdersInteractionV4Installed)return;
  window.__ralabOrdersInteractionV4Installed=true;

  function go(view){
    try{
      if(['workplaces','tooling'].includes(view)&&window.RALAB_WORKPLACES?.show){window.RALAB_WORKPLACES.show(view);return true}
      if(['dashboard','quotes','orders','orderoverview','completed','products','customers'].includes(view)&&window.RALAB_ERP?.show){
        window.RALAB_ERP.show(view);
        // ERP owns the generic navigation, but the commercial module owns the
        // dashboard and customer screens. ERP renders on the next animation
        // frame, so redraw these screens immediately afterwards.
        if(view==='customers'||view==='dashboard')requestAnimationFrame(()=>{
          if(view==='customers')window.RALAB_COMMERCIAL?.renderCustomers?.();
          if(view==='dashboard')window.RALAB_COMMERCIAL?.renderDashboard?.();
        });
        return true;
      }
      if(typeof window.switchView==='function'){window.switchView(view);return true}
      if(window.RALAB_ERP?.show){window.RALAB_ERP.show(view);return true}
    }catch(err){console.error('Navigatie mislukt',err)}
    return false;
  }

  function orderAction(btn){
    if(!btn)return null;
    const raw=btn.getAttribute('onclick')||'';
    let m=raw.match(/RALAB_ERP\.openOrder\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'open',id:m[1]};
    m=raw.match(/RALAB_ERP\.orderConfirmation\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'confirmation',id:m[1]};
    m=raw.match(/RALAB_ERP\.deleteOrder\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'delete',id:m[1]};
    if(btn.matches('[data-start-review]')||raw.includes('startReview'))return {type:'review'};
    m=raw.match(/RALAB_ERP\.renderOrders\((-?\d+)\)/);
    if(m)return {type:'ordersPage',page:Number(m[1])};
    m=raw.match(/RALAB_ERP\.openCustomer\(['"]([^'"]+)['"]\)/);
    if(m)return {type:'customer',id:m[1]};
    if(raw.includes("RALAB_ERP.show('calculation')")||raw.includes('RALAB_ERP.show("calculation")'))return {type:'calculation'};
    return null;
  }

  function runOrderAction(action){
    if(!action)return false;
    try{
      if(action.type==='open'){
        const fn=window.RALAB_ERP?.openOrder;
        if(typeof fn!=='function')throw new Error('openOrder unavailable');
        Promise.resolve(fn(action.id)).catch(err=>{console.error(err);alert('Order openen mislukt.');});
        return true;
      }
      if(action.type==='confirmation'){
        const fn=window.RALAB_ERP?.orderConfirmation;
        if(typeof fn!=='function')throw new Error('orderConfirmation unavailable');
        fn(action.id);return true;
      }
      if(action.type==='delete'){
        const fn=window.RALAB_ERP?.deleteOrder;
        if(typeof fn!=='function')throw new Error('deleteOrder unavailable');
        fn(action.id);return true;
      }
      if(action.type==='review'){window.RALAB_ORDER_CALC_WORKFLOW?.startReview?.();return true}
      if(action.type==='ordersPage'){window.RALAB_ERP?.renderOrders?.(action.page);return true}
      if(action.type==='customer'){
        if(window.RALAB_COMMERCIAL?.customerForm)window.RALAB_COMMERCIAL.customerForm(action.id);
        else window.RALAB_ERP?.openCustomer?.(action.id);
        return true;
      }
      if(action.type==='calculation'){go('calculation');return true}
    }catch(err){console.error('Orderactie mislukt',err);alert('Deze orderactie kon niet worden geopend.');}
    return false;
  }

  function handlePoint(e){
    const x=e.clientX,y=e.clientY;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;

    // If a modal is open, let that modal own the screen. Never hit-test buttons behind it.
    if(document.getElementById('ralabNumericOverlay')?.classList.contains('open'))return;
    if(e.target.closest?.('input,select,textarea,[data-temporal-dialog]'))return;
    const modalRoot=document.getElementById('modalRoot');
    if(modalRoot&&modalRoot.children.length)return;

    // Header/navigation only when the header was actually clicked.
    const nav=e.target.closest?.('header .navbtn');
    if(nav){
      e.preventDefault();e.stopImmediatePropagation();
      if(nav.id==='refreshAppBtn'){
        const u=new URL(location.href);u.searchParams.set('_refresh',Date.now().toString());location.replace(u.toString());return;
      }
      const view=nav.dataset.view;
      if(view)go(view);
      return;
    }

    const orders=document.getElementById('view-orders');
    if(orders&&!orders.classList.contains('hidden')){
      const btn=e.target.closest?.('#view-orders button');
      const action=orderAction(btn);
      if(action){e.preventDefault();e.stopImmediatePropagation();runOrderAction(action)}
      return;
    }
    const customers=document.getElementById('view-customers');
    if(customers&&!customers.classList.contains('hidden')){
      const btn=e.target.closest?.('#view-customers button');
      const action=orderAction(btn);
      if(action){e.preventDefault();e.stopImmediatePropagation();runOrderAction(action);return}
      const row=e.target.closest?.('#view-customers tr[data-customer-id]');
      if(row){
        e.preventDefault();e.stopImmediatePropagation();
        if(window.RALAB_COMMERCIAL?.customerForm)window.RALAB_COMMERCIAL.customerForm(row.dataset.customerId);
        else window.RALAB_ERP?.openCustomer?.(row.dataset.customerId);
      }
    }
  }

  // A single native click works for touch, mouse and keyboard activation.
  // Native click is the only activation; never search for buttons beneath inputs.
  document.addEventListener('click',e=>{
    if(e.detail===0)return;
    handlePoint(e);
  },true);

  window.RALAB_ORDERS_INTERACTION_V4={version:VERSION,go};
})();
