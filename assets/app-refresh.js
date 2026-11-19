(()=>{'use strict';
 const key='ralabaster-refresh-view';
 function remember(){
  const page=[...document.querySelectorAll('main>section[id^="view-"]')].find(x=>!x.classList.contains('hidden'));
  if(page)try{sessionStorage.setItem(key,page.id.slice(5))}catch(_){}
 }
 function refresh(){remember();const url=new URL(location.href);url.searchParams.set('_refresh',Date.now().toString());location.replace(url.toString())}
 function restore(){
  let view;try{view=sessionStorage.getItem(key);sessionStorage.removeItem(key)}catch(_){}
  if(!view||!document.getElementById('view-'+view))return;
  const nav=[...document.querySelectorAll('.navbtn[data-view]')].find(x=>x.dataset.view===view);
  if(nav)nav.click();else window.RALAB_ORDERS_INTERACTION_V4?.go(view);
 }
 window.RALAB_APP_REFRESH={remember,refresh,restore};
 window.addEventListener('load',()=>requestAnimationFrame(restore),{once:true});
})();
