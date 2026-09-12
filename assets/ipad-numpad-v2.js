// rAlabaster numeric keypad v2 — true fullscreen overlay for touch number entry.
(()=>{
  const VERSION='20260912-2';
  const touchCapable=()=>('maxTouchPoints' in navigator&&navigator.maxTouchPoints>0);
  if(!touchCapable())return;

  let target=null,buffer='',original='';
  const overlay=document.createElement('div');
  overlay.id='ralabNumericOverlay';
  overlay.innerHTML=`<div class="np-card" role="dialog" aria-modal="true" aria-label="Getal invoeren">
    <div class="np-head"><div class="np-label">Getal invoeren</div><button type="button" class="np-close" data-np-close aria-label="Sluiten">×</button></div>
    <div class="np-value">0</div>
    <div class="np-grid">${['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(k=>`<button type="button" data-np-key="${k}">${k}</button>`).join('')}</div>
    <div class="np-actions"><button type="button" data-np-cancel>Annuleer</button><button type="button" class="np-ok" data-np-ok>OK</button></div>
  </div>`;
  document.body.appendChild(overlay);

  const valueEl=overlay.querySelector('.np-value');
  const labelEl=overlay.querySelector('.np-label');

  function labelFor(el){
    const id=el.id;
    if(id){
      try{const lab=document.querySelector(`label[for="${CSS.escape(id)}"]`);if(lab?.textContent.trim())return lab.textContent.trim()}catch(_){ }
    }
    const field=el.closest('.field,td,tr');
    const lab=field?.querySelector('label');
    if(lab?.textContent.trim())return lab.textContent.trim();
    const ph=el.getAttribute('placeholder');
    return ph||'Getal invoeren';
  }
  function display(){valueEl.textContent=buffer||'0'}
  function open(el){
    if(!el||el.disabled||el.readOnly)return;
    if(target&&target!==el)target.classList.remove('np-active');
    target=el;
    original=String(el.value??'');
    buffer=original.replace('.',',');
    target.classList.add('np-active');
    try{target.blur()}catch(_){ }
    labelEl.textContent=labelFor(el);
    display();
    overlay.classList.add('open');
    document.documentElement.style.overflow='hidden';
  }
  function close(commit){
    if(target&&commit){
      let v=(buffer||'0').replace(',','.');
      let n=Number(v);if(!Number.isFinite(n))n=0;
      const min=target.getAttribute('min'),max=target.getAttribute('max');
      if(min!==null&&Number.isFinite(Number(min)))n=Math.max(n,Number(min));
      if(max!==null&&Number.isFinite(Number(max)))n=Math.min(n,Number(max));
      target.value=String(n);
      target.dispatchEvent(new Event('input',{bubbles:true}));
      target.dispatchEvent(new Event('change',{bubbles:true}));
    } else if(target){target.value=original}
    if(target)target.classList.remove('np-active');
    target=null;buffer='';original='';
    overlay.classList.remove('open');
    document.documentElement.style.overflow='';
  }
  function key(k){
    if(k==='⌫'){buffer=buffer.slice(0,-1);display();return}
    if(k===','){
      if(target?.step==='1'||target?.dataset?.integer==='true')return;
      if(!buffer.includes(','))buffer=(buffer||'0')+',';
      display();return;
    }
    if(buffer==='0'&&!buffer.includes(','))buffer=k;else buffer+=k;
    display();
  }

  document.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;
    const el=e.target.closest('input[type="number"]');
    if(!el||el.disabled||el.readOnly)return;
    e.preventDefault();
    e.stopPropagation();
    open(el);
  },true);

  overlay.addEventListener('pointerdown',e=>{
    if(e.target===overlay){e.preventDefault();close(false);return}
    e.preventDefault();
  });
  overlay.addEventListener('click',e=>{
    const k=e.target.closest('[data-np-key]');if(k){key(k.dataset.npKey);return}
    if(e.target.closest('[data-np-ok]')){close(true);return}
    if(e.target.closest('[data-np-cancel],[data-np-close]')){close(false);return}
  });
  window.RALAB_IPAD_NUMPAD={open,close,version:VERSION};
})();
