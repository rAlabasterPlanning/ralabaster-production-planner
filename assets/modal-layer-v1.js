// One authoritative interaction layer for every current and future planner modal.
(()=>{
  const VERSION='20260913-1';
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
  install();
  window.RALAB_MODAL_LAYER={version:VERSION,sync};
})();
