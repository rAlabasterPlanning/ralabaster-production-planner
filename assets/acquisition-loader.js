/* Acquisitie owns its navigation and loads only when opened. */
(()=>{
 let loading;
 function show(){
  if(typeof window.switchView==='function')window.switchView('acquisition');
  else {document.querySelectorAll('main>section').forEach(s=>s.classList.toggle('hidden',s.id!=='view-acquisition'));}
 }
 async function open(){
  show();
  if(window.RALAB_ACQUISITION)return window.RALAB_ACQUISITION.open();
  if(loading)return loading;
  const root=document.getElementById('view-acquisition');if(!root)return;
  root.innerHTML='<div class="panel" style="padding:24px">Acquisitie laden…</div>';
  loading=(async()=>{
   if(!document.querySelector('[data-acquisition-styles]')){const css=document.createElement('link');css.rel='stylesheet';css.href='assets/acquisition.css?v=20261013-3';css.dataset.acquisitionStyles='';document.head.appendChild(css);}
   for(const file of ['acquisition-core.js','acquisition-messages.js','acquisition.js'])await new Promise((ok,no)=>{const script=document.createElement('script');script.src='assets/'+file+'?v=20261013-3';script.onload=ok;script.onerror=()=>no(new Error(file+' kon niet laden'));document.body.appendChild(script);});
   if(!window.RALAB_ACQUISITION)throw new Error('Acquisitiemodule kon niet starten');
   await window.RALAB_ACQUISITION.open();
  })().catch(()=>{
   root.innerHTML='<div class="panel" style="padding:24px"><h2>Acquisitie kon niet laden</h2><p>Probeer opnieuw om de module te openen.</p><button class="btn" data-acquisition-retry>Opnieuw proberen</button></div>';
   loading=null;
  });
  return loading;
 }
 window.RALAB_ACQUISITION_LOADER={open};
 // The shared header router calls open directly; fallback supports isolated navigation.
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-acquisition-retry]')){void open();return;}
  if(event.target.closest('[data-view="acquisition"]'))void open();
 });
 if(new URLSearchParams(location.search).has('acquisition')){
  const ready=window.RALAB_CORE_READY||Promise.resolve();
  ready.then(()=>open()).catch(()=>{const root=document.getElementById('view-acquisition');if(root)root.textContent='De planner kon niet laden. Vernieuw de pagina.';});
 }
})();
