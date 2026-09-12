// rAlabaster iPad numeric keypad v2 — centered touch popup for number fields.
(()=>{
  const isTouchCapable=()=>('maxTouchPoints' in navigator&&navigator.maxTouchPoints>0);
  if(!isTouchCapable())return;

  let target=null,buffer='',original='';
  const pad=document.createElement('div');
  pad.id='ralabIpadNumpad';
  pad.innerHTML=`<div class="np-dialog" role="dialog" aria-modal="true" aria-label="Numerieke invoer"><div class="np-head"><div class="np-label">Getal invoeren</div><button type="button" data-np-close aria-label="Sluiten">×</button></div><div class="np-value">0</div><div class="np-grid">${['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(k=>`<button type="button" data-np-key="${k}">${k}</button>`).join('')}</div><div class="np-actions"><button type="button" data-np-cancel>Annuleer</button><button type="button" class="np-ok" data-np-ok>OK</button></div></div>`;
  document.body.appendChild(pad);
  const valueEl=pad.querySelector('.np-value'),labelEl=pad.querySelector('.np-label');

  function labelFor(el){
    const id=el.id,lab=id?document.querySelector(`label[for="${CSS.escape(id)}"]`):null;
    if(lab?.textContent.trim())return lab.textContent.trim();
    const field=el.closest('.field,td');
    const nearby=field?.querySelector('label,th');
    if(nearby?.textContent.trim())return nearby.textContent.trim();
    const ph=el.getAttribute('placeholder');
    return ph||'Getal invoeren';
  }
  function display(){valueEl.textContent=buffer||'0'}
  function open(el){
    if(target&&target!==el)target.classList.remove('np-active');
    target=el;original=String(el.value??'');buffer=original.replace('.',',');
    target.classList.add('np-active');labelEl.textContent=labelFor(el);display();pad.classList.add('open');
  }
  function close(commit){
    if(!target){pad.classList.remove('open');return}
    if(commit){
      let v=buffer.replace(',','.');
      if(v===''||v==='-'||v==='.')v='0';
      const min=target.getAttribute('min'),max=target.getAttribute('max');
      let n=Number(v);if(!Number.isFinite(n))n=0;
      if(min!==null&&Number.isFinite(Number(min)))n=Math.max(n,Number(min));
      if(max!==null&&Number.isFinite(Number(max)))n=Math.min(n,Number(max));
      target.value=String(n);
      target.dispatchEvent(new Event('input',{bubbles:true}));
      target.dispatchEvent(new Event('change',{bubbles:true}));
    } else target.value=original;
    target.classList.remove('np-active');target=null;buffer='';original='';pad.classList.remove('open');
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
    open(el);
  },true);
  pad.addEventListener('pointerdown',e=>e.preventDefault());
  pad.addEventListener('click',e=>{
    if(e.target===pad){close(false);return}
    const k=e.target.closest('[data-np-key]');if(k){key(k.dataset.npKey);return}
    if(e.target.closest('[data-np-ok]')){close(true);return}
    if(e.target.closest('[data-np-cancel],[data-np-close]')){close(false);return}
  });
  window.RALAB_IPAD_NUMPAD={open,close,version:'20260912-2'};
})();
