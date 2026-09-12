// rAlabaster order-calculation workflow helpers: batch review flow + selectable standard steps.
(()=>{
  const VERSION='20260912-10';
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
    if(o.waitingMaterial||o.materialStatus==='waiting')return{ok:true,missing:[],waitingMaterial:true};
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
  function needsReview(o){
    if(!o||o.deleted||o.active===false||o.status==='completed'||o.waitingMaterial||o.materialStatus==='waiting')return false;
    if(needsPlanning(o))return true;
    const promised=o.communicatedDeadline||'';
    const internal=o.internalExpectedDate||'';
    if(promised&&internal&&internal>promised)return true;
    const h=window.RALAB_DEADLINE_PLANNER?.health?.(o);
    if(!h)return false;
    const accepted=!!o.planningRiskAcceptedAt&&o.planningRiskAcceptedFinish===h.finish&&o.planningRiskAcceptedDeadline===(o.communicatedDeadline||'');
    if(accepted&&h.status!=='bad')return false;
    return h.status==='risk'||h.status==='bad';
  }
  function reviewQueue(){
    const s=S();if(!s)return[];
    return (s.orders||[]).filter(needsReview).sort((a,b)=>(a.deadline||a.communicatedDeadline||'9999-12-31').localeCompare(b.deadline||b.communicatedDeadline||'9999-12-31')||(a.orderNo||'').localeCompare(b.orderNo||''));
  }
  function reviewCount(){return reviewQueue().length}
  function startReview(){
    reviewed.clear();
    const n=reviewQueue()[0];
    if(!n){alert('Er zijn geen orders meer die gecontroleerd of ingepland moeten worden.');return false}
    window.RALAB_ORDER_CALC?.open?.(n.id);
    return true;
  }
  function nextOrder(excludeId){
    const s=S();if(!s)return null;
    return (s.orders||[])
      .filter(o=>o.id!==excludeId&&!reviewed.has(o.id)&&needsReview(o))
      .sort((a,b)=>(a.deadline||a.communicatedDeadline||'9999-12-31').localeCompare(b.deadline||b.communicatedDeadline||'9999-12-31')||(a.orderNo||'').localeCompare(b.orderNo||''))[0]||null;
  }
  function remainingUnplannedCount(){return reviewCount()}
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
    o.planningCheckedAt=new Date().toISOString();
    try{save()}catch(_){}
    reviewed.add(o.id);
    const n=nextOrder(o.id);if(n){setTimeout(()=>window.RALAB_ORDER_CALC?.open?.(n.id),30);return}
    const left=remainingUnplannedCount();
    alert(left?`Alle orders zijn in deze controle-ronde langs geweest. Er zijn nog ${left} order(s) met resterende ongeplande stappen.`:'Alle actieve orders zijn volledig ingepland.');
    try{if(typeof window.switchView==='function')window.switchView('today');else window.RALAB_ERP?.show?.('today')}catch(_){ }
  }
  function fmtHours(mins){const h=(Number(mins)||0)/60;return h<0.1?'0 uur':(Math.round(h*10)/10).toFixed(h%1?1:0).replace('.',',')+' uur'}
  function renderAttentionPanel(){
    const editor=document.getElementById('orderCalcEditor');if(!editor||editor.querySelector('#ocAttentionPanel'))return;
    const o=currentOrder();if(!o)return;
    const a=audit(o),h=window.RALAB_DEADLINE_PLANNER?.health?.(o),promised=o.communicatedDeadline||'',internal=o.internalExpectedDate||'';
    const reasons=[];
    if(a&&!a.ok){const names=(a.missing||[]).slice(0,8).map(t=>`${t.seq||'?'}. ${t.name||t.machine||'Stap'}`);reasons.push('<b>Niet volledig ingepland:</b> '+(names.length?names.map(esc).join(', '):'er ontbreken planningsblokken'))}
    if(promised&&internal&&internal>promised)reasons.push(`<b>Deadlineprobleem:</b> intern verwacht gereed <b>${esc(internal)}</b>, maar aan klant gecommuniceerd <b>${esc(promised)}</b>.`);
    if(h?.status==='bad'&&!reasons.some(x=>x.includes('Deadlineprobleem')))reasons.push(`<b>Niet haalbaar:</b> verwachte einddatum ${esc(h.finish||'—')} ligt te laat voor de klantdeadline ${esc(promised||h.hard||'—')}.`);
    if(h?.status==='risk')reasons.push(`<b>Spannend:</b> ${esc(h.label||'weinig speling')} ${h.slack!=null?'('+esc(String(h.slack))+' werkdagen speling)':''}.`);
    if(!reasons.length)return;

    let adviceHtml='<b>Advies:</b> controleer de gemarkeerde planning.';
    if(a&&!a.ok){
      adviceHtml='<b>Wat doen:</b> vul/controleer de ontbrekende stappen en druk daarna op <b>Opslaan en direct inplannen</b>. De hele keten moet daarna een planning hebben.';
    }else if(h?.status==='bad'){
      let adv=null;try{adv=window.RALAB_DEADLINE_PLANNER?.attentionAdvice?.(o.id)}catch(err){console.warn('Capaciteitsadvies kon niet worden berekend',err)}
      if(adv?.peter&&adv.peter.status!=='bad'){
        const target=fmtHours(adv.peterMinutesTarget),total=fmtHours(adv.peterMinutesTotal);
        adviceHtml=`<b>Slimste herstel:</b> Peter inzetten maakt deze order volgens de simulatie haalbaar. Peter wordt ca. <b>${target}</b> op deze order ingezet (${total} in de totale herplanning). Daarmee worden <b>${adv.rescuedByPeter}</b> momenteel rode order(s) haalbaar.`;
      }else if(adv?.overtime&&adv.overtime.status!=='bad'){
        const target=fmtHours(adv.saturdayMinutesTarget),total=fmtHours(adv.saturdayMinutesTotal);
        adviceHtml=`<b>Slimste herstel:</b> Peter alleen is niet genoeg. Met Peter + zaterdag/overwerk is deze order wel haalbaar. De simulatie gebruikt ca. <b>${total}</b> extra zaterdaguren in de totale planning${Number(adv.saturdayMinutesTarget)>0?' ('+target+' direct op deze order)':''}. Daarmee worden <b>${adv.rescuedByOvertime}</b> rode order(s) haalbaar.`;
      }else if(adv){
        adviceHtml='<b>Capaciteitstekort:</b> zelfs met Peter en het huidige zaterdag/overwerkmodel blijft deze order te laat. Dan moet je capaciteit/machinekeuze wijzigen, een eerdere order verschuiven of de klantdeadline aanpassen.';
      }else{
        adviceHtml='<b>Capaciteitstekort:</b> probeer deadline-optimalisatie of extra capaciteit; deze order staat nu na de beloofde klantdatum.';
      }
    }else if(h?.status==='risk'){
      adviceHtml='<b>Wat doen:</b> nog geen harde overschrijding, maar weinig buffer. Plan deze order eerder of houd extra capaciteit vrij om rood te voorkomen.';
    }

    let smartHtml='';
    if((h?.status==='bad'||h?.status==='risk')&&a?.ok){
      try{
        const smart=window.RALAB_DEADLINE_PLANNER?.strategicRecommendation?.(o.id),best=smart?.best;
        if(best){
          best.focusId=o.id;window.__ralabSmartChoice=best;
          const saved=(best.saved||[]),other=(best.savedOther||[]);
          const orderName=id=>{const x=(S()?.orders||[]).find(q=>q.id===id);return x?(x.orderNo||'')+(x.product?' · '+x.product:''):id};
          const savedNames=saved.slice(0,4).map(orderName).join(', ');
          let action='';
          if(best.kind==='shift')action=`Verschuif <b>${esc(best.shiftOrderNo)}${best.shiftProduct?' · '+esc(best.shiftProduct):''}</b> met <b>${best.days} dag(en)</b> naar ${esc(best.newDate)}.`;
          else if(best.kind==='peter')action=`Zet Peter gericht in voor ca. <b>${fmtHours(best.extraMinutes)}</b> in de herplanning.`;
          else action=`Gebruik Peter + zaterdag/overwerk; ca. <b>${fmtHours(best.extraMinutes)}</b> valt op zaterdag in de herplanning.`;
          smartHtml=`<div style="margin-top:12px;padding:12px;border:2px solid #2f7d4a;border-radius:8px;background:#eef8f1">
            <div style="font-size:16px;font-weight:900">⭐ Beste keuze over alle orders</div>
            <div style="margin-top:6px">${action}</div>
            <div style="margin-top:5px">Effect: <b>${saved.length} rode order(s)</b> worden hiermee haalbaar${other.length?' — daarvan '+other.length+' andere order(s) naast deze':''}.</div>
            ${savedNames?'<div class="muted" style="margin-top:4px">Worden gered: '+esc(savedNames)+(saved.length>4?' + '+(saved.length-4)+' meer':'')+'</div>':''}
            <div class="muted" style="margin-top:5px">De keuze is berekend over de hele actieve planning: eerst zoveel mogelijk deadlines halen, daarna zo min mogelijk klantdeadlines verschuiven en zo min mogelijk extra capaciteit gebruiken.</div>
            <button class="btn primary" type="button" data-apply-smart-choice style="margin-top:9px">Beste keuze uitvoeren</button>
          </div>`;
        }
      }catch(err){console.warn('Slimste keuze kon niet worden berekend',err)}
    }
    let execute='';
    const hasDeadline=!!promised;
    if(hasDeadline){
      let adv=null;try{adv=window.RALAB_DEADLINE_PLANNER?.attentionAdvice?.(o.id)}catch(_){}
      const proposal=adv?.peter&&adv.peter.status!=='bad'?'Peter inzetten':adv?.overtime&&adv.overtime.status!=='bad'?'Peter + zaterdag/overwerk inzetten':'';
      execute=`<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,.14)">
        <div style="font-weight:900;margin-bottom:8px">Beslis en voer direct uit</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          ${proposal?'<button class="btn primary" type="button" data-attention-enforce="'+esc(o.id)+'">Voer voorstel uit · '+esc(proposal)+'</button>':''}
          <button class="btn primary" type="button" data-attention-enforce="${esc(o.id)}" style="font-weight:900">Deadline moet gehaald worden</button>
          <button class="btn" type="button" data-attention-accept="${esc(o.id)}">Planning zo accepteren</button>
          <span style="display:inline-flex;gap:6px;align-items:center"><input class="input" id="attentionShiftDays" type="number" inputmode="numeric" min="1" step="1" value="1" style="width:72px"><span>dagen</span><button class="btn" type="button" data-attention-shift="${esc(o.id)}">Deadline opschuiven</button></span>
        </div>
        <div class="muted" style="margin-top:7px">“Deadline moet gehaald worden” probeert de beloofde datum vast te houden en herplant de nog niet gestarte werkzaamheden met de beschikbare herstelopties.</div>
      </div>`;
    }else{
      execute=`<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,.14)"><b>Geen gecommuniceerde deadline ingevuld.</b> Vul eerst de klantdeadline in; daarna kan de planner hem als harde datum bewaken.</div>`;
    }
    const panel=document.createElement('div');panel.id='ocAttentionPanel';panel.className='panel';panel.style.cssText='margin:12px 0;padding:14px;border:2px solid '+(h?.status==='bad'?'#c73b32':'#d59b2d')+';background:'+(h?.status==='bad'?'#fff0ee':'#fff7df');
    panel.innerHTML=`<div style="font-size:18px;font-weight:900;margin-bottom:8px">${h?.status==='bad'?'🔴 Aandacht nodig':'🟠 Controleren'}</div><div style="line-height:1.55">${reasons.map(x=>'<div style="margin:4px 0">'+x+'</div>').join('')}<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,.12)">${adviceHtml}</div></div>${smartHtml}${execute}`;
    const toolbar=editor.querySelector('.toolbar');toolbar?.after(panel);
  }
  function stepOptions(selected=''){
    const names=OPS.map(x=>x.name),extra=selected&&!names.includes(selected)?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:'';
    return `<option value="">— kies stap —</option>${extra}${OPS.map(o=>`<option value="${esc(o.name)}" ${o.name===selected?'selected':''}>${esc(o.name)}</option>`).join('')}`;
  }
  function machineOptions(selected=''){
    const extra=selected&&!WORKPLACES.includes(selected)?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:'';
    return `<option value="">— kies werkplek —</option>${extra}${WORKPLACES.map(n=>`<option value="${esc(n)}" ${n===selected?'selected':''}>${esc(n)}</option>`).join('')}`;
  }
  function upgradeExistingRows(){
    const tbody=document.getElementById('ocRows');if(!tbody)return;
    for(const row of tbody.querySelectorAll('[data-oc-row]')){
      const nameEl=row.querySelector('[data-oc-name]');
      if(nameEl && nameEl.tagName!=='SELECT'){
        const v=nameEl.value||'';const sel=document.createElement('select');
        sel.className=nameEl.className||'input';sel.setAttribute('data-oc-name','');sel.innerHTML=stepOptions(v);
        nameEl.replaceWith(sel);
      }
      const machineEl=row.querySelector('[data-oc-machine]');
      if(machineEl && machineEl.tagName!=='SELECT'){
        const v=machineEl.value||'';const sel=document.createElement('select');
        sel.className=machineEl.className||'input';sel.setAttribute('data-oc-machine','');sel.innerHTML=machineOptions(v);
        machineEl.replaceWith(sel);
      }
    }
  }
  function addSelectableRow(){
    const tbody=document.getElementById('ocRows');if(!tbody)return;const id=uid();
    tbody.insertAdjacentHTML('beforeend',`<tr data-oc-row data-task-id="${id}" data-status="open"><td style="white-space:nowrap"><button class="btn small" type="button" data-oc-up title="Omhoog">↑</button> <button class="btn small" type="button" data-oc-down title="Omlaag">↓</button></td><td><select class="input" data-oc-name>${stepOptions()}</select></td><td><select class="input" data-oc-machine>${machineOptions()}</select></td><td><select class="input" data-oc-mode><option value="batch">1× batch</option><option value="unit">per product</option><option value="external">extern</option><option value="wait">wachten 24/7</option></select></td><td><input class="input" data-oc-min type="text" inputmode="text" value="0" placeholder="min / 1,5u / 1d"></td><td><input class="input" data-oc-rate type="number" min="0" step="0.01" value="0"></td><td><input class="input" data-oc-ext type="number" min="0" step="0.01" value="0"></td><td><button class="btn small" type="button" data-oc-delete>Verwijder</button></td></tr>`);
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
    const smart=e.target.closest('[data-apply-smart-choice]');if(smart){e.preventDefault();e.stopImmediatePropagation();const choice=window.__ralabSmartChoice;if(!choice){alert('Het voorstel is niet meer beschikbaar. Open de order opnieuw om opnieuw te berekenen.');return}const r=window.RALAB_DEADLINE_PLANNER?.applyStrategicRecommendation?.(choice);if(!r?.ok){alert(r?.message||'Kon de beste keuze niet uitvoeren.');return}window.__ralabSmartChoice=null;alert('Beste keuze uitgevoerd en de volledige planning is opnieuw opgeslagen.');setTimeout(()=>window.RALAB_ORDER_CALC?.open?.(choice.focusId),60);return}
    const enforce=e.target.closest('[data-attention-enforce]');if(enforce){e.preventDefault();e.stopImmediatePropagation();const r=window.RALAB_DEADLINE_PLANNER?.applyDeadlineMustBeMet?.(enforce.dataset.attentionEnforce);if(!r?.ok){alert(r?.message||'Deze deadline kan niet automatisch gehaald worden.');return}alert('Planning aangepast en opgeslagen. De gekozen extra capaciteit is nu echt ingepland.');setTimeout(()=>window.RALAB_ORDER_CALC?.open?.(enforce.dataset.attentionEnforce),50);return}
    const accept=e.target.closest('[data-attention-accept]');if(accept){e.preventDefault();e.stopImmediatePropagation();const r=window.RALAB_DEADLINE_PLANNER?.acceptCurrentPlanAndMoveDeadline?.(accept.dataset.attentionAccept);if(!r?.ok){alert(r?.message||'Kon planning niet accepteren.');return}reviewed.add(accept.dataset.attentionAccept);alert('Planning geaccepteerd. Nieuwe deadline: '+r.newDate+'.');const n=nextOrder(accept.dataset.attentionAccept);if(n)setTimeout(()=>window.RALAB_ORDER_CALC?.open?.(n.id),50);else if(typeof window.switchView==='function')window.switchView('orders');return}
    const shift=e.target.closest('[data-attention-shift]');if(shift){e.preventDefault();e.stopImmediatePropagation();const days=Math.max(0,Number(document.getElementById('attentionShiftDays')?.value)||0);const r=window.RALAB_DEADLINE_PLANNER?.shiftCustomerDeadline?.(shift.dataset.attentionShift,days);if(!r?.ok){alert(r?.message||'Kon deadline niet verschuiven.');return}alert('Deadline '+days+' dag(en) opgeschoven naar '+r.newDate+'. Planning is opnieuw doorgerekend.');setTimeout(()=>window.RALAB_ORDER_CALC?.open?.(shift.dataset.attentionShift),50);return}
  },true);
  document.addEventListener('change',e=>{
    const step=e.target.closest('#ocRows [data-oc-name]');if(step){applyStepPreset(step);return}
    const machine=e.target.closest('#ocRows [data-oc-machine]');if(machine)applyMachinePreset(machine);
  },true);

  const observer=new MutationObserver(()=>{upgradeExistingRows();renderAttentionPanel()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(upgradeExistingRows,700);
  upgradeExistingRows();renderAttentionPanel();

  window.RALAB_ORDER_CALC_WORKFLOW={version:VERSION,reviewed,nextOrder,needsPlanning,needsReview,reviewQueue,reviewCount,startReview,audit,ensureFullyPlanned,renderAttentionPanel};
})();
