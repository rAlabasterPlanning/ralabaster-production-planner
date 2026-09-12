// Orders interaction v4 — direct hit testing for iPad/touch, no render wrapping or DOM mutation.
(()=>{
  const VERSION='20260912-5';
  if(window.__ralabOrdersInteractionV4Installed)return;
  window.__ralabOrdersInteractionV4Installed=true;

  const inRect=(r,x,y)=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
  const hit=(selector,x,y)=>[...document.querySelectorAll(selector)].find(el=>{
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0&&inRect(r,x,y);
  })||null;

  function go(view){
    try{
      if(['dashboard','quotes','orders','completed','products','customers'].includes(view)&&window.RALAB_ERP?.show){
        window.RALAB_ERP.show(view);return true;
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
      if(action.type==='calculation'){go('calculation');return true}
    }catch(err){console.error('Orderactie mislukt',err);alert('Deze orderactie kon niet worden geopend.');}
    return false;
  }

  function handlePoint(e){
    const x=e.clientX,y=e.clientY;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;

    // If a visible numeric modal is open, let it own the screen.
    if(document.getElementById('ralabNumericOverlay')?.classList.contains('open'))return;

    // Header/navigation: coordinate hit-testing still works even if an invisible layer is sitting above it.
    const nav=hit('header .navbtn',x,y);
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
    if(!orders||orders.classList.contains('hidden'))return;
    const btn=hit('#view-orders button',x,y);
    const action=orderAction(btn);
    if(action){
      e.preventDefault();e.stopImmediatePropagation();
      runOrderAction(action);
    }
  }

  // pointerup is most reliable for iPad touch; click is the fallback for mouse/trackpad.
  document.addEventListener('pointerup',handlePoint,true);
  document.addEventListener('click',e=>{
    if(e.detail===0)return;
    handlePoint(e);
  },true);

  window.RALAB_ORDERS_INTERACTION_V4={version:VERSION,go};
})();
