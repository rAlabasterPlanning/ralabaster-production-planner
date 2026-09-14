// Modal ownership only. Native click events belong to their real DOM targets.
(()=>{
 const VERSION='20260914-2';
 if(window.__ralabModalLayerV1Installed)return;
 window.__ralabModalLayerV1Installed=true;
 function sync(){
  const root=document.getElementById('modalRoot');if(!root)return;
  const picker=!!document.querySelector('[data-temporal-dialog]');
  const open=picker||!!root.querySelector('.modalback,.modal');
  for(const el of [document.querySelector('body>header'),document.querySelector('body>main'),document.getElementById('printArea')]){
   if(el)el.toggleAttribute('inert',open);
  }
  root.toggleAttribute('inert',picker);
  document.documentElement.classList.toggle('ralab-modal-open',open);
 }
 function install(){const root=document.getElementById('modalRoot');if(!root)return setTimeout(install,50);new MutationObserver(sync).observe(root,{childList:true,subtree:true});sync()}
 install();window.RALAB_MODAL_LAYER={version:VERSION,sync};
})();
