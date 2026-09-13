// One authoritative interaction layer for every current and future planner modal.
(()=>{
  const VERSION='20260913-2';
  if(window.__ralabModalLayerV1Installed)return;
  window.__ralabModalLayerV1Installed=true;

  function sync(){
    const root=document.getElementById('modalRoot');
    if(!root)return;
    const open=!!root.querySelector('.modalback,.modal');
    for(const el of [document.querySelector('body>header'),document.querySelector('body>main'),document.getElementById('printArea')]){
      if(!el)continue;
      if(open)el.setAttribute('inert','');else el.removeAttribute('inert');
    }
    document.documentElement.classList.toggle('ralab-modal-open',open);
  }

  function install(){
    const root=document.getElementById('modalRoot');
    if(!root)return setTimeout(install,50);
    new MutationObserver(sync).observe(root,{childList:true,subtree:true});
    sync();
  }

  function nativeControlAt(x,y){
    const root=document.getElementById('modalRoot');
    if(!root?.querySelector('.modalback,.modal'))return null;
    let best=null,bestArea=Infinity;
    for(const el of root.querySelectorAll('select,input,textarea')){
      if(el.disabled||el.readOnly)continue;
      const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0||x<r.left||x>r.right||y<r.top||y>r.bottom)continue;
      const area=r.width*r.height;if(area<bestArea){best=el;bestArea=area}
    }
    return best;
  }

  // iPad Safari can visually show a native control while hit-testing the scrolling
  // table above it. Open the picker from the original trusted touch event instead.
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType&&e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
    const el=nativeControlAt(e.clientX,e.clientY);if(!el)return;
    const picker=el.matches('select,input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]');
    if(!picker)return;
    try{
      el.focus({preventScroll:true});
      if(typeof el.showPicker==='function'){
        el.showPicker();
        e.preventDefault();e.stopImmediatePropagation();
      }
    }catch(_){/* Native event continues as fallback on older Safari versions. */}
  },true);

  install();
  window.RALAB_MODAL_LAYER={version:VERSION,sync};
})();
