// Keep the dropdown outside the scrolling nav, including on iOS Safari.
(()=>{
  const trigger=document.querySelector('.nav-more-trigger');
  const menu=document.getElementById('navMoreMenu');
  if(!trigger||!menu)return;

  function close(){
    menu.hidden=true;
    trigger.setAttribute('aria-expanded','false');
  }
  function position(){
    if(menu.hidden)return;
    const viewport=window.visualViewport;
    const margin=8,leftEdge=(viewport?.offsetLeft||0)+margin;
    const topEdge=(viewport?.offsetTop||0)+margin;
    const rightEdge=leftEdge+(viewport?.width||window.innerWidth)-2*margin;
    const bottomEdge=topEdge+(viewport?.height||window.innerHeight)-2*margin;
    const r=trigger.getBoundingClientRect();
    const below=Math.max(0,bottomEdge-r.bottom-6);
    const above=Math.max(0,r.top-topEdge-6);
    const openAbove=menu.scrollHeight>below&&above>below;
    menu.style.maxHeight=Math.max(0,openAbove?above:below)+'px';
    menu.style.left=Math.round(Math.max(leftEdge,Math.min(r.left,rightEdge-menu.offsetWidth)))+'px';
    menu.style.top=Math.round(openAbove?Math.max(topEdge,r.top-menu.offsetHeight-6):r.bottom+6)+'px';
    menu.style.right='auto';
  }

  // Run before document-level navigation handlers that stop propagation.
  window.addEventListener('click',e=>{
    if(e.target.closest?.('.nav-more-trigger')){
      e.preventDefault();
      e.stopImmediatePropagation();
      const opening=menu.hidden;
      close();
      if(opening){menu.hidden=false;trigger.setAttribute('aria-expanded','true');position()}
      return;
    }
    if(e.target.closest?.('.nav-more-menu [data-view]'))close();
    else if(!menu.contains(e.target))close();
  },true);
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!menu.hidden){close();trigger.focus()}
  },true);
  window.addEventListener('resize',position);
  document.addEventListener('scroll',e=>{if(!menu.contains(e.target))position()},true);
  window.visualViewport?.addEventListener('resize',position);
  window.visualViewport?.addEventListener('scroll',position);
})();
