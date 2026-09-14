// One authoritative interaction layer for every current and future planner modal.
(()=>{
  const VERSION='20260914-1';
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

  function modalButtonAt(x,y){
    const root=document.getElementById('modalRoot');
    if(!root?.querySelector('.modalback,.modal'))return null;
    let best=null,bestArea=Infinity;
    for(const el of root.querySelectorAll('button')){
      if(el.disabled)continue;
      const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0||x<r.left||x>r.right||y<r.top||y>r.bottom)continue;
      const area=r.width*r.height;if(area<bestArea){best=el;bestArea=area}
    }
    return best;
  }

  // Native pickers need the complete tap sequence. Opening showPicker on
  // pointerdown made Safari treat the following release as a second activation.
  // Remember control gestures so coordinate-based button fallbacks cannot steal
  // the release, even if the native picker retargets that event.
  let controlGesture=false;
  document.addEventListener('pointerdown',e=>{
    controlGesture=!!e.target?.closest?.('select,input,textarea,[contenteditable="true"]');
    if(!controlGesture&&Number.isFinite(e.clientX)&&Number.isFinite(e.clientY))controlGesture=!!nativeControlAt(e.clientX,e.clientY);
  },true);
  document.addEventListener('pointercancel',()=>{controlGesture=false},true);

  // Route every modal button through one trusted touch endpoint. This avoids
  // Safari losing the later click when a sticky/scrolled modal footer is used.
  document.addEventListener('pointerup',e=>{
    if(controlGesture||e.target?.closest?.('select,input,textarea,[contenteditable="true"]')){controlGesture=false;return}
    if(e.pointerType&&e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
    const btn=modalButtonAt(e.clientX,e.clientY);if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();btn.click();
  },true);

  install();
  window.RALAB_MODAL_LAYER={version:VERSION,sync};
})();
