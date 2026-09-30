(function(){
 'use strict';
 const key='ralabaster_customer_mode_v1',root=document.documentElement;
 function read(){try{return localStorage.getItem(key)==='on'}catch(_){return false}}
 function active(){return root.dataset.customerMode==='on'}
 function refresh(){
  const button=document.getElementById('customerModeToggle'),notice=document.getElementById('customerModeNotice');
  if(button){button.textContent=active()?'Klantmodus aan':'Klantmodus uit';button.setAttribute('aria-pressed',String(active()));}
  if(notice)notice.hidden=!active();
 }
 function set(enabled){
  root.dataset.customerMode=enabled?'on':'off';
  try{localStorage.setItem(key,enabled?'on':'off')}catch(_){}
  refresh();
 }
 root.dataset.customerMode=read()?'on':'off';
 window.RALAB_CUSTOMER_MODE={active,set};
 document.addEventListener('DOMContentLoaded',refresh);
 document.addEventListener('click',event=>{
  if(event.target.closest('#customerModeToggle'))set(!active());
 },true);
 window.addEventListener('storage',event=>{if(event.key===key){root.dataset.customerMode=read()?'on':'off';refresh()}});
})();
