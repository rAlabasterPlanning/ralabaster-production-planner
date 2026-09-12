// rAlabaster order-calculation workflow helpers: batch review flow + selectable standard steps.
(()=>{
  const VERSION='20260912-2';
  const reviewed=new Set();
  const OPS=[
    ['Technisch uitwerken',0,30,'batch'],['Verpakking bestellen',30,30,'batch'],['Materiaal bestellen',11,30,'batch'],['Alabaster klaarzetten',11,30,'batch'],
    ['Zagerij Ermelo (extern)',0,20160,'external'],['Ruw materiaal boren',61,0,'unit'],['Doppen lijmen',11,1,'unit'],['Droogruimte',0,540,'wait'],
    ['Mori - Instellen',60,30,'batch'],['Mori ZL15 #1',20.5,0,'unit'],['Mori ZL15 #2',20.5,0,'unit'],['Mori SL25',20.5,0,'unit'],
    ['Teach-In draaibank - instellen',40,30,'batch'],['Teach-In Draaibank (RALAB)',41,0,'unit'],['Reichenbacher - Instellen',30,30,'batch'],['Reichenbacher',26,0,'unit'],
    ['KUKA KR210 - Instellen',30,60,'batch'],['KUKA KR210',41,0,'unit'],['Kawasaki Boorrobot',11,0,'unit'],['Kolomboormachine',11,0,'unit'],
    ['Schuren',26,0,'unit'],['Polijsten',26,0,'unit'],['Assemblage',11,0,'unit'],['Inpakken',11,0,'unit'],['INTERN - Algemeen',11,0,'unit'],['Zagen (Wiseco)',16,0,'unit'],['Waterjetten (extern)',0,20160,'external']
  ].map(x=>({name:x[0],rate:x[1],minutes:x[2],mode:x[3]}));
  const WORKPLACES=[...new Set(OPS.map(x=>x.name))];
  const S=()=>{try{return state}catch(_){return null}};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>`t_edit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

  function currentOrder(){
    const s=S();if(!s)return null;
    const h=document.querySelector('#orderCalcEditor h2');
    const no=(h?.textContent||'').split('·').slice(1).join('·').trim();
    return (s.orders||[]).find(o=>String(o.orderNo||'')===no)||null;
  }
  function audit(o){
    if(!o)return{ok:false,missing:[]};
    if(window.RALAB_CHAIN_RELEASE?.auditOrder)return window.RALAB_CHAIN_RELEASE.auditOrder(o.id);
    const s=S(),missing=[];
    for(const t of (s?.tasks||[]).filter(t=>t.orderId===o.id)){
      const st=String(t.status||'').toLowerCase();if(['done','completed'].includes(st))continue;
      if(t.type==='wait'){if(!(t.waitStartAt&&t.waitEndAt))missing.push(t);continue}
      if(t.type==='external'){if(!(t.date&&t.expectedReturnDate))missing.push(t);continue}
      if(!(t.date||(t.planSegments||[]).length))missing.push(t);
    }
    return{ok:missing.length===0,missing};
  }
  function needsPlanning(o){return !audit(o).ok}
  function nextOrder(excludeId){
    const s=S();if(!s)return null;
    return (s.orders||[])
      .filter(o=>o.id!==excludeId&&!reviewed.has(o.id)&&o.active!==false&&o.status!=='completed'&&needsPlanning(o))
      .sort((a,b)=>(a.deadline||a.communicatedDeadline||'9999-12-31').localeCompare(b.deadline||b.communicatedDeadline||'9999-12-31')||(a.orderNo||'').localeCompare(b.orderNo||''))[0]||null;
  }
  function remainingUnplannedCount(){const s=S();return (s?.orders||[]).filter(o=>o.active!==false&&o.status!=='completed'&&needsPlanning(o)).length}
  function ensureFullyPlanned(o){
    let a=audit(o);if(a.ok)return a;
    try{window.RALAB_DEADLINE_PLANNER?.normalizeSequences?.();window.RALAB_DEADLINE_PLANNER?.planOrderStrict?.(o,{allowPeter:false,allowSaturday:false});save()}catch(e){console.warn('Extra planningscontrole mislukt',e)}
    return audit(o);
  }
  function saveAndNext(){
    const o=currentOrder();if(!o||!window.RALAB_ORDER_CALC?.save)return;
    const originalAlert=window.alert;window.alert=()=>{};let ok=false;
    try{ok=window.RALAB_ORDER_CALC.save(false)!==false}catch(e){console.error(e)}finally{window.alert=originalAlert}
    if(!ok)return;
    const check=ensureFullyPlanned(o);
    if(!check.ok){
      const names=check.missing.map(t=>`${t.seq}. ${t.name}`).join('\n');
      alert(`Deze order is nog niet volledig ingepland. Ik ga daarom niet door naar de volgende order.\n\nNog zonder geldige planning:\n${names||'onbekende stap'}`);
      return;
    }
    reviewed.add(o.id);
    const n=nextOrder(o.id);if(n){setTimeout(()=>window.RALAB_ORDER_CALC?.open?.(n.id),30);return}
    const left=remainingUnplannedCount();
    alert(left?`Alle orders zijn in deze controle-ronde langs geweest. Er zijn nog ${left} order(s) met resterende ongeplande stappen.`:'Alle actieve orders zijn volledig ingepland.');
    try{if(typeof window.switchView==='function')window.switchView('today');else window.RALAB_ERP?.show?.('today')}catch(_){ }
  }
  function stepOptions(selected=''){
    const names=OPS.map(x=>x.name),extra=selected&&!names.includes(selected)?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:'';
    return `<option value="">— kies stap —</option>${extra}${OPS.map(o=>`<option value="${esc(o.name)}" ${o.name===selected?'selected':''}>${esc(o.name)}</option>`).join('')}`;
  }
  function machineOptions(selected=''){
    const extra=selected&&!WORKPLACES.includes(selected)?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:'';
    return `<option value="">— kies werkplek —</option>${extra}${WORKPLACES.map(n=>`<option value="${esc(n)}" ${n===selected?'selected':''}>${esc(n)}</option>`).join('')}`;
  }
  function addSelectableRow(){
    const tbody=document.getElementById('ocRows');if(!tbody)return;const id=uid();
    tbody.insertAdjacentHTML('beforeend',`<tr data-oc-row data-task-id="${id}" data-status="open"><td style="white-space:nowrap"><button class="btn small" type="button" data-oc-up title="Omhoog">↑</button> <button class="btn small" type="button" data-oc-down title="Omlaag">↓</button></td><td><select class="input" data-oc-name>${stepOptions()}</select></td><td><select class="input" data-oc-machine>${machineOptions()}</select></td><td><select class="input" data-oc-mode><option value="batch">1× batch</option><option value="unit">per product</option><option value="external">extern</option><option value="wait">wachten 24/7</option></select></td><td><input class="input" data-oc-min type="number" min="0" step="0.1" value="0"></td><td><input class="input" data-oc-rate type="number" min="0" step="0.01" value="0"></td><td><input class="input" data-oc-ext type="number" min="0" step="0.01" value="0"></td><td><button class="btn small" type="button" data-oc-delete>Verwijder</button></td></tr>`);
  }
  function applyStepPreset(sel){
    const row=sel.closest('[data-oc-row]');if(!row)return;const p=OPS.find(x=>x.name===sel.value);if(!p)return;
    const machine=row.querySelector('[data-oc-machine]');if(machine)machine.value=p.name;
    row.querySelector('[data-oc-mode]').value=p.mode;row.querySelector('[data-oc-min]').value=String(p.minutes);row.querySelector('[data-oc-rate]').value=String(p.rate);
  }
  function applyMachinePreset(sel){
    const row=sel.closest('[data-oc-row]');if(!row)return;const p=OPS.find(x=>x.name===sel.value);if(!p)return;
    row.querySelector('[data-oc-rate]').value=String(p.rate);
  }

  document.addEventListener('click',e=>{
    const add=e.target.closest('[data-oc-add]');if(add){e.preventDefault();e.stopImmediatePropagation();addSelectableRow();return}
    const savePlan=e.target.closest('[data-oc-save-plan]');if(savePlan){e.preventDefault();e.stopImmediatePropagation();saveAndNext();return}
  },true);
  document.addEventListener('change',e=>{
    const step=e.target.closest('#ocRows [data-oc-name]');if(step){applyStepPreset(step);return}
    const machine=e.target.closest('#ocRows [data-oc-machine]');if(machine)applyMachinePreset(machine);
  },true);

  window.RALAB_ORDER_CALC_WORKFLOW={version:VERSION,reviewed,nextOrder,needsPlanning,audit,ensureFullyPlanned};
})();
